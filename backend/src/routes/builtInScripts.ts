import { Router } from 'express';
import { scanBuiltInScripts } from '../store/builtInScripts.js';

/**
 * /api/scripts/built-in — serves the built-in Pine scripts (test_indicators/).
 * The scan + name extraction live in the shared store module so the Telegram
 * /backtest wizard resolves the SAME built-ins with the SAME ids; this route
 * keeps its exact response contract: { scripts: [{id, name, source, type}] }.
 */
export function createBuiltInScriptsRouter(testIndicatorsDir: string): Router {
  const router = Router();

  router.get('/scripts/built-in', (_req, res) => {
    try {
      const scripts = scanBuiltInScripts(testIndicatorsDir);
      res.json({ scripts });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load built-in scripts' });
    }
  });

  return router;
}
