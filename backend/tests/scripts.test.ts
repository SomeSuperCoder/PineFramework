import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ScriptFileManager } from '../src/store/ScriptFileManager.js';
import { ScriptsManifestStore } from '../src/store/ScriptsManifestStore.js';
import { createScriptsRouter } from '../src/routes/scripts.js';

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `scripts-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createFileManager(dir?: string): { fileManager: ScriptFileManager; dir: string } {
  const d = dir || tmpDir();
  const scriptsDir = path.join(d, 'scripts');
  fs.mkdirSync(path.join(scriptsDir, 'indicators'), { recursive: true });
  fs.mkdirSync(path.join(scriptsDir, 'strategies'), { recursive: true });
  const manifestStore = new ScriptsManifestStore(path.join(scriptsDir, 'manifest.json'));
  const fileManager = new ScriptFileManager(scriptsDir, manifestStore);
  return { fileManager, dir: d };
}

describe('ScriptFileManager', () => {
  let dir: string;
  let fm: ScriptFileManager;

  beforeEach(() => {
    const result = createFileManager();
    dir = result.dir;
    fm = result.fileManager;
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });

  describe('create', () => {
    it('creates a script and returns it', async () => {
      const script = await fm.create('My Indicator', '//@version=6\nindicator("My")\nplot(close)');
      expect(script.name).toBe('My Indicator');
      expect(script.source).toContain('indicator');
      expect(script.scriptType).toBe('indicator');
      expect(script.id).toBeDefined();
      expect(typeof script.createdAt).toBe('number');
      expect(typeof script.updatedAt).toBe('number');
    });

    it('auto-detects strategy type', async () => {
      const script = await fm.create('My Strategy', '//@version=6\nstrategy("My")\nplot(close)');
      expect(script.scriptType).toBe('strategy');
    });

    it('auto-detects indicator type', async () => {
      const script = await fm.create('My Indicator', '//@version=6\nindicator("My")\nplot(close)');
      expect(script.scriptType).toBe('indicator');
    });

    it('trims name whitespace', async () => {
      const script = await fm.create('  My Script  ', '//@version=6\nindicator("My")\nplot(close)');
      expect(script.name).toBe('My Script');
    });

    it('creates .pine file on disk', async () => {
      const script = await fm.create('Test', 'indicator("T")\nplot(close)');
      const manifest = new ScriptsManifestStore(path.join(dir, 'scripts', 'manifest.json'));
      const entry = manifest.getById(script.id);
      expect(entry).toBeDefined();
      const content = fs.readFileSync(path.join(dir, 'scripts', entry!.filePath), 'utf-8');
      expect(content).toContain('indicator("T")');
    });
  });

  describe('getAll', () => {
    it('returns empty array initially', async () => {
      expect(await fm.getAll()).toEqual([]);
    });

    it('returns all created scripts', async () => {
      await fm.create('A', 'indicator("A")\nplot(close)');
      await fm.create('B', 'indicator("B")\nplot(close)');
      expect(await fm.getAll()).toHaveLength(2);
    });
  });

  describe('getById', () => {
    it('returns script by id', async () => {
      const created = await fm.create('Test', 'indicator("T")\nplot(close)');
      const found = await fm.getById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe(created.name);
      expect(found!.source).toBe(created.source);
    });

    it('returns undefined for unknown id', async () => {
      expect(await fm.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates name', async () => {
      const created = await fm.create('Old Name', 'indicator("O")\nplot(close)');
      const updated = await fm.update(created.id, { name: 'New Name' });
      expect(updated!.name).toBe('New Name');
      expect(updated!.scriptType).toBe('indicator');
    });

    it('updates source and re-detects type', async () => {
      const created = await fm.create('Test', 'indicator("T")\nplot(close)');
      const updated = await fm.update(created.id, { source: '//@version=6\nstrategy("T")\nplot(close)' });
      expect(updated!.scriptType).toBe('strategy');
      expect(updated!.source).toContain('strategy');
    });

    it('returns null for unknown id', async () => {
      const result = await fm.update('nonexistent', { name: 'X' });
      expect(result).toBeNull();
    });

    it('bumps updatedAt timestamp', async () => {
      const created = await fm.create('Test', 'indicator("T")\nplot(close)');
      const originalTime = created.updatedAt;
      const updated = await fm.update(created.id, { name: 'Updated' });
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(originalTime);
    });

    it('persists source changes to disk', async () => {
      const created = await fm.create('Test', 'indicator("T")\nplot(close)');
      await fm.update(created.id, { source: 'indicator("Updated")\nplot(close)' });
      const found = await fm.getById(created.id);
      expect(found!.source).toContain('Updated');
    });
  });

  describe('delete', () => {
    it('deletes existing script', async () => {
      const created = await fm.create('Test', 'indicator("T")\nplot(close)');
      expect(await fm.delete(created.id)).toBe(true);
      expect(await fm.getById(created.id)).toBeUndefined();
    });

    it('returns false for unknown id', async () => {
      expect(await fm.delete('nonexistent')).toBe(false);
    });

    it('clears activeScriptId when deleting active script', async () => {
      const created = await fm.create('Active', 'indicator("A")\nplot(close)');
      fm.setActive(created.id);
      expect(fm.getActiveId()).toBe(created.id);
      await fm.delete(created.id);
      expect(fm.getActiveId()).toBeNull();
    });

    it('removes .pine file from disk', async () => {
      const created = await fm.create('Test', 'indicator("T")\nplot(close)');
      const manifest = new ScriptsManifestStore(path.join(dir, 'scripts', 'manifest.json'));
      const entry = manifest.getById(created.id);
      expect(fs.existsSync(path.join(dir, 'scripts', entry!.filePath))).toBe(true);
      await fm.delete(created.id);
      expect(fs.existsSync(path.join(dir, 'scripts', entry!.filePath))).toBe(false);
    });
  });

  describe('active script', () => {
    it('setActive returns null for missing id', () => {
      expect(fm.setActive('nonexistent')).toBeNull();
    });

    it('setActive persists and getActive retrieves', async () => {
      const s1 = await fm.create('A', 'indicator("A")\nplot(close)');
      const s2 = await fm.create('B', 'indicator("B")\nplot(close)');

      fm.setActive(s1.id);
      const active1 = await fm.getActive();
      expect(active1!.id).toBe(s1.id);
      expect(fm.getActiveId()).toBe(s1.id);

      fm.setActive(s2.id);
      const active2 = await fm.getActive();
      expect(active2!.id).toBe(s2.id);
      expect(fm.getActiveId()).toBe(s2.id);
    });

    it('returns undefined when no active script', async () => {
      expect(await fm.getActive()).toBeUndefined();
      expect(fm.getActiveId()).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await fm.create('Alpha Strategy', '//@version=6\nstrategy("Alpha")\nplot(close)');
      await fm.create('Beta Indicator', '//@version=6\nindicator("Beta")\nplot(close)');
      await fm.create('Gamma Strategy', '//@version=6\nstrategy("Gamma")\nplot(close)');
    });

    it('returns all scripts for empty query', async () => {
      expect(await fm.search('')).toHaveLength(3);
    });

    it('filters by name (case-insensitive)', async () => {
      const results = await fm.search('alpha');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alpha Strategy');
    });

    it('filters by source content', async () => {
      const results = await fm.search('Beta');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Beta Indicator');
    });

    it('filters by scriptType', async () => {
      const results = await fm.search('strategy');
      const names = results.map((s) => s.name);
      expect(names).toContain('Alpha Strategy');
      expect(names).toContain('Gamma Strategy');
      expect(names).not.toContain('Beta Indicator');
    });

    it('returns empty array for no matches', async () => {
      expect(await fm.search('zzzzz')).toHaveLength(0);
    });
  });

  describe('persistence', () => {
    it('preserves data across manager instances', async () => {
      const created = await fm.create('Persist', 'indicator("P")\nplot(close)');
      fm.setActive(created.id);

      const result2 = createFileManager(dir);
      expect(await result2.fileManager.getAll()).toHaveLength(1);
      const active = await result2.fileManager.getActive();
      expect(active!.id).toBe(created.id);
    });
  });
});

describe('createScriptsRouter', () => {
  it('returns an Express Router', async () => {
    const { fileManager } = createFileManager();
    const router = createScriptsRouter(fileManager);
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });
});
