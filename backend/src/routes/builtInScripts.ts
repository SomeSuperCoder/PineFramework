import { Router } from 'express';
import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';

export function createBuiltInScriptsRouter(testIndicatorsDir: string): Router {
  const router = Router();

  router.get('/scripts/built-in', (_req, res) => {
    try {
      const files = readdirSync(testIndicatorsDir).filter((f) => f.endsWith('.pine'));
      const scripts = files.map((file) => {
        const source = readFileSync(join(testIndicatorsDir, file), 'utf-8');
        const name = basename(file, '.pine');
        return {
          id: `builtin_${name}`,
          name,
          source,
          type: source.includes('strategy(') ? 'strategy' as const : 'indicator' as const,
        };
      });
      res.json({ scripts });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load built-in scripts' });
    }
  });

  return router;
}
