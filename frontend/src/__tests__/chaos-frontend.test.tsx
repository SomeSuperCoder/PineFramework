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
import type { ChaosSignalRecord, ChaosHeartbeatRecord, CandleErrorRecord } from '../types';

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

describe('useBotWebSocket chaos heartbeat + candle-error observability (fix-chaos-mode-silent-vanish)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const heartbeat: ChaosHeartbeatRecord = {
    pair: 'BTCUSDT:60',
    timeframe: '60',
    candleTimestamp: BASE_MS,
    outcome: 'signal',
    action: 'long',
  };

  const candleError: CandleErrorRecord = {
    type: 'candle-error',
    pair: 'BTCUSDT:60',
    timeframe: '60',
    candleTimestamp: BASE_MS,
    message: 'rpc boom',
  };

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

  it('seeds chaosHeartbeat, totalCandleErrors, and engineChaosMode from the bot:snapshot payload', () => {
    const { result } = renderHook(() => useBotWebSocket('http://test:8081'));

    const ws = wsInstances[0]!;
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage({
      channel: 'bot:snapshot',
      type: 'snapshot',
      data: {
        status: SNAPSHOT_STATUS,
        chaosSignals: [],
        chaosHeartbeat: heartbeat,
        totalCandleErrors: 3,
        chaosMode: { enabled: true, executionMode: 'simulated', reason: 'wallet-empty' },
      },
    }));

    expect(result.current.chaosHeartbeat).toEqual(heartbeat);
    expect(result.current.totalCandleErrors).toBe(3);
    expect(result.current.engineChaosMode).toEqual({
      enabled: true,
      executionMode: 'simulated',
      reason: 'wallet-empty',
    });
  });

  it('updates heartbeat state on bot:chaosHeartbeat and increments the error count on bot:candleError', () => {
    const { result } = renderHook(() => useBotWebSocket('http://test:8081'));

    const ws = wsInstances[0]!;
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage({
      channel: 'bot:snapshot',
      type: 'snapshot',
      data: {
        status: SNAPSHOT_STATUS,
        chaosSignals: [],
        chaosHeartbeat: null,
        totalCandleErrors: 2,
        chaosMode: { enabled: true, executionMode: 'live' },
      },
    }));

    expect(result.current.chaosHeartbeat).toBeNull();
    expect(result.current.totalCandleErrors).toBe(2);

    // A no-op heartbeat (explicit reason) — the "never silently idle" contract.
    act(() => ws.simulateMessage({
      channel: 'bot:chaosHeartbeat',
      data: { ...heartbeat, outcome: 'noop', action: undefined, reason: 'long while already long' },
    }));
    expect(result.current.chaosHeartbeat).toMatchObject({
      outcome: 'noop',
      reason: 'long while already long',
    });

    // A candle-error event is rendered as the last error AND bumps the counter.
    act(() => ws.simulateMessage({ channel: 'bot:candleError', data: candleError }));
    expect(result.current.lastCandleError).toEqual(candleError);
    expect(result.current.totalCandleErrors).toBe(3);
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

describe('useBotWebSocket new channels (fix-chaos-live-invisibility 5.2)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const FEED_STATUS = {
    connected: true,
    subscriptions: [{ pair: 'BTCUSDT', timeframe: '60', ok: true }],
    lastCandleAt: BASE_MS,
    candleCount: 5,
  };

  const LONG_POS = {
    pair: 'BTCUSDT:60',
    symbol: 'BTCUSDT',
    timeframe: '60',
    direction: 'long',
    quantity: 0.1,
    entryPrice: 50000,
    entryTime: BASE_MS,
  };

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

  it('seeds feedStatus from the snapshot and updates it on bot:feedStatus', () => {
    const { result } = renderHook(() => useBotWebSocket('http://test:8081'));

    const ws = wsInstances[0]!;
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage({
      channel: 'bot:snapshot',
      type: 'snapshot',
      data: { status: { ...SNAPSHOT_STATUS, feedState: FEED_STATUS }, chaosSignals: [] },
    }));

    // Fresh page load on a silent feed is not blind: the snapshot carries it.
    expect(result.current.feedStatus).toEqual(FEED_STATUS);

    // Live updates flow on the bot:feedStatus channel.
    act(() => ws.simulateMessage({
      channel: 'bot:feedStatus',
      data: { ...FEED_STATUS, connected: false, candleCount: 9 },
    }));
    expect(result.current.feedStatus).toMatchObject({ connected: false, candleCount: 9 });
  });

  it('handles bot:position open, update, and close against status.positions', () => {
    const { result } = renderHook(() => useBotWebSocket('http://test:8081'));

    const ws = wsInstances[0]!;
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage({
      channel: 'bot:snapshot',
      type: 'snapshot',
      data: { status: { ...SNAPSHOT_STATUS, positions: [] }, chaosSignals: [] },
    }));
    expect(result.current.status?.positions).toEqual([]);

    // Open — a long position is added.
    act(() => ws.simulateMessage({ channel: 'bot:position', data: LONG_POS }));
    expect(result.current.status?.positions).toHaveLength(1);
    expect(result.current.status?.positions[0]).toMatchObject({
      symbol: 'BTCUSDT',
      direction: 'long',
      quantity: 0.1,
    });

    // Update for the same symbol replaces instead of duplicating.
    act(() => ws.simulateMessage({
      channel: 'bot:position',
      data: { ...LONG_POS, quantity: 0.2, entryPrice: 51000 },
    }));
    expect(result.current.status?.positions).toHaveLength(1);
    expect(result.current.status?.positions[0]).toMatchObject({ quantity: 0.2, entryPrice: 51000 });

    // Close — a flat position removes it (panel is truthful, no stale row).
    act(() => ws.simulateMessage({
      channel: 'bot:position',
      data: { ...LONG_POS, direction: 'flat', quantity: 0, entryPrice: 0 },
    }));
    expect(result.current.status?.positions).toEqual([]);
  });

  it('accumulates heartbeat history seeded from the snapshot and bounded like chaosSignals', () => {
    const hb1 = { pair: 'BTCUSDT:60', timeframe: '60', candleTimestamp: BASE_MS, outcome: 'signal' as const, action: 'long' };
    const hb2 = { pair: 'BTCUSDT:60', timeframe: '60', candleTimestamp: BASE_MS + 60_000, outcome: 'noop' as const, reason: 'already long' };
    const hb3 = { pair: 'BTCUSDT:60', timeframe: '60', candleTimestamp: BASE_MS + 120_000, outcome: 'error' as const, reason: 'rpc boom' };

    const { result } = renderHook(() => useBotWebSocket('http://test:8081'));

    const ws = wsInstances[0]!;
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage({
      channel: 'bot:snapshot',
      type: 'snapshot',
      data: { status: SNAPSHOT_STATUS, chaosSignals: [], chaosHeartbeat: hb1 },
    }));

    // Snapshot seeds the ring with the latest record.
    expect(result.current.chaosHeartbeatHistory).toEqual([hb1]);

    act(() => ws.simulateMessage({ channel: 'bot:chaosHeartbeat', data: hb2 }));
    act(() => ws.simulateMessage({ channel: 'bot:chaosHeartbeat', data: hb3 }));

    // Events accumulate in order for the mini-chart glyphs.
    expect(result.current.chaosHeartbeatHistory.map((h) => h.outcome)).toEqual([
      'signal',
      'noop',
      'error',
    ]);

    // Bounded ring: 205 events still cap at 200 entries (like chaosSignals).
    act(() => ws.simulateMessage({
      channel: 'bot:snapshot',
      type: 'snapshot',
      data: { status: SNAPSHOT_STATUS, chaosSignals: [], chaosHeartbeat: null },
    }));
    for (let i = 0; i < 205; i++) {
      act(() => ws.simulateMessage({
        channel: 'bot:chaosHeartbeat',
        data: { ...hb2, candleTimestamp: BASE_MS + i * 60_000 },
      }));
    }
    expect(result.current.chaosHeartbeatHistory.length).toBeLessThanOrEqual(200);
  });
});

describe('useBotMiniChartData full-window reindex + heartbeats + filters (fix-chaos-live-invisibility 5.2)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const BAR_COUNT = 160;
  const DISPLAY = 12;
  const SLICE_START = BAR_COUNT - DISPLAY; // 148

  function manyBars(count = BAR_COUNT) {
    return Array.from({ length: count }, (_, i) => ({
      timestamp: BASE_MS + i * 60_000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 10,
    }));
  }

  function signalAt(fullIdx: number, name: string, overrides: Record<string, unknown> = {}): ChaosSignalRecord {
    return {
      marker: {
        type: 'entry', name, direction: 'long', action: 'buy',
        quantity: 0.02, price: 50000, barIndex: fullIdx,
        timestamp: BASE_MS + fullIdx * 60_000, color: '#00FF00',
      },
      symbol: 'BTCUSDT', timeframe: '60', success: true,
      timestamp: BASE_MS + fullIdx * 60_000,
      ...overrides,
    } as ChaosSignalRecord;
  }

  function heartbeatAt(fullIdx: number, outcome: 'signal' | 'noop' | 'error', reason?: string): ChaosHeartbeatRecord {
    return {
      pair: 'BTCUSDT:60',
      timeframe: '60',
      candleTimestamp: BASE_MS + fullIdx * 60_000,
      outcome,
      reason,
    };
  }

  // Stable per-test fixture arrays. Passing inline literals here would create a
  // fresh array on every render; as deps of the chaos effect, that retriggers
  // the effect infinitely (the same trap EMPTY_HEARTBEATS fixes in the hook's
  // default). Define once, reuse.
  const SIG_REINDEX = [signalAt(150, 'Long150'), signalAt(147, 'Drop147')];
  const SIG_SINGLE = [signalAt(150, 'Long150')];
  const SIG_FILTERED = [
    signalAt(150, 'Matching'),
    signalAt(150, 'WrongTF', { timeframe: '15' }),
    signalAt(150, 'WrongPair', { symbol: 'ETHUSDT' }),
  ];
  const HB_NOOP_ERROR = [
    heartbeatAt(149, 'noop', 'already long'),
    heartbeatAt(150, 'error', 'rpc boom'),
    heartbeatAt(151, 'signal', 'long'),
  ];
  const NO_HEARTBEATS: ChaosHeartbeatRecord[] = [];

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/ohlcv')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: manyBars() }) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    // The hook also opens the kline WebSocket; without a stub, `new WebSocket`
    // throws inside the passive effect and the scheduler never settles.
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function flush() {
    await act(async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
  }

  it('reindexes a full-window marker into the display slice and drops out-of-window markers', async () => {
    const { result } = renderHook(() =>
      useBotMiniChartData(
        'http://test:8081',
        'BTCUSDT',
        '60',
        null,
        true,
        SIG_REINDEX,
        NO_HEARTBEATS,
        DISPLAY,
      ),
    );

    await flush();

    const markers = result.current.displayScriptResult?.strategyMarkers ?? [];
    // Marker at full-array index 150 renders at display index 150 - 148 = 2
    // once the 12-candle window slides to it.
    const long150 = markers.find((m) => m.name === 'Long150');
    expect(long150).toBeDefined();
    expect(long150?.barIndex).toBe(150 - SLICE_START); // 150 - 148 = 2

    // Marker whose full index is outside the visible window is dropped.
    expect(markers.find((m) => m.name === 'Drop147')).toBeUndefined();

    // The display window is exactly the last 12 candles.
    expect(result.current.displayCandles).toHaveLength(DISPLAY);
  });

  it('renders noop/error heartbeats as heartbeat markers and SKIPS signal heartbeats', async () => {
    const { result } = renderHook(() =>
      useBotMiniChartData(
        'http://test:8081',
        'BTCUSDT',
        '60',
        null,
        true,
        SIG_SINGLE,
        HB_NOOP_ERROR,
        DISPLAY,
      ),
    );

    await flush();

    const markers = result.current.displayScriptResult?.strategyMarkers ?? [];

    // No-op → distinct heartbeat glyph data (orange).
    const noop = markers.find((m) => m.type === 'heartbeat' && m.outcome === 'noop');
    expect(noop).toBeDefined();
    expect(noop?.color).toBe('#ff9800');
    expect(noop?.comment).toBe('already long');
    // Error → distinct heartbeat glyph data (red).
    const error = markers.find((m) => m.type === 'heartbeat' && m.outcome === 'error');
    expect(error).toBeDefined();
    expect(error?.color).toBe('#e94560');
    expect(error?.comment).toBe('rpc boom');

    // Signal heartbeat is skipped — heartbeat glyphs only ever carry noop/error,
    // and exactly the two (noop + error) heartbeats land on the chart.
    const heartbeats = markers.filter((m) => m.type === 'heartbeat');
    expect(heartbeats.map((h) => h.outcome).sort()).toEqual(['error', 'noop']);
    // ...and the bar still has exactly one marker: the order marker.
    expect(markers.filter((m) => m.name === 'Long150')).toHaveLength(1);
  });

  it('filters order markers by timeframe AND pair (only the traded pair lands)', async () => {
    const { result } = renderHook(() =>
      useBotMiniChartData(
        'http://test:8081',
        'BTCUSDT',
        '60',
        null,
        true,
        SIG_FILTERED,
        NO_HEARTBEATS,
        DISPLAY,
      ),
    );

    await flush();

    const markers = result.current.displayScriptResult?.strategyMarkers ?? [];
    expect(markers.map((m) => m.name)).toEqual(['Matching']);
  });
});
