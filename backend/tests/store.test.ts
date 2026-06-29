import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JsonStore } from '../src/store/JsonStore.js';
import { TelegramConfigStore } from '../src/store/TelegramConfigStore.js';

function tmpFile(): string {
  return path.join(os.tmpdir(), `json-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe('JsonStore', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpFile();
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('creates file with defaults if missing', () => {
    const store = new JsonStore(filePath, {
      defaultData: { key: 'value' },
    });
    const data = store.read();
    expect(data).toEqual({ key: 'value' });
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('reads existing data', () => {
    fs.writeFileSync(filePath, JSON.stringify({ foo: 'bar' }), 'utf-8');
    const store = new JsonStore(filePath, {
      defaultData: { foo: '' },
    });
    expect(store.read()).toEqual({ foo: 'bar' });
  });

  it('writes data', () => {
    const store = new JsonStore(filePath, {
      defaultData: { count: 0 },
    });
    store.write({ count: 42 });
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(raw).toEqual({ count: 42 });
  });

  it('patches data', () => {
    const store = new JsonStore(filePath, {
      defaultData: { a: 1, b: 2 },
    });
    store.patch({ a: 10 });
    expect(store.read()).toEqual({ a: 10, b: 2 });
  });

  it('validates data on write', () => {
    const store = new JsonStore(filePath, {
      defaultData: { val: 0 },
      validate: (d): d is { val: number } => {
        return typeof (d as Record<string, unknown>).val === 'number';
      },
    });
    expect(() => store.write({ val: 'string' as unknown as number })).toThrow('validation failed');
  });

  it('handles malformed JSON gracefully', () => {
    fs.writeFileSync(filePath, '{invalid json}', 'utf-8');
    const store = new JsonStore(filePath, {
      defaultData: { fallback: true },
    });
    expect(store.read()).toEqual({ fallback: true });
  });

  it('creates directory if missing', () => {
    const nestedDir = path.join(os.tmpdir(), 'nested-test-dir', 'sub');
    const nestedFile = path.join(nestedDir, 'test.json');
    const store = new JsonStore(nestedFile, {
      defaultData: { created: true },
    });
    expect(store.read()).toEqual({ created: true });
    expect(fs.existsSync(nestedFile)).toBe(true);

    try { fs.rmSync(nestedDir, { recursive: true }); } catch { /* ignore */ }
  });
});

describe('TelegramConfigStore', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpFile();
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('returns default values for empty store', () => {
    const store = new TelegramConfigStore(filePath);
    expect(store.getBotToken()).toBe('');
    expect(store.getSubscribers()).toEqual([]);
  });

  it('sets and gets bot token', () => {
    const store = new TelegramConfigStore(filePath);
    store.setBotToken('test-token-123');
    expect(store.getBotToken()).toBe('test-token-123');
  });

  it('adds and removes subscribers', () => {
    const store = new TelegramConfigStore(filePath);
    store.addSubscriber(12345, 'testuser');
    expect(store.getSubscribers()).toHaveLength(1);
    expect(store.getSubscribers()[0]!.chatId).toBe(12345);
    expect(store.getSubscribers()[0]!.username).toBe('testuser');

    store.addSubscriber(12345, 'testuser');
    expect(store.getSubscribers()).toHaveLength(1);

    const removed = store.removeSubscriber(12345);
    expect(removed).toBe(true);
    expect(store.getSubscribers()).toHaveLength(0);

    const notFound = store.removeSubscriber(99999);
    expect(notFound).toBe(false);
  });

  it('gets and sets alert preferences', () => {
    const store = new TelegramConfigStore(filePath);
    store.addSubscriber(12345, 'testuser');

    expect(store.getAlertPreference(12345, 'alert_1')).toBe(true);

    store.setAlertPreference(12345, 'alert_1', false);
    expect(store.getAlertPreference(12345, 'alert_1')).toBe(false);

    store.setAlertPreference(12345, 'alert_1', true);
    expect(store.getAlertPreference(12345, 'alert_1')).toBe(true);
  });

  it('returns true for unknown subscriber alerts', () => {
    const store = new TelegramConfigStore(filePath);
    expect(store.getAlertPreference(99999, 'alert_1')).toBe(true);
  });

  it('reloads from disk on each read', () => {
    const store = new TelegramConfigStore(filePath);
    store.setBotToken('initial-token');
    fs.writeFileSync(filePath, JSON.stringify({ botToken: 'edited-token', subscribers: [], settings: {} }), 'utf-8');
    expect(store.getBotToken()).toBe('edited-token');
  });

  it('handles corrupted file gracefully', () => {
    fs.writeFileSync(filePath, '{corrupted', 'utf-8');
    const store = new TelegramConfigStore(filePath);
    expect(store.getBotToken()).toBe('');
    expect(store.getSubscribers()).toEqual([]);
  });
});
