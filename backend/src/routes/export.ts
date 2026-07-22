import { Router } from 'express';
import { writeFileSync } from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const EXPORTS_DIR = path.join(PROJECT_ROOT, '.exports');

export function createExportRouter(): Router {
  const router = Router();

  router.post('/export', (req, res) => {
    try {
      const payload = req.body;
      const filename = `export-${Date.now()}.json`;
      const filePath = path.join(EXPORTS_DIR, filename);

      writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');

      console.log(`[Export] Written to ${filePath}`);
      res.json({ success: true, path: filePath });
    } catch (err) {
      console.error('[Export] Error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to write export',
      });
    }
  });

  return router;
}
