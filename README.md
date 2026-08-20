# Slava Vote

Telegram-бот для проведения конкурса фотографий.

## Стек

Node.js, TypeScript, [grammY](https://grammy.dev), PostgreSQL, Prisma.

## Локальный запуск

1. Установить зависимости:

   ```sh
   npm install
   ```

2. Скопировать `.env.example` в `.env` и заполнить значения:

   - `BOT_TOKEN` — токен бота от [@BotFather](https://t.me/BotFather).
   - `DATABASE_URL` — connection string PostgreSQL (используем [Neon](https://neon.tech)).
   - `ADMIN_TELEGRAM_IDS` — telegram_id первых администраторов через запятую.

3. Запустить в режиме разработки:

   ```sh
   npm run dev
   ```

## Скрипты

| Команда | Назначение |
| --- | --- |
| `npm run dev` | запуск бота в режиме разработки (watch) |
| `npm run build` | сборка в `dist/` |
| `npm start` | запуск собранной версии |
| `npm run typecheck` | проверка типов без сборки |
| `npm run lint` | ESLint |
| `npm test` | тесты (Vitest) |
| `npm run prisma:migrate` | применение Prisma-миграций |

## Статус проекта

Проект разрабатывается поэтапно. Текущий этап — Phase 0 (инфраструктура и tooling), схема БД и бизнес-логика ещё не реализованы.
