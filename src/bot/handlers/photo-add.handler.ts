import type { MyContext } from '../context.js';
import { createPhoto } from '../../services/photo.service.js';

/**
 * Строго одно сообщение: фото + caption = имя участника, в одном и том же
 * апдейте. Без caption Photo не создаётся. Никакого многошагового диалога —
 * бот не спрашивает имя отдельным сообщением и не хранит промежуточное
 * состояние (см. PRODUCT_SPEC.md).
 */
export async function handleAddPhoto(ctx: MyContext): Promise<void> {
  const photoSizes = ctx.message?.photo;
  if (!photoSizes || photoSizes.length === 0) return;

  const name = ctx.message?.caption?.trim();
  if (!name) {
    await ctx.reply('Нужно прислать фото с именем участника в подписи (caption) — без подписи фото не сохраняется.');
    return;
  }

  const largest = photoSizes[photoSizes.length - 1];
  const photo = await createPhoto({
    telegramFileId: largest.file_id,
    telegramFileUniqueId: largest.file_unique_id,
    name,
  });

  await ctx.reply(`Участник добавлен: ${photo.name}.`);
}
