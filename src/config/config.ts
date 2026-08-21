import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseAdminIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number);
}

export const config = {
  botToken: required('BOT_TOKEN'),
  databaseUrl: required('DATABASE_URL'),
  adminTelegramIds: parseAdminIds(process.env.ADMIN_TELEGRAM_IDS),
  apiPort: Number(process.env.API_PORT ?? 3000),
  appJwtSecret: required('APP_JWT_SECRET'),
};
