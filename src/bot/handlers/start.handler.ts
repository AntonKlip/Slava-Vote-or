import type { MyContext } from '../context.js';

export async function handleStart(ctx: MyContext): Promise<void> {
  const role = ctx.dbUser?.role ?? 'USER';
  await ctx.reply(`Добро пожаловать! Ваша роль: ${role}`);
}
