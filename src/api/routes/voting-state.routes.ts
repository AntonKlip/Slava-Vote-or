import { Router } from 'express';
import { getOrCreateVotingState } from '../../services/voting-state.service.js';

export const votingStateRouter = Router();

votingStateRouter.get('/', async (_req, res) => {
  const state = await getOrCreateVotingState();
  res.json({ status: state.status });
});
