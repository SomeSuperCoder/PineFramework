import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ScriptFileManager } from '../src/store/ScriptFileManager.js';
import { ScriptsManifestStore } from '../src/store/ScriptsManifestStore.js';

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `reconcile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createFileManager(): { fileManager: ScriptFileManager; scriptsDir: string; dir: string } {
  const dir = tmpDir();
  const scriptsDir = path.join(dir, 'scripts');
  fs.mkdirSync(path.join(scriptsDir, 'indicators'), { recursive: true });
  fs.mkdirSync(path.join(scriptsDir, 'strategies'), { recursive: true });
  const manifest = new ScriptsManifestStore(path.join(scriptsDir, 'manifest.json'));
  const fileManager = new ScriptFileManager(scriptsDir, manifest);
  return { fileManager, scriptsDir, dir };
}

describe('ScriptFileManager lazy reconcile', () => {
  let scriptsDir: string;
  let fm: ScriptFileManager;
  let dir: string;

  beforeEach(() => {
    const result = createFileManager();
    fm = result.fileManager;
    scriptsDir = result.scriptsDir;
    dir = result.dir;
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });

  describe('paste discovery', () => {
    it('discovers a manually pasted .pine strategy file (not via create)', async () => {
      const rel = path.join(scriptsDir, 'strategies', 'foo.pine');
      fs.writeFileSync(rel, '//@version=6\nstrategy(title="Foo Strategy")\nplot(close)\n');

      const all = await fm.getAll();
      const entry = all.find((s) => s.name === 'Foo Strategy');
      expect(entry).toBeDefined();
      expect(entry!.scriptType).toBe('strategy');
      expect(entry!.id).toBeTruthy();
      expect(typeof entry!.id).toBe('string');
      expect(entry!.id.length).toBeGreaterThan(0);
    });

    it('assigns a stable id across consecutive getAll() calls', async () => {
      const rel = path.join(scriptsDir, 'strategies', 'stable.pine');
      fs.writeFileSync(rel, '//@version=6\nstrategy(title="Stable")\nplot(close)\n');

      const first = await fm.getAll();
      const firstEntry = first.find((s) => s.name === 'Stable');
      expect(firstEntry).toBeDefined();
      const id1 = firstEntry!.id;

      const second = await fm.getAll();
      const secondEntry = second.find((s) => s.name === 'Stable');
      expect(secondEntry).toBeDefined();
      expect(secondEntry!.id).toBe(id1);
    });

    it('falls back to basename when no title is present', async () => {
      const rel = path.join(scriptsDir, 'strategies', 'notitle.pine');
      // No strategy()/indicator() call with a title -> name falls back to basename.
      fs.writeFileSync(rel, '//@version=6\nplot(close)\n');

      const all = await fm.getAll();
      const entry = all.find((s) => s.name === 'notitle');
      expect(entry).toBeDefined();
      expect(entry!.scriptType).toBe('strategy');
    });
  });

  describe('delete pruning', () => {
    it('removes the manifest entry when the .pine file is unlinked', async () => {
      const rel = path.join(scriptsDir, 'strategies', 'prune.pine');
      fs.writeFileSync(rel, '//@version=6\nstrategy(title="Prune Me")\nplot(close)\n');

      const before = await fm.getAll();
      expect(before.find((s) => s.name === 'Prune Me')).toBeDefined();

      fs.unlinkSync(rel);
      const after = await fm.getAll();
      expect(after.find((s) => s.name === 'Prune Me')).toBeUndefined();
    });
  });

  describe('active clears on prune', () => {
    it('clears activeScriptId when the active script file is removed from disk', async () => {
      const rel = path.join(scriptsDir, 'strategies', 'active.pine');
      fs.writeFileSync(rel, '//@version=6\nstrategy(title="Active One")\nplot(close)\n');

      const all = await fm.getAll();
      const entry = all.find((s) => s.name === 'Active One');
      expect(entry).toBeDefined();

      await fm.setActive(entry!.id);
      expect(fm.getActiveId()).toBe(entry!.id);

      fs.unlinkSync(rel);
      expect(await fm.getActive()).toBeUndefined();
      expect(fm.getActiveId()).toBeNull();
    });
  });

  describe('external edit refresh', () => {
    it('refreshes name/checksum when the file is edited externally (newer mtime)', async () => {
      const rel = path.join(scriptsDir, 'strategies', 'edit.pine');
      fs.writeFileSync(rel, '//@version=6\nstrategy(title="Alpha")\nplot(close)\n');

      const first = await fm.getAll();
      const firstEntry = first.find((s) => s.name === 'Alpha');
      expect(firstEntry).toBeDefined();
      const id = firstEntry!.id;

      // Rewrite with new title and force a newer mtime so reconcile detects it.
      fs.writeFileSync(rel, '//@version=6\nstrategy(title="Beta")\nplot(close)\n');
      const future = new Date(Date.now() + 10000);
      fs.utimesSync(rel, future, future);

      const second = await fm.getAll();
      const secondEntry = second.find((s) => s.id === id);
      expect(secondEntry).toBeDefined();
      expect(secondEntry!.name).toBe('Beta');
    });

    it('keeps the same id after an external edit refresh', async () => {
      const rel = path.join(scriptsDir, 'strategies', 'edit-stable.pine');
      fs.writeFileSync(rel, '//@version=6\nstrategy(title="Alpha")\nplot(close)\n');

      const first = await fm.getAll();
      const id = first.find((s) => s.name === 'Alpha')!.id;

      fs.writeFileSync(rel, '//@version=6\nstrategy(title="Beta")\nplot(close)\n');
      const future = new Date(Date.now() + 10000);
      fs.utimesSync(rel, future, future);

      const second = await fm.getAll();
      expect(second.find((s) => s.name === 'Beta')!.id).toBe(id);
    });
  });

  describe('indicator subdir', () => {
    it('discovers a manually pasted .pine indicator file', async () => {
      const rel = path.join(scriptsDir, 'indicators', 'osc.pine');
      fs.writeFileSync(rel, '//@version=6\nindicator(title="My Oscillator")\nplot(close)\n');

      const all = await fm.getAll();
      const entry = all.find((s) => s.name === 'My Oscillator');
      expect(entry).toBeDefined();
      expect(entry!.scriptType).toBe('indicator');
    });
  });
});
