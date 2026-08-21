import { Router } from 'express';
import { config } from '../../config/config.js';
import { upsertUserFromTelegram } from '../../services/user.service.js';
import { validateInitData } from '../auth/telegram-init-data.js';
import { signSessionToken } from '../auth/jwt.js';

export const authRouter = Router();

/**
 * telegramId/role никогда не приходят от клиента — только initData, подпись которого
 * проверяется здесь (D21). userId в выданном JWT — единственное, чему доверяет requireAuth.
 */
authRouter.post('/telegram', async (req, res) => {
  const initData = req.body?.initData;
  if (typeof initData !== 'string' || initData.length === 0) {
    res.status(400).json({ error: 'initData is required' });
    return;
  }

  const tgUser = validateInitData(initData, config.botToken);
  if (!tgUser) {
    res.status(401).json({ error: 'Invalid or expired initData' });
    return;
  }

  const user = await upsertUserFromTelegram({
    id: tgUser.id,
    username: tgUser.username,
    firstName: tgUser.firstName,
    lastName: tgUser.lastName,
  });

  const token = signSessionToken({ userId: user.id });
  res.json({ token, user: { id: user.id, role: user.role } });
});
