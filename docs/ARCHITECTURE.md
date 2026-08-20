# Архитектура — Slava Vote

Статус: живой документ. Последнее обновление: 2026-08-20. Продуктовые правила — см. [PRODUCT_SPEC.md](./PRODUCT_SPEC.md), история решений с обоснованиями — [DECISIONS.md](./DECISIONS.md).

## Стек

Node.js, TypeScript (ESM, `NodeNext`), [grammY](https://grammy.dev), PostgreSQL (Neon), Prisma ORM, Vitest, ESLint + Prettier.

## Слои

```
Telegram
    ↓
bot/ (grammY handlers/commands/keyboards/messages)
    ↓
services/ (бизнес-логика)
    ↓
Prisma
    ↓
PostgreSQL
```

Handlers не содержат бизнес-логику — только приём апдейта, вызов сервиса, форматирование ответа. Вся логика (проверки ролей, состояние голосования, `canVote`, подсчёт результатов) — в `services/`.

## Структура проекта

```text
src/
├── bot/
│   ├── commands/
│   ├── handlers/
│   ├── keyboards/
│   └── messages/
│
├── services/
│   ├── user.service.ts
│   ├── voting-state.service.ts   (было contest.service — переименовано, см. DECISIONS.md D8)
│   ├── photo.service.ts
│   ├── voting.service.ts         (canVote + запись голоса)
│   └── results.service.ts
│
├── middleware/
│   └── permissions.ts
│
├── config/
│   └── config.ts
│
└── index.ts

prisma/
└── schema.prisma
```

Реализовано на данный момент (Phase 0): `config/`, `index.ts` (заглушка `/start`), пустой скелет остальных папок. Файлы сервисов появятся по мере фаз — см. [TASKS.md](./TASKS.md).

## Модель данных

Один общий пул фотографий и одно голосование — сущности `Contest`/`PhotoNomination` из ранних черновиков удалены (см. DECISIONS.md D8).

```
User ──< Vote >── Photo
          │
          └──── Nomination

User ──(0..1)── VotingPermission ──(grantedBy)── User

VotingState  (одна строка на всё приложение: DRAFT/VIEWING/VOTING/FINISHED)
```

- **User** — `telegramId` (`BigInt`, unique) — единственный идентификатор личности, `username` только для отображения. `role` (`USER`/`MODERATOR`/`ADMIN`).
- **Photo** — глобальный пул, ни к чему не привязан напрямую. `telegramFileId`, `telegramFileUniqueId` (индекс, не unique — дедупликация, если понадобится, это политика `photo.service`, а не ограничение схемы), `name` (имя участника), `status` (`ACTIVE`/`DELETED`, soft delete).
- **Nomination** — глобальный список (без привязки к чему-либо, конкурс один): `name`, `description`, `sortOrder`, `active`.
- **Vote** — `userId` + `photoId` + `nominationId` + `createdAt`. `UNIQUE(userId, photoId, nominationId)` — единственная зафиксированная гарантия. `@@index([nominationId, photoId])` — под агрегацию результатов.
- **VotingPermission** — индивидуальный ранний доступ к голосованию: `userId` (unique — одно разрешение на пользователя), `grantedBy` (FK на User).
- **VotingState** — `status` (`VotingStatus`: `DRAFT`/`VIEWING`/`VOTING`/`FINISHED`), `votingStartedAt`, `votingFinishedAt`. Одна строка на всё приложение; singleton не закреплён на уровне БД — это ответственность `voting-state.service` (создать при отсутствии, никогда не создавать вторую запись).

Никаких `onDelete: Cascade` — сознательно (см. DECISIONS.md D12): soft delete — единственный способ "удалить" фото, история голосов не должна пострадать от каскада.

Полная Prisma-схема появится в `prisma/schema.prisma` на этапе Phase 2 (см. TASKS.md T2.x); черновик схемы согласован в чате и зафиксирован в DECISIONS.md D8–D13.

## Security-принципы

- проверка ролей — только на сервере, никогда по клиентскому вводу;
- проверка состояния голосования и права голосовать — только на сервере;
- единая точка истины для права голоса — `canVote(user, votingState)`, не дублируется по хендлерам;
- уникальные ограничения на уровне БД (`UNIQUE(userId, photoId, nominationId)`);
- секреты — только в env variables, `.env` в `.gitignore`, никогда не коммитятся;
- username никогда не используется как идентификатор;
- роль пользователя никогда не берётся из клиентского ввода;
- USER не может вызвать moderator/admin-действия через прямой callback — проверка на сервере, а не скрытие кнопки.

## Атомарность голосования и переходов состояния (Phase 5, TBD в реализации)

Гонка между записью голоса и остановкой голосования должна быть исключена: проверка `status === VOTING` и `INSERT Vote` — не должны быть двумя независимыми шагами. Планируемый подход (уточняется при реализации Phase 5): транзакция Prisma с условным обновлением состояния (`UPDATE ... WHERE status = 'VOTING'`) либо эквивалентный механизм блокировки, гарантирующий, что после атомарного перехода в `FINISHED` новый голос физически не может быть записан. То же самое — для перехода `VOTING → FINISHED` (допустим только если текущий статус действительно `VOTING`).

## Хранение фотографий

Файлы не хранятся в собственном сторадже и не кладутся в PostgreSQL как бинарные данные. Используются `telegram_file_id` (повторная отправка) и `telegram_file_unique_id` (идентификация). Архитектура должна допускать в будущем переход на S3-совместимое хранилище (R2/S3) без изменения остальной бизнес-логики.

## Окружение и хостинг

| Переменная | Назначение |
| --- | --- |
| `BOT_TOKEN` | токен бота от @BotFather |
| `DATABASE_URL` | connection string PostgreSQL (Neon) |
| `ADMIN_TELEGRAM_IDS` | telegram_id первых администраторов, через запятую |

- БД — Neon (бесплатный тариф), используется и для разработки, и в будущем для продакшена — без Docker/локального Postgres (см. DECISIONS.md D4). `DATABASE_URL` хранится только у пользователя, никогда не передаётся в чат.
- Бот — long polling (не нужен публичный HTTPS endpoint). Конкретный хостинг для постоянно работающего Node.js-процесса — TBD (VPS/Railway/Render — не выбрано).
- Возможен cold start Neon после простоя — специальный keep-alive/ping не добавляется без необходимости, сначала реализуется корректная обработка задержки первого запроса.

## Тестирование

Vitest. Обязательное покрытие критической бизнес-логики до создания сложного UI: RBAC, машина состояний голосования, `canVote`, individual permissions, запрет голосования после `FINISHED`, уникальность голосов, детерминированность результатов при ничьей.
