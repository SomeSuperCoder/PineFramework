import { Router } from 'express';
import type { RunningIndicatorsStore } from '../store/RunningIndicatorsStore.js';

export function createIndicatorsRouter(store: RunningIndicatorsStore): Router {
  const router = Router();

  router.get('/indicators', (_req, res) => {
    try {
      const indicators = store.getAll();
      res.json({ indicators });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list indicators' });
    }
  });

  router.post('/indicators', (req, res) => {
    try {
      const { scriptId, name, overlay, source } = req.body as {
        scriptId?: string;
        name?: string;
        overlay?: boolean;
        source?: string;
      };
      if (typeof scriptId !== 'string' || scriptId.trim() === '') {
        res.status(400).json({ error: 'scriptId must be a non-empty string' });
        return;
      }
      if (typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'name must be a non-empty string' });
        return;
      }
      if (typeof source !== 'string') {
        res.status(400).json({ error: 'source must be a string' });
        return;
      }
      const indicator = store.add(scriptId, name, overlay ?? true, source);
      res.status(201).json({ indicator });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add indicator' });
    }
  });

  router.delete('/indicators/:id', (req, res) => {
    try {
      const removed = store.remove(req.params.id);
      if (!removed) {
        res.status(404).json({ error: 'Indicator not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to remove indicator' });
    }
  });

  return router;
}
