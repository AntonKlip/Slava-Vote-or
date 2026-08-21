import jwt from 'jsonwebtoken';
import { config } from '../../config/config.js';

// Короткоживущий (D21) — фронтенд переполучает токен при каждом открытии Mini App,
// роль в payload не хранится (см. DECISIONS.md D34 — перечитывается из БД на каждый запрос).
const EXPIRES_IN = '2h';

export interface SessionTokenPayload {
  userId: string;
}

export function signSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, config.appJwtSecret, { expiresIn: EXPIRES_IN });
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.appJwtSecret);
    if (typeof decoded === 'object' && decoded !== null && typeof (decoded as { userId?: unknown }).userId === 'string') {
      return { userId: (decoded as { userId: string }).userId };
    }
    return null;
  } catch {
    return null;
  }
}
