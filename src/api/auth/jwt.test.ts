import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { config } from '../../config/config.js';
import { signSessionToken, verifySessionToken } from './jwt.js';

describe('signSessionToken / verifySessionToken', () => {
  it('round-trip: подписанный токен успешно проверяется', () => {
    const token = signSessionToken({ userId: 'user-1' });
    expect(verifySessionToken(token)).toEqual({ userId: 'user-1' });
  });

  it('возвращает null для истёкшего токена', () => {
    const expired = jwt.sign({ userId: 'user-1' }, config.appJwtSecret, { expiresIn: -10 });
    expect(verifySessionToken(expired)).toBeNull();
  });

  it('возвращает null для подделанного токена (другой секрет)', () => {
    const tampered = jwt.sign({ userId: 'user-1' }, 'wrong-secret', { expiresIn: '2h' });
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('возвращает null для мусорной строки', () => {
    expect(verifySessionToken('not-a-jwt')).toBeNull();
  });

  it('возвращает null, если payload не содержит userId', () => {
    const noUserId = jwt.sign({ foo: 'bar' }, config.appJwtSecret, { expiresIn: '2h' });
    expect(verifySessionToken(noUserId)).toBeNull();
  });
});
