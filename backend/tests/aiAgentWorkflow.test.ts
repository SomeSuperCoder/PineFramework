import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ScriptStore } from '../src/store/ScriptStore.js';
import { ScriptsManifestStore } from '../src/store/ScriptsManifestStore.js';
import { FileSyncEngine } from '../src/store/FileSyncEngine.js';
import { DatabaseFileSync } from '../src/store/DatabaseFileSync.js';

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `ai-agent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('AI Agent Workflow Integration', () => {
  let dir: string;
  let scriptsDir: string;
  let scriptStore: ScriptStore;
  let manifestStore: ScriptsManifestStore;
  let syncEngine: FileSyncEngine;
  let dbFileSync: DatabaseFileSync;

  beforeEach(() => {
    dir = tmpDir();
    scriptsDir = path.join(dir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });

    const scriptStorePath = path.join(dir, 'scripts.json');
    const manifestPath = path.join(scriptsDir, 'manifest.json');

    scriptStore = new ScriptStore(scriptStorePath);
    manifestStore = new ScriptsManifestStore(manifestPath);
    syncEngine = new FileSyncEngine(scriptsDir, manifestStore, scriptStore);
    dbFileSync = new DatabaseFileSync(scriptsDir, manifestStore, scriptStore);
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });

  it('AI agent creates script file → syncs to database', async () => {
    const source = '//@version=5\nindicator("AI Generated Script")';
    const filePath = path.join(scriptsDir, 'ai_script.pine');
    fs.writeFileSync(filePath, source, 'utf-8');

    await syncEngine.syncFile(filePath);

    const manifest = manifestStore.getAll();
    expect(manifest).toHaveLength(1);
    expect(manifest[0]!.filename).toBe('ai_script.pine');
    expect(manifest[0]!.name).toBe('AI Generated Script');

    const scripts = scriptStore.getAll();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.name).toBe('AI Generated Script');
  });

  it('AI agent modifies script file → updates database', async () => {
    const source = '//@version=5\nindicator("Original Script")';
    const filePath = path.join(scriptsDir, 'ai_script.pine');
    fs.writeFileSync(filePath, source, 'utf-8');

    await syncEngine.syncFile(filePath);

    const updatedSource = '//@version=5\nindicator("Updated Script")';
    fs.writeFileSync(filePath, updatedSource, 'utf-8');

    await syncEngine.syncFile(filePath);

    const manifest = manifestStore.getAll();
    expect(manifest).toHaveLength(1);
    expect(manifest[0]!.name).toBe('Updated Script');

    const scripts = scriptStore.getAll();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.name).toBe('Updated Script');
  });

  it('AI agent deletes script file → removes from database', async () => {
    const source = '//@version=5\nindicator("To Delete")';
    const filePath = path.join(scriptsDir, 'delete_me.pine');
    fs.writeFileSync(filePath, source, 'utf-8');

    await syncEngine.syncFile(filePath);
    expect(scriptStore.getAll()).toHaveLength(1);

    fs.unlinkSync(filePath);
    await syncEngine.removeFile(filePath);

    expect(scriptStore.getAll()).toHaveLength(0);
    expect(manifestStore.getAll()).toHaveLength(0);
  });

  it('API creates script → .pine file is created', () => {
    const script = scriptStore.create('API Script', '//@version=5\nindicator("API Script")');
    dbFileSync.onScriptCreated(script);

    const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.pine'));
    expect(files).toHaveLength(1);

    const content = fs.readFileSync(path.join(scriptsDir, files[0]!), 'utf-8');
    expect(content).toContain('indicator("API Script")');
  });

  it('API updates script → .pine file is updated', () => {
    const script = scriptStore.create('Update Test', '//@version=5\nindicator("Original")');
    dbFileSync.onScriptCreated(script);

    scriptStore.update(script.id, { source: '//@version=5\nindicator("Modified")' });
    const updated = scriptStore.getById(script.id)!;
    dbFileSync.onScriptUpdated(updated);

    const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.pine'));
    const content = fs.readFileSync(path.join(scriptsDir, files[0]!), 'utf-8');
    expect(content).toContain('indicator("Modified")');
  });

  it('API deletes script → .pine file is deleted', () => {
    const script = scriptStore.create('Delete Test', '//@version=5\nindicator("Delete Me")');
    dbFileSync.onScriptCreated(script);

    const filesBefore = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.pine'));
    expect(filesBefore).toHaveLength(1);

    scriptStore.delete(script.id);
    dbFileSync.onScriptDeleted(script.id);

    const filesAfter = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.pine'));
    expect(filesAfter).toHaveLength(0);
  });

  it('fullSync detects new files', async () => {
    const source1 = '//@version=5\nindicator("Script 1")';
    const source2 = '//@version=5\nstrategy("Script 2")';
    fs.writeFileSync(path.join(scriptsDir, 'script1.pine'), source1, 'utf-8');
    fs.writeFileSync(path.join(scriptsDir, 'script2.pine'), source2, 'utf-8');

    const result = await syncEngine.fullSync();
    expect(result.added).toBe(2);
    expect(scriptStore.getAll()).toHaveLength(2);
  });

  it('fullSync detects removed files', async () => {
    const source = '//@version=5\nindicator("Ghost Script")';
    const filePath = path.join(scriptsDir, 'ghost.pine');
    fs.writeFileSync(filePath, source, 'utf-8');
    await syncEngine.syncFile(filePath);

    expect(scriptStore.getAll()).toHaveLength(1);

    fs.unlinkSync(filePath);
    const result = await syncEngine.fullSync();
    expect(result.removed).toBe(1);
    expect(scriptStore.getAll()).toHaveLength(0);
  });

  it('fullSync detects modified files', async () => {
    const source = '//@version=5\nindicator("Original")';
    const filePath = path.join(scriptsDir, 'modified.pine');
    fs.writeFileSync(filePath, source, 'utf-8');
    await syncEngine.syncFile(filePath);

    const updatedSource = '//@version=5\nindicator("Modified")';
    fs.writeFileSync(filePath, updatedSource, 'utf-8');

    const result = await syncEngine.fullSync();
    expect(result.updated).toBe(1);
    expect(scriptStore.getAll()[0]!.name).toBe('Modified');
  });

  it('handles multiple AI agents creating scripts simultaneously', async () => {
    const agents = Array.from({ length: 5 }, (_, i) => ({
      name: `Agent ${i} Script`,
      source: `//@version=5\nindicator("Agent ${i} Script")`,
    }));

    for (const agent of agents) {
      const filePath = path.join(scriptsDir, `${agent.name.replace(/\s/g, '_').toLowerCase()}.pine`);
      fs.writeFileSync(filePath, agent.source, 'utf-8');
    }

    await syncEngine.fullSync();

    expect(scriptStore.getAll()).toHaveLength(5);
    expect(manifestStore.getAll()).toHaveLength(5);
  });
});
