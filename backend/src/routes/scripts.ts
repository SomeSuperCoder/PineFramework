import { Router } from 'express';
import type { ScriptFileManager } from '../store/ScriptFileManager.js';
import type { RunningIndicatorsStore } from '../store/RunningIndicatorsStore.js';
import { broadcastIndicatorRemoved } from '../ws/broadcast.js';

export function createScriptsRouter(fileManager: ScriptFileManager, indicatorsStore?: RunningIndicatorsStore): Router {
  const router = Router();

  router.get('/scripts', async (req, res) => {
    try {
      const q = req.query.q;
      const scripts = typeof q === 'string' ? await fileManager.search(q) : await fileManager.getAll();
      const activeId = fileManager.getActiveId();
      res.json({ scripts, activeScriptId: activeId });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list scripts' });
    }
  });

  router.get('/scripts/active', async (_req, res) => {
    try {
      const active = await fileManager.getActive();
      res.json({ script: active ?? null });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get active script' });
    }
  });

  router.put('/scripts/active', async (req, res) => {
    try {
      const { scriptId } = req.body as { scriptId?: string };
      if (typeof scriptId !== 'string' || scriptId.trim() === '') {
        res.status(400).json({ error: 'scriptId must be a non-empty string' });
        return;
      }
      const script = await fileManager.setActive(scriptId);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }
      res.json({ script });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to set active script' });
    }
  });

  router.get('/scripts/:id', async (req, res) => {
    try {
      const script = await fileManager.getById(req.params.id);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }
      res.json({ script });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get script' });
    }
  });

  router.post('/scripts', async (req, res) => {
    try {
      const { name, source } = req.body as { name?: string; source?: string };
      if (typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'name must be a non-empty string' });
        return;
      }
      if (typeof source !== 'string') {
        res.status(400).json({ error: 'source must be a string' });
        return;
      }
      const script = await fileManager.create(name, source);
      res.status(201).json({ script });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create script' });
    }
  });

  router.put('/scripts/:id', async (req, res) => {
    try {
      const { name, source } = req.body as { name?: string; source?: string };
      const updates: { name?: string; source?: string } = {};
      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim() === '') {
          res.status(400).json({ error: 'name must be a non-empty string' });
          return;
        }
        updates.name = name;
      }
      if (source !== undefined) {
        if (typeof source !== 'string') {
          res.status(400).json({ error: 'source must be a string' });
          return;
        }
        updates.source = source;
      }
      const script = await fileManager.update(req.params.id, updates);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }
      res.json({ script });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update script' });
    }
  });

  router.delete('/scripts/:id', async (req, res) => {
    try {
      const deleted = await fileManager.delete(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }
      let removedIndicatorIds: string[] = [];
      if (indicatorsStore) {
        const removed = indicatorsStore.removeByScriptId(req.params.id);
        removedIndicatorIds = removed.map((i) => i.id);
      }
      if (removedIndicatorIds.length > 0) {
        broadcastIndicatorRemoved(removedIndicatorIds);
      }
      res.json({ success: true, removedIndicatorIds });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete script' });
    }
  });

  return router;
}
