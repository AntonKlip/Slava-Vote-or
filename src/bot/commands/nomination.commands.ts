import type { MyContext } from '../context.js';
import { Prisma } from '../../generated/prisma/client.js';
import { createNomination, deactivate, listActive } from '../../services/nomination.service.js';

function parseAddNominationArgs(ctx: MyContext): { name: string; description?: string } | null {
  const raw = ctx.match?.toString().trim();
  if (!raw) return null;

  const [namePart, ...rest] = raw.split('|');
  const name = namePart.trim();
  if (!name) return null;

  const description = rest.join('|').trim();
  return description ? { name, description } : { name };
}

export async function handleAddNomination(ctx: MyContext): Promise<void> {
  const parsed = parseAddNominationArgs(ctx);
  if (!parsed) {
    await ctx.reply('Формат: /add_nomination Название | Описание (описание необязательно)');
    return;
  }

  const nomination = await createNomination(parsed);
  await ctx.reply(`Номинация добавлена: ${nomination.name} (id: ${nomination.id}).`);
}

export async function handleListNominations(ctx: MyContext): Promise<void> {
  const nominations = await listActive();
  if (nominations.length === 0) {
    await ctx.reply('Активных номинаций пока нет.');
    return;
  }

  const lines = nominations.map((n) => `${n.name} — id: ${n.id}`);
  await ctx.reply(lines.join('\n'));
}

export async function handleDeactivateNomination(ctx: MyContext): Promise<void> {
  const raw = ctx.match?.toString().trim();
  const id = raw ? Number(raw) : NaN;
  if (!raw || !Number.isInteger(id)) {
    await ctx.reply('Укажите id номинации: /deactivate_nomination <id> (см. /list_nominations).');
    return;
  }

  try {
    const nomination = await deactivate(id);
    await ctx.reply(`Номинация деактивирована: ${nomination.name}.`);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      await ctx.reply('Номинация с таким id не найдена.');
      return;
    }
    throw err;
  }
}
