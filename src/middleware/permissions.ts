import type { MiddlewareFn } from 'grammy';
import type { MyContext } from '../bot/context.js';
import { upsertUserFromTelegram } from '../services/user.service.js';
import { UserRole } from '../generated/prisma/enums.js';

const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.USER]: 0,
  [UserRole.MODERATOR]: 1,
  [UserRole.ADMIN]: 2,
};

export const attachDbUser: MiddlewareFn<MyContext> = async (ctx, next) => {
  if (ctx.from && !ctx.from.is_bot) {
    ctx.dbUser = await upsertUserFromTelegram({
      id: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
    });
  }
  await next();
};

export function requireRole(minRole: UserRole): MiddlewareFn<MyContext> {
  return async (ctx, next) => {
    if (!ctx.dbUser || ROLE_RANK[ctx.dbUser.role] < ROLE_RANK[minRole]) {
      await ctx.reply('У вас нет доступа к этому действию.');
      return;
    }
    await next();
  };
}
