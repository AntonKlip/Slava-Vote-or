# План задач — Slava Vote

Статус: живой документ, обновляется по мере выполнения. Последнее обновление: 2026-08-20.

Продуктовое решение (2026-08-20): основным интерфейсом голосования становится Telegram Mini App
вместо чат-команд бота. План разработки продолжается тремя фазами: Phase 5 (`canVote` + атомарность —
без изменений), новая Phase 6 (управление фото/номинациями — этой возможности не было ни в одной
прошлой фазе), новая Phase 7 (Telegram Mini App). Подробности и обоснование — см. DECISIONS.md D19–D26.

Легенда статусов: ✅ Done · 🔜 Ready (согласовано, можно начинать) · ⏳ Todo (не начато, ждёт предыдущих фаз) · 🧊 Backlog (сознательно отложено / TBD).

## Обзор по фазам

| Фаза | Название | Статус |
| --- | --- | --- |
| 0 | Project foundation | ✅ Done |
| 2 | Database (Prisma schema) | ✅ Done — миграция применена к Neon |
| 3 | Users / RBAC | ✅ Done |
| 4 | Voting state machine | ✅ Done |
| 5 | Voting access (`canVote`) + атомарность | ✅ Done |
| 6 | Управление фото и номинациями | ⏳ Todo |
| 7 | Telegram Mini App | ⏳ Todo |
| — | Backlog / TBD | 🧊 |

(Нумерация фаз сохранена от исходного плана; отдельной "Phase 1" как самостоятельной задачи нет — это был чекпоинт внутри Phase 0. Начиная с Phase 5 отдельной фазы "Tests" больше нет — каждая фаза включает тесты в свои приёмочные критерии, см. DECISIONS.md D26.)

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

## Phase 3 — Users / RBAC ✅ Done

| ID | Задача | Зависит от | Приёмочные критерии | Статус |
| --- | --- | --- | --- | --- |
| T3.1 | `user.service.ts`: upsert по `telegramId` | T2.3, T2.12 | повторный `/start` того же `telegram_id` не создаёт дубликат | ✅ |
| T3.2 | Bootstrap первого ADMIN через `ADMIN_TELEGRAM_IDS` | T3.1 | пользователь с `telegram_id` из списка получает `role = ADMIN` при первом `/start` | ✅ |
| T3.3 | `/start` handler использует `user.service` (замена текущей заглушки) | T3.1 | handler не содержит бизнес-логику, только вызов сервиса | ✅ |
| T3.4 | `middleware/permissions.ts` — серверная проверка роли | T3.1 | USER не может выполнить admin-действие даже прямым callback-запросом | ✅ (`requireRole`, задействуется в Phase 4) |

Реализация: `src/database/prisma.ts` (синглтон Prisma Client с driver adapter `@prisma/adapter-pg`, обязателен в Prisma 7 для Postgres), `src/services/user.service.ts`, `src/bot/context.ts` (типизированный `MyContext` с `ctx.dbUser`), `src/middleware/permissions.ts` (`attachDbUser`, `requireRole`), `src/bot/handlers/start.handler.ts`. `config.databaseUrl` стал обязательной переменной (раньше был опциональным fallback на `''`). Проверено: `typecheck`/`lint`/`build` чисто, реальное подключение к Neon подтверждено (`prisma.user.count()` вернул 0).

## Phase 4 — Voting state machine ✅ Done

(было "Contest state machine" в исходном плане — переименовано, см. DECISIONS.md D8/D9.)

| ID | Задача | Зависит от | Приёмочные критерии | Статус |
| --- | --- | --- | --- | --- |
| T4.1 | `voting-state.service.ts`: получение/создание единственной строки `VotingState` | T2.8, T2.12 | вызов при отсутствии строки создаёт ровно одну; повторный вызов не создаёт вторую | ✅ |
| T4.2 | Функция перехода состояния с картой разрешённых переходов (`DRAFT→VIEWING→VOTING→FINISHED`) | T4.1 | переходы `FINISHED→VOTING`, `FINISHED→VIEWING`, повторный запуск/остановка — отклоняются на сервере | ✅ |
| T4.3 | Команды администратора для запуска/остановки голосования | T4.2, T3.4 | доступно только ADMIN; при запуске пишется `votingStartedAt`, при остановке — `votingFinishedAt` | ✅ |

Реализация: `src/services/voting-state.service.ts` (`getOrCreateVotingState`, `ALLOWED_TRANSITIONS`, `openViewing`/`startVoting`/`stopVoting`, `InvalidVotingTransitionError`), `src/bot/commands/voting-state.commands.ts` (хендлеры), `src/index.ts` (регистрация `/open_viewing`, `/start_voting`, `/stop_voting`, все под `requireRole(UserRole.ADMIN)`). Перед этой фазой роль `MODERATOR` удалена из модели — см. DECISIONS.md D18. `typecheck`/`lint`/`build` проходят чисто.

## Phase 5 — Voting access (`canVote`) + атомарность ✅ Done

| ID | Задача | Зависит от | Приёмочные критерии | Статус |
| --- | --- | --- | --- | --- |
| T5.1 | `voting-permission.service.ts` (grant/revoke) + bot-команды `/grant_access`, `/revoke_access` (ADMIN, по `telegram_id` или reply) | T2.7, T3.4 | повторная выдача разрешения одному пользователю не создаёт дубликат (unique `userId`); команды доступны только ADMIN | ✅ |
| T5.2 | `canVote(user, votingState, hasPermission)` в `voting.service.ts` — единая точка истины, чистая функция | T4.1, T5.1 | покрывает матрицу из PRODUCT_SPEC.md (DRAFT/VIEWING/VOTING/FINISHED × с/без permission), включая явную ветку ADMIN (голосует наравне с USER+permission); не дублируется в хендлерах | ✅ |
| T5.3 | Атомарная запись голоса `castVote()` (транзакция + `SELECT ... FOR UPDATE` на строке `VotingState`) | T5.2 | гонка "голос vs остановка голосования" не приводит к записи голоса после перехода в FINISHED (см. ARCHITECTURE.md, раздел "Атомарность"); заодно проверяет `Photo.status = ACTIVE` и `Nomination.active`; повторный идентичный голос идемпотентен (без второй записи) | ✅ |
| T5.4 | Тесты (vitest): RBAC, переходы state machine, матрица `canVote`, уникальность голоса, гонка голос/стоп | T5.1–T5.3 | 29 тестов, `npm test` зелёный | ✅ |

Реализация: `src/services/voting-permission.service.ts` (`grantPermission`/`revokePermission`/`hasVotingPermission`), `src/services/voting.service.ts` (`canVote`, `canUserVoteNow`, `castVote`, `VotingNotAllowedError`, `InvalidVoteTargetError`), `src/bot/commands/voting-permission.commands.ts`, `src/index.ts` (регистрация `/grant_access`, `/revoke_access`). Матрица прав голоса (включая явное решение по ADMIN) зафиксирована в PRODUCT_SPEC.md.

Побочная находка при написании гоночного теста: `votingStartedAt`/`votingFinishedAt` в `voting-state.service.ts` считались через `new Date()` в JS **до** ожидания блокировки строки — под конкуренцией таймстемп мог оказаться раньше реального момента commit (не влияет на корректность самого перехода, только на точность отображаемого времени). Исправлено: таймстемп теперь пишется через `NOW()` внутри того же атомарного `UPDATE` (raw SQL, `Prisma.sql`/`Prisma.raw`/`Prisma.empty`).

Тесты бьют напрямую в реальный Neon (нет тестовой БД, см. D4) и используют отрицательные `telegramId` для тестовых пользователей (реальные Telegram id всегда положительные — коллизий не бывает), с гарантированной очисткой после себя (`afterAll`/`try…finally`). `vitest.config.ts` отключает параллелизм файлов (`fileParallelism: false`), так как несколько файлов тестов делят одну и ту же singleton-строку `VotingState`. Тестовые файлы исключены из продакшен-сборки через новый `tsconfig.build.json` (`npm run build` теперь использует его вместо `tsconfig.json`, чтобы в `dist/` не попадали `*.test.js`); `npm run typecheck` по-прежнему проверяет тесты через основной `tsconfig.json`.

## Phase 6 — Управление фото и номинациями ⏳ Todo

Новая фаза — этой возможности не было ни в одной прошлой фазе (обнаружено при подготовке миграции на Mini App, см. DECISIONS.md D19). Разбивка задач и найденные при планировании отклонения от изначального списка — см. DECISIONS.md D31.

| ID | Задача | Зависит от | Приёмочные критерии | Статус |
| --- | --- | --- | --- | --- |
| T6.1 | `src/services/photo.service.ts` — `createPhoto`, `listActive` (paginated, `ORDER BY createdAt ASC, id ASC`), `getById`, `softDelete` | T2.4 | `status: DELETED` не попадает в `listActive`; порядок детерминирован; связанные `Vote` не трогаются при удалении (D12); пагинация покрыта тестом | ✅ |
| T6.2 | `src/services/nomination.service.ts` — `createNomination` (`sortOrder = MAX(sortOrder)+1`, не переиспользуется после деактивации), `listActive` (`ORDER BY sortOrder`), `deactivate(id)` | T2.5 | без `contestId`, без `PhotoNomination`; повторный `deactivate` не падает | ✅ |
| T6.3 | Bot-flow добавления фото (ADMIN), строго одним сообщением: фото + caption = имя участника. Caption (`trim()`, непустой) обязателен, без диалога/ожидания следующего апдейта | T6.1, T3.4 | без (пустого) caption `Photo` не создаётся | ✅ |
| T6.4 | Bot-команды номинаций: `/add_nomination`, `/list_nominations`, `/deactivate_nomination <id>` (ADMIN) | T6.2, T3.4 | доступны только ADMIN; деактивация по `id`, не по имени (`Nomination.name` не unique) | ✅ |
| T6.5 | Bot-команды фото: `/list_photos` (paginated), `/delete_photo <id>` (ADMIN) — новая задача, см. D31 | T6.1, T3.4 | доступны только ADMIN; несуществующий/уже удалённый `id` — понятная ошибка | ✅ |
| T6.6 | Опциональный доп. интеграционный/регрессионный прогон после T6.3–T6.5 (не обязателен для приёмки — тесты `photo.service`/`nomination.service` уже входят в T6.1/T6.2, см. D26/D31) | T6.1, T6.2 | выполняется только если ручная проверка вскроет непокрытый кейс | 🧊 |

Реализация T6.1: `src/services/photo.service.ts` (`createPhoto`, `listActive`, `getById`, `softDelete`), `src/services/photo.service.test.ts` (7 тестов, включая проверку сохранности `Vote` после `softDelete`). `typecheck`/`lint`/`build`/`npm test` (36/36) проходят чисто.

Реализация T6.2: `src/services/nomination.service.ts` (`createNomination`, `listActive`, `deactivate`), `src/services/nomination.service.test.ts` (4 теста, включая проверку что `sortOrder` не переиспользуется после деактивации). `typecheck`/`lint`/`build`/`npm test` (40/40) проходят чисто.

Реализация T6.3: `src/bot/handlers/photo-add.handler.ts` (`handleAddPhoto`), регистрация `bot.on('message:photo', requireRole(ADMIN), handleAddPhoto)` в `src/index.ts`. Без отдельного unit-теста хендлера — как и в Phase 4/5, тестируется только сервисный слой (T6.1); ручная проверка через `npm run dev` — перед финальной приёмкой Phase 6. `typecheck`/`lint`/`build` чисты.

Реализация T6.4/T6.5: `src/bot/commands/nomination.commands.ts` (`handleAddNomination`, `handleListNominations`, `handleDeactivateNomination`), `src/bot/commands/photo.commands.ts` (`handleListPhotos`, `handleDeletePhoto`), регистрация всех пяти команд в `src/index.ts` под `requireRole(ADMIN)`. Несуществующий `id` в `deactivate_nomination`/`delete_photo` отлавливается через `Prisma.PrismaClientKnownRequestError` (код `P2025`) и превращается в понятное сообщение, а не падает исключением. Без отдельных unit-тестов хендлеров (см. T6.3) — сервисный слой уже покрыт (T6.1/T6.2); ручная проверка — перед финальной приёмкой Phase 6. `typecheck`/`lint`/`build`/`npm test` (40/40) чисты.

## Phase 7 — Telegram Mini App ⏳ Todo

См. полную разбивку T7.1–T7.14 и архитектурные решения D20–D25 в DECISIONS.md; задачи не переносятся сюда до начала фазы (по одной фазе за раз).

---

## Backlog / TBD 🧊

Сознательно не реализуется и не проектируется заранее — см. PRODUCT_SPEC.md, раздел TBD:

- финальные названия и количество номинаций;
- точные правила голосования (сколько разных фото можно выбрать в одной номинации);
- можно ли отозвать/изменить голос — сама возможность не отбрасывается, `voting.service`/API проектируются так, чтобы replace/cancel можно было добавить позже без переделки контракта (см. DECISIONS.md D25), но не реализуется, пока не решено правило про количество фото;
- финальный UI каталога/просмотра/голосования (грид/список/карточки — экспериментировать в Phase 7);
- полноценный `results.service` под финализированные правила (базовая версия — TOP-2, tie-break `photo.id ASC` — запланирована в T7.11);
- выбор хостинга для постоянно работающего процесса;
- CI (GitHub Actions) для typecheck/lint/tests — не настроено.
