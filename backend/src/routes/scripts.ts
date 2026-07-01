import { Router } from 'express';
import type { ScriptStore } from '../store/ScriptStore.js';

export function createScriptsRouter(store: ScriptStore): Router {
  const router = Router();

  router.get('/scripts', (req, res) => {
    try {
      const q = req.query.q;
      const scripts = typeof q === 'string' ? store.search(q) : store.getAll();
      const activeId = store.getActiveId();
      res.json({ scripts, activeScriptId: activeId });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list scripts' });
    }
  });

  router.get('/scripts/active', (_req, res) => {
    try {
      const active = store.getActive();
      res.json({ script: active ?? null });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get active script' });
    }
  });

  router.put('/scripts/active', (req, res) => {
    try {
      const { scriptId } = req.body as { scriptId?: string };
      if (typeof scriptId !== 'string' || scriptId.trim() === '') {
        res.status(400).json({ error: 'scriptId must be a non-empty string' });
        return;
      }
      const script = store.setActive(scriptId);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }
      res.json({ script });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to set active script' });
    }
  });

  router.get('/scripts/:id', (req, res) => {
    try {
      const script = store.getById(req.params.id);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }
      res.json({ script });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get script' });
    }
  });

  router.post('/scripts', (req, res) => {
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
      const script = store.create(name, source);
      res.status(201).json({ script });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create script' });
    }
  });

  router.put('/scripts/:id', (req, res) => {
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
      const script = store.update(req.params.id, updates);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }
      res.json({ script });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update script' });
    }
  });

  router.delete('/scripts/:id', (req, res) => {
    try {
      const deleted = store.delete(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete script' });
    }
  });

  return router;
}
