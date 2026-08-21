# Архитектура — Slava Vote

Статус: живой документ. Последнее обновление: 2026-08-21. Продуктовые правила — см. [PRODUCT_SPEC.md](./PRODUCT_SPEC.md), история решений с обоснованиями — [DECISIONS.md](./DECISIONS.md).

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
│   ├── bot.ts                    (общий экземпляр Bot — переиспользуется index.ts и api/)
│   ├── commands/
│   ├── handlers/
│   ├── keyboards/
│   └── messages/
│
├── services/
│   ├── user.service.ts
│   ├── voting-state.service.ts   (было contest.service — переименовано, см. DECISIONS.md D8)
│   ├── photo.service.ts
│   ├── nomination.service.ts
│   ├── voting.service.ts         (canVote/canViewPhotos + запись голоса)
│   ├── voting-permission.service.ts
│   └── results.service.ts        (computeResults, canViewResults — Phase 7)
│
├── api/                           (HTTP API, Express — Phase 7, см. раздел "HTTP API" ниже)
│   ├── app.ts                     (createApp({ bot }))
│   ├── auth/                      (telegram-init-data.ts, jwt.ts)
│   ├── middleware/require-auth.ts
│   └── routes/                    (auth, voting-state, photos, nominations, votes, results)
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

frontend/                            (npm workspace, Phase 8, см. раздел "Frontend" ниже)
├── index.html
├── vite.config.ts                   (dev-прокси /api → backend, порт из корневого .env)
└── src/
    ├── main.tsx
    └── App.tsx
```

Реализовано на данный момент (после Phase 7, T7.1–T7.10, и Phase 8, T8.1–T8.6): всё из Phase 6 (`config/`, `database/prisma.ts`, `bot/context.ts`, `middleware/permissions.ts`, `bot/handlers/*`, `bot/commands/*`, `services/{user,voting-state,voting-permission,voting,photo,nomination}.service.ts`) плюс `bot/bot.ts`, `services/results.service.ts`, `api/` (Express HTTP API поверх тех же `services/`, см. ниже) и полностью рабочий `frontend/` (React+TS+Vite): авторизация через Telegram `initData`, просмотр фото по фазам, голосование, результаты — все экраны проверены вручную в браузере (Phase 8, T8.1–T8.6, DevTools Local Overrides вместо реального Telegram, см. ниже).

Express (`src/api/app.ts`) работает в том же Node-процессе, что и бот (`bot.start()` и `app.listen()` — оба в `src/index.ts`). Бот остаётся точкой входа и интерфейсом администратора. Запуск внутри реального Telegram (Phase 9, T9.1–T9.2) реализован: `express.static` отдаёт продакшен-сборку `frontend/dist` из того же процесса, кнопка запуска — персистентная menu-button бота (`type: web_app`). Финальная ручная E2E-проверка в реальном Telegram (T9.3) — см. DECISIONS.md D33/D37.

## Frontend (Phase 8)

`frontend/` — отдельный npm workspace (корневой `package.json` → `"workspaces": ["frontend"]`, см. DECISIONS.md D22), React + TypeScript + Vite, обычный CSS без UI-кита (финальный визуал не определён, см. PRODUCT_SPEC.md TBD). Инструментарий фронтенда (сборка, typecheck, lint через `oxlint`) полностью независим от корневого `tsconfig.json`/`eslint.config.js` — backend-скрипты (`dev`, `build`, `typecheck`, `lint`, `test`) не задевают `frontend/` и наоборот; корневые прокси-скрипты `dev:frontend`/`build:frontend`/`typecheck:frontend`/`lint:frontend` явно вызывают воркспейс (`npm run <script> -w frontend`).

В dev-режиме `frontend/vite.config.ts` проксирует `/api/*` на `http://localhost:<API_PORT>` (та же переменная, что читает backend, значение подтягивается из корневого `.env` через `loadEnv`) — CORS не нужен уже на этапе разработки. В проде `frontend/dist` отдаётся тем же Express-процессом с того же origin, что и API (`express.static` в `src/api/app.ts`, Phase 9 T9.1) — без SPA-fallback роута, фронтенд не использует клиентский роутер (единственная точка входа `/`). Корневой `npm run build` собирает и фронтенд (`vite build`), и backend одной командой.

Локальная разработка запускается двумя параллельными процессами: `npm run dev` (бот + Express, backend) и `npm run dev:frontend` (Vite).

**Структура `frontend/src/`:** `auth/` (`auth-context.ts`, `AuthProvider.tsx`, `useAuth.ts` — разбито на три файла ради React Fast Refresh; JWT только в `useRef`/React state, никогда в `localStorage`, D21), `api/` (`client.ts` — централизованный клиент: авто-`Authorization`, единая обработка 401; `types.ts`; `useVotingState.ts`, `useAuthorizedImage.ts` — переиспользуемые хуки), `photos/` (`PhotosScreen.tsx`, `PhotoCard.tsx` — просмотр + голосование), `results/` (`ResultsScreen.tsx` — top-2 без чисел голосов), `types/telegram-web-app.d.ts` (ambient-тип `window.Telegram.WebApp`).

Ключевой принцип фронтенда: **доступ не дублируется на клиенте**. `PhotosScreen`/`ResultsScreen` не проверяют роль или фазу голосования сами — всегда делают запрос, а ответ сервера (200 → данные; 403 с `votingStatus` в теле → сообщение) определяет, что показать. Это даёт корректное поведение (например, ADMIN видит фото в любой фазе) без отдельных `if (role === 'ADMIN')` веток во фронтенд-коде — ровно то же самое, что делает `canViewPhotos`/`canViewResults` на сервере.

**Ручная проверка Mini App без реального Telegram-клиента** — через DevTools Local Overrides (Phase 8, T8.2). Рабочий приём: **полностью заменить** `window.Telegram` целым объектом (`{WebApp: {initData, ready(){}, expand(){}}}`), вставленным между `<script src="telegram-web-app.js">` и `<script type="module" src="/src/main.tsx">` в локально переопределённом `index.html`. Точечное присваивание `window.Telegram.WebApp.initData = '...'` **не работает** — настоящий `telegram-web-app.js` определяет `initData` как read-only (только getter), и такое присваивание в обычном `<script>` молча игнорируется без ошибки в консоли. Это чисто браузерная dev-only техника, кода в репозитории не касается — сервер как проверяет HMAC-подпись `initData`, так и продолжает.

## HTTP API (Phase 7)

Тонкий слой поверх `services/`: парсинг запроса → вызов сервиса → маппинг результата/ошибки в HTTP. Никакой бизнес-логики не дублируется — `canVote`/`castVote`/`canViewPhotos`/`canViewResults` вызываются напрямую.

| Метод и путь | Гейт (сверх requireAuth) | Сервис |
| --- | --- | --- |
| `POST /api/auth/telegram` | — (сам выдаёт JWT) | `user.service.upsertUserFromTelegram` |
| `GET /api/voting-state` | любой авторизованный | `voting-state.service.getOrCreateVotingState` |
| `GET /api/photos` | `canViewPhotos` | `photo.service.listActive` |
| `GET /api/photos/:id/image` | `canViewPhotos` ИЛИ `canViewResults` (см. DECISIONS.md D36) | `photo.service.getById` + `bot.api.getFile` (прокси) |
| `GET /api/nominations` | `canViewPhotos` (D35 — тот же гейт, что у фото) | `nomination.service.listActive` |
| `POST /api/votes` | (внутри `castVote`, свой `canVote`) | `voting.service.castVote` |
| `GET /api/results` | `canViewResults` | `results.service.computeResults` |

Все роуты, кроме `/api/auth/telegram` и `/api/health`, защищены мидлваром `requireAuth` (`src/api/middleware/require-auth.ts`).

## Аутентификация Mini App

Фронтенд при каждом открытии Mini App читает `window.Telegram.WebApp.initData` и отправляет на `POST /api/auth/telegram`. Сервер валидирует HMAC-подпись Telegram (`src/api/auth/telegram-init-data.ts`, ключ — `BOT_TOKEN`, алгоритм `secret = HMAC_SHA256("WebAppData", botToken)`, `hash = HMAC_SHA256(secret, data_check_string)`) и свежесть `auth_date` (по умолчанию не старше 24ч); при успехе — `user.service.upsertUserFromTelegram` (без изменений) получает/создаёт `User` и выдаёт короткоживущий JWT (`src/api/auth/jwt.ts`, `jsonwebtoken`, TTL 2ч, секрет — `APP_JWT_SECRET`).

JWT-payload содержит только `userId` — не роль. `requireAuth` перечитывает `User` из Prisma по `id` на каждый защищённый запрос (DECISIONS.md D34), поэтому смена роли ADMIN действует немедленно, не дожидаясь истечения токена. Клиент никогда не передаёт `telegramId`/`userId`/`role` в теле запроса для определения личности — только `Authorization: Bearer <JWT>`.

Dev-режим с подменным логином (без реального `initData`) сознательно не реализован (D34) — локальная проверка фронтенда в Phase 8 идёт через инъекцию валидно подписанного `initData` в `window.Telegram.WebApp` через devtools console, не через код в репозитории.

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

Mini App получает изображения через серверный прокси `GET /api/photos/:id/image` (`src/api/routes/photos.routes.ts`, D23): `telegram_file_id → file_path` резолвится через `bot.api.getFile`, результат кэшируется в памяти процесса (`Map<telegramFileId, {filePath, expiresAt}>`, TTL ~50 минут — с запасом от ~1ч валидности `file_path` у Telegram), сами байты запрашиваются у `api.telegram.org` и отдаются одним буферизованным ответом (не потоковым — фото из Telegram некрупные, буферизация проще потокового пайплайна и не требует межпотоковой стыковки Web/Node Streams). `BOT_TOKEN` никогда не попадает в браузер.

## Окружение и хостинг

| Переменная | Назначение |
| --- | --- |
| `BOT_TOKEN` | токен бота от @BotFather |
| `DATABASE_URL` | connection string PostgreSQL (Neon) |
| `ADMIN_TELEGRAM_IDS` | telegram_id первых администраторов, через запятую |
| `API_PORT` | порт Express HTTP API (Phase 7); необязательна, по умолчанию `3000` |
| `APP_JWT_SECRET` | секрет для подписи session-JWT Mini App (Phase 7, D21/D34) |
| `MINI_APP_URL` | публичный HTTPS-адрес Mini App (Phase 9), используется для menu-button бота |

- БД — Neon (бесплатный тариф), используется и для разработки, и в будущем для продакшена — без Docker/локального Postgres (см. DECISIONS.md D4). `DATABASE_URL` хранится только у пользователя, никогда не передаётся в чат.
- Бот — long polling (не нужен публичный HTTPS endpoint для самого Telegram API).
- Возможен cold start Neon после простоя — специальный keep-alive/ping не добавляется без необходимости, сначала реализуется корректная обработка задержки первого запроса.

### Хостинг — локальный self-hosting с автоматическим восстановлением процессов (DECISIONS.md D39)

Процесс (`node dist/index.js` — Express API + статика фронтенда + бот, всё в одном процессе, см. выше) работает **локально на ПК пользователя**, не в облаке — осознанный выбор в пользу $0 вместо платного always-on хостинга. Это **не гарантия доступности** — домашний ПК, интернет-соединение и Windows остаются единой точкой отказа, никакой скрипт от этого не защищает. Цель — убрать необходимость ручного вмешательства при обычных сбоях (упал процесс, перезагрузился ПК), не более.

`scripts/run-with-tunnel.ps1` — PowerShell-супервизор в бесконечном цикле:
- поднимает `cloudflared tunnel --url http://localhost:<API_PORT>` (бесплатный `trycloudflare.com` quick tunnel — тот же инструмент, что в Phase 9 T9.3, no uptime guarantee по природе самого сервиса) и ждёт до 30 сек появления URL в его выводе (перенаправлен в файл, не читается "на лету");
- атомарно (временный файл + `Move-Item`) прописывает полученный URL в `MINI_APP_URL` в `.env` — падение скрипта посередине записи не может оставить `.env` без обязательной переменной;
- запускает `node dist/index.js` напрямую (не через `npm start`) — отслеживаемый PID гарантированно совпадает с реальным процессом, а не с промежуточной npm-обёрткой;
- каждые 10 сек проверяет, живы ли оба процесса; при падении любого — гарантированно останавливает второй (ждёт фактического исчезновения PID, не только вызова `Stop-Process`) и запускает всю пару заново с чистого листа (новый туннель → новый URL).

Автозапуск — задача Task Scheduler `SlavaVoteBot` (триггер "At log on", `MultipleInstances=IgnoreNew`, обычные права пользователя). Если ПК перезагрузится, а пользователь не войдёт в систему — бот не поднимется, пока не залогинится; для домашнего ПК это осознанно приемлемо. Двойной запуск исключён на двух уровнях: настройка задачи + файл-лок (`run/supervisor.lock`) внутри самого скрипта. Простой append-лог `logs/supervisor.log` (без ротации — конкурс однодневный) фиксирует каждый цикл.

**Эксплуатационное ограничение quick tunnel:** при каждом полном перезапуске URL туннеля меняется случайно. `setChatMenuButton` переустанавливается при каждом старте `node dist/index.js` и получает актуальный `MINI_APP_URL` — новые открытия Mini App через menu-button получают правильный адрес. Но уже открытая у кого-то сессия Mini App со старым URL не переключается сама — соединение с сервером просто обрывается, нужно заново открыть Mini App через menu-button. Цена бесплатного варианта, приемлемая для однодневного конкурса.

## Тестирование

Vitest. Обязательное покрытие критической бизнес-логики до создания сложного UI: RBAC, машина состояний голосования, `canVote`/`canViewPhotos`/`canViewResults`, individual permissions, запрет голосования после `FINISHED`, уникальность голосов, детерминированность результатов при ничьей (`photo.id ASC`, покрыто в `results.service.test.ts`).

Роуты HTTP API (Phase 7) намеренно не получают отдельных тестов — они тонкие (парсинг + вызов уже протестированного сервиса + маппинг ошибки в статус). Единственное исключение — `POST /api/auth/telegram` + `requireAuth` (`src/api/routes/auth.routes.test.ts`, `supertest`): это новая security-граница (валидация `initData`, выдача/проверка JWT), а не проброс к существующей бизнес-логике, поэтому решено покрыть отдельно (DECISIONS.md D33).
