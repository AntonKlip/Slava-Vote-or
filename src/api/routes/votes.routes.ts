import { Router } from 'express';
import { castVote, InvalidVoteTargetError, listUserVotes, VotingNotAllowedError } from '../../services/voting.service.js';

export const votesRouter = Router();

/**
 * Собственные голоса пользователя — фронтенду нужно знать, за что он уже голосовал,
 * чтобы блокировать кнопки повторно при возврате/перезагрузке страницы (не полагаться
 * только на эфемерное состояние React, которое сбрасывается при ремонте компонента).
 */
votesRouter.get('/mine', async (req, res) => {
  const items = await listUserVotes(req.dbUser!.id);
  res.json({ items });
});

/**
 * Тонкий роут поверх castVote() — вся бизнес-логика (canVote, атомарность, идемпотентность)
 * уже внутри сервиса (D25/D28), здесь только парсинг тела и маппинг ошибок в статус-коды.
 * userId всегда из req.dbUser (requireAuth), никогда из тела запроса.
 */
votesRouter.post('/', async (req, res) => {
  const photoId = Number(req.body?.photoId);
  const nominationId = Number(req.body?.nominationId);
  if (!Number.isInteger(photoId) || !Number.isInteger(nominationId)) {
    res.status(400).json({ error: 'photoId and nominationId must be integers' });
    return;
  }

  try {
    const result = await castVote(req.dbUser!, photoId, nominationId);
    res.json({ alreadyVoted: result.alreadyVoted });
  } catch (err) {
    if (err instanceof VotingNotAllowedError) {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err instanceof InvalidVoteTargetError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});
