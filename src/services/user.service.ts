import { prisma } from '../database/prisma.js';
import { UserRole } from '../generated/prisma/enums.js';
import type { User } from '../generated/prisma/client.js';
import { config } from '../config/config.js';

export interface TelegramUserInfo {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export async function upsertUserFromTelegram(tgUser: TelegramUserInfo): Promise<User> {
  const telegramId = BigInt(tgUser.id);
  const bootstrapRole = config.adminTelegramIds.includes(tgUser.id) ? UserRole.ADMIN : UserRole.USER;

  return prisma.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username: tgUser.username ?? null,
      firstName: tgUser.firstName ?? null,
      lastName: tgUser.lastName ?? null,
      role: bootstrapRole,
    },
    update: {
      username: tgUser.username ?? null,
      firstName: tgUser.firstName ?? null,
      lastName: tgUser.lastName ?? null,
    },
  });
}
