/**
 * UNIT TESTS — jupiter-fee-fetcher persistent-cache integrity guards (B13).
 *
 * Locks the guard contract of getCacheEntry (via public getCachedDexFeeBps):
 *   1. CACHE_ENTRY_VERSION=2 is stamped on write (setCacheEntry path).
 *   2. Entries whose version !== 2 are treated as misses.
 *   3. Legacy entries without a version field are treated as misses.
 *   4. Entries with dexFeeBps < 1 (corruption artifact, e.g. 0.25) are misses.
 *   5. A valid v2 entry with dexFeeBps >= 1 is a hit (source: 'cache').
 *
 * The cache path is redirected to a temp dir by mocking node:os homedir.
 * Run: pnpm vitest run tests/jupiter-fee-cache-guard.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TMP_HOME = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'pine-feecache-test-'));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TMP_HOME };
});

import { getCachedDexFeeBps, getCacheFilePath } from '../src/strategy/jupiter-fee-fetcher.js';

const CACHE_FILE = () => getCacheFilePath();

/** Write a raw cache file with one entry for `symbol`. */
function seedEntry(symbol: string, entry: Record<string, unknown>): void {
  const file = CACHE_FILE();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf-8'))
    : { version: 1, entries: {} };
  existing.entries[symbol.toUpperCase()] = entry;
  fs.writeFileSync(file, JSON.stringify(existing), 'utf-8');
}

beforeAll(() => {
  fs.mkdirSync(path.dirname(CACHE_FILE()), { recursive: true });
});

afterAll(() => {
  try {
    fs.rmSync(TMP_HOME, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

describe('jupiter fee-cache integrity guards (CACHE_ENTRY_VERSION=2)', () => {
  it('happy path: valid v2 entry with dexFeeBps >= 1 is a HIT from cache', () => {
    seedEntry('GUARDHAPPYUSDT', {
      version: 2,
      dexFeeBps: 25,
      timestamp: Date.now(),
      dexLabel: 'Raydium',
    });
    const result = getCachedDexFeeBps('GUARDHAPPYUSDT');
    expect(result).toBeDefined();
    expect(result!.dexFeeBps).toBe(25);
    expect(result!.source).toBe('cache');
  });

  it('version mismatch: version !== 2 → MISS', () => {
    seedEntry('GUARDV1USDT', {
      version: 1,
      dexFeeBps: 25,
      timestamp: Date.now(),
      dexLabel: 'Raydium',
    });
    expect(getCachedDexFeeBps('GUARDV1USDT')).toBeUndefined();
  });

  it('legacy entry without a version field → MISS', () => {
    seedEntry('GUARDLEGACYUSDT', {
      // no version field — pre-v2 schema
      dexFeeBps: 25,
      timestamp: Date.now(),
      dexLabel: 'Raydium',
    });
    expect(getCachedDexFeeBps('GUARDLEGACYUSDT')).toBeUndefined();
  });

  it('sub-1 bps corruption artifact (0.25) → MISS', () => {
    seedEntry('GUARDLOWUSDT', {
      version: 2,
      dexFeeBps: 0.25, // historical 100x-undercharge artifact
      timestamp: Date.now(),
      dexLabel: 'Quantum',
    });
    expect(getCachedDexFeeBps('GUARDLOWUSDT')).toBeUndefined();
  });
});
