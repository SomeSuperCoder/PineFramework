/**
 * sol-price-fetcher.test.ts
 *
 * Locks the behavior of fetchSolPriceUsd (backend/src/services/sol-price-fetcher.ts)
 * after the Bybit v2 → v5 migration. The user-visible symptom was a SOL/USD price
 * that silently came back null ("BYBIT SOL price API returned no usable price")
 * because the retired v2 endpoint returned HTTP 404. These tests pin the v5 +
 * defensive-v2 parsing so the price can never silently regress to null again.
 *
 * Strategy:
 * - parseBybitTicker is module-private, so every parser path is exercised THROUGH
 *   the public fetchSolPriceUsd with a stubbed global fetch.
 * - node:fs is fully mocked, so the disk cache (~/.pine/bybit-sol-price.json) is
 *   never read or written for real — the home-dir cache is untouched by construction.
 * - fetch cache-hit/miss behavior is asserted via the fs mock (existsSync /
 *   readFileSync / writeFileSync / mkdirSync).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mock state so the fs mock factory can reference it before imports run.
const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => fsMock);

// Silence the real pino logger — failure paths log warnings by design.
vi.mock('../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { fetchSolPriceUsd } from '../src/services/sol-price-fetcher.js';

/** Stub global fetch to resolve a Bybit ticker payload. */
function mockFetchResponse(payload: unknown, ok = true): void {
  fetchMock.mockResolvedValue({
    ok,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  });
}

/** Canonical v5 payload (live endpoint shape). */
function v5Payload(overrides: Record<string, unknown> = {}): object {
  return {
    retCode: 0,
    result: {
      category: 'spot',
      list: [{ symbol: 'SOLUSDT', lastPrice: '76.48' }],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Re-stub fetch EVERY test — afterEach unstubs globals, so a top-level
  // vi.stubGlobal would only survive the first test (the 15-fail red run).
  vi.stubGlobal('fetch', fetchMock);
  // Default: no cache file → every test exercises the upstream path.
  fsMock.existsSync.mockReturnValue(false);
  fetchMock.mockResolvedValue({ ok: true, text: async () => '{}' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSolPriceUsd — Bybit v5 primary shape', () => {
  it('v5 object shape with string lastPrice → returns the number', async () => {
    mockFetchResponse(v5Payload());
    await expect(fetchSolPriceUsd()).resolves.toBe(76.48);
  });

  it('v5 list with lastPrice as a NUMBER → returns the number', async () => {
    mockFetchResponse({ ...v5Payload(), result: { category: 'spot', list: [{ symbol: 'SOLUSDT', lastPrice: 76.48 }] } });
    await expect(fetchSolPriceUsd()).resolves.toBe(76.48);
  });
});

describe('fetchSolPriceUsd — legacy v2 defensive shapes', () => {
  it('v2 single-object shape → returns the number', async () => {
    mockFetchResponse({ ret_code: 0, result: { symbol: 'SOLUSDT', last_price: '76.48' } });
    await expect(fetchSolPriceUsd()).resolves.toBe(76.48);
  });

  it('v2 array shape with number last_price → returns the number', async () => {
    mockFetchResponse({
      ret_code: 0,
      result: [
        { symbol: 'BTCUSDT', last_price: '105000' },
        { symbol: 'SOLUSDT', last_price: 76.48 },
      ],
    });
    await expect(fetchSolPriceUsd()).resolves.toBe(76.48);
  });
});

describe('fetchSolPriceUsd — unusable payload guards', () => {
  it('retCode !== 0 (10001) → null and NO cache write', async () => {
    mockFetchResponse({ retCode: 10001, ret_msg: 'invalid request', result: {} });
    await expect(fetchSolPriceUsd()).resolves.toBeNull();
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it('result.list empty → null', async () => {
    mockFetchResponse({ retCode: 0, result: { category: 'spot', list: [] } });
    await expect(fetchSolPriceUsd()).resolves.toBeNull();
  });

  it('list without a SOLUSDT entry → null', async () => {
    mockFetchResponse({ retCode: 0, result: { category: 'spot', list: [{ symbol: 'BTCUSDT', lastPrice: '105000' }] } });
    await expect(fetchSolPriceUsd()).resolves.toBeNull();
  });

  it('lastPrice empty string → null (NOT 0)', async () => {
    mockFetchResponse({ retCode: 0, result: { category: 'spot', list: [{ symbol: 'SOLUSDT', lastPrice: '' }] } });
    const result = await fetchSolPriceUsd();
    expect(result).toBeNull();
    expect(result).not.toBe(0);
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it('lastPrice non-numeric garbage → null', async () => {
    mockFetchResponse({ retCode: 0, result: { category: 'spot', list: [{ symbol: 'SOLUSDT', lastPrice: 'abc' }] } });
    await expect(fetchSolPriceUsd()).resolves.toBeNull();
  });

  it('ticker with no lastPrice/last_price field → null', async () => {
    mockFetchResponse({ retCode: 0, result: { category: 'spot', list: [{ symbol: 'SOLUSDT' }] } });
    await expect(fetchSolPriceUsd()).resolves.toBeNull();
  });
});

describe('fetchSolPriceUsd — upstream transport failures', () => {
  it('malformed JSON (res.text() = "not json") → null', async () => {
    mockFetchResponse('not json');
    await expect(fetchSolPriceUsd()).resolves.toBeNull();
  });

  it('fetch rejects (network down) → null', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(fetchSolPriceUsd()).resolves.toBeNull();
  });

  it('!res.ok (HTTP 404 — the retired v2 symptom) → null', async () => {
    mockFetchResponse(v5Payload(), false);
    await expect(fetchSolPriceUsd()).resolves.toBeNull();
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });
});

describe('fetchSolPriceUsd — disk cache behavior', () => {
  it('fresh cache hit → returns cached value WITHOUT calling fetch', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(JSON.stringify({ priceUsd: 150, fetchedAt: Date.now() }));
    await expect(fetchSolPriceUsd()).resolves.toBe(150);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it('stale cache → calls fetch and writes a fresh cache entry', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(
      JSON.stringify({ priceUsd: 150, fetchedAt: Date.now() - 6 * 60 * 1000 }),
    );
    mockFetchResponse(v5Payload());
    await expect(fetchSolPriceUsd()).resolves.toBe(76.48);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.bybit.com/v5/market/tickers?category=spot&symbol=SOLUSDT',
      expect.anything(),
    );
    expect(fsMock.mkdirSync).toHaveBeenCalled();
    expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1);
    const [cachePath, cacheJson] = fsMock.writeFileSync.mock.calls[0];
    expect(cachePath).toContain('.pine');
    expect(JSON.parse(cacheJson)).toMatchObject({ priceUsd: 76.48 });
  });

  it('corrupt cache file → treated as a miss, falls through to fetch', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockImplementation(() => {
      throw new Error('corrupt cache');
    });
    mockFetchResponse(v5Payload());
    await expect(fetchSolPriceUsd()).resolves.toBe(76.48);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cache entry with wrong types → treated as a miss', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(JSON.stringify({ priceUsd: '150', fetchedAt: 'nope' }));
    mockFetchResponse(v5Payload());
    await expect(fetchSolPriceUsd()).resolves.toBe(76.48);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
