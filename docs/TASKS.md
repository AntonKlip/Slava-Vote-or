# План задач — Slava Vote

Статус: живой документ, обновляется по мере выполнения. Последнее обновление: 2026-08-21.

Продуктовое решение (2026-08-20): основным интерфейсом голосования становится Telegram Mini App
вместо чат-команд бота. План разработки продолжается: Phase 5 (`canVote` + атомарность — без
изменений), Phase 6 (управление фото/номинациями), затем сам переход на Mini App — разбитый на
три фазы по границам ответственности (Phase 7 — HTTP API, Phase 8 — frontend, Phase 9 — запуск
внутри реального Telegram) вместо одной большой фазы, см. DECISIONS.md D19–D26, D33–D35.

Легенда статусов: ✅ Done · 🔜 Ready (согласовано, можно начинать) · ⏳ Todo (не начато, ждёт предыдущих фаз) · 🧊 Backlog (сознательно отложено / TBD).

## Обзор по фазам

| Фаза | Название | Статус |
| --- | --- | --- |
| 0 | Project foundation | ✅ Done |
| 2 | Database (Prisma schema) | ✅ Done — миграция применена к Neon |
| 3 | Users / RBAC | ✅ Done |
| 4 | Voting state machine | ✅ Done |
| 5 | Voting access (`canVote`) + атомарность | ✅ Done |
| 6 | Управление фото и номинациями | ✅ Done |
| 7 | Mini App — HTTP API | ✅ Done |
| 8 | Mini App — Frontend | ✅ Done |
| 9 | Mini App — Запуск внутри реального Telegram | ✅ Done |
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

## Phase 6 — Управление фото и номинациями ✅ Done

Новая фаза — этой возможности не было ни в одной прошлой фазе (обнаружено при подготовке миграции на Mini App, см. DECISIONS.md D19). Разбивка задач и найденные при планировании отклонения от изначального списка — см. DECISIONS.md D31.

| ID | Задача | Зависит от | Приёмочные критерии | Статус |
| --- | --- | --- | --- | --- |
| T6.1 | `src/services/photo.service.ts` — `createPhoto`, `listActive` (paginated, `ORDER BY createdAt ASC, id ASC`), `getById`, `softDelete` | T2.4 | `status: DELETED` не попадает в `listActive`; порядок детерминирован; связанные `Vote` не трогаются при удалении (D12); пагинация покрыта тестом | ✅ |
| T6.2 | `src/services/nomination.service.ts` — `createNomination` (`sortOrder = MAX(sortOrder)+1`, не переиспользуется после деактивации), `listActive` (`ORDER BY sortOrder`), `deactivate(id)` | T2.5 | без `contestId`, без `PhotoNomination`; повторный `deactivate` не падает | ✅ |
| T6.3 | Bot-flow добавления фото (ADMIN), строго одним сообщением: фото + caption = имя участника. Caption (`trim()`, непустой) обязателен, без диалога/ожидания следующего апдейта | T6.1, T3.4 | без (пустого) caption `Photo` не создаётся | ✅ |
| T6.4 | Bot-команды номинаций: `/add_nomination`, `/list_nominations`, `/deactivate_nomination <id>` (ADMIN) | T6.2, T3.4 | доступны только ADMIN; деактивация по `id`, не по имени (`Nomination.name` не unique) | ✅ |
| T6.5 | Bot-команды фото: `/list_photos` (paginated), `/delete_photo <id>` (ADMIN) — новая задача, см. D31 | T6.1, T3.4 | доступны только ADMIN; несуществующий/уже удалённый `id` — понятная ошибка | ✅ |
| T6.6 | Опциональный доп. интеграционный/регрессионный прогон после T6.3–T6.5 (не обязателен для приёмки — тесты `photo.service`/`nomination.service` уже входят в T6.1/T6.2, см. D26/D31) | T6.1, T6.2 | выполняется только если ручная проверка вскроет непокрытый кейс | 🧊 не потребовался — ручная проверка прошла без замечаний |

Реализация T6.1: `src/services/photo.service.ts` (`createPhoto`, `listActive`, `getById`, `softDelete`), `src/services/photo.service.test.ts` (7 тестов, включая проверку сохранности `Vote` после `softDelete`). `typecheck`/`lint`/`build`/`npm test` (36/36) проходят чисто.

Реализация T6.2: `src/services/nomination.service.ts` (`createNomination`, `listActive`, `deactivate`), `src/services/nomination.service.test.ts` (4 теста, включая проверку что `sortOrder` не переиспользуется после деактивации). `typecheck`/`lint`/`build`/`npm test` (40/40) проходят чисто.

Реализация T6.3: `src/bot/handlers/photo-add.handler.ts` (`handleAddPhoto`), регистрация `bot.on('message:photo', requireRole(ADMIN), handleAddPhoto)` в `src/index.ts`. Без отдельного unit-теста хендлера — как и в Phase 4/5, тестируется только сервисный слой (T6.1); ручная проверка через `npm run dev` — перед финальной приёмкой Phase 6. `typecheck`/`lint`/`build` чисты.

Реализация T6.4/T6.5: `src/bot/commands/nomination.commands.ts` (`handleAddNomination`, `handleListNominations`, `handleDeactivateNomination`), `src/bot/commands/photo.commands.ts` (`handleListPhotos`, `handleDeletePhoto`), регистрация всех пяти команд в `src/index.ts` под `requireRole(ADMIN)`. Несуществующий `id` в `deactivate_nomination`/`delete_photo` отлавливается через `Prisma.PrismaClientKnownRequestError` (код `P2025`) и превращается в понятное сообщение, а не падает исключением. Без отдельных unit-тестов хендлеров (см. T6.3) — сервисный слой уже покрыт (T6.1/T6.2); ручная проверка — перед финальной приёмкой Phase 6. `typecheck`/`lint`/`build`/`npm test` (40/40) чисты.

`Photo.id`/`Nomination.id` заменены с cuid на `Int autoincrement` по итогам ручной проверки (cuid неудобно вводить вручную) — см. DECISIONS.md D32, миграция `20260820215416_simple_int_ids_photo_nomination` применена к Neon.

### Ручная проверка — завершена 2026-08-21

Полный чек-лист (см. план `phase-6-rosy-lecun.md`, раздел "Проверка") пройден без замечаний: добавление фото/номинации через bot-flow, `/list_photos` → `/delete_photo <id>` и `/list_nominations` → `/deactivate_nomination <id>` с новыми числовыми id (после D32), отказ для не-ADMIN аккаунта — всё работает штатно. T6.6 не потребовался.

Код T6.1–T6.5 закоммичен в `main` (6+ локальных коммитов) — **push в `origin/main` пока не выполнялся**, решение за пользователем.

Phase 6 закрыта.

## Phase 7 — Mini App: HTTP API ✅ Done

Первая из трёх фаз перехода на Telegram Mini App (D19), разделённых по границам ответственности вместо одной большой Phase 7 (обоснование — DECISIONS.md D33): **Phase 7** — HTTP API, **Phase 8** — Mini App frontend, **Phase 9** — запуск внутри реального Telegram. Каждая фаза полностью реализуется и проверяется до начала следующей.

Phase 7 — backend-слой поверх существующих `services/`, без фронтенда и без Telegram; проверяется curl/supertest. Архитектурные решения — DECISIONS.md D19–D25 (общая архитектура Mini App), D33–D35 (уточнения по auth/результатам/разбивке на фазы).

| ID | Задача | Зависит от | Приёмочные критерии | Статус |
| --- | --- | --- | --- | --- |
| T7.1 | Express bootstrap: `src/api/app.ts` (`createApp`), `GET /api/health`, `app.listen` рядом с `bot.start()` в `src/index.ts` | — | `npm run dev` поднимает бота и Express одновременно; `GET /api/health` → 200; typecheck/lint/build чистые | ✅ |
| T7.2 | `canViewPhotos` — чистая функция доступа к просмотру, `voting.service.ts` | — | покрывает матрицу PRODUCT_SPEC.md "Просмотр фотографий" явной веткой; unit-тесты без БД | ✅ |
| T7.3 | Валидация Telegram `initData` (HMAC-SHA256, `src/api/auth/telegram-init-data.ts`) + выдача/проверка JWT (`src/api/auth/jwt.ts`, `jsonwebtoken`, `APP_JWT_SECRET`) | — | валидная/невалидная/протухшая подпись обрабатываются корректно; JWT round-trip; unit-тесты без сети/БД | ✅ |
| T7.4 | `POST /api/auth/telegram` + `requireAuth` мидлвар (`src/api/routes/auth.routes.ts`, `src/api/middleware/require-auth.ts`) | T7.1, T7.3 | верная роль при bootstrap (как в `/start`); 401 без/с невалидным токеном; роль перечитывается из БД на каждый запрос (D34); первый в проекте `supertest`-тест | ✅ |
| T7.5 | `GET /api/photos`, `GET /api/nominations`, `GET /api/voting-state` | T7.4, T7.2 | гейт `canViewPhotos` на оба списка (D35); ответ по фото без `telegramFileId` | ✅ |
| T7.6 | `GET /api/photos/:id/image` — прокси через `bot.api.getFile`, in-memory кэш `file_path` (TTL); `bot` выносится в `src/bot/bot.ts` | T7.5, T7.1 | отдаёт байты авторизованным; 403/404 корректно; `BOT_TOKEN` не попадает в браузер (D23) | ✅ |
| T7.7 | `POST /api/votes` — тонкий роут поверх `castVote()` | T7.4 | идемпотентность (`alreadyVoted`); 403/400 по фазе/цели; без переизобретения бизнес-логики (D25) | ✅ |
| T7.8 | `src/services/results.service.ts` — `computeResults()`, `canViewResults()` | — | детерминированный tie-break `photo.id ASC`; интеграционные тесты против Neon (тест на ничью обязателен) | ✅ |
| T7.9 | `GET /api/results` | T7.8, T7.4 | гейт `canViewResults`; числа голосов скрыты от всех, включая ADMIN (D35) | ✅ |
| T7.10 | Закрытие фазы — полная ручная проверка HTTP API (curl/Postman, без браузера и без Telegram) по всей матрице auth × фаза × роль | T7.1–T7.9 | чек-лист без замечаний; `npm test`/typecheck/lint/build зелёные | ✅ |

Реализация: `src/api/app.ts` (`createApp({ bot })`, монтирует все роуты + JSON error-handler), `src/api/auth/{telegram-init-data,jwt}.ts`, `src/api/middleware/require-auth.ts`, `src/api/routes/{auth,voting-state,photos,nominations,votes,results}.routes.ts`, `src/api/types.d.ts` (аугментация `Express.Request.dbUser`), `src/bot/bot.ts` (общий `Bot`-инстанс, вынесен из `index.ts`), `src/services/voting.service.ts` (+`canViewPhotos`), `src/services/results.service.ts` (новый). Новые зависимости: `express`, `jsonwebtoken`, dev: `@types/express`, `@types/jsonwebtoken`, `supertest`, `@types/supertest`. `config.ts` — `apiPort` (необязательна, дефолт 3000), `appJwtSecret` (обязательна). `npm test` — 72/72 (было 40 после Phase 6), `typecheck`/`lint`/`build` чистые.

### Ручная проверка — завершена 2026-08-21

Полный прогон по матрице auth × фаза × роль (DRAFT/VIEWING/VOTING/FINISHED × USER/ADMIN) через `npm run dev` + fetch-скрипт, использующий реальный `BOT_TOKEN` для подписи `initData` (не сохранён в репозитории) и существующие `voting-state.service`-функции для переходов состояния (то же, что делают bot-команды). Проверено: bootstrap роли, 401 без/с невалидным/протухшим токеном, гейты `canViewPhotos`/`canViewResults` на всех 4 фазах для USER и ADMIN, идемпотентность голоса, отказ по невалидной цели голосования, отсутствие `voteCount` в `/api/results` для обеих ролей, `image-proxy` не даёт доступ без токена. Все тестовые данные (фото/номинация/пользователи) удалены после проверки, `VotingState` возвращён в исходный статус (`DRAFT`) — реальные данные пользователя из Phase 6 не затронуты.

Полные формулировки по каждой задаче (что именно создавалось/переиспользовалось, тесты, ручная проверка, доклады) — см. план `soft-percolating-sky.md`, раздел "Phase 7 — HTTP API".

Phase 7 закрыта. Следующий шаг — Phase 8 (Mini App frontend), по одной фазе за раз.

## Phase 8 — Mini App: Frontend ⏳ Todo

Начинается только после закрытия Phase 7 (закрыта). React + TypeScript + Vite (D22) поверх HTTP API из Phase 7 — отдельный npm workspace `frontend/`. Проверяется в обычном десктоп-браузере, без реального Telegram-клиента и без туннеля (ручная проверка — инъекция валидно подписанного `initData` через DevTools Local Overrides, см. DECISIONS.md D34 и уточнение в плане `8-delegated-wirth.md`). Границы фазы: только фронтенд поверх уже существующего API, без новых backend-эндпоинтов и без новых продуктовых правил; фронтенд не дублирует серверную бизнес-логику (`canViewPhotos`/`canVote`/`canViewResults` — окончательно на сервере).

| ID | Задача | Зависит от | Приёмочные критерии | Статус |
| --- | --- | --- | --- | --- |
| T8.1 | Bootstrap frontend-воркспейса (`frontend/`, React+TS+Vite, npm workspaces, dev-прокси `/api`) | Phase 7 | `npm run dev:frontend` поднимает пустую страницу; прокси `/api/health` работает; backend-скрипты (`dev`/`test`/`typecheck`/`lint`/`build`) не задеты | ✅ |
| T8.2 | Авторизация на фронтенде (`telegram-web-app.js`, `POST /api/auth/telegram`, JWT в React state, централизованный API-клиент `frontend/src/api/client.ts` с авто-`Authorization` и централизованной обработкой 401) | T8.1, T7.4 | успешный вход показывает роль; ошибка авторизации — видимое состояние, не пустой экран; без dev-bypass в коде | ✅ |
| T8.3 | Просмотр фото на фронтенде (`/api/voting-state`, `/api/photos`, `/api/nominations`, image через blob URL + `revokeObjectURL`) | T8.2, T7.5, T7.6 | фото рендерятся; DRAFT/FINISHED — соответствующее сообщение; пагинация работает; без утечки blob URL | ✅ |
| T8.4 | Голосование на фронтенде (`POST /api/votes`, идемпотентность, 403/400) | T8.3, T7.7 | голос отражается без перезагрузки; повтор не выглядит как ошибка; вне VOTING — понятное объяснение | ✅ |
| T8.5 | Результаты на фронтенде (`GET /api/results`, top-2 без чисел, изображения тем же способом, что в T8.3) | T8.2, T7.9 | до FINISHED — сообщение; после — корректный top-2 без утечки blob URL | ✅ |
| T8.6 | Закрытие Phase 8 — полная ручная проверка в браузере (приёмочный чек-лист, без новой функциональности) | T8.1–T8.5 | чек-лист без замечаний; `typecheck`/`lint`/`build` чистые для root и `frontend/` | ✅ |

Полная разбивка задач с деталями реализации и ручной проверки — план `8-delegated-wirth.md`.

Реализация T8.1: `frontend/` — воркспейс `create-vite` (React+TS+Vite, шаблон `react-ts`). Корневой `package.json` → `"workspaces": ["frontend"]`, новые прокси-скрипты `dev:frontend`/`build:frontend`/`typecheck:frontend`/`lint:frontend` (каждый — `npm run <script> -w frontend`). `frontend/package.json` получил свой `typecheck` (`tsc -b`, `noEmit` уже в `tsconfig.app.json`). `frontend/vite.config.ts` — dev-прокси `/api` → `http://localhost:<API_PORT>`, порт читается из корневого `.env` через `loadEnv` (без дублирования значения). Корневой `eslint.config.js` — `frontend/` добавлен в `ignores` (у фронтенда свой линтер, `oxlint`, из шаблона). Корневой `.gitignore` уже покрывал `frontend/node_modules`/`frontend/dist` (паттерны `node_modules/`/`dist/` без слэша матчат на любой глубине) — правок не потребовалось. Backend-скрипты (`dev`/`build`/`typecheck`/`lint`/`test`) — проверены после изменений, ведут себя как раньше (root `tsconfig.json`/`tsconfig.build.json` включают только `src/`). Проверено вручную: `npm run dev` + `npm run dev:frontend` параллельно, `curl localhost:5173/api/health` (через прокси Vite) → `{"status":"ok"}`.

Реализация T8.2: `frontend/index.html` — подключён `telegram-web-app.js` в `<head>`, порядок скриптов (`telegram-web-app.js` → `main.tsx`) фиксирует, что реальный Telegram API инициализируется раньше React (см. ARCHITECTURE.md/план). `frontend/src/types/telegram-web-app.d.ts` — минимальный ambient-тип `window.Telegram.WebApp`. `frontend/src/api/client.ts` — `createApiClient({getToken, onUnauthorized})`: единая точка для всех запросов к `/api/*`, авто-`Authorization`, централизованный сброс сессии на 401. `frontend/src/auth/` — `auth-context.ts` (контекст+типы), `AuthProvider.tsx` (компонент: `fetch('/api/auth/telegram')` на маунте, JWT только в `useRef`/state, retry по требованию), `useAuth.ts` (хук) — разбито на три файла ради React Fast Refresh (устраняет lint-warning `only-export-components`). JWT нигде не пишется в `localStorage`/`sessionStorage` (D21). Серверный контракт (`POST /api/auth/telegram` → `{token, user:{id,role}}`; `requireAuth` → 401 без токена) проверен одноразовым скриптом (собирает валидный `initData` тем же HMAC-алгоритмом, что и T7.4, бьёт в реально запущенный `npm run dev`, чистит тестового пользователя) — скрипт не коммитился.

Побочная находка при ручной браузерной проверке: первоначальный приём из плана (переопределить только `window.Telegram.WebApp.initData` точечно) не сработал — настоящий `telegram-web-app.js` определяет `initData` как read-only (только getter), присваивание в обычном `<script>` молча не срабатывает без ошибки в консоли. Рабочий приём — **полностью заменить** `window.Telegram` новым объектом (`{WebApp: {initData, ready(){}, expand(){}}}`) через DevTools Local Overrides, а не точечно мутировать поле существующего. Уточнение внесено в план `8-delegated-wirth.md`; остаётся чисто браузерной dev-only техникой, кода в репозитории не касается (D34). Ручная проверка (реальный Chrome, Local Overrides, `initData` подписана реальным `BOT_TOKEN` под admin `telegram_id`): успешный вход показал `Авторизован как ADMIN`; отдельно проверено состояние ошибки (испорченный `initData` → видимое сообщение об ошибке + кнопка «Повторить», не пустой экран). `typecheck`/`lint`/`build` для `frontend/` чистые (0 warnings).

Реализация T8.3: `frontend/src/api/types.ts` — типы ответов API (`PhotosResponse`, `NominationsResponse`, `VotingStateResponse`, `ForbiddenBody`). `frontend/src/api/useVotingState.ts` — хук чисто для UX-подсказки (заголовок фазы), не источник истины для доступа. `frontend/src/api/useAuthorizedImage.ts` — переиспользуемый хук: авторизованный `fetch` через централизованный клиент → `Blob` → `createObjectURL`, с гарантированным `revokeObjectURL` в cleanup эффекта при смене `path`/размонтировании (переиспользуется и в T8.5). `frontend/src/photos/{PhotoCard,PhotosScreen}.tsx` — сетка фото с пагинацией (`skip`/`take`). Доступ **не дублируется на клиенте**: `PhotosScreen` не проверяет роль/фазу сама — всегда запрашивает `/api/photos`+`/api/nominations`, и именно ответ сервера (200 → сетка; 403 с `votingStatus` в теле → соответствующее сообщение) определяет, что показать; поэтому ADMIN корректно видит фото в любой фазе (включая DRAFT/FINISHED) без отдельной ветки `if (role === 'ADMIN')` во фронтенд-коде — ровно то же поведение, что даёт серверный `canViewPhotos`.

Ручная проверка (реальные тестовые данные, добавленные через бота: 2 фото + 1 номинация): ADMIN видит сетку фото в DRAFT (до `/open_viewing`), VOTING и после `/stop_voting` в FINISHED — картинки рендерятся через blob URL, пагинация `1–2 из 2` корректна (кнопки Назад/Вперёд задизейблены, т.к. умещается на одной странице). USER (тестовый non-admin `telegram_id`) в FINISHED видит «Голосование завершено — доступны только результаты.» вместо сетки — 403 от `/api/photos`/`/api/nominations` с `votingStatus` корректно превращён в сообщение. `typecheck`/`lint`/`build` для `frontend/` чистые.

Реализация T8.4: `frontend/src/photos/PhotoCard.tsx` — по кнопке на номинацию под каждым фото, `POST /api/votes` через централизованный клиент. Ответ `{alreadyVoted}` — идемпотентный успех (D25) рендерится как отдельное состояние («уже проголосовали»), не как ошибка; 403 → «недоступно сейчас», 400 → «невалидный выбор», прочее → «ошибка, попробуйте ещё раз». Никакой проверки «можно ли голосовать» на клиенте до отправки — решает только ответ сервера.

Для ручной проверки тестовый `VotingState` пришлось напрямую (в обход обычной машины переходов, только для теста, с подтверждения пользователя) вернуть из `FINISHED` в `VOTING` — обратного перехода через сервис нет (T4.2). Ручная проверка (2 фото × 2 номинации, ADMIN): все 4 голоса поставлены через UI, отражены без перезагрузки (✓), реально записаны в Neon (сверено напрямую через Prisma) под правильным `userId`. Идемпотентность подтверждена: после перезагрузки страницы (локальный React-стейт кнопок сбрасывается) повторный клик по уже проголосованной номинации вернул `alreadyVoted:true`, показан как «(уже проголосовали)», не как сбой.

Обсуждена и сознательно отложена UX-доработка: упреждающая блокировка уже проголосованных кнопок сразу при загрузке экрана (без клика) потребовала бы нового backend-эндпоинта («мои голоса»), что выходит за границы Phase 8 («никаких новых backend-эндпоинтов», см. план). Решение пользователя — не делать сейчас, возможная отдельная задача в будущем.

Реализация T8.5: `frontend/src/results/ResultsScreen.tsx` — `GET /api/results` через централизованный клиент, тот же паттерн, что и в T8.3 (сервер решает через 403+`votingStatus`, фронтенд не гейтит сам). Картинки top-2 — тем же `useAuthorizedImage` (переиспользован, не продублирован). `App.tsx` — простое переключение вкладок «Фото»/«Результаты» (`useState<Tab>`).

Найден и исправлен баг на границе Phase 7/Phase 8 (см. DECISIONS.md D36): `GET /api/photos/:id/image` был гейтирован только `canViewPhotos`, которая явно запрещает USER доступ в FINISHED — той самой фазе, в которой USER впервые получает доступ к результатам (`canViewResults`). Из-за этого USER видел текст результатов, но не фото (пустые серые плейсхолдеры), хотя ADMIN видел всё корректно (у ADMIN обе матрицы всегда `true`, поэтому баг не проявлялся в ручной проверке Phase 7 T7.10). Исправлено точечно: гейт роута — `canViewPhotos(...) || canViewResults(...)` (обе уже существующие чистые функции переиспользованы, новой бизнес-логики не добавлено); поведение DRAFT/VIEWING/VOTING не изменилось. Правка согласована с пользователем как обоснованное исключение из границы «Phase 8 не трогает backend» — это не новый эндпоинт, а починка контракта уже существующего.

Ручная проверка (реальные тестовые данные, `VotingState` переведён в `FINISHED` через `/stop_voting`): ADMIN и USER оба видят top-2 по обеим номинациям («Секс», «Ляля») с картинками (после фикса гейта) и без чисел голосов, в полном соответствии с 4 голосами, поставленными в T8.4. `typecheck`/`lint`/`build` для `frontend/` и backend (после правки гейта) чистые.

### Ручная проверка — завершена 2026-08-21 (T8.6)

За сессию Phase 8 вживую (реальный Chrome, DevTools Local Overrides — см. D34, техника подмены `initData` уточнена по ходу T8.2) пройдено:

- **Авторизация:** успешный вход (ADMIN) с показом роли; состояние ошибки (`initData` не найден/испорчен) — видимое сообщение + кнопка «Повторить», не пустой экран.
- **Просмотр фото:** ADMIN — сетка с картинками во всех трёх достигнутых фазах (DRAFT до `/open_viewing`, VOTING, FINISHED — ADMIN видит всегда); USER — сообщение «Голосование завершено…» в FINISHED, картинки корректно не запрашивались. Пагинация (`skip`/`take`) отрендерена корректно (при 2 фото кнопки Назад/Вперёд задизейблены).
- **Голосование:** 4 голоса (2 фото × 2 номинации) поставлены через UI ADMIN'ом, отражены без перезагрузки, реально записаны в Neon; идемпотентность подтверждена (повторный клик после перезагрузки → «уже проголосовали», не ошибка).
- **Результаты:** ADMIN и USER (после FINISHED) видят одинаковый top-2 по обеим номинациям, без чисел голосов; картинки — тем же blob-URL механизмом.
- **Найден и исправлен побочный баг** (не относится к новой функциональности T8.1–T8.5, всплыл только при её ручной проверке) — гейт `/api/photos/:id/image` не пускал USER к фото из результатов в FINISHED; исправлено, см. DECISIONS.md D36.

Не проверено вживую в браузере (полагаемся на код-ревью + уже пройденную в Phase 7 T7.10 полную curl-матрицу auth×фаза×роль, поскольку `VotingState` — синглтон и необратимо дошёл до FINISHED в ходе тестирования T8.3–T8.5): USER в фазах DRAFT/VIEWING для экрана фото (код идентичен уже проверенной ветке USER+FINISHED — тот же компонент, та же функция `forbiddenMessage`, отличается только текст по `votingStatus` из ответа сервера) и явная проверка отсутствия утечки blob URL через DevTools Memory profiler (полагаемся на корректность `revokeObjectURL` в cleanup эффекта, подтверждённую чтением кода `useAuthorizedImage`).

`npm test` (72/72), `typecheck`/`lint`/`build` — чистые для root и `frontend/` (0 warnings). Код Phase 8 не закоммичен — коммит и пуш по решению пользователя.

Phase 8 закрыта.

## Phase 9 — Mini App: запуск внутри реального Telegram ✅ Done

Начинается только после закрытия Phase 8 (закрыта). Продакшен-сборка `frontend/dist` статикой из Express (D22), кнопка запуска Mini App в боте (`web_app`, `MINI_APP_URL`). `cloudflared` — разовый инструмент ручной E2E-проверки на этом этапе, не часть архитектуры (см. DECISIONS.md D33).

| ID | Задача | Зависит от | Приёмочные критерии | Статус |
| --- | --- | --- | --- | --- |
| T9.1 | Продакшен-раздача `frontend/dist` из Express (`express.static` в `src/api/app.ts`); `npm run build` (root) собирает фронтенд и backend одной командой | Phase 8 | `npm run build && npm start` → `/` отдаёт HTML, `/api/health` работает, реальный сгенерированный ассет (`/assets/index-*.js`, имя взято из фактической сборки, не угадано) отдаётся 200 | ✅ |
| T9.2 | Кнопка запуска Mini App в боте — персистентная menu-button (`bot.api.setChatMenuButton`, `type: web_app`), новая переменная `MINI_APP_URL` (обязательная, HTTPS) | T9.1 | menu-button виден в Telegram с правильным `url`; вызов `setChatMenuButton` не блокирует запуск бота/API при ошибке (try/catch + лог) | ✅ |
| T9.3 | Закрытие фазы — ручная E2E-проверка в реальном Telegram через `cloudflared`-туннель, с настоящим `initData` (не инъекция из Phase 8), под обеими ролями (ADMIN и USER) | T9.1, T9.2 | полный флоу (авторизация → просмотр → голосование → результаты) пройден вживую под ADMIN и под USER; `typecheck`/`lint`/`test`/`build` зелёные | ✅ |

Реализация T9.1: `src/api/app.ts` — `express.static(frontendDistDir)` (путь через `fileURLToPath(import.meta.url)`, одинаково работает из `src/` под `tsx` и из `dist/` после `tsc`), смонтирован сразу после `express.json()`, до `/api/*`-роутов. SPA-fallback роут не нужен — фронтенд без клиентского роутера (`App.tsx` — переключение вкладок через `useState`), единственная точка входа `/`, которую `express.static` отдаёт сама. Корневой `package.json`: `build` → `npm run build:frontend && tsc -p tsconfig.build.json`. Проверено: `npm run build` (весь путь, включая `vite build` фронтенда) → `npm start` → `curl` на `/`, `/api/health` и на реальный сгенерированный файл (`assets/index-BfBGPc3O.js`, имя прочитано из `frontend/dist/index.html`, не предположено) — все 200, тело ассета непустое (198404 байт, совпадает с выводом `vite build`). `typecheck`/`lint`/`npm test` (72/72) чистые, тестовый прод-процесс остановлен после проверки.

Реализация T9.2: `.env.example`/`src/config/config.ts` — `MINI_APP_URL` (`required`, по аналогии с `botToken`/`appJwtSecret`). `src/index.ts` — `bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: config.miniAppUrl } } })` вызывается один раз при старте (глобально, без `chat_id`), рядом с уже существующим `setMyCommands`; обёрнут в `try/catch` — ошибка логируется (`console.error`), но не мешает `app.listen`/`bot.start()`. Решение — почему menu-button, а не инлайн-кнопка в `/start` — DECISIONS.md D37.

### Ручная проверка — завершена 2026-08-21 (T9.3)

Отклонение от исходного плана: второй реальный Telegram-аккаунт для USER оказался недоступен пользователю на момент проверки. Вместо этого использован один и тот же реальный аккаунт (ADMIN из `ADMIN_TELEGRAM_IDS`) с ручным переключением `User.role` напрямую в БД между шагами (роль перечитывается из БД на каждый запрос, см. D34 — переключение применяется мгновенно, без перезапуска процесса и без повторной авторизации). Перед проверкой данные конкурса (Photo/Nomination/Vote/VotingPermission) очищены, `VotingState` сброшен в `DRAFT` — по явному запросу пользователя, реальные `User`-записи не тронуты.

Пройдено вживую через `cloudflared`-туннель (`https://<random>.trycloudflare.com`, публичный HTTPS, локальный `npm start`) и menu-button бота, с настоящим `window.Telegram.WebApp.initData`, полученным от реального Telegram-клиента (не инъекция из Phase 8):
- авторизация (реальная HMAC-подпись `initData` → `POST /api/auth/telegram`);
- `DRAFT`: ADMIN видит фото; `/start_voting` из `DRAFT` корректно отклонён сервером (машина состояний не позволяет пропустить `VIEWING`);
- `/open_viewing` → `/start_voting` → голосование через клик по кнопке в Mini App — голос реально записан (3 голоса, 4 фото, 1 номинация);
- `/stop_voting` → `FINISHED` → экран результатов показывает top-2 без чисел голосов (в соответствии с D35);
- роль USER (тот же аккаунт, роль переключена в БД) — на всех проверенных фазах доступ ограничен ровно так, как предписывает `canViewPhotos`/`canVote`/`canViewResults`, отдельных проблем не найдено.

Побочные UI-доработки, сделанные по ходу проверки на реальном устройстве (не входили в исходные T9.1–T9.3, добавлены точечно): кнопка обновления страницы (круглая, иконка `refresh-cw`, фиксированное положение в правом верхнем углу — `frontend/src/App.tsx`, `.refresh-button` в `App.css`) и русские подписи фаз голосования вместо сырых значений enum (`VOTING_STATUS_LABELS` в `frontend/src/api/types.ts`, использован в `PhotosScreen.tsx`) — обе мелкие, без изменений в бэкенде.

`typecheck`/`lint`/`test` (72/72)/`build` — чистые после всех правок (backend и `frontend/`).

Phase 9 закрыта.

### Пост-Phase 9: откат фазы назад + `/next_phase`/`/prev_phase`

Не входит ни в одну спланированную фазу — практическая доработка после первого реального использования (ADMIN мог продвинуть фазу по ошибке без способа откатить без ручного вмешательства в БД). `voting-state.service.ts` — `PREVIOUS_TRANSITIONS` (зеркало `ALLOWED_TRANSITIONS`), `nextPhase()`/`previousPhase()`; `src/bot/commands/voting-state.commands.ts` — `handleNextPhase`/`handlePreviousPhase`; регистрация `/next_phase`, `/prev_phase` в `src/index.ts` и `menu.commands.ts` (`ADMIN`-only, дополняют, не заменяют `open_viewing`/`start_voting`/`stop_voting`). Подробности и обоснование таймстемпов — DECISIONS.md D38. Тесты добавлены в `voting-state.service.test.ts` (откат на каждом шаге цепочки + оба граничных случая "дальше/раньше некуда"). `typecheck`/`lint`/`test` (78/78) чистые.

## Хостинг — локальный self-hosting с автоматическим восстановлением ✅ Done

Не входит ни в одну спланированную фазу — закрывает последний пункт Backlog (выбор хостинга). Пользователь явно выбрал: локальный ПК, $0, не платный облачный хостинг (Railway/Render рассмотрены и отклонены — подробности и обоснование см. DECISIONS.md D39).

Реализовано: `scripts/run-with-tunnel.ps1` — PowerShell-супервизор, держит живой связку `cloudflared tunnel` (бесплатный quick tunnel) + напрямую запущенный `node dist/index.js`; при падении любого из двух гарантированно останавливает оба и перезапускает с чистого листа, новый URL туннеля атомарно синхронизируется в `MINI_APP_URL`. Автозапуск — задача Task Scheduler `SlavaVoteBot` (триггер "At log on"). Полная разбивка решения, ограничений (новый URL при каждом рестарте — открытые сессии Mini App не переключаются сами) и файлов — DECISIONS.md D39, ARCHITECTURE.md ("Хостинг" в разделе "Окружение и хостинг").

Проверено вручную: скрипт запущен вне Task Scheduler — туннель поднимается, `MINI_APP_URL` обновляется, `node dist/index.js` стартует, приложение отвечает локально и через туннель; принудительно убит `node` — супервизор обнаружил падение за ~10 сек, гарантированно остановил `cloudflared`, поднял новую пару с новым URL, `getChatMenuButton` показал новый адрес, дублирующихся процессов не возникло; аналогично проверено падение `cloudflared`; попытка запустить второй экземпляр скрипта вручную корректно завершилась сразу по файлу-локу, не подняв вторую пару процессов.

Task Scheduler-задача `SlavaVoteBot` **не зарегистрирована автоматически** — `Register-ScheduledTask`/`schtasks /Create ... /SC ONLOGON` в текущей среде выполнения вернули "Access is denied" именно для триггера ONLOGON (задачи с другими триггерами создавались без проблем — это не общая блокировка Task Scheduler, а ограничение конкретно на логон-триггер в этой сессии). Пользователю нужно самостоятельно выполнить одну команду в своём PowerShell (без прав администратора) — команда передана отдельно в чате.

---

## Backlog / TBD 🧊

Сознательно не реализуется и не проектируется заранее — см. PRODUCT_SPEC.md, раздел TBD:

- финальные названия и количество номинаций;
- точные правила голосования (сколько разных фото можно выбрать в одной номинации);
- можно ли отозвать/изменить голос — сама возможность не отбрасывается, `voting.service`/API проектируются так, чтобы replace/cancel можно было добавить позже без переделки контракта (см. DECISIONS.md D25), но не реализуется, пока не решено правило про количество фото;
- финальный UI каталога/просмотра/голосования (грид/список/карточки — экспериментировать в Phase 7);
- полноценный `results.service` под финализированные правила (базовая версия — TOP-2, tie-break `photo.id ASC` — запланирована в T7.8);
- CI (GitHub Actions) для typecheck/lint/tests — не настроено.
