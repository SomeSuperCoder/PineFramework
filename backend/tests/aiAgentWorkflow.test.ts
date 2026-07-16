import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ScriptFileManager } from '../src/store/ScriptFileManager.js';
import { ScriptsManifestStore } from '../src/store/ScriptsManifestStore.js';

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `ai-agent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createFileManager(dir: string): { fileManager: ScriptFileManager; manifestStore: ScriptsManifestStore } {
  const scriptsDir = path.join(dir, 'scripts');
  fs.mkdirSync(path.join(scriptsDir, 'indicators'), { recursive: true });
  fs.mkdirSync(path.join(scriptsDir, 'strategies'), { recursive: true });
  const manifestStore = new ScriptsManifestStore(path.join(scriptsDir, 'manifest.json'));
  const fileManager = new ScriptFileManager(scriptsDir, manifestStore);
  return { fileManager, manifestStore };
}

describe('AI Agent Workflow Integration', () => {
  let dir: string;
  let fileManager: ScriptFileManager;
  let manifestStore: ScriptsManifestStore;

  beforeEach(() => {
    dir = tmpDir();
    const result = createFileManager(dir);
    fileManager = result.fileManager;
    manifestStore = result.manifestStore;
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });

  it('AI agent creates script via ScriptManager → .pine file and manifest exist', async () => {
    const script = await fileManager.create('AI Generated Script', '//@version=5\nindicator("AI Generated Script")');

    const manifest = manifestStore.getAll();
    expect(manifest).toHaveLength(1);
    expect(manifest[0]!.filename).toBe('ai_generated_script.pine');
    expect(manifest[0]!.name).toBe('AI Generated Script');

    const found = await fileManager.getById(script.id);
    expect(found).toBeDefined();
    expect(found!.source).toContain('indicator("AI Generated Script")');
  });

  it('AI agent updates script → .pine file and manifest updated', async () => {
    const script = await fileManager.create('Original Script', '//@version=5\nindicator("Original Script")');

    await fileManager.update(script.id, { source: '//@version=5\nindicator("Updated Script")' });

    const manifest = manifestStore.getAll();
    expect(manifest).toHaveLength(1);
    expect(manifest[0]!.name).toBe('Original Script');

    const found = await fileManager.getById(script.id);
    expect(found!.source).toContain('indicator("Updated Script")');
  });

  it('AI agent deletes script → .pine file and manifest entry removed', async () => {
    const script = await fileManager.create('To Delete', '//@version=5\nindicator("To Delete")');
    expect(manifestStore.getAll()).toHaveLength(1);

    await fileManager.delete(script.id);

    expect(manifestStore.getAll()).toHaveLength(0);
    expect(await fileManager.getById(script.id)).toBeUndefined();
  });

  it('handles multiple scripts simultaneously', async () => {
    const scripts = await Promise.all([
      fileManager.create('Script 1', '//@version=5\nindicator("Script 1")'),
      fileManager.create('Script 2', '//@version=5\nstrategy("Script 2")'),
      fileManager.create('Script 3', '//@version=5\nindicator("Script 3")'),
    ]);

    expect(scripts).toHaveLength(3);
    expect(manifestStore.getAll()).toHaveLength(3);

    const all = await fileManager.getAll();
    expect(all).toHaveLength(3);
  });

  it('detects strategy type correctly', async () => {
    await fileManager.create('My Strategy', '//@version=5\nstrategy("My Strategy")\nplot(close)');
    const all = await fileManager.getAll();
    expect(all[0]!.scriptType).toBe('strategy');
  });

  it('detects indicator type correctly', async () => {
    await fileManager.create('My Indicator', '//@version=5\nindicator("My Indicator")\nplot(close)');
    const all = await fileManager.getAll();
    expect(all[0]!.scriptType).toBe('indicator');
  });

  it('active script persists across instances', async () => {
    const script = await fileManager.create('Active Script', '//@version=5\nindicator("Active")');
    fileManager.setActive(script.id);

    const result2 = createFileManager(dir);
    const active = await result2.fileManager.getActive();
    expect(active).toBeDefined();
    expect(active!.id).toBe(script.id);
  });

  it('search finds scripts by name and source', async () => {
    await fileManager.create('Alpha Indicator', '//@version=5\nindicator("Alpha")\nplot(rsi)');
    await fileManager.create('Beta Strategy', '//@version=5\nstrategy("Beta")\nplot(close)');

    const byName = await fileManager.search('Alpha');
    expect(byName).toHaveLength(1);
    expect(byName[0].name).toBe('Alpha Indicator');

    const bySource = await fileManager.search('plot(rsi)');
    expect(bySource).toHaveLength(1);
    expect(bySource[0].name).toBe('Alpha Indicator');

    const byType = await fileManager.search('strategy');
    expect(byType).toHaveLength(1);
    expect(byType[0].name).toBe('Beta Strategy');
  });
});
