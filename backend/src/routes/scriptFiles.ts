import { Router } from 'express';
import * as fs from 'node:fs';
import type { ScriptsManifestStore } from '../store/ScriptsManifestStore.js';
import type { FileSyncEngine } from '../store/FileSyncEngine.js';

export function createScriptFilesRouter(
  manifestStore: ScriptsManifestStore,
  syncEngine: FileSyncEngine,
  _scriptsDir: string
): Router {
  const router = Router();

  router.get('/scripts/files', (_req, res) => {
    try {
      const entries = manifestStore.getAll();
      res.json({ files: entries });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list files' });
    }
  });

  router.get('/scripts/files/status', (_req, res) => {
    try {
      const lastSyncAt = manifestStore.getLastSyncAt();
      const count = manifestStore.getAll().length;
      res.json({ lastSyncAt, scriptCount: count });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get status' });
    }
  });

  router.get('/scripts/files/:id', (req, res) => {
    try {
      const entry = manifestStore.getById(req.params.id);
      if (!entry) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      res.json({ file: entry });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get file' });
    }
  });

  router.get('/scripts/files/:id/content', (req, res) => {
    try {
      const entry = manifestStore.getById(req.params.id);
      if (!entry) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      if (!fs.existsSync(entry.filePath)) {
        res.status(404).json({ error: 'File does not exist on disk' });
        return;
      }

      const content = fs.readFileSync(entry.filePath, 'utf-8');
      res.json({ content });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read file' });
    }
  });

  router.post('/scripts/files/sync', async (_req, res) => {
    try {
      const result = await syncEngine.fullSync();
      res.json({ synced: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to sync' });
    }
  });

  return router;
}
