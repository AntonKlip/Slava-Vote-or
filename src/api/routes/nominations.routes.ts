import { Router } from 'express';
import { listActive } from '../../services/nomination.service.js';
import { getOrCreateVotingState } from '../../services/voting-state.service.js';
import { canViewPhotos } from '../../services/voting.service.js';

export const nominationsRouter = Router();

/**
 * Гейт — тот же canViewPhotos, что и у /api/photos (DECISIONS.md D35): PRODUCT_SPEC.md
 * определяет матрицу просмотра буквально для фото, но без доступа к самим фото
 * список номинаций бессмыслен, поэтому применяется то же правило.
 */
nominationsRouter.get('/', async (req, res) => {
  const votingState = await getOrCreateVotingState();
  if (!canViewPhotos(req.dbUser!, votingState)) {
    res.status(403).json({ error: 'Not allowed to view nominations in current phase', votingStatus: votingState.status });
    return;
  }

  const nominations = await listActive();
  res.json({
    items: nominations.map((n) => ({ id: n.id, name: n.name, description: n.description, sortOrder: n.sortOrder })),
  });
});
