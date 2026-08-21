import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../database/prisma.js';
import { verifySessionToken } from '../auth/jwt.js';

/**
 * Роль и прочие поля User перечитываются из БД на каждый запрос (не берутся из JWT-payload,
 * который содержит только userId) — см. DECISIONS.md D34. Смена роли ADMIN действует
 * немедленно, не дожидаясь истечения токена.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  req.dbUser = user;
  next();
}
