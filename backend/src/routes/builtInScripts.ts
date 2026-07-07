import { Router } from 'express';
import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';

function extractNameFromContent(source: string): string | null {
  const match = source.match(/\b(?:indicator|strategy|library)\s*\(\s*["']([^"']+)["']/);
  return match ? match[1] : null;
}

export function createBuiltInScriptsRouter(testIndicatorsDir: string): Router {
  const router = Router();

  router.get('/scripts/built-in', (_req, res) => {
    try {
      const files = readdirSync(testIndicatorsDir).filter((f) => f.endsWith('.pine'));
      const scripts = files.map((file) => {
        const source = readFileSync(join(testIndicatorsDir, file), 'utf-8');
        const name = extractNameFromContent(source) || basename(file, '.pine');
        return {
          id: `builtin_${basename(file, '.pine')}`,
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
