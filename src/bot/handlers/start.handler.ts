import type { MyContext } from '../context.js';
import { syncCommandsForChat } from '../commands/menu.commands.js';

export async function handleStart(ctx: MyContext): Promise<void> {
  const role = ctx.dbUser?.role ?? 'USER';
  await syncCommandsForChat(ctx);
  await ctx.reply(`Добро пожаловать! Ваша роль: ${role}`);
}
