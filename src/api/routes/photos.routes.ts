import { Router } from 'express';
import type { Bot } from 'grammy';
import type { MyContext } from '../../bot/context.js';
import { getById, listActive } from '../../services/photo.service.js';
import { getOrCreateVotingState } from '../../services/voting-state.service.js';
import { canViewPhotos } from '../../services/voting.service.js';
import { canViewResults } from '../../services/results.service.js';
import { PhotoStatus } from '../../generated/prisma/enums.js';

const MAX_TAKE = 50;
const FILE_PATH_TTL_MS = 50 * 60 * 1000; // с запасом от ~1ч валидности file_path у Telegram (D23)

interface CachedFilePath {
  filePath: string;
  expiresAt: number;
}

/**
 * Фабрика, а не модульный Router — образу нужен общий `bot` (для bot.api.getFile, D23)
 * и приватный in-memory кэш file_path, живущий вместе с процессом.
 */
export function createPhotosRouter(bot: Bot<MyContext>): Router {
  const router = Router();
  const filePathCache = new Map<string, CachedFilePath>();

  router.get('/', async (req, res) => {
    const votingState = await getOrCreateVotingState();
    if (!canViewPhotos(req.dbUser!, votingState)) {
      res.status(403).json({ error: 'Not allowed to view photos in current phase', votingStatus: votingState.status });
      return;
    }

    const skipRaw = Number(req.query.skip ?? 0);
    const takeRaw = Number(req.query.take ?? MAX_TAKE);
    const skip = Number.isInteger(skipRaw) && skipRaw >= 0 ? skipRaw : 0;
    const take = Number.isInteger(takeRaw) && takeRaw > 0 ? Math.min(takeRaw, MAX_TAKE) : MAX_TAKE;

    const { items, total } = await listActive({ skip, take });
    res.json({
      items: items.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, imageUrl: `/api/photos/${p.id}/image` })),
      total,
    });
  });

  router.get('/:id/image', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid photo id' });
      return;
    }

    const votingState = await getOrCreateVotingState();
    // canViewResults — вторая, альтернативная причина доступа: results.service отдаёт imageUrl,
    // ведущий сюда же, поэтому после FINISHED USER должен видеть эти фото через результаты,
    // даже если canViewPhotos (просмотр каталога) в этой фазе уже не разрешает.
    if (!canViewPhotos(req.dbUser!, votingState) && !canViewResults(req.dbUser!, votingState)) {
      res.status(403).json({ error: 'Not allowed to view photos in current phase', votingStatus: votingState.status });
      return;
    }

    const photo = await getById(id);
    if (!photo || photo.status !== PhotoStatus.ACTIVE) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    let cached = filePathCache.get(photo.telegramFileId);
    if (!cached || cached.expiresAt < Date.now()) {
      const file = await bot.api.getFile(photo.telegramFileId);
      if (!file.file_path) {
        res.status(502).json({ error: 'Telegram did not return a file path' });
        return;
      }
      cached = { filePath: file.file_path, expiresAt: Date.now() + FILE_PATH_TTL_MS };
      filePathCache.set(photo.telegramFileId, cached);
    }

    const telegramUrl = `https://api.telegram.org/file/bot${bot.token}/${cached.filePath}`;
    const upstream = await fetch(telegramUrl);
    if (!upstream.ok) {
      filePathCache.delete(photo.telegramFileId);
      res.status(502).json({ error: 'Failed to fetch image from Telegram' });
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg');
    res.send(buffer);
  });

  return router;
}
