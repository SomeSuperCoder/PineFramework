import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ScriptsManifestStore, computeChecksum } from '../src/store/ScriptsManifestStore.js';
import { sanitizeFilename, uniqueFilename } from '../src/utils/filename.js';
import { detectScriptType } from '../src/utils/scriptType.js';

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `file-storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('sanitizeFilename', () => {
  it('lowercases and replaces spaces', () => {
    expect(sanitizeFilename('My Script Name')).toBe('my_script_name');
  });

  it('removes special characters', () => {
    expect(sanitizeFilename('script@#$%^&*()')).toBe('script');
  });

  it('truncates to 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeFilename(long).length).toBe(64);
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('untitled');
  });

  it('preserves hyphens', () => {
    expect(sanitizeFilename('my-script')).toBe('my-script');
  });

  it('preserves underscores', () => {
    expect(sanitizeFilename('my_script')).toBe('my_script');
  });
});

describe('uniqueFilename', () => {
  it('returns base name if no conflict', () => {
    expect(uniqueFilename('test', new Set())).toBe('test');
  });

  it('appends numeric suffix for conflicts', () => {
    const existing = new Set(['test']);
    expect(uniqueFilename('test', existing)).toBe('test_1');
  });

  it('appends higher suffix if lower ones taken', () => {
    const existing = new Set(['test', 'test_1', 'test_2']);
    expect(uniqueFilename('test', existing)).toBe('test_3');
  });
});

describe('detectScriptType', () => {
  it('detects strategy', () => {
    const result = detectScriptType('strategy("My Strategy")');
    expect(result.type).toBe('strategy');
    expect(result.name).toBe('My Strategy');
  });

  it('detects indicator', () => {
    const result = detectScriptType('indicator("My Indicator")');
    expect(result.type).toBe('indicator');
    expect(result.name).toBe('My Indicator');
  });

  it('detects library', () => {
    const result = detectScriptType('library("My Library")');
    expect(result.type).toBe('library');
    expect(result.name).toBe('My Library');
  });

  it('defaults to indicator when no declaration', () => {
    const result = detectScriptType('//@version=5');
    expect(result.type).toBe('indicator');
    expect(result.name).toBeNull();
  });
});

describe('ScriptsManifestStore', () => {
  let dir: string;
  let manifestPath: string;

  beforeEach(() => {
    dir = tmpDir();
    manifestPath = path.join(dir, 'manifest.json');
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });

  it('creates manifest with defaults', () => {
    const store = new ScriptsManifestStore(manifestPath);
    expect(store.getAll()).toEqual([]);
    expect(store.getLastSyncAt()).toBe(0);
  });

  it('adds and retrieves entries', () => {
    const store = new ScriptsManifestStore(manifestPath);
    const entry = store.add({
      id: 'test-id',
      filename: 'test.pine',
      name: 'Test',
      scriptType: 'indicator',
      filePath: '/path/to/test.pine',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      checksum: 'abc123',
    });

    expect(store.getById('test-id')).toBeDefined();
    expect(store.getByFilename('test.pine')).toBeDefined();
    expect(store.getAll()).toHaveLength(1);
  });

  it('removes entries', () => {
    const store = new ScriptsManifestStore(manifestPath);
    store.add({
      id: 'test-id',
      filename: 'test.pine',
      name: 'Test',
      scriptType: 'indicator',
      filePath: '/path/to/test.pine',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      checksum: 'abc123',
    });

    expect(store.remove('test-id')).toBe(true);
    expect(store.getById('test-id')).toBeUndefined();
    expect(store.remove('nonexistent')).toBe(false);
  });

  it('updates entries', () => {
    const store = new ScriptsManifestStore(manifestPath);
    store.add({
      id: 'test-id',
      filename: 'test.pine',
      name: 'Test',
      scriptType: 'indicator',
      filePath: '/path/to/test.pine',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      checksum: 'abc123',
    });

    const updated = store.update('test-id', { name: 'Updated Test' });
    expect(updated?.name).toBe('Updated Test');
    expect(store.update('nonexistent', { name: 'fail' })).toBeUndefined();
  });

  it('returns existing filenames', () => {
    const store = new ScriptsManifestStore(manifestPath);
    store.add({
      id: 'test-id',
      filename: 'test.pine',
      name: 'Test',
      scriptType: 'indicator',
      filePath: '/path/to/test.pine',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      checksum: 'abc123',
    });

    const filenames = store.getExistingFilenames();
    expect(filenames.has('test.pine')).toBe(true);
    expect(filenames.has('other.pine')).toBe(false);
  });
});

describe('computeChecksum', () => {
  it('returns consistent checksum for same content', () => {
    const content = 'test content';
    expect(computeChecksum(content)).toBe(computeChecksum(content));
  });

  it('returns different checksum for different content', () => {
    expect(computeChecksum('content1')).not.toBe(computeChecksum('content2'));
  });
});
