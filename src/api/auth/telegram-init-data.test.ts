import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateInitData } from './telegram-init-data.js';

const BOT_TOKEN = 'test-bot-token';

function buildInitData(
  fields: Record<string, string>,
  botToken: string = BOT_TOKEN,
): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function validFields(authDate = Math.floor(Date.now() / 1000)): Record<string, string> {
  return {
    auth_date: String(authDate),
    query_id: 'AAHtest',
    user: JSON.stringify({ id: 123456789, username: 'ivan', first_name: 'Иван', last_name: 'Петров' }),
  };
}

describe('validateInitData', () => {
  it('распознаёт пользователя при верной подписи', () => {
    const initData = buildInitData(validFields());
    const result = validateInitData(initData, BOT_TOKEN);
    expect(result).toEqual({ id: 123456789, username: 'ivan', firstName: 'Иван', lastName: 'Петров' });
  });

  it('возвращает null при подделанной подписи (другой bot token)', () => {
    const initData = buildInitData(validFields(), 'wrong-bot-token');
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('возвращает null при вручную испорченном hash', () => {
    const params = new URLSearchParams(buildInitData(validFields()));
    params.set('hash', '0'.repeat(64));
    expect(validateInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });

  it('возвращает null без hash', () => {
    const params = new URLSearchParams(buildInitData(validFields()));
    params.delete('hash');
    expect(validateInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });

  it('возвращает null при протухшем auth_date', () => {
    const staleAuthDate = Math.floor(Date.now() / 1000) - 90000; // > 86400s (default maxAge)
    const initData = buildInitData(validFields(staleAuthDate));
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('принимает свежий auth_date в пределах кастомного maxAgeSeconds', () => {
    const authDate = Math.floor(Date.now() / 1000) - 10;
    const initData = buildInitData(validFields(authDate));
    expect(validateInitData(initData, BOT_TOKEN, 60)).not.toBeNull();
  });

  it('возвращает null при auth_date из будущего дальше окна допуска', () => {
    const futureAuthDate = Math.floor(Date.now() / 1000) + 90000;
    const initData = buildInitData(validFields(futureAuthDate));
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('возвращает null без поля user', () => {
    const fields = validFields();
    delete (fields as Record<string, string | undefined>).user;
    const initData = buildInitData(fields);
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('возвращает null при невалидном JSON в user', () => {
    const fields = { ...validFields(), user: '{not-json' };
    const initData = buildInitData(fields);
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });
});
