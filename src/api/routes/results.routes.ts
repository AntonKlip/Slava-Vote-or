import { Router } from 'express';
import { canViewResults, computeResults } from '../../services/results.service.js';
import { getOrCreateVotingState } from '../../services/voting-state.service.js';

export const resultsRouter = Router();

/**
 * voteCount никогда не попадает в ответ — ни для USER, ни для ADMIN (DECISIONS.md D35).
 * Один контракт ответа для обеих ролей.
 */
resultsRouter.get('/', async (req, res) => {
  const votingState = await getOrCreateVotingState();
  if (!canViewResults(req.dbUser!, votingState)) {
    res.status(403).json({ error: 'Results not available in current phase', votingStatus: votingState.status });
    return;
  }

  const results = await computeResults();
  res.json({
    items: results.map((r) => ({
      nomination: { id: r.nomination.id, name: r.nomination.name },
      top: r.top.map((t) => ({ id: t.photo.id, name: t.photo.name, imageUrl: `/api/photos/${t.photo.id}/image` })),
    })),
  });
});
