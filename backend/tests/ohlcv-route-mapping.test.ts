/**
 * Route-level tests for GET /api/ohlcv Bybit instrument mapping
 * (OpenSpec change: bybit-ticker-mapping).
 *
 * Contract under test:
 * - The Bybit request URL uses the MAPPED instrument + category for the 7
 *   mapped pairs: GOLDUSDC→symbol=XAUTUSDT&category=spot,
 *   TSLAXUSDC→TSLAXUSDT, AAPLXUSDC→AAPLXUSDT, and the 4 Backed xStocks
 *   (NVDAXUSDC→NVDAXUSDT, MCDXUSDC→MCDXUSDT, GOOGLXUSDC→GOOGLXUSDT,
 *   SPCXXUSDC→SPCXXUSDT).
 * - The 7 legacy pairs keep byte-identical legacy URL shape:
 *   /v5/market/kline?category=linear&symbol=<pair>&interval=60&limit=100.
 * - The JSON response AND the cache key keep the ORIGINAL pairSymbol — the
 *   frontend never sees the mapped Bybit instrument.
 *
 * Uses a real express app on an ephemeral port with ONLY the ohlcv router
 * mounted and a fresh in-memory OHLCVCache (no disk cache). The only external
 * dependency — the Bybit REST call — is stubbed via global.fetch: the stub
 * intercepts ONLY Bybit kline URLs and passes everything else (including the
 * test's own HTTP call to the ephemeral server) through to the real fetch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createOHLCVRouter } from '../src/routes/ohlcv.js';
import { OHLCVCache } from '../src/cache/ohlcv-cache.js';

/** Bybit v5 kline list rows are string arrays, newest first. */
const BYBIT_ROWS = [
  ['1700003600000', '105', '110', '100', '104', '1000'],
  ['1700000000000', '100', '110', '90', '105', '2000'],
];

function bybitOkResponse(rows: string[][]) {
  return { retCode: 0, retMsg: 'OK', result: { list: rows } };
}

/** Strip the REST base host so assertions pin the exact path+query. */
function pathAndQuery(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '');
}

describe('GET /api/ohlcv Bybit instrument mapping', () => {
  let server: Server;
  let baseUrl: string;
  let cache: OHLCVCache;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    cache = new OHLCVCache();
    const realFetch = globalThis.fetch.bind(globalThis);
    fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : String(input);
        if (url.includes('/v5/market/kline')) {
          return { ok: true, json: async () => bybitOkResponse(BYBIT_ROWS) } as Response;
        }
        return realFetch(input as RequestInfo, init);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = express();
    app.use('/api', createOHLCVRouter(cache));

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it.each([
    ['GOLDUSDC', 'XAUTUSDT'],
    ['TSLAXUSDC', 'TSLAXUSDT'],
    ['AAPLXUSDC', 'AAPLXUSDT'],
    ['NVDAXUSDC', 'NVDAXUSDT'],
    ['MCDXUSDC', 'MCDXUSDT'],
    ['GOOGLXUSDC', 'GOOGLXUSDT'],
    ['SPCXXUSDC', 'SPCXXUSDT'],
  ])(
    'requests the MAPPED Bybit instrument in spot category for %s → %s',
    async (original, mapped) => {
      const res = await fetch(`${baseUrl}/ohlcv?symbol=${original}&interval=60&limit=100`);
      expect(res.status).toBe(200);

      // calls[0] is the test's own HTTP request (it also flows through the
      // fetch wrapper) — pick the intercepted Bybit kline call.
      const bybitCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/v5/market/kline'),
      );
      expect(bybitCall).toBeDefined();
      const url = bybitCall![0] as string;
      expect(url).toContain('category=spot');
      expect(url).toContain(`symbol=${mapped}`);
      expect(url).toContain('interval=60');
      expect(url).toContain('limit=100');
      expect(url).not.toContain(original); // mapped instrument replaces the pair

      // The JSON response keeps the ORIGINAL pairSymbol + unchanged bar shape.
      const body = (await res.json()) as {
        symbol: string;
        interval: string;
        data: Array<{
          timestamp: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }>;
        hasMore: boolean;
      };
      expect(body.symbol).toBe(original);
      expect(body.interval).toBe('60');
      expect(body.data).toHaveLength(2);
      // Route reverses Bybit's newest-first list → oldest bar first.
      expect(body.data[0]).toEqual({
        timestamp: 1_700_000_000_000,
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 2000,
      });
      expect(body.data[1]!.close).toBe(104);
      expect(body.hasMore).toBe(false);

      // Invariant: the L1 cache key also keeps the ORIGINAL pairSymbol.
      expect(cache.get(original, '60')).not.toBeNull();
      expect(cache.get(mapped, '60')).toBeNull();
    },
  );

  it.each(['BTCUSDT', 'ETHUSDT'])(
    'legacy pair %s keeps a byte-identical Bybit URL (identity + linear)',
    async (pair) => {
      const res = await fetch(`${baseUrl}/ohlcv?symbol=${pair}&interval=60&limit=100`);
      expect(res.status).toBe(200);

      const bybitCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/v5/market/kline'),
      );
      expect(bybitCall).toBeDefined();
      const url = bybitCall![0] as string;
      expect(pathAndQuery(url)).toBe(
        `/v5/market/kline?category=linear&symbol=${pair}&interval=60&limit=100`,
      );

      const body = (await res.json()) as { symbol: string; data: unknown[] };
      expect(body.symbol).toBe(pair);
      expect(body.data).toHaveLength(2);
    },
  );
});
