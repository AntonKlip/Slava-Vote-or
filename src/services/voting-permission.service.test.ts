import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../database/prisma.js';
import { UserRole } from '../generated/prisma/enums.js';
import type { User } from '../generated/prisma/client.js';
import { grantPermission, revokePermission, hasVotingPermission } from './voting-permission.service.js';

// Отрицательные telegramId никогда не встречаются у реальных Telegram-аккаунтов —
// безопасный способ создавать тестовых пользователей в реальной Neon-БД без коллизий.
describe('voting-permission.service (integration)', () => {
  let admin: User;
  let target: User;

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { telegramId: -9101n, role: UserRole.ADMIN } });
    target = await prisma.user.create({ data: { telegramId: -9102n, role: UserRole.USER } });
  });

  afterAll(async () => {
    await prisma.votingPermission.deleteMany({ where: { userId: target.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, target.id] } } });
  });

  it('grantPermission выдаёт доступ', async () => {
    await grantPermission(target.id, admin.id);
    expect(await hasVotingPermission(target.id)).toBe(true);
  });

  it('повторная выдача не создаёт дубликат (unique userId)', async () => {
    await grantPermission(target.id, admin.id);
    await grantPermission(target.id, admin.id);
    const count = await prisma.votingPermission.count({ where: { userId: target.id } });
    expect(count).toBe(1);
  });

  it('revokePermission отзывает доступ', async () => {
    await revokePermission(target.id);
    expect(await hasVotingPermission(target.id)).toBe(false);
  });

  it('повторный revoke без существующего разрешения не падает', async () => {
    await expect(revokePermission(target.id)).resolves.not.toThrow();
  });
});
