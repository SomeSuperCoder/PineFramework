import { Router } from 'express';

export const statusRouter = Router();

statusRouter.get('/status', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
  });
});
