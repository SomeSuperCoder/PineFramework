import { Router } from 'express';
import { getTradablePairs } from 'pine-framework';

export const symbolsRouter = Router();

symbolsRouter.get('/symbols', (_req, res) => {
  res.json({ symbols: getTradablePairs() });
});
