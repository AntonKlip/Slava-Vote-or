import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramInitDataUser {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

interface TelegramInitDataUserJson {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Валидация Telegram WebApp initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * secret_key = HMAC_SHA256(key="WebAppData", data=botToken); hash = HMAC_SHA256(key=secret_key, data=data_check_string).
 * Возвращает null при любой проблеме (подделанная подпись, протухший auth_date, битые данные) — не бросает,
 * чтобы вызывающий код мог единообразно превратить это в 401.
 */
export function validateInitData(
  raw: string,
  botToken: string,
  maxAgeSeconds = 86400,
): TelegramInitDataUser | null {
  const params = new URLSearchParams(raw);

  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const hashBuffer = Buffer.from(hash, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');
  if (hashBuffer.length !== computedBuffer.length || !timingSafeEqual(hashBuffer, computedBuffer)) {
    return null;
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) return null;
  const ageSeconds = Date.now() / 1000 - authDate;
  if (ageSeconds < 0 || ageSeconds > maxAgeSeconds) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;

  let userJson: TelegramInitDataUserJson;
  try {
    userJson = JSON.parse(userRaw) as TelegramInitDataUserJson;
  } catch {
    return null;
  }
  if (typeof userJson.id !== 'number') return null;

  return {
    id: userJson.id,
    username: userJson.username,
    firstName: userJson.first_name,
    lastName: userJson.last_name,
  };
}
