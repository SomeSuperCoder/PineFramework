import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ScriptStore } from '../src/store/ScriptStore.js';
import { createScriptsRouter } from '../src/routes/scripts.js';

function tmpFile(): string {
  return path.join(os.tmpdir(), `scripts-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function createStore(): ScriptStore {
  return new ScriptStore(tmpFile());
}

function ownedStore(filePath: string): ScriptStore {
  return new ScriptStore(filePath);
}

describe('ScriptStore', () => {
  let filePath: string;
  let store: ScriptStore;

  beforeEach(() => {
    filePath = tmpFile();
    store = ownedStore(filePath);
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  describe('create', () => {
    it('creates a script and returns it', () => {
      const script = store.create('My Indicator', '//@version=6\nindicator("My")\nplot(close)');
      expect(script.name).toBe('My Indicator');
      expect(script.source).toContain('indicator');
      expect(script.scriptType).toBe('indicator');
      expect(script.id).toBeDefined();
      expect(typeof script.createdAt).toBe('number');
      expect(typeof script.updatedAt).toBe('number');
    });

    it('auto-detects strategy type', () => {
      const script = store.create('My Strategy', '//@version=6\nstrategy("My")\nplot(close)');
      expect(script.scriptType).toBe('strategy');
    });

    it('auto-detects indicator type', () => {
      const script = store.create('My Indicator', '//@version=6\nindicator("My")\nplot(close)');
      expect(script.scriptType).toBe('indicator');
    });

    it('trims name whitespace', () => {
      const script = store.create('  My Script  ', '//@version=6\nindicator("My")\nplot(close)');
      expect(script.name).toBe('My Script');
    });

    it('persists to file', () => {
      store.create('Test', 'indicator("T")\nplot(close)');
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(raw.scripts).toHaveLength(1);
      expect(raw.scripts[0].name).toBe('Test');
    });
  });

  describe('getAll', () => {
    it('returns empty array initially', () => {
      expect(store.getAll()).toEqual([]);
    });

    it('returns all created scripts', () => {
      store.create('A', 'indicator("A")\nplot(close)');
      store.create('B', 'indicator("B")\nplot(close)');
      expect(store.getAll()).toHaveLength(2);
    });
  });

  describe('getById', () => {
    it('returns script by id', () => {
      const created = store.create('Test', 'indicator("T")\nplot(close)');
      const found = store.getById(created.id);
      expect(found).toEqual(created);
    });

    it('returns undefined for unknown id', () => {
      expect(store.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates name', () => {
      const created = store.create('Old Name', 'indicator("O")\nplot(close)');
      const updated = store.update(created.id, { name: 'New Name' });
      expect(updated!.name).toBe('New Name');
      expect(updated!.scriptType).toBe('indicator');
    });

    it('updates source and re-detects type', () => {
      const created = store.create('Test', 'indicator("T")\nplot(close)');
      const updated = store.update(created.id, { source: '//@version=6\nstrategy("T")\nplot(close)' });
      expect(updated!.scriptType).toBe('strategy');
      expect(updated!.source).toContain('strategy');
    });

    it('returns undefined for unknown id', () => {
      const result = store.update('nonexistent', { name: 'X' });
      expect(result).toBeUndefined();
    });

    it('bumps updatedAt timestamp', () => {
      const created = store.create('Test', 'indicator("T")\nplot(close)');
      const originalTime = created.updatedAt;
      const updated = store.update(created.id, { name: 'Updated' });
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(originalTime);
    });
  });

  describe('delete', () => {
    it('deletes existing script', () => {
      const created = store.create('Test', 'indicator("T")\nplot(close)');
      expect(store.delete(created.id)).toBe(true);
      expect(store.getById(created.id)).toBeUndefined();
    });

    it('returns false for unknown id', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });

    it('clears activeScriptId when deleting active script', () => {
      const created = store.create('Active', 'indicator("A")\nplot(close)');
      store.setActive(created.id);
      expect(store.getActiveId()).toBe(created.id);
      store.delete(created.id);
      expect(store.getActiveId()).toBeNull();
    });

    it('clears runningScriptId when deleting running script', () => {
      const created = store.create('Running', 'indicator("R")\nplot(close)');
      store.setRunning(created.id);
      expect(store.getRunningId()).toBe(created.id);
      store.delete(created.id);
      expect(store.getRunningId()).toBeNull();
    });
  });

  describe('active script', () => {
    it('setActive returns undefined for missing id', () => {
      expect(store.setActive('nonexistent')).toBeUndefined();
    });

    it('setActive persists and getActive retrieves', () => {
      const s1 = store.create('A', 'indicator("A")\nplot(close)');
      const s2 = store.create('B', 'indicator("B")\nplot(close)');

      store.setActive(s1.id);
      expect(store.getActive()!.id).toBe(s1.id);
      expect(store.getActiveId()).toBe(s1.id);

      store.setActive(s2.id);
      expect(store.getActive()!.id).toBe(s2.id);
      expect(store.getActiveId()).toBe(s2.id);
    });

    it('returns undefined when no active script', () => {
      expect(store.getActive()).toBeUndefined();
      expect(store.getActiveId()).toBeNull();
    });
  });

  describe('running script', () => {
    it('setRunning returns undefined for missing id', () => {
      expect(store.setRunning('nonexistent')).toBeUndefined();
    });

    it('setRunning persists and getRunning retrieves', () => {
      const created = store.create('Test', 'indicator("T")\nplot(close)');
      store.setRunning(created.id);
      expect(store.getRunning()!.id).toBe(created.id);
      expect(store.getRunningId()).toBe(created.id);
    });

    it('returns undefined when no running script', () => {
      expect(store.getRunning()).toBeUndefined();
      expect(store.getRunningId()).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      store.create('Alpha Strategy', '//@version=6\nstrategy("Alpha")\nplot(close)');
      store.create('Beta Indicator', '//@version=6\nindicator("Beta")\nplot(close)');
      store.create('Gamma Strategy', '//@version=6\nstrategy("Gamma")\nplot(close)');
    });

    it('returns all scripts for empty query', () => {
      expect(store.search('')).toHaveLength(3);
    });

    it('filters by name (case-insensitive)', () => {
      const results = store.search('alpha');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alpha Strategy');
    });

    it('filters by source content', () => {
      const results = store.search('Beta');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Beta Indicator');
    });

    it('filters by scriptType', () => {
      const results = store.search('strategy');
      const names = results.map((s) => s.name);
      expect(names).toContain('Alpha Strategy');
      expect(names).toContain('Gamma Strategy');
      expect(names).not.toContain('Beta Indicator');
    });

    it('returns empty array for no matches', () => {
      expect(store.search('zzzzz')).toHaveLength(0);
    });
  });

  describe('persistence', () => {
    it('preserves data across store instances', () => {
      const s1 = ownedStore(filePath);
      const created = s1.create('Persist', 'indicator("P")\nplot(close)');
      s1.setActive(created.id);
      s1.setRunning(created.id);

      const s2 = ownedStore(filePath);
      expect(s2.getAll()).toHaveLength(1);
      expect(s2.getActive()!.id).toBe(created.id);
      expect(s2.getRunning()!.id).toBe(created.id);
    });
  });
});

describe('createScriptsRouter', () => {
  it('returns an Express Router', () => {
    const store = createStore();
    const router = createScriptsRouter(store);
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });

  it('can be mounted and handle a request', () => {
    const store = createStore();
    store.create('Test', 'indicator("T")\nplot(close)');
    const router = createScriptsRouter(store);

    const mockReq = { query: {} } as any;
    const mockRes = {
      _json: null,
      _status: 200,
      status(code: number) { this._status = code; return this; },
      json(data: unknown) { this._json = data; },
    };

    router.handle({ ...mockReq, method: 'GET', url: '/scripts' } as any, mockRes as any);
    expect(mockRes._status).toBe(200);
    expect((mockRes._json as any).scripts).toHaveLength(1);
  });
});
