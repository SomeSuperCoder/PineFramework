import { describe, it, expect, vi } from 'vitest';
import type { Bar } from 'pine-framework';

// Mock the underlying fetch-bars module so this test isolates BybitBarFetcher's
// truncation logic (it must NOT hit the real pagination/REST path).
const { fetchBarsMock } = vi.hoisted(() => ({ fetchBarsMock: vi.fn() }));

vi.mock('../src/bybit/fetch-bars.js', () => ({
  fetchBars: fetchBarsMock,
}));

import { BybitBarFetcher } from '../src/trading/auto-select-runner.js';

function makeAscendingBars(count: number, startTs: number, intervalMs: number): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: startTs + i * intervalMs,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1000,
  }));
}

// ---------------------------------------------------------------------------
// BybitBarFetcher auto-select truncation (engine fault #2 follow-up)
//
// fetchBars now returns GLOBALLY ASCENDING bars. Pre-fix, `slice(0, limit)`
// accidentally kept the NEWEST bars (because the input was newest-page-first).
// With ascending input, `slice(0, limit)` would keep the OLDEST — auto-select
// semantics require the most RECENT `limit` bars, so B6 flipped it to
// `slice(-limit)`. These tests lock that semantic.
// ---------------------------------------------------------------------------
describe('BybitBarFetcher auto-select truncation', () => {
  it('keeps the NEWEST N bars from a multi-page ascending window', async () => {
    // Simulated 2-page window, globally ascending (post-fix contract).
    const allBars = makeAscendingBars(2000, 0, 60_000);
    fetchBarsMock.mockResolvedValue(allBars);

    const fetcher = new BybitBarFetcher();
    const bars = await fetcher.fetchBars('BTCUSDT', '1', 0, 2000 * 60_000, 1000);

    expect(bars).toHaveLength(1000);
    // Oldest of the NEWEST 1000 (tail of the window), NOT the oldest 1000.
    expect(bars[0]!.timestamp).toBe(1000 * 60_000);
    expect(bars[bars.length - 1]!.timestamp).toBe(1999 * 60_000);
  });

  it('returns all bars when no limit is given', async () => {
    const allBars = makeAscendingBars(2000, 0, 60_000);
    fetchBarsMock.mockResolvedValue(allBars);

    const fetcher = new BybitBarFetcher();
    const bars = await fetcher.fetchBars('BTCUSDT', '1', 0, 2000 * 60_000);

    expect(bars).toHaveLength(2000);
    expect(bars[0]!.timestamp).toBe(0);
  });

  it('returns all bars when limit exceeds the window size', async () => {
    const allBars = makeAscendingBars(10, 0, 60_000);
    fetchBarsMock.mockResolvedValue(allBars);

    const fetcher = new BybitBarFetcher();
    const bars = await fetcher.fetchBars('BTCUSDT', '1', undefined, undefined, 1000);

    expect(bars).toHaveLength(10);
  });
});
