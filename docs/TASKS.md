# План задач — Slava Vote

Статус: живой документ, обновляется по мере выполнения. Последнее обновление: 2026-08-20.

Легенда статусов: ✅ Done · 🔜 Ready (согласовано, можно начинать) · ⏳ Todo (не начато, ждёт предыдущих фаз) · 🧊 Backlog (сознательно отложено / TBD).

## Обзор по фазам

| Фаза | Название | Статус |
| --- | --- | --- |
| 0 | Project foundation | ✅ Done |
| 2 | Database (Prisma schema) | ✅ Done — миграция применена к Neon |
| 3 | Users / RBAC | ⏳ Todo |
| 4 | Voting state machine | ⏳ Todo |
| 5 | Voting access (`canVote`) + атомарность | ⏳ Todo |
| 6 | Tests | ⏳ Todo |
| — | Backlog / TBD | 🧊 |

(Нумерация фаз сохранена от исходного плана; отдельной "Phase 1" как самостоятельной задачи нет — это был чекпоинт внутри Phase 0.)

---

## Phase 0 — Project foundation ✅ Done

Коммит: `f2b65ab` (запушен в `main`).

| ID | Задача | Статус |
| --- | --- | --- |
| T0.1 | Git подключён к существующему репозиторию `AntonKlip/Slava-Vote-or`, дублирующий локальный клон устранён | ✅ |
| T0.2 | `package.json` (npm, ESM), `tsconfig.json` (strict, NodeNext) | ✅ |
| T0.3 | ESLint (flat config) + Prettier | ✅ |
| T0.4 | Зависимости установлены: grammy, dotenv, typescript, tsx, @types/node, vitest, prisma, @prisma/client, eslint, typescript-eslint, prettier | ✅ |
| T0.5 | npm-скрипты: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `prisma:generate`, `prisma:migrate` | ✅ |
| T0.6 | `.env.example` + `src/config/config.ts` (валидация `BOT_TOKEN`, парсинг `ADMIN_TELEGRAM_IDS`) | ✅ |
| T0.7 | Скелет `src/` (`bot/{commands,handlers,keyboards,messages}`, `services/`, `middleware/`, `database/`, `config/`), `src/index.ts` — временная заглушка `/start` → "pong" | ✅ |
| T0.8 | Проверено: `typecheck`, `build`, `lint` проходят; сквозная цепочка config → grammY → Telegram API подтверждена (фейковый токен → честный `401` от Telegram) | ✅ |
| T0.9 | README.md с инструкцией запуска | ✅ |

Известный технический долг: 3 high-severity в транзитивной dev-зависимости Prisma CLI (`deepmerge-ts`) — осознанно не фиксировали, см. DECISIONS.md D7.

---

## Phase 2 — Database (Prisma schema) ✅ Done

| ID | Задача | Зависит от | Статус | Приёмочные критерии |
| --- | --- | --- | --- | --- |
| T2.1 | `npx prisma init --datasource-provider postgresql` | T0.4 | ✅ | `prisma/schema.prisma` создан (URL теперь через `prisma.config.ts`, см. DECISIONS.md D14) |
| T2.2 | Описать enum'ы `UserRole`, `VotingStatus`, `PhotoStatus` | T2.1 | ✅ | значения строго как в PRODUCT_SPEC.md / DECISIONS.md D8 |
| T2.3 | Модель `User` (`telegramId` unique, `role`, timestamps) | T2.1 | ✅ | `prisma validate` проходит; `telegramId` — единственный уникальный идентификатор |
| T2.4 | Модель `Photo` (глобальная, без FK на что-либо) | T2.1 | ✅ | `telegramFileUniqueId` индексирован, не unique (D10); `status` soft-delete enum |
| T2.5 | Модель `Nomination` (глобальная) | T2.1 | ✅ | без `contestId`, поля по PRODUCT_SPEC.md |
| T2.6 | Модель `Vote` (`userId`+`photoId`+`nominationId`) | T2.3–T2.5 | ✅ | `@@unique([userId, photoId, nominationId])`; **нет** `@@unique([userId, nominationId])` (D13); индекс `[nominationId, photoId]` |
| T2.7 | Модель `VotingPermission` (per-user) | T2.3 | ✅ | `userId` unique, `grantedBy` → `User` (D11) |
| T2.8 | Модель `VotingState` (одна строка статуса) | T2.1 | ✅ | поля `status`, `votingStartedAt`, `votingFinishedAt`; без каскадов нигде (D12) |
| T2.9 | Schema-only проверки: `prisma format`, `prisma validate`, `prisma generate` | T2.2–T2.8 | ✅ | все три команды завершились без ошибок, без подключения к реальной БД |
| T2.10 | `npm run typecheck` / `npm run build` + lint после генерации клиента | T2.9 | ✅ | typecheck/build/lint проходят; `postinstall: prisma generate` добавлен, `src/generated/` исключён из ESLint |
| T2.11 | Коммит `prisma/schema.prisma` + скаффолдинг `prisma/` | T2.10 | ✅ | запушено в `main` |
| T2.12 | Применить миграцию `init` к Neon | T2.11 | ✅ | `20260820192542_init` применена, `npm run typecheck`/`lint` проходят после миграции. Отступление от D6: пользователь вставил реальный `DATABASE_URL` прямо в чат, а не только в свой `.env` — см. DECISIONS.md D15 |

---

## Phase 3 — Users / RBAC ⏳ Todo

| ID | Задача | Зависит от | Приёмочные критерии |
| --- | --- | --- | --- |
| T3.1 | `user.service.ts`: upsert по `telegramId` | T2.3, T2.12 | повторный `/start` того же `telegram_id` не создаёт дубликат |
| T3.2 | Bootstrap первого ADMIN через `ADMIN_TELEGRAM_IDS` | T3.1 | пользователь с `telegram_id` из списка получает `role = ADMIN` при первом `/start` |
| T3.3 | `/start` handler использует `user.service` (замена текущей заглушки) | T3.1 | handler не содержит бизнес-логику, только вызов сервиса |
| T3.4 | `middleware/permissions.ts` — серверная проверка роли | T3.1 | USER не может выполнить moderator/admin-действие даже прямым callback-запросом |

## Phase 4 — Voting state machine ⏳ Todo

(было "Contest state machine" в исходном плане — переименовано, см. DECISIONS.md D8/D9.)

| ID | Задача | Зависит от | Приёмочные критерии |
| --- | --- | --- | --- |
| T4.1 | `voting-state.service.ts`: получение/создание единственной строки `VotingState` | T2.8, T2.12 | вызов при отсутствии строки создаёт ровно одну; повторный вызов не создаёт вторую |
| T4.2 | Функция перехода состояния с картой разрешённых переходов (`DRAFT→VIEWING→VOTING→FINISHED`) | T4.1 | переходы `FINISHED→VOTING`, `FINISHED→VIEWING`, повторный запуск/остановка — отклоняются на сервере |
| T4.3 | Команды модератора для запуска/остановки голосования | T4.2, T3.4 | доступно только MODERATOR/ADMIN; при запуске пишется `votingStartedAt`, при остановке — `votingFinishedAt` |

## Phase 5 — Voting access (`canVote`) + атомарность ⏳ Todo

| ID | Задача | Зависит от | Приёмочные критерии |
| --- | --- | --- | --- |
| T5.1 | `voting-permission.service.ts` (grant/revoke) | T2.7, T3.4 | повторная выдача разрешения одному пользователю не создаёт дубликат (unique `userId`) |
| T5.2 | `canVote(user, votingState)` в `voting.service.ts` — единая точка истины | T4.1, T5.1 | покрывает матрицу из PRODUCT_SPEC.md (DRAFT/VIEWING/VOTING/FINISHED × с/без permission); не дублируется в хендлерах |
| T5.3 | Атомарная запись голоса (транзакция/условный UPDATE) | T5.2 | гонка "голос vs остановка голосования" не приводит к записи голоса после перехода в FINISHED (см. ARCHITECTURE.md, раздел "Атомарность") |

## Phase 6 — Tests ⏳ Todo

| ID | Задача | Зависит от | Приёмочные критерии |
| --- | --- | --- | --- |
| T6.1 | Тесты RBAC | T3.4 | покрывает все три роли и запрет чужих действий |
| T6.2 | Тесты машины состояний голосования | T4.2 | все валидные и невалидные переходы |
| T6.3 | Тесты `canVote` | T5.2 | вся матрица доступа |
| T6.4 | Тесты уникальности голоса | T2.6, T5.3 | повторный голос за то же (photo, nomination) отклоняется на уровне БД |
| T6.5 | Тест детерминированности результатов | результат Phase 6 предполагает минимальный `results.service` | одинаковый ввод → одинаковый порядок при ничьей (`photo.id ASC`) |

---

## Backlog / TBD 🧊

Сознательно не реализуется и не проектируется заранее — см. PRODUCT_SPEC.md, раздел TBD:

- финальные названия и количество номинаций;
- точные правила голосования (одна/несколько фотографий на номинацию, изменение голоса);
- финальный UI каталога/просмотра/голосования (список / карточки / последовательная навигация);
- полноценный `results.service` под финализированные правила;
- выбор хостинга для постоянно работающего процесса;
- CI (GitHub Actions) для typecheck/lint/tests — не настроено.
