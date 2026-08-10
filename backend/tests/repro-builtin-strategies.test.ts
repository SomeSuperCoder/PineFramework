/**
 * REPRO: StrategySelector shows no strategies
 * 
 * This test creates a full Express app matching backend/src/index.ts route mounting
 * and verifies both /api/scripts and /api/scripts/built-in return the expected data.
 */
import express from 'express';
import { createServer } from 'http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createBuiltInScriptsRouter } from '../src/routes/builtInScripts.js';
import { createScriptsRouter } from '../src/routes/scripts.js';
import { ScriptFileManager } from '../src/store/ScriptFileManager.js';
import { ScriptsManifestStore } from '../src/store/ScriptsManifestStore.js';

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `repro-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('REPRO: StrategySelector empty dropdown', () => {
  let tmpScriptsDir: string;
  let tmpIndicatorsDir: string;
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(async () => {
    // Create temp directory for user scripts (empty — no user-created scripts)
    tmpScriptsDir = tmpDir();
    fs.mkdirSync(path.join(tmpScriptsDir, 'strategies'), { recursive: true });
    fs.mkdirSync(path.join(tmpScriptsDir, 'indicators'), { recursive: true });

    // Create temp directory for built-in test indicators (same as test_indicators/)
    tmpIndicatorsDir = tmpDir();
    fs.writeFileSync(
      path.join(tmpIndicatorsDir, 'test-strategy.pine'),
      '//@version=5\nstrategy("Test Strategy", overlay=true)',
    );
    fs.writeFileSync(
      path.join(tmpIndicatorsDir, 'test-indicator.pine'),
      '//@version=5\nindicator("Test Indicator", overlay=true)',
    );

    // Build Express app with EXACT same route mounting order as backend/src/index.ts
    const app = express();
    app.use(express.json());

    const manifestStore = new ScriptsManifestStore(path.join(tmpScriptsDir, 'manifest.json'));
    const fileManager = new ScriptFileManager(tmpScriptsDir, manifestStore);

    // Mount order matches index.ts lines 248-249
    app.use('/api', createBuiltInScriptsRouter(tmpIndicatorsDir));
    app.use('/api', createScriptsRouter(fileManager));

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    fs.rmSync(tmpScriptsDir, { recursive: true, force: true });
    fs.rmSync(tmpIndicatorsDir, { recursive: true, force: true });
  });

  it('GET /api/scripts/built-in returns scripts with type field', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/scripts/built-in`);
    const body = await res.json() as { scripts: Array<{ id: string; name: string; type: string; source: string }> };

    expect(res.status).toBe(200);
    expect(body.scripts).toBeDefined();
    expect(body.scripts.length).toBe(2);

    const strategy = body.scripts.find((s) => s.type === 'strategy');
    expect(strategy).toBeDefined();
    expect(strategy!.name).toBe('Test Strategy');

    const indicator = body.scripts.find((s) => s.type === 'indicator');
    expect(indicator).toBeDefined();
    expect(indicator!.name).toBe('Test Indicator');
  });

  it('GET /api/scripts returns scripts with scriptType field', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/scripts`);
    const body = await res.json() as { scripts: Array<{ id: string; name: string; scriptType: string }> };

    expect(res.status).toBe(200);
    expect(body.scripts).toBeDefined();
    // No user scripts created — should be empty
    expect(body.scripts.length).toBe(0);
  });

  it('REPRO: frontend merge logic extracts strategies from both endpoints', async () => {
    // Simulate the exact frontend fetch logic from StrategySelector.tsx
    const [listRes, builtInRes] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/scripts`),
      fetch(`http://127.0.0.1:${port}/api/scripts/built-in`),
    ]);

    const listData = await listRes.json() as any;
    const builtInData = await builtInRes.json() as any;

    // Frontend filter for user scripts (line 73-81)
    const userScripts = (listData.scripts || [])
      .filter((s: any) => s.scriptType === 'strategy')
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        source: s.source,
        type: s.scriptType,
        isBuiltIn: false,
      }));

    // Frontend filter for built-in scripts (line 83-91)
    const builtInScripts = (builtInData.scripts || [])
      .filter((s: any) => s.type === 'strategy')
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        source: s.source,
        type: s.type,
        isBuiltIn: true,
      }));

    const allStrategies = [...userScripts, ...builtInScripts];

    console.log('userScripts:', JSON.stringify(userScripts));
    console.log('builtInScripts:', JSON.stringify(builtInScripts));
    console.log('allStrategies:', JSON.stringify(allStrategies));

    // THIS IS THE ASSERTION: after merge, should have 1 strategy
    expect(allStrategies.length).toBe(1);
    expect(allStrategies[0].name).toBe('Test Strategy');
    expect(allStrategies[0].isBuiltIn).toBe(true);
  });
});
