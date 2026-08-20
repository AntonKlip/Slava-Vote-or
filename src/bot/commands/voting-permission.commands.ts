import type { MyContext } from '../context.js';
import { prisma } from '../../database/prisma.js';
import type { User } from '../../generated/prisma/client.js';
import { grantPermission, revokePermission } from '../../services/voting-permission.service.js';

function parseTargetTelegramId(ctx: MyContext): number | null {
  const arg = ctx.match?.toString().trim();
  if (arg) {
    const id = Number(arg);
    return Number.isFinite(id) ? id : null;
  }

  const repliedFrom = ctx.message?.reply_to_message?.from;
  if (repliedFrom && !repliedFrom.is_bot) {
    return repliedFrom.id;
  }

  return null;
}

async function resolveTargetUser(ctx: MyContext): Promise<User | null> {
  const telegramId = parseTargetTelegramId(ctx);
  if (telegramId === null) {
    await ctx.reply(
      'Укажите telegram_id пользователя или ответьте этой командой на его сообщение: /grant_access 123456789',
    );
    return null;
  }

  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  if (!user) {
    await ctx.reply('Этот пользователь ещё не запускал бота (/start) — выдать доступ нельзя.');
    return null;
  }

  return user;
}

function describeUser(user: User): string {
  return user.username ? `@${user.username}` : String(user.telegramId);
}

export async function handleGrantAccess(ctx: MyContext): Promise<void> {
  if (!ctx.dbUser) return;
  const target = await resolveTargetUser(ctx);
  if (!target) return;

  await grantPermission(target.id, ctx.dbUser.id);
  await ctx.reply(`Индивидуальный доступ к голосованию выдан: ${describeUser(target)}.`);
}

export async function handleRevokeAccess(ctx: MyContext): Promise<void> {
  const target = await resolveTargetUser(ctx);
  if (!target) return;

  await revokePermission(target.id);
  await ctx.reply(`Индивидуальный доступ к голосованию отозван: ${describeUser(target)}.`);
}
