import { createHmac } from 'node:crypto';
import { Bot } from 'grammy';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../../config/config.js';
import { prisma } from '../../database/prisma.js';
import { UserRole } from '../../generated/prisma/enums.js';
import type { MyContext } from '../../bot/context.js';

function buildInitData(fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

const TEST_TELEGRAM_ID = -9401;

// Единственный supertest-набор в проекте (см. DECISIONS.md D33/D34) — это новая
// security-граница (auth-эндпоинт + requireAuth), остальные роуты остаются тонкими
// и не получают отдельных тестов (сервисы под ними уже покрыты).
describe('POST /api/auth/telegram (integration)', () => {
  const bot = new Bot<MyContext>(config.botToken);
  const app = createApp({ bot });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_TELEGRAM_ID) } });
  });

  it('валидный initData -> 200 + JWT + роль USER по умолчанию', async () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: TEST_TELEGRAM_ID, username: 'test_auth_user' }),
    });

    const res = await request(app).post('/api/auth/telegram').send({ initData });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.role).toBe(UserRole.USER);
  });

  it('невалидная подпись -> 401', async () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: TEST_TELEGRAM_ID }),
    }).replace(/hash=[a-f0-9]+/, `hash=${'0'.repeat(64)}`);

    const res = await request(app).post('/api/auth/telegram').send({ initData });
    expect(res.status).toBe(401);
  });

  it('протухший auth_date -> 401', async () => {
    const staleAuthDate = Math.floor(Date.now() / 1000) - 90000;
    const initData = buildInitData({
      auth_date: String(staleAuthDate),
      user: JSON.stringify({ id: TEST_TELEGRAM_ID }),
    });

    const res = await request(app).post('/api/auth/telegram').send({ initData });
    expect(res.status).toBe(401);
  });

  it('без initData -> 400', async () => {
    const res = await request(app).post('/api/auth/telegram').send({});
    expect(res.status).toBe(400);
  });
});

describe('requireAuth middleware (integration, через GET /api/voting-state)', () => {
  const bot = new Bot<MyContext>(config.botToken);
  const app = createApp({ bot });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_TELEGRAM_ID) } });
  });

  it('без токена -> 401', async () => {
    const res = await request(app).get('/api/voting-state');
    expect(res.status).toBe(401);
  });

  it('с невалидным токеном -> 401', async () => {
    const res = await request(app).get('/api/voting-state').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('с валидным токеном -> 200', async () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: TEST_TELEGRAM_ID }),
    });
    const authRes = await request(app).post('/api/auth/telegram').send({ initData });
    const token = authRes.body.token as string;

    const res = await request(app).get('/api/voting-state').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });
});
