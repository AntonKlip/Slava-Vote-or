import type { MyContext } from '../context.js';
import { syncCommandsForChat, buildAdminKeyboard } from '../commands/menu.commands.js';
import { UserRole } from '../../generated/prisma/enums.js';

export async function handleStart(ctx: MyContext): Promise<void> {
  const role = ctx.dbUser?.role ?? 'USER';
  await syncCommandsForChat(ctx);

  if (ctx.dbUser?.role === UserRole.ADMIN) {
    await ctx.reply(`Добро пожаловать! Ваша роль: ${role}`, {
      reply_markup: buildAdminKeyboard(),
    });
    return;
  }

  await ctx.reply(`Добро пожаловать! Ваша роль: ${role}`);
}
