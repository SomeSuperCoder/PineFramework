/**
 * Frontend tests for the chaos-mode realistic simulation change:
 *
 * 5.6 — `useBotWebSocket` seeds `chaosSignals` from `bot:snapshot` and appends
 *       on each `bot:chaosSignal` message.
 * 5.5 — `useBotMiniChartData` in chaos mode does NOT call `/api/execute` and
 *       renders chaos markers (failed markers flagged); non-chaos behavior is
 *       unchanged (still executes the strategy script).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBotWebSocket } from '../components/TradingBotPanel';
import { useBotMiniChartData } from '../hooks/useMiniChartData';
import type { ChaosSignalRecord } from '../types';

// ─── WebSocket stub ───────────────────────────────────────────────
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
  simulateOpen() { this.readyState = 1; this.onopen?.(); }
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────
const BASE_MS = 1_700_000_000_000; // matches candle time 1_700_000_000 (sec)

function ohlcvBars(): Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> {
  return Array.from({ length: 5 }, (_, i) => ({
    timestamp: BASE_MS + i * 60_000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 10,
  }));
}

const chaosSignals: ChaosSignalRecord[] = [
  {
    marker: {
      type: 'entry', name: 'Long', direction: 'long', action: 'buy',
      quantity: 0.02, price: 50000, barIndex: 0,
      timestamp: BASE_MS + 4 * 60_000, color: '#00FF00',
    },
    symbol: 'BTCUSDT', timeframe: '60', success: true,
    timestamp: BASE_MS + 4 * 60_000,
  },
  {
    marker: {
      type: 'close', name: 'Exit Short', direction: 'long', action: 'sell',
      quantity: 0.02, price: 50000, barIndex: 0,
      timestamp: BASE_MS + 3 * 60_000, color: '#FF0000',
    },
    symbol: 'BTCUSDT', timeframe: '60', success: false, error: 'dex down',
    timestamp: BASE_MS + 3 * 60_000,
  },
];

const SNAPSHOT_STATUS = {
  state: 'Running',
  strategyName: 'x',
  dex: 'jupiter-swap',
  walletPublicKey: null,
  startedAt: Date.now(),
  uptimeMs: 0,
  balance: 0,
  realizedPnl: 0,
  unrealizedPnl: 0,
  positions: [],
  exposure: 0,
  errors: [],
};

describe('useBotWebSocket chaosSignals (spec 5.6)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    wsInstances = [];
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('seeds chaosSignals from the bot:snapshot on connect', () => {
    const { result } = renderHook(() => useBotWebSocket('http://test:8081'));

    const ws = wsInstances[0]!;
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage({
      channel: 'bot:snapshot',
      type: 'snapshot',
      data: { status: SNAPSHOT_STATUS, chaosSignals },
    }));

    expect(result.current.chaosSignals).toHaveLength(2);
    expect(result.current.chaosSignals[0]!.marker.name).toBe('Long');
    expect(result.current.chaosSignals[1]!.success).toBe(false);
  });

  it('appends records on each bot:chaosSignal message', () => {
    const { result } = renderHook(() => useBotWebSocket('http://test:8081'));

    const ws = wsInstances[0]!;
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage({
      channel: 'bot:snapshot',
      type: 'snapshot',
      data: { status: SNAPSHOT_STATUS, chaosSignals: [] },
    }));

    act(() => ws.simulateMessage({
      channel: 'bot:chaosSignal',
      data: chaosSignals[0],
    }));
    act(() => ws.simulateMessage({
      channel: 'bot:chaosSignal',
      data: chaosSignals[1],
    }));

    expect(result.current.chaosSignals).toHaveLength(2);
    expect(result.current.chaosSignals.map((c) => c.marker.name)).toEqual(['Long', 'Exit Short']);
  });
});

describe('useBotMiniChartData chaos path (spec 5.5)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    wsInstances = [];
    fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/ohlcv')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: ohlcvBars() }) });
      }
      if (url.includes('/api/execute')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ outputs: {}, shapes: [], fills: [], strategyMarkers: [] }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('in chaos mode does NOT call /api/execute and renders chaos markers', async () => {
    const { result } = renderHook(() =>
      useBotMiniChartData('http://test:8081', 'BTCUSDT', '60', null, true, chaosSignals),
    );

    // Flush the OHLCV fetch microtask chain
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const executeCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/execute'),
    );
    expect(executeCalls).toHaveLength(0);

    const markers = result.current.displayScriptResult?.strategyMarkers ?? [];
    expect(markers).toHaveLength(2);

    const long = markers.find((m) => m.name === 'Long');
    const failedExit = markers.find((m) => m.name === 'Exit Short');
    expect(long?.color).toBe('#00FF00');
    expect(long?.barIndex).toBe(4); // resolved against the visible candle slice
    // Failed marker is flagged with the distinct color
    expect(failedExit?.color).toBe('#8a8a8a');
  });

  it('in non-chaos mode still executes the strategy script', async () => {
    const { result } = renderHook(() =>
      useBotMiniChartData('http://test:8081', 'BTCUSDT', '60', '//@version=5\nstrategy("x")', false, chaosSignals),
    );

    // Flush the OHLCV fetch + script execution microtask chain
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const executeCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/execute'),
    );
    expect(executeCalls.length).toBeGreaterThan(0);

    // Chaos signals are ignored outside chaos mode
    const markers = result.current.displayScriptResult?.strategyMarkers ?? [];
    expect(markers).toHaveLength(0);
  });
});
