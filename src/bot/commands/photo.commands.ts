import type { MyContext } from '../context.js';
import { Prisma } from '../../generated/prisma/client.js';
import { listActive, softDelete } from '../../services/photo.service.js';

const PAGE_SIZE = 20;

function parsePageArg(ctx: MyContext): number {
  const raw = ctx.match?.toString().trim();
  const page = raw ? Number(raw) : 1;
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export async function handleListPhotos(ctx: MyContext): Promise<void> {
  const page = parsePageArg(ctx);
  const { items, total } = await listActive({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });

  if (total === 0) {
    await ctx.reply('Активных фото пока нет.');
    return;
  }

  if (items.length === 0) {
    await ctx.reply(`Страница ${page} пуста (всего фото: ${total}).`);
    return;
  }

  const lines = items.map((p) => `${p.name} — id: ${p.id}`);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  await ctx.reply(`${lines.join('\n')}\n\nСтраница ${page}/${totalPages} (всего: ${total}).`);
}

export async function handleDeletePhoto(ctx: MyContext): Promise<void> {
  const raw = ctx.match?.toString().trim();
  const id = raw ? Number(raw) : NaN;
  if (!raw || !Number.isInteger(id)) {
    await ctx.reply('Укажите id фото: /delete_photo <id> (см. /list_photos).');
    return;
  }

  try {
    const photo = await softDelete(id);
    await ctx.reply(`Фото удалено: ${photo.name}.`);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      await ctx.reply('Фото с таким id не найдено.');
      return;
    }
    throw err;
  }
}
