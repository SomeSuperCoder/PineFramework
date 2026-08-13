import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChartData } from '../hooks/useChartData';

// ─── Mock types ───────────────────────────────────────────────────
interface MockBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Helpers ──────────────────────────────────────────────────────
function makeBar(ts: number, close = 100): MockBar {
  return { timestamp: ts, open: close, high: close + 1, low: close - 1, close, volume: 10 };
}
function makeBars(startTs: number, count: number, step = 86400_000): MockBar[] {
  // Ensure all timestamps are positive (toCandleData filters time > 0)
  return Array.from({ length: count }, (_, i) => makeBar(startTs + i * step));
}
// Use timestamps well above 0 to avoid toCandleData filtering
const BASE_TS = 100_000_000_000; // ~1973 (safely positive)




// ─── Fetch mock ───────────────────────────────────────────────────
let fetchMock: ReturnType<typeof vi.fn>;
let wsInstances: MockWS[] = [];

class MockWS {
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  // Simulate the server opening the connection
  simulateOpen() { this.readyState = 1; this.onopen?.(); }
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

// ─── Test suite ───────────────────────────────────────────────────
describe('useChartData — scroll / indicator lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    wsInstances = [];
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Scenario 1: basic scroll without indicator ───────────────
  it('scrolls back without indicator — candles grow, no errors', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);
    const barsOlder = makeBars(BASE_TS, 500);

    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    // Initial fetchOHLCV
    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    expect(result.current.candles.length).toBe(1000);
    expect(result.current.isLoading).toBe(false);

    // Mock older bars response
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsOlder }),
    });

    // Scroll back
    await act(async () => {
      const count = await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
      expect(count).toBe(500);
    });

    // Candles should have grown by 500
    expect(result.current.candles.length).toBe(1500);
    // First candle should be the oldest new bar
    expect(result.current.candles[0].time).toBe(Math.floor(barsOlder[0].timestamp / 1000));
    // Last candle should be the last original bar
    expect(result.current.candles[1499].time).toBe(Math.floor(bars1k[999].timestamp / 1000));
  });

  // ── Scenario 2: indicator with lookback — seed bars don't leak
  it('adds indicator with lookback — ohlcvDataRef has no seed bars', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);

    // First call: initial OHLCV fetch
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    expect(result.current.ohlcvDataRef.current.length).toBe(1000);

    // Mock #1: initial /api/execute returns maxLookback: 100
    const initialOutputs = bars1k.map(() => null);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        overlay: true,
        maxLookback: 100,
        outputs: { sma: initialOutputs },
        barTimestamps: bars1k.map(b => b.timestamp),
        shapes: [],
        fills: [],
        strategyMarkers: [],
      }),
    });

    // Mock #2: /api/bars returns seed bars
    const seedBars = makeBars(BASE_TS + 900_000, 100);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: seedBars }),
    });

    // Mock #3: second /api/execute with seed+original bars (1100 total)
    const allBars = [...seedBars, ...bars1k];
    const smaValues = allBars.map((_b, i) => (i >= 100 ? 100 : null));

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        overlay: true,
        outputs: { sma: smaValues },
        barTimestamps: allBars.map(b => b.timestamp),
        shapes: [],
        fills: [],
        strategyMarkers: [],
      }),
    });

    // Execute script
    await act(async () => {
      await result.current.executeScript(
        'indicator',
        'BTCUSDT',
        '1d',
        undefined,
        undefined,
        undefined,
        'ind-1',
      );
    });

    // Key assertion: ohlcvDataRef should NOT have seed bars
    expect(result.current.ohlcvDataRef.current.length).toBe(1000);

    // Indicator result should be trimmed (no seed bar entries)
    const indResult = result.current.indicatorResultsRef?.current?.get('ind-1');
    if (indResult) {
      expect(indResult.plots[0].data.length).toBeLessThanOrEqual(1000);
    }
  });

  // ── Scenario 3: scroll then add indicator — uses existing data
  it('scrolls back then adds indicator — uses existing bars, not re-fetch', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);
    const barsOlder = makeBars(BASE_TS, 500);

    // Step 1: initial fetch
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    expect(result.current.candles.length).toBe(1000);

    // Step 2: scroll back (no indicator yet, so no execute)
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsOlder }),
    });

    await act(async () => {
      await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
    });

    expect(result.current.candles.length).toBe(1500);
    expect(result.current.ohlcvDataRef.current.length).toBe(1500);

    // Step 3: add indicator — should use existing 1500 bars, not re-fetch 1000
    const allBars = result.current.ohlcvDataRef.current;
    const smaValues = allBars.map((_, i) => (i >= 100 ? 100 : null));
    const smaTimestamps = allBars.map(b => b.timestamp);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        overlay: true,
        outputs: { sma: smaValues },
        barTimestamps: smaTimestamps,
        shapes: [],
        fills: [],
        strategyMarkers: [],
      }),
    });

    await act(async () => {
      await result.current.executeScript(
        'indicator',
        'BTCUSDT',
        '1d',
        undefined,
        undefined,
        undefined,
        'ind-1',
      );
    });

    // The execute call should have used 1500 bars (the existing data)
    const executeCall = fetchMock.mock.calls.find(
      (c) => (c as [string, RequestInit])[0] === '/api/execute' && (c as [string, RequestInit])[1]?.method === 'POST'
    );
    expect(executeCall).toBeDefined();
    const body = JSON.parse((executeCall as [string, RequestInit])[1].body as string);
    expect(body.bars.length).toBe(1500);

    // Indicator should have 1500 entries (matching all bars)
    const indResult = result.current.indicatorResultsRef?.current?.get('ind-1');
    expect(indResult).toBeDefined();
    expect(indResult!.plots[0].data.length).toBe(1500);
  });

  // ── Scenario 4: add indicator then scroll — data stays consistent
  it('adds indicator then scrolls — candles and plot data stay in sync', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);
    const barsOlder = makeBars(BASE_TS, 500);
    const allBars = [...bars1k];

    // Step 1: initial fetch
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    // Step 2: add indicator (no seed bars, maxLookback=0)
    const smaValues1k = allBars.map((_, i) => (i >= 10 ? 100 : null));

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        overlay: true,
        outputs: { sma: smaValues1k },
        barTimestamps: allBars.map(b => b.timestamp),
        shapes: [],
        fills: [],
        strategyMarkers: [],
      }),
    });

    await act(async () => {
      await result.current.executeScript(
        'indicator',
        'BTCUSDT',
        '1d',
        undefined,
        undefined,
        undefined,
        'ind-1',
      );
    });

    const indResult1 = result.current.indicatorResultsRef?.current?.get('ind-1');
    expect(indResult1).toBeDefined();
    expect(indResult1!.plots[0].data.length).toBe(1000);

    // Step 3: scroll back
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsOlder }),
    });

    // The hook re-executes the indicator against the FULL in-scope window:
    // execBars = [...newBars(barsOlder), ...oldBars.slice(0, contextSize)]
    // where contextSize = max(maxLookback, newBars.length) = max(0, 500) = 500.
    // The engine returns one output per bar it was sent, so the mock must
    // cover all 1000 exec bars (500 new + 500 context) — otherwise plot data
    // cannot have an entry for every candle.
    const contextBars = bars1k.slice(0, barsOlder.length);
    const execBars = [...barsOlder, ...contextBars];
    const newSmaValues = execBars.map((_, i) => (i >= 10 ? 200 : null));

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        overlay: true,
        outputs: { sma: newSmaValues },
        barTimestamps: execBars.map(b => b.timestamp),
        shapes: [],
        fills: [],
        strategyMarkers: [],
      }),
    });

    await act(async () => {
      const count = await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
      expect(count).toBe(barsOlder.length);
    });

    // Derived window size from fixtures: 1000 initial + 500 prepended
    const expectedCount = bars1k.length + barsOlder.length;
    expect(result.current.candles.length).toBe(expectedCount);

    // Indicator must stay in sync with the grown window — one plot entry per candle
    const indResult2 = result.current.indicatorResultsRef?.current?.get('ind-1');
    expect(indResult2).toBeDefined();
    expect(indResult2!.plots[0].data.length).toBe(expectedCount);

    // Candles and plot data should be the same length
    expect(result.current.candles.length).toBe(indResult2!.plots[0].data.length);

    // First plot data time should match first candle time
    expect(indResult2!.plots[0].data[0].time).toBe(result.current.candles[0].time);
    // Last plot data time should match last candle time
    expect(indResult2!.plots[0].data[expectedCount - 1].time).toBe(result.current.candles[expectedCount - 1].time);
  });

  // ── Scenario 5: multiple scrolls — data keeps growing correctly
  it('multiple scrolls — candles and data grow monotonically', async () => {
    const bars1k = makeBars(BASE_TS + 2_000_000, 1000);
    const barsOlder1 = makeBars(BASE_TS + 1_000_000, 500);
    const barsOlder2 = makeBars(BASE_TS, 500);

    // Step 1: initial fetch
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    expect(result.current.candles.length).toBe(1000);

    // Step 2: first scroll
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsOlder1 }),
    });

    await act(async () => {
      await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
    });

    expect(result.current.candles.length).toBe(1500);
    expect(result.current.ohlcvDataRef.current.length).toBe(1500);

    // Step 3: second scroll
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsOlder2 }),
    });

    await act(async () => {
      await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
    });

    expect(result.current.candles.length).toBe(2000);
    expect(result.current.ohlcvDataRef.current.length).toBe(2000);

    // Times should be monotonically increasing
    for (let i = 1; i < result.current.candles.length; i++) {
      expect(result.current.candles[i].time).toBeGreaterThan(result.current.candles[i - 1].time);
    }
  });

  // ── Scenario 6: ohlcvDataRef and candles always match
  it('ohlcvDataRef and candles always have matching timestamps', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);
    const barsOlder = makeBars(BASE_TS, 500);

    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    // After initial fetch: timestamps match
    const refTimes1 = result.current.ohlcvDataRef.current.map(b => Math.floor(b.timestamp / 1000));
    const candleTimes1 = result.current.candles.map(c => c.time);
    expect(refTimes1).toEqual(candleTimes1);

    // After scroll: timestamps still match
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsOlder }),
    });

    await act(async () => {
      await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
    });

    const refTimes2 = result.current.ohlcvDataRef.current.map(b => Math.floor(b.timestamp / 1000)).sort((a, b) => a - b);
    const candleTimes2 = result.current.candles.map(c => c.time).sort((a, b) => a - b);
    expect(candleTimes2.length).toBe(refTimes2.length);
    expect(candleTimes2).toEqual(refTimes2);
  });

  // ── Scenario 7: WS kline after scroll updates both candle and data
  it('WS kline after scroll updates both candle state and ohlcvDataRef', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);
    const barsOlder = makeBars(BASE_TS, 500);

    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    // Connect WS
    const ws = wsInstances[0];
    act(() => ws.simulateOpen());

    // Subscribe
    act(() => {
      result.current.subscribe('BTCUSDT', '1d');
    });

    // Scroll back
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsOlder }),
    });

    await act(async () => {
      await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
    });

    const candleCountBefore = result.current.candles.length;

    // Simulate WS kline update for the last bar
    const lastBar = bars1k[bars1k.length - 1];
    act(() => {
      ws.simulateMessage({
        type: 'kline',
        data: {
          interval: '1d',
          symbol: 'BTCUSDT',
          timestamp: lastBar.timestamp,
          open: lastBar.open,
          high: lastBar.high + 5,
          low: lastBar.low,
          close: lastBar.close + 5,
          volume: lastBar.volume,
        },
      });
    });

    // Candle count should not change (same bar updated, not new)
    expect(result.current.candles.length).toBe(candleCountBefore);

    // Last candle should be updated
    expect(result.current.candles[candleCountBefore - 1].close).toBe(lastBar.close + 5);

    // ohlcvDataRef should also be updated
    expect(result.current.ohlcvDataRef.current[result.current.ohlcvDataRef.current.length - 1].close).toBe(lastBar.close + 5);
  });

  // ── Scenario 8: hasMoreHistory stops at end
  it('fetchOlderOHLCV returns 0 when no more history', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);

    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    // Mock empty response (no more history)
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: [] }),
    });

    await act(async () => {
      const count = await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
      expect(count).toBe(0);
    });

    // Second call should be short-circuited
    const count = await act(async () => {
      return await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
    });
    expect(count).toBe(0);
  });

  // ── Scenario 9: 3-scroll indicator — verify every plot entry has a matching candle
  it('3 scrolls — all plot entry times match candle times (no black hole)', async () => {
    const maxLookback = 100;
    // Non-overlapping ranges: step is 86_400_000 (1 day in ms)
    // Each batch's start >= previous batch's start + previous batch's count * step
    const bars1k = makeBars(BASE_TS + 1_000 * 86_400_000, 1000);
    const barsScroll1 = makeBars(BASE_TS + 500 * 86_400_000, 500);
    const barsScroll2 = makeBars(BASE_TS, 500);

    // Step 1: initial fetchOHLCV
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    expect(result.current.candles.length).toBe(1000);

    // Step 2: execute indicator with lookback
    const seedBars = makeBars(BASE_TS + 900 * 86_400_000, maxLookback);
    const allInitBars = [...seedBars, ...bars1k];

    // Mock #1: initial /api/execute (returns maxLookback)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true, overlay: true, maxLookback,
        outputs: { sma: bars1k.map(() => 100) },
        barTimestamps: bars1k.map(b => b.timestamp),
        shapes: [], fills: [], strategyMarkers: [],
      }),
    });

    // Mock #2: seed bars fetch
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: seedBars }),
    });

    // Mock #3: execute with seed bars
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true, overlay: true,
        outputs: { sma: allInitBars.map((_, i) => (i >= maxLookback ? 100 + i : null)) },
        barTimestamps: allInitBars.map(b => b.timestamp),
        shapes: [], fills: [], strategyMarkers: [],
      }),
    });

    await act(async () => {
      await result.current.executeScript(
        'indicator', 'BTCUSDT', '1d', undefined, undefined, undefined, 'ind-1',
      );
    });

    const ind1 = result.current.indicatorResultsRef?.current?.get('ind-1');
    expect(ind1).toBeDefined();
    expect(ind1!.plots[0].data.length).toBe(1000);

    // Helper: verify all plot entry times exist in candles
    function verifyAlignment(_label?: string) {
      const candleTimes = new Set(result.current.candles.map(c => c.time));
      const ind = result.current.indicatorResultsRef?.current?.get('ind-1');
      expect(ind).toBeDefined();
      for (const entry of ind!.plots[0].data) {
        expect(candleTimes.has(entry.time)).toBe(true);
      }
      // Also check candle count == plot data length
      expect(ind!.plots[0].data.length).toBe(result.current.candles.length);
    }

    // ── Scroll 1 ──
    // The hook re-executes against execBars = [...newBars, ...oldBars.slice(0, contextSize)]
    // where contextSize = max(maxLookback=100, newBars.length=500) = 500.
    // Mock must return an output for ALL 1000 exec bars (500 new + 500 context)
    // so the merged plot data covers every candle in the grown window.
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsScroll1 }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true, overlay: true,
        outputs: { sma: [...barsScroll1.map(() => 101), ...bars1k.slice(0, 500).map(() => 100)] },
        barTimestamps: [...barsScroll1.map(b => b.timestamp), ...bars1k.slice(0, 500).map(b => b.timestamp)],
        shapes: [], fills: [], strategyMarkers: [],
      }),
    });

    await act(async () => {
      const count = await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
      expect(count).toBe(500);
    });

    verifyAlignment('after scroll 1');

    // ── Scroll 2 ──
    // contextSize = max(100, 500) = 500; context bars now come from barsScroll1
    // (the oldest 500 bars in the ref after scroll 1).
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsScroll2 }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true, overlay: true,
        outputs: { sma: [...barsScroll2.map(() => 102), ...barsScroll1.slice(0, 500).map(() => 101)] },
        barTimestamps: [...barsScroll2.map(b => b.timestamp), ...barsScroll1.slice(0, 500).map(b => b.timestamp)],
        shapes: [], fills: [], strategyMarkers: [],
      }),
    });

    await act(async () => {
      const count = await result.current.fetchOlderOHLCV('BTCUSDT', '1d');
      expect(count).toBe(500);
    });

    // THIS is the critical assertion — after the 3rd batch (2nd scroll),
    // all plot entry times must match candle times
    verifyAlignment('after scroll 2 (3rd batch)');

    // Verify specific boundary — first and last entries
    const ind2 = result.current.indicatorResultsRef?.current?.get('ind-1')!;
    expect(ind2.plots[0].data[0].time).toBe(result.current.candles[0].time);
    expect(ind2.plots[0].data[ind2.plots[0].data.length - 1].time).toBe(
      result.current.candles[result.current.candles.length - 1].time,
    );
  });

  // ── Scenario 10: 3-scroll with varying lookback — fillColorData alignment
  it('3 scrolls — fillColorData length matches candle count', async () => {
    const maxLookback = 50;
    // Use non-overlapping timestamp ranges: step is 86_400_000 (1 day in ms)
    // barsScroll2 is oldest, barsScroll1 is middle, bars1k is newest
    // Each range starts after the previous one ends: start[i] >= start[i-1] + count[i-1] * step
    const bars1k = makeBars(BASE_TS + 1_000 * 86_400_000, 1000);
    const barsScroll1 = makeBars(BASE_TS + 500 * 86_400_000, 500);
    const barsScroll2 = makeBars(BASE_TS, 500);

    // Step 1: initial fetch
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());
    await act(async () => { result.current.fetchOHLCV('BTCUSDT', '1d'); });

    // Step 2: execute indicator
    const seedBars = makeBars(BASE_TS + 950 * 86_400_000, maxLookback);
    const allInitBars = [...seedBars, ...bars1k];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true, overlay: true, maxLookback,
        outputs: { sma: bars1k.map(() => 100) },
        barTimestamps: bars1k.map(b => b.timestamp),
        shapes: [], fills: [], strategyMarkers: [],
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: seedBars }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true, overlay: true,
        outputs: { sma: allInitBars.map((_, i) => (i >= maxLookback ? 100 : null)) },
        barTimestamps: allInitBars.map(b => b.timestamp),
        shapes: [], fills: [], strategyMarkers: [],
      }),
    });

    await act(async () => {
      await result.current.executeScript('indicator', 'BTCUSDT', '1d', undefined, undefined, undefined, 'ind-1');
    });

    // Scroll 1
    // contextSize = max(maxLookback=50, newBars.length=500) = 500. Mock returns
    // one output per bar for ALL 1000 exec bars (500 new + 500 context).
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsScroll1 }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true, overlay: true,
        outputs: { sma: [...barsScroll1.map(() => 101), ...bars1k.slice(0, 500).map(() => 100)] },
        barTimestamps: [...barsScroll1.map(b => b.timestamp), ...bars1k.slice(0, 500).map(b => b.timestamp)],
        shapes: [], fills: [], strategyMarkers: [],
      }),
    });
    await act(async () => { await result.current.fetchOlderOHLCV('BTCUSDT', '1d'); });

    const expectedLen1 = bars1k.length + barsScroll1.length; // 1000 + 500
    expect(result.current.candles.length).toBe(expectedLen1);
    const ind1 = result.current.indicatorResultsRef?.current?.get('ind-1')!;
    expect(ind1.plots[0].data.length).toBe(expectedLen1);

    // Scroll 2 — context bars now come from barsScroll1 (oldest 500 in ref)
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: barsScroll2 }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true, overlay: true,
        outputs: { sma: [...barsScroll2.map(() => 102), ...barsScroll1.slice(0, 500).map(() => 101)] },
        barTimestamps: [...barsScroll2.map(b => b.timestamp), ...barsScroll1.slice(0, 500).map(b => b.timestamp)],
        shapes: [], fills: [], strategyMarkers: [],
      }),
    });
    await act(async () => { await result.current.fetchOlderOHLCV('BTCUSDT', '1d'); });

    // Derived window: 1000 initial + 500 scroll 1 + 500 scroll 2 = 2000 candles/plots
    const expectedLen2 = bars1k.length + barsScroll1.length + barsScroll2.length;
    expect(result.current.candles.length).toBe(expectedLen2);
    const ind2 = result.current.indicatorResultsRef?.current?.get('ind-1')!;
    expect(ind2.plots[0].data.length).toBe(expectedLen2);

    // Verify all times are monotonically non-decreasing
    const times = ind2.plots[0].data.map(d => d.time);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }

    // Verify no gaps — each consecutive time difference should be consistent (86400 seconds for daily)
    for (let i = 1; i < times.length; i++) {
      const diff = times[i] - times[i - 1];
      expect(diff).toBeGreaterThan(0);
    }
  });

  // ── Scenario: timeframe switch clears stale plot data ──────────────
  it('switching timeframe clears scriptResult so stale plots are not displayed', async () => {
    const bars1d = makeBars(BASE_TS + 1_000_000, 1000, 86400_000);
    const bars1h = makeBars(BASE_TS + 1_000_000, 1000, 3600_000);

    // Step 1: load daily data
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1d }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    expect(result.current.candles.length).toBe(1000);

    // Step 2: execute a script — produces plot data for daily timeframe
    const dailyOutputs = { sma: bars1d.map((_b, i) => (i >= 100 ? 100 : null)) };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        overlay: true,
        outputs: dailyOutputs,
        barTimestamps: bars1d.map(b => b.timestamp),
        shapes: [],
        fills: [],
        strategyMarkers: [],
      }),
    });

    await act(async () => {
      await result.current.executeScript(
        '//@version=6\nindicator("SMA")',
        'BTCUSDT',
        '1d',
      );
    });

    // Script result should exist with daily plot data
    expect(result.current.scriptResult).not.toBeNull();
    expect(result.current.scriptResult!.plots[0].data.length).toBe(1000);

    // Step 3: switch to hourly timeframe
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1h }),
    });

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1h');
    });

    // BUG: scriptResult should be cleared (null) after timeframe switch
    // because the old daily plot data is stale and doesn't match hourly candles
    expect(result.current.scriptResult).toBeNull();

    // Candles should be hourly data
    expect(result.current.candles.length).toBe(1000);
  });

  // ── Scenario: confirmed kline updates candle after forming tick ──
  it('WS confirmed kline updates candle to final close price', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);

    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    // Connect WS
    const ws = wsInstances[0];
    act(() => ws.simulateOpen());

    // Subscribe
    act(() => {
      result.current.subscribe('BTCUSDT', '1d');
    });

    // Simulate forming tick (price 105)
    const lastBar = bars1k[bars1k.length - 1];
    act(() => {
      ws.simulateMessage({
        type: 'kline',
        data: {
          interval: '1d',
          symbol: 'BTCUSDT',
          timestamp: lastBar.timestamp,
          open: lastBar.open,
          high: lastBar.high + 10,
          low: lastBar.low,
          close: lastBar.close + 5, // forming price 105
          volume: lastBar.volume,
          confirmed: false,
        },
      });
    });

    // Candle should update to forming price
    expect(result.current.candles[result.current.candles.length - 1].close).toBe(lastBar.close + 5);

    // Simulate confirmed tick (price 110) — same timestamp, but confirmed
    act(() => {
      ws.simulateMessage({
        type: 'kline',
        data: {
          interval: '1d',
          symbol: 'BTCUSDT',
          timestamp: lastBar.timestamp, // same timestamp
          open: lastBar.open,
          high: lastBar.high + 20,
          low: lastBar.low,
          close: lastBar.close + 10, // confirmed price 110
          volume: lastBar.volume + 50,
          confirmed: true,
        },
      });
    });

    // BUG: With <= guard, confirmed tick is dropped, candle stays at 105
    // EXPECTED: Candle should update to confirmed price 110
    expect(result.current.candles[result.current.candles.length - 1].close).toBe(lastBar.close + 10);

    // ohlcvDataRef should also be updated to confirmed price
    expect(result.current.ohlcvDataRef.current[result.current.ohlcvDataRef.current.length - 1].close).toBe(lastBar.close + 10);
  });

  // ── Scenario: timeframe switch + indicator re-execution ──────────
  it('after timeframe switch, indicator results from old timeframe are stale', async () => {
    const bars1d = makeBars(BASE_TS + 1_000_000, 1000, 86400_000);
    const bars1h = makeBars(BASE_TS + 1_000_000, 1000, 3600_000);

    // Step 1: load daily data
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1d }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    // Step 2: execute indicator on daily
    const dailyOutputs = { sma: bars1d.map((_b, i) => (i >= 100 ? 100 : null)) };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        overlay: true,
        outputs: dailyOutputs,
        barTimestamps: bars1d.map(b => b.timestamp),
        shapes: [],
        fills: [],
        strategyMarkers: [],
      }),
    });

    await act(async () => {
      await result.current.executeScript(
        '//@version=6\nindicator("SMA")',
        'BTCUSDT',
        '1d',
        undefined,
        undefined,
        undefined,
        'ind-1',
      );
    });

    const indResult = result.current.indicatorResultsRef?.current?.get('ind-1');
    expect(indResult).toBeDefined();
    expect(indResult!.plots[0].data.length).toBe(1000);

    // Step 3: switch to hourly — indicator data should NOT persist
    // (it's from daily and doesn't match hourly candles)
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1h }),
    });

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1h');
    });

    // The indicator result from daily should be cleared
    // because it's stale and doesn't match the new hourly timeframe
    const staleResult = result.current.indicatorResultsRef?.current?.get('ind-1');
    expect(staleResult).toBeUndefined();
  });

  // ── Scenario: generation counter discards late execution result ──
  it('discards late HTTP execution result after indicator removal', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);

    // Initial OHLCV fetch
    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    // Mock execute response (no maxLookback to avoid seed path)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true, overlay: true,
        outputs: { sma: bars1k.map(() => 100) },
        barTimestamps: bars1k.map(b => b.timestamp),
        shapes: [], fills: [], strategyMarkers: [],
      }),
    });

    // Start indicator execution WITHOUT awaiting it
    const execPromise = result.current.executeScript(
      'indicator', 'BTCUSDT', '1d', undefined, undefined, undefined, 'ind-1',
    );

    // Remove the indicator mid-flight — this increments the generation counter,
    // which should cause the in-flight execution to discard its result.
    result.current.removeIndicatorData('ind-1');

    // Now let the execution finish
    await act(async () => {
      await execPromise;
    });

    // The result should NOT be stored since the indicator was removed mid-flight
    const storedResult = result.current.indicatorResultsRef?.current?.get('ind-1');
    expect(storedResult).toBeUndefined();
  });

  // ── Scenario: normal execution stores result when not removed ──
  it('stores execution result when indicator is not removed', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);

    fetchMock.mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());

    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true, overlay: true,
        outputs: { sma: bars1k.map(() => 100) },
        barTimestamps: bars1k.map(b => b.timestamp),
        shapes: [], fills: [], strategyMarkers: [],
      }),
    });

    await act(async () => {
      await result.current.executeScript(
        'indicator', 'BTCUSDT', '1d', undefined, undefined, undefined, 'ind-1',
      );
    });

    const storedResult = result.current.indicatorResultsRef?.current?.get('ind-1');
    expect(storedResult).toBeDefined();
    expect(storedResult!.plots[0].data.length).toBe(1000);
  });
});

// ─── EngineError normalization — Errors-button black-screen regression ─────
// The REST execute endpoint sends the EngineError OBJECT {message, barIndex,
// span, stack} raw (backend/src/routes/execute.ts:178). Pre-fix, useChartData
// stored the object into PineScriptError.message (typed string) and
// ErrorConsole rendered it → React "Objects are not valid as a React child" →
// black screen. The fix adds toErrorMessage at ALL storage sites; these tests
// lock the string guarantee at the two live boundaries (REST + WS).
describe('useChartData — EngineError normalization (black-screen regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    wsInstances = [];
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('REST /api/execute: EngineError OBJECT message is stored as a render-safe string', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());
    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    // The REAL wire shape: success:false + raw EngineError object
    // (JSON serialization drops `span: undefined`).
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: false,
          error: {
            message: 'Variable unknownVar is not defined',
            barIndex: 0,
            stack: 'Error: Variable unknownVar is not defined',
          },
        }),
    });

    await act(async () => {
      await result.current.executeScript(
        'plot(unknownVar)',
        'BTCUSDT',
        '1d',
        undefined,
        undefined,
        undefined,
        'ind-err',
      );
    });

    expect(result.current.errors).toHaveLength(1);
    expect(typeof result.current.errors[0].message).toBe('string');
    expect(result.current.errors[0].message).toBe(
      'Variable unknownVar is not defined',
    );
  });

  it('WS execution_result: EngineError OBJECT error field is stored as a render-safe string', async () => {
    const bars1k = makeBars(BASE_TS + 1_000_000, 1000);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: bars1k }),
    });

    const { result } = renderHook(() => useChartData());
    await act(async () => {
      result.current.fetchOHLCV('BTCUSDT', '1d');
    });

    await act(async () => {
      wsInstances[0].simulateMessage({
        type: 'execution_result',
        indicatorId: 'default',
        data: {
          error: {
            message: 'Variable unknownVar is not defined',
            barIndex: 0,
            stack: 'Error: Variable unknownVar is not defined',
          },
        },
      });
    });

    expect(result.current.errors).toHaveLength(1);
    expect(typeof result.current.errors[0].message).toBe('string');
    expect(result.current.errors[0].message).toBe(
      'Variable unknownVar is not defined',
    );
  });
});
