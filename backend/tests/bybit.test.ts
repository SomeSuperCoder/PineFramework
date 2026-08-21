import { describe, it, expect, vi, afterEach } from 'vitest';
import { RateLimiter } from '../src/bybit/rate-limiter.js';

describe('RateLimiter', () => {
  it('allows requests within limit', async () => {
    const limiter = new RateLimiter(5, 1000);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
  });

  it('throttles when limit exceeded', async () => {
    const limiter = new RateLimiter(2, 100);
    await limiter.acquire();
    await limiter.acquire();
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});

describe('BybitDataSource', () => {
  it('can be instantiated', async () => {
    const { BybitDataSource } = await import('../src/bybit/bybit-data-source.js');
    const ds = new BybitDataSource();
    expect(ds).toBeDefined();
  });

  it('fetchBars returns array of bars from Bybit', async () => {
    const { BybitDataSource } = await import('../src/bybit/bybit-data-source.js');
    const ds = new BybitDataSource();
    const now = Date.now();
    const oneHourAgo = now - 3600_000;

    // Network-independent: mock the kline endpoint (raw rows are newest-first,
    // as Bybit returns them). Same response shape as the pagination mocks below.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      if (!url.toString().includes('/v5/market/kline')) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(
        JSON.stringify({
          retCode: 0,
          retMsg: 'OK',
          result: {
            list: [
              [String(now), '100', '110', '90', '105', '1000'],
              [String(oneHourAgo), '95', '108', '92', '99', '800'],
            ],
          },
        }),
        { status: 200 },
      );
    });

    const bars = await ds.fetchBars('BTCUSDT', '1', oneHourAgo, now);
    expect(Array.isArray(bars)).toBe(true);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]).toHaveProperty('timestamp');
    expect(bars[0]).toHaveProperty('open');
    expect(bars[0]).toHaveProperty('high');
    expect(bars[0]).toHaveProperty('low');
    expect(bars[0]).toHaveProperty('close');
    expect(bars[0]).toHaveProperty('volume');
    // Parsed from raw strings to numbers.
    expect(typeof bars[0]!.close).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// fetchBars multi-page chronological fix (engine fault #2)
//
// Root cause (proven by the baseline backtest): fetch-bars pagination fetches
// NEWEST-page-first and concatenates pages newest-page-first. Each page is
// internally ascending (raw Bybit rows are newest-first, then .reverse()), so
// the concatenation jumps BACKWARD at every ~1000-bar boundary. PineScript
// var/[1] semantics require oldest->newest — state machines corrupt at each
// jump → 0 trades. B6 fixed it with a global sort + timestamp dedupe before
// cache write and return. These tests lock that behavior.
// ---------------------------------------------------------------------------

/** Assert a bar array is strictly globally ascending (no backward jumps, no dup timestamps). */
function assertGloballyAscending(bars: Array<{ timestamp: number }>): void {
  for (let i = 1; i < bars.length; i++) {
    expect(bars[i]!.timestamp).toBeGreaterThan(bars[i - 1]!.timestamp);
  }
}

/**
 * Mock the Bybit kline REST endpoint with pages delivered newest-page-first.
 * Each page is a raw Bybit list (rows DESCENDING by timestamp, as Bybit
 * returns them). The `end` cursor selects which page is served: the page whose
 * OLDEST bar (last raw row) matches the cursor.
 */
function mockBybitKlinePages(pages: string[][][]): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
    const urlStr = url.toString();
    if (!urlStr.includes('/v5/market/kline')) {
      return new Response('Not Found', { status: 404 });
    }
    const endMatch = urlStr.match(/[?&]end=(\d+)/);
    let page: string[][] | undefined;
    if (!endMatch) {
      page = pages[0];
    } else {
      const end = parseInt(endMatch[1]!, 10);
      // Bybit `end` returns bars <= end, so the OLDER page's NEWEST bar
      // (first raw row, raw lists are descending) equals the cursor. This is
      // also the boundary-overlap bar (oldest of page N = newest of page N+1).
      page = pages.find((p) => parseInt(p[0]![0], 10) === end);
    }
    const list = page ?? [];
    return new Response(
      JSON.stringify({ retCode: 0, retMsg: 'OK', result: { list } }),
      { status: 200 },
    );
  });
}

function rawRow(timestamp: number): string[] {
  return [String(timestamp), '100', '110', '90', '105', '1000'];
}

describe('fetchBars multi-page chronological fix', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns GLOBALLY ascending + deduped bars across a backward-jump page boundary', async () => {
    // Page 1 (newest, no `end` cursor): 1000 bars 10000000..9001000, raw DESC.
    const page1 = Array.from({ length: 1000 }, (_, i) => rawRow(10_000_000 - i * 1000));
    // Page 2 (older, `end=9001000`): 6 bars 9001000..8996000, raw DESC —
    // OVERLAPS page 1 at the boundary timestamp 9001000 (the exact failure:
    // pre-fix concatenation = [9001000..10000000 asc, 8996000..9001000 asc] →
    // backward jump 10000000 → 8996000 + duplicate 9001000).
    const page2 = [9_001_000, 9_000_000, 8_999_000, 8_998_000, 8_997_000, 8_996_000].map(rawRow);
    mockBybitKlinePages([page1, page2]);

    const { fetchBars } = await import('../src/bybit/fetch-bars.js');
    const bars = await fetchBars('BTCUSDT', '60', 8_996_000, 10_000_000);

    // 1000 + 6 - 1 duplicate = 1005 unique bars
    expect(bars).toHaveLength(1005);
    expect(bars[0]!.timestamp).toBe(8_996_000);
    expect(bars[bars.length - 1]!.timestamp).toBe(10_000_000);
    // No backward jumps and no duplicate timestamps anywhere
    assertGloballyAscending(bars);
    expect(new Set(bars.map((b) => b.timestamp)).size).toBe(bars.length);
    // Boundary bar 9001000 appears exactly once (dedupe kept first occurrence)
    expect(bars.filter((b) => b.timestamp === 9_001_000)).toHaveLength(1);
    // The pre-fix failure boundary: after the older page's 5 unique bars the
    // next bar must be 9001000, NOT a jump back to 8996000.
    expect(bars[5]!.timestamp).toBe(9_001_000);
    expect(bars[6]!.timestamp).toBe(9_002_000);
  });

  it('single-page fetch is still ascending (no regression)', async () => {
    // One page of 5 bars, raw DESC (newest-first, as Bybit returns).
    mockBybitKlinePages([[5000, 4000, 3000, 2000, 1000].map(rawRow)]);

    const { fetchBars } = await import('../src/bybit/fetch-bars.js');
    const bars = await fetchBars('BTCUSDT', '60', 1000, 5000);

    expect(bars).toHaveLength(5);
    expect(bars[0]!.timestamp).toBe(1000);
    expect(bars[bars.length - 1]!.timestamp).toBe(5000);
    assertGloballyAscending(bars);
    expect(new Set(bars.map((b) => b.timestamp)).size).toBe(5);
  });
});
