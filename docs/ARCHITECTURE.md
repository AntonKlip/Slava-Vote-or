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

Реализовано на данный момент (после Phase 6, T6.1–T6.5): `config/`, `database/prisma.ts`, `bot/context.ts`, `middleware/permissions.ts`, `bot/handlers/{start,photo-add}.handler.ts`, `bot/commands/{voting-state,voting-permission,nomination,photo}.commands.ts`, `services/{user,voting-state,voting-permission,voting,photo,nomination}.service.ts`, `index.ts` (регистрирует все команды). `services/results.service.ts`, `api/`, `frontend/` — появятся в Phase 7, см. [TASKS.md](./TASKS.md).

С Phase 7 (Telegram Mini App, см. DECISIONS.md D19–D25) поверх этих же `services/` появится HTTP API-слой (`src/api/`, Express) и отдельный фронтенд (`frontend/`, React+Vite), работающие в том же Node-процессе, что и бот. Бот остаётся точкой входа и интерфейсом администратора; подробности — в DECISIONS.md.

## Модель данных

Один общий пул фотографий и одно голосование — сущности `Contest`/`PhotoNomination` из ранних черновиков удалены (см. DECISIONS.md D8).

```
User ──< Vote >── Photo
          │
          └──── Nomination

User ──(0..1)── VotingPermission ──(grantedBy)── User

VotingState  (одна строка на всё приложение: DRAFT/VIEWING/VOTING/FINISHED)
```

- **User** — `telegramId` (`BigInt`, unique) — единственный идентификатор личности, `username` только для отображения. `role` (`USER`/`ADMIN`).
- **Photo** — глобальный пул, ни к чему не привязан напрямую. `id` — `Int autoincrement` (не cuid, как у остальных моделей — короткий id нужен админу для ручного ввода в bot-командах, см. DECISIONS.md D32), `telegramFileId`, `telegramFileUniqueId` (индекс, не unique — дедупликация, если понадобится, это политика `photo.service`, а не ограничение схемы), `name` (имя участника), `status` (`ACTIVE`/`DELETED`, soft delete).
- **Nomination** — глобальный список (без привязки к чему-либо, конкурс один): `id` — `Int autoincrement` (см. D32), `name`, `description`, `sortOrder`, `active`.
- **Vote** — `userId` + `photoId` + `nominationId` + `createdAt`. `UNIQUE(userId, photoId, nominationId)` — единственная зафиксированная гарантия. `@@index([nominationId, photoId])` — под агрегацию результатов.
- **VotingPermission** — индивидуальный ранний доступ к голосованию: `userId` (unique — одно разрешение на пользователя), `grantedBy` (FK на User).
- **VotingState** — `status` (`VotingStatus`: `DRAFT`/`VIEWING`/`VOTING`/`FINISHED`), `votingStartedAt`, `votingFinishedAt`. Одна строка на всё приложение; singleton не закреплён на уровне БД — это ответственность `voting-state.service` (создать при отсутствии, никогда не создавать вторую запись).

Никаких `onDelete: Cascade` — сознательно (см. DECISIONS.md D12): soft delete — единственный способ "удалить" фото, история голосов не должна пострадать от каскада.

Схема реализована в `prisma/schema.prisma` (Phase 2, см. TASKS.md T2.x). Установленная версия Prisma (7.9.1) сама задаёт две детали иначе, чем в первоначальном черновике — см. DECISIONS.md D14:
- клиент генерируется в `src/generated/prisma` (не в `node_modules`), в `.gitignore`;
- `DATABASE_URL` читается через `prisma.config.ts`, а не напрямую из `datasource.url` в схеме.

## Security-принципы

- проверка ролей — только на сервере, никогда по клиентскому вводу;
- проверка состояния голосования и права голосовать — только на сервере;
- единая точка истины для права голоса — `canVote(user, votingState, hasPermission)`, не дублируется по хендлерам/роутам; доступ к просмотру фото — отдельная от `canVote` проверка (см. PRODUCT_SPEC.md, DECISIONS.md D27);
- уникальные ограничения на уровне БД (`UNIQUE(userId, photoId, nominationId)`);
- секреты — только в env variables, `.env` в `.gitignore`, никогда не коммитятся;
- username никогда не используется как идентификатор;
- роль пользователя никогда не берётся из клиентского ввода;
- USER не может вызвать admin-действия через прямой callback — проверка на сервере, а не скрытие кнопки.

## Атомарность голосования и переходов состояния (реализовано в Phase 5)

Гонка между записью голоса и остановкой голосования исключена: `castVote()` (`voting.service.ts`) открывает Prisma-транзакцию, которая сначала блокирует singleton-строку `VotingState` (`SELECT ... FOR UPDATE`), затем проверяет `canVote` по свежепрочитанному статусу и только потом пишет `Vote`. Конкурентный переход состояния (`voting-state.service.ts`'s `UPDATE ... WHERE id = ... AND status = current` — тот же compare-and-swap, что и раньше) физически ждёт снятия этой блокировки: какая бы транзакция ни выиграла гонку, вторая видит уже актуальное состояние. То же самое действует для перехода `VOTING → FINISHED`.

Таймстемпы `votingStartedAt`/`votingFinishedAt` пишутся через `NOW()` внутри того же атомарного `UPDATE` (raw SQL), а не через `new Date()` в JS заранее — иначе под конкуренцией (когда `UPDATE` ждёт снятия блокировки) таймстемп мог оказаться раньше фактического момента коммита. См. DECISIONS.md D28/D29.

Повторный идентичный голос (тот же `user`+`photo`+`nomination`) обрабатывается как идемпотентный успех (`findUnique` внутри той же транзакции, без второй записи) — не как попытка `create()` с отловом unique-constraint.

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
