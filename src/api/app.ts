import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Bot } from 'grammy';
import type { MyContext } from '../bot/context.js';
import { authRouter } from './routes/auth.routes.js';
import { createPhotosRouter } from './routes/photos.routes.js';
import { nominationsRouter } from './routes/nominations.routes.js';
import { votingStateRouter } from './routes/voting-state.routes.js';
import { votesRouter } from './routes/votes.routes.js';
import { resultsRouter } from './routes/results.routes.js';
import { requireAuth } from './middleware/require-auth.js';

const frontendDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');

export interface CreateAppDeps {
  bot: Bot<MyContext>;
}

export function createApp({ bot }: CreateAppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(frontendDistDir));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/voting-state', requireAuth, votingStateRouter);
  app.use('/api/photos', requireAuth, createPhotosRouter(bot));
  app.use('/api/nominations', requireAuth, nominationsRouter);
  app.use('/api/votes', requireAuth, votesRouter);
  app.use('/api/results', requireAuth, resultsRouter);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
