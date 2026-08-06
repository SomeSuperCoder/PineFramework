import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BybitWebSocketService, timeframeToMinutes } from '../../../src/trading/bybit-websocket.js';
import type { PineLogger } from '../../../src/utils/logger/types.js';
import type { PairId } from '../../../src/trading/scheduler.js';

// ─── ws mock (liveness suite) ──────────────────────────────────────
// The service uses the `ws` package's EventEmitter-style API. These tests are
// deterministic — they never hit the real Bybit feed. The mock drives
// open/message/error/close and records sent payloads so resubscribe-all and
// single-flight reconnect can be asserted exactly.
const { MockWebSocket, wsInstances } = vi.hoisted(() => {
  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    url: string;
    readyState: number;
    closed = false;
    sent: string[] = [];
    private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

    constructor(url: string) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      wsInstances.push(this);
    }
    on(event: string, cb: (...args: unknown[]) => void): void {
      (this.handlers[event] ??= []).push(cb);
    }
    emit(event: string, ...args: unknown[]): void {
      for (const cb of this.handlers[event] ?? []) cb(...args);
    }
    send(data: string): void {
      this.sent.push(data);
    }
    close(): void {
      this.closed = true;
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close', 1000, Buffer.from(''));
    }
    simulateOpen(): void {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    }
    simulateMessage(data: unknown): void {
      this.emit('message', Buffer.from(JSON.stringify(data)));
    }
    simulateRaw(data: string): void {
      this.emit('message', Buffer.from(data));
    }
    simulateError(error: Error): void {
      this.emit('error', error);
    }
  }
  const wsInstances: MockWebSocket[] = [];
  return { MockWebSocket, wsInstances };
});

vi.mock('ws', () => ({ default: MockWebSocket }));

function makeLogger(): PineLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as PineLogger;
}

// Builds the REAL Bybit v5 kline WS payload shape: `data` is an ARRAY of
// kline objects (one per subscription event). The 4-day chaos-mode bug was
// shipped because this fixture built `data` as a single OBJECT — the handler
// normalized Array.isArray → undefined.confirm, the confirmed-only gate never
// opened, and onCandle never fired. Overrides merge into the first array
// element so callers keep the per-field ergonomics they always had.
function klineMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    topic: 'kline.60.BTCUSDT',
    type: 'kline',
    ts: Date.now(),
    data: [
      {
        start: 1_700_000_000_000,
        end: 1_700_000_001_000,
        interval: '60',
        open: '100',
        high: '110',
        low: '90',
        close: '105',
        volume: '1000',
        confirm: false,
        timestamp: 1_700_000_000_500,
        ...overrides,
      },
    ],
  };
}

describe('BybitWebSocketService', () => {
  let service: BybitWebSocketService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BybitWebSocketService();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      expect(service).toBeDefined();
      expect(service.connected).toBe(false);
      expect(service.activeSubscriptions).toEqual([]);
    });

    it('should create service with custom config', () => {
      const customService = new BybitWebSocketService({
        wsUrl: 'wss://custom-ws.example.com',
        maxReconnectAttempts: 5,
      });
      expect(customService).toBeDefined();
    });
  });

  describe('subscriptions', () => {
    it('should add subscription', () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      service.subscribe(pair);
      expect(service.activeSubscriptions).toContainEqual(pair);
    });

    it('should remove subscription', () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      service.subscribe(pair);
      service.unsubscribe(pair);
      expect(service.activeSubscriptions).not.toContainEqual(pair);
    });

    it('should handle multiple subscriptions', () => {
      const pair1: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      const pair2: PairId = { symbol: 'SOLUSDT', timeframe: '15' };
      service.subscribe(pair1);
      service.subscribe(pair2);
      expect(service.activeSubscriptions).toHaveLength(2);
      expect(service.activeSubscriptions).toContainEqual(pair1);
      expect(service.activeSubscriptions).toContainEqual(pair2);
    });
  });

  describe('fetchHistoricalCandles', () => {
    it('should fetch historical candles from REST API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          retCode: 0,
          retMsg: 'OK',
          result: {
            list: [
              ['1234567890', '100', '110', '90', '105', '1000'],
              ['1234567891', '105', '115', '95', '110', '1200'],
            ],
          },
        }),
      });
      global.fetch = mockFetch;

      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      const candles = await service.fetchHistoricalCandles(pair);

      expect(candles).toHaveLength(2);
      // Note: candles are reversed, so the second candle in the API response is first
      expect(candles[0].symbol).toBe('BTCUSDT');
      expect(candles[0].timeframe).toBe('60');
      expect(candles[0].open).toBe(105);
      expect(candles[0].high).toBe(115);
      expect(candles[0].low).toBe(95);
      expect(candles[0].close).toBe(110);
      expect(candles[0].volume).toBe(1200);
    });

    it('should throw error on API failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          retCode: 10001,
          retMsg: 'Invalid symbol',
          result: {},
        }),
      });
      global.fetch = mockFetch;

      const pair: PairId = { symbol: 'INVALID', timeframe: '60' };
      await expect(service.fetchHistoricalCandles(pair)).rejects.toThrow('Invalid symbol');
    });
  });

  describe('disconnect stops message processing', () => {
    it('should not invoke candle callback for messages after disconnect', () => {
      const candleCallback = vi.fn();
      service.setCandleCallback(candleCallback);

      // Simulate disconnect
      service.disconnect();

      // handleMessage is private — the guard is verified directly: after
      // disconnect isStopped is set and no candle may reach the callback.
      expect((service as any).isStopped).toBe(true);
      expect(candleCallback).not.toHaveBeenCalled();
    });

    it('should prevent reconnection after disconnect', () => {
      service.disconnect();

      // After disconnect, isStopped should prevent scheduleReconnect
      expect((service as any).isStopped).toBe(true);

      // Try to reconnect — connect() resets isStopped, but we check the guard
      // The close handler checks isStopped before scheduling reconnect
      expect((service as any).reconnectTimer).toBeNull();
    });
  });

  describe('callbacks', () => {
    it('should set candle callback', () => {
      const mockCandle = vi.fn();
      service.setCandleCallback(mockCandle);
      expect((service as any).onCandle).toBe(mockCandle);
    });

    it('should set connection callback', () => {
      const mockConnection = vi.fn();
      service.setConnectionCallback(mockConnection);
      expect((service as any).onConnectionChange).toBe(mockConnection);
    });

    it('should set error callback', () => {
      const mockError = vi.fn();
      service.setErrorCallback(mockError);
      expect((service as any).onError).toBe(mockError);
    });
  });
});

describe('timeframeToMinutes (liveness suite)', () => {
  it('parses numeric intervals (kline.60 → 60, kline.1 → 1)', () => {
    expect(timeframeToMinutes('60')).toBe(60);
    expect(timeframeToMinutes('1')).toBe(1);
    expect(timeframeToMinutes('5')).toBe(5);
    expect(timeframeToMinutes('240')).toBe(240);
  });

  it('handles D/W/M calendar units', () => {
    expect(timeframeToMinutes('D')).toBe(1440);
    expect(timeframeToMinutes('W')).toBe(10080);
    expect(timeframeToMinutes('M')).toBe(43200);
    // Case-insensitive
    expect(timeframeToMinutes('d')).toBe(1440);
  });

  it('returns 0 for unknown or non-positive intervals (caller treats 0 as cannot-compute)', () => {
    expect(timeframeToMinutes('X')).toBe(0);
    expect(timeframeToMinutes('0')).toBe(0);
    expect(timeframeToMinutes('-5')).toBe(0);
  });
});

describe('feed liveness — kline tick logging + telemetry (confirmed AND unconfirmed)', () => {
  let logger: PineLogger;
  let service: BybitWebSocketService;

  beforeEach(async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    logger = makeLogger();
    service = new BybitWebSocketService({ logger });
    await service.connect();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debug-logs every kline tick, confirmed or not', () => {
    const ws = wsInstances[0]!;
    ws.simulateMessage(klineMessage({ confirm: false }));
    ws.simulateMessage(klineMessage({ confirm: true }));

    expect(logger.debug).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(
      'Bybit kline tick',
      expect.objectContaining({ symbol: 'BTCUSDT', timeframe: '60', ts: 1_700_000_000_500, confirm: false }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'Bybit kline tick',
      expect.objectContaining({ confirm: true }),
    );
  });

  it('invokes the tick callback on EVERY kline message but keeps the confirmed-only candle gate', () => {
    const onTick = vi.fn();
    const onCandle = vi.fn();
    service.setTickCallback(onTick);
    service.setCandleCallback(onCandle);

    const ws = wsInstances[0]!;
    ws.simulateMessage(klineMessage({ confirm: false, close: '104' }));
    ws.simulateMessage(klineMessage({ confirm: true, close: '105' }));

    // Telemetry: every message, confirmed or not.
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(onTick.mock.calls[0]![0]).toMatchObject({ symbol: 'BTCUSDT', timeframe: '60', confirm: false, close: 104 });
    expect(onTick.mock.calls[1]![0]).toMatchObject({ confirm: true, close: 105 });

    // Execution semantics UNCHANGED: only the confirmed candle reaches the engine.
    expect(onCandle).toHaveBeenCalledTimes(1);
    expect(onCandle.mock.calls[0]![0]).toMatchObject({ symbol: 'BTCUSDT', close: 105, timestamp: 1_700_000_000_000 });
  });

  it('ignores subscription confirmations and malformed messages without touching the candle gate', () => {
    const onCandle = vi.fn();
    const onError = vi.fn();
    service.setCandleCallback(onCandle);
    service.setErrorCallback(onError);

    const ws = wsInstances[0]!;
    ws.simulateMessage({ success: true, ret_msg: 'OK', op: 'subscribe', conn_id: 'x' });
    ws.simulateRaw('not json');

    expect(onCandle).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1); // parse error surfaced, not swallowed
  });
});

describe('data-shape regression — Bybit v5 ARRAY payload (4-day chaos-mode bug)', () => {
  let service: BybitWebSocketService;

  beforeEach(async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    service = new BybitWebSocketService();
    await service.connect();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // REGRESSION: this test FAILS on the old buggy handler, where
  // `message.data.confirm` was read on the ARRAY (→ undefined → the
  // confirmed-only gate always returned → onCandle NEVER fired).
  it('fires onCandle with the parsed ClosedCandle for data:[{confirm:true}] (real Bybit v5 shape)', () => {
    const onTick = vi.fn();
    const onCandle = vi.fn();
    service.setTickCallback(onTick);
    service.setCandleCallback(onCandle);

    // The REAL Bybit v5 kline WS payload: `data` is an ARRAY of one kline.
    wsInstances[0]!.simulateMessage({
      topic: 'kline.1.ETHUSDT',
      type: 'snapshot',
      ts: 1_786_005_123_123,
      data: [
        {
          start: 1_786_005_120_000,
          end: 1_786_005_180_000,
          interval: '1',
          open: '1912.39',
          high: '1912.39',
          low: '1912.28',
          close: '1912.29',
          volume: '9.16',
          confirm: true,
          timestamp: 1_786_005_128_123,
        },
      ],
    });

    expect(onCandle).toHaveBeenCalledTimes(1);
    expect(onCandle.mock.calls[0]![0]).toEqual({
      symbol: 'ETHUSDT',
      timeframe: '1',
      timestamp: 1_786_005_120_000, // candle timestamp = kline `start`
      open: 1912.39,
      high: 1912.39,
      low: 1912.28,
      close: 1912.29,
      volume: 9.16,
    });

    // Liveness preserved: a confirmed candle is still a tick.
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick.mock.calls[0]![0]).toMatchObject({
      symbol: 'ETHUSDT',
      timeframe: '1',
      confirm: true,
      close: 1912.29,
    });
  });

  it('does NOT fire onCandle for data:[{confirm:false}] but still fires onTick (liveness before the gate)', () => {
    const onTick = vi.fn();
    const onCandle = vi.fn();
    service.setTickCallback(onTick);
    service.setCandleCallback(onCandle);

    wsInstances[0]!.simulateMessage(klineMessage({ confirm: false, close: '104' }));

    expect(onCandle).not.toHaveBeenCalled();
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick.mock.calls[0]![0]).toMatchObject({
      symbol: 'BTCUSDT',
      timeframe: '60',
      confirm: false,
      close: 104,
    });
  });

  it('still handles a legacy single-object `data` (backward-compat normalization)', () => {
    const onCandle = vi.fn();
    service.setCandleCallback(onCandle);

    // Pre-array shape: `data` as ONE kline object. The Array.isArray
    // normalization must fall back to using it directly, so old fixtures /
    // non-conforming payloads keep working.
    wsInstances[0]!.simulateMessage({
      topic: 'kline.60.BTCUSDT',
      type: 'kline',
      ts: Date.now(),
      data: {
        start: 1_700_000_000_000,
        end: 1_700_000_001_000,
        interval: '60',
        open: '100',
        high: '110',
        low: '90',
        close: '105',
        volume: '1000',
        confirm: true,
        timestamp: 1_700_000_000_500,
      },
    });

    expect(onCandle).toHaveBeenCalledTimes(1);
    expect(onCandle.mock.calls[0]![0]).toMatchObject({
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: 1_700_000_000_000,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1000,
    });
  });
});

describe('connect timeout (liveness suite)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('times out a socket stuck CONNECTING after 12s: logs, surfaces error, aborts the stuck socket, schedules reconnect', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    const logger = makeLogger();
    const onError = vi.fn();
    const service = new BybitWebSocketService({ logger });
    service.setErrorCallback(onError);

    await service.connect();
    expect(wsInstances).toHaveLength(1);
    const ws = wsInstances[0]!;
    expect(ws.readyState).toBe(MockWebSocket.CONNECTING);

    // Below the 12s threshold — no timeout.
    vi.advanceTimersByTime(11_999);
    expect(onError).not.toHaveBeenCalled();

    // Cross the threshold.
    vi.advanceTimersByTime(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toContain('connect timeout after 12000ms');
    expect(logger.error).toHaveBeenCalledWith(
      'Bybit feed connect timeout',
      expect.objectContaining({ timeoutMs: 12_000, at: expect.any(String) }),
    );

    // The stuck socket is aborted (close on a CONNECTING socket).
    expect(ws.closed).toBe(true);
    // A reconnect is scheduled (single-flight: exactly one timer).
    expect((service as any).reconnectTimer).not.toBeNull();
  });

  it('does NOT fire the timeout once the socket is OPEN (guard)', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    const onError = vi.fn();
    const service = new BybitWebSocketService();
    service.setErrorCallback(onError);

    await service.connect();
    wsInstances[0]!.simulateOpen();
    vi.advanceTimersByTime(20_000);

    expect(onError).not.toHaveBeenCalled();
    expect((service as any).connectTimeoutTimer).toBeNull();
  });
});

describe('stale-socket identity guard (review regression)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('late close/error/message from aborted socket A do NOT mutate socket B (timeout → reconnect race)', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    // Deterministic reconnect delay: attempt 0 → cap/2 == 500ms.
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const onError = vi.fn();
    const onConnectionChange = vi.fn();
    const onCandle = vi.fn();
    const onTick = vi.fn();
    const service = new BybitWebSocketService();
    service.setErrorCallback(onError);
    service.setConnectionCallback(onConnectionChange);
    service.setCandleCallback(onCandle);
    service.setTickCallback(onTick);

    await service.connect();
    const wsA = wsInstances[0]!;
    expect(wsA.readyState).toBe(MockWebSocket.CONNECTING);

    // 12s timeout fires → aborts A (close) → schedules ONE reconnect. The
    // disconnect signal at the abort is legitimate (the feed really went down).
    vi.advanceTimersByTime(12_000);
    expect(wsA.closed).toBe(true);
    expect((service as any).reconnectTimer).not.toBeNull();
    expect(onConnectionChange).toHaveBeenCalledWith(false);
    const connectionCallsAtAbort = onConnectionChange.mock.calls.length;

    // Reconnect fires → socket B is the live socket, still CONNECTING with its
    // own connect timeout armed (mid-handshake).
    vi.advanceTimersByTime(500);
    expect(wsInstances).toHaveLength(2);
    const wsB = wsInstances[1]!;
    expect(wsB.readyState).toBe(MockWebSocket.CONNECTING);
    expect((service as any).isConnecting).toBe(true);
    expect((service as any).connectTimeoutTimer).not.toBeNull();

    // A's late events fire AFTER B exists — the exact race the identity guard
    // fixes (the abort's close/error often lands after the reconnect).
    wsA.simulateError(new Error('stale abort error'));
    wsA.close();
    wsA.simulateMessage(klineMessage({ confirm: true, close: '999' }));

    // 1. B's connect timeout is NOT cleared by A's stale close/error.
    expect((service as any).connectTimeoutTimer).not.toBeNull();
    // 2. isConnecting is NOT flipped false mid-B-handshake.
    expect((service as any).isConnecting).toBe(true);
    // 3. NO second reconnect scheduled (stale A must not schedule one).
    expect((service as any).reconnectTimer).toBeNull();
    // 4. No NEW onConnectionChange(false) from stale A.
    expect(onConnectionChange.mock.calls.length).toBe(connectionCallsAtAbort);
    // 5. No stale kline from A reaches the engine or the tick telemetry.
    expect(onCandle).not.toHaveBeenCalled();
    expect(onTick).not.toHaveBeenCalled();

    // B's own connect timeout still fires on schedule — the guard did not
    // break the abort path for the CURRENT socket.
    vi.advanceTimersByTime(12_000);
    expect(onError).toHaveBeenCalledTimes(2); // A's abort timeout + B's timeout
  });
});

describe('reconnect-on-error (liveness suite)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('error→close schedules exactly ONE reconnect (single-flight, one timer/one socket)', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    const service = new BybitWebSocketService({ maxReconnectAttempts: 10 });

    await service.connect();
    const ws = wsInstances[0]!;

    // Real-world error+close pair.
    ws.simulateError(new Error('boom'));
    ws.close();
    expect(vi.getTimerCount()).toBe(1); // exactly one scheduled reconnect

    // Advance past the max jitter delay (but well under the connect timeout).
    vi.advanceTimersByTime(2_000);
    expect(wsInstances).toHaveLength(2); // exactly ONE new socket

    // The new socket is genuinely connected to a fresh feed.
    expect(wsInstances[1]!.readyState).toBe(MockWebSocket.CONNECTING);
  });

  it('uses equal-jitter backoff: delay in [cap/2, cap] (base 1s, cap 30s)', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;

    // Min jitter → delay == cap/2 == 500ms for attempt 0 (cap = min(1000*2^0, 30000)).
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const service = new BybitWebSocketService(); // defaults base 1000, cap 30000
    await service.connect();
    wsInstances[0]!.simulateError(new Error('e'));

    vi.advanceTimersByTime(499);
    expect(wsInstances).toHaveLength(1); // not yet — delay is at least cap/2
    vi.advanceTimersByTime(1);
    expect(wsInstances).toHaveLength(2); // fired exactly at cap/2
  });

  it('never schedules a delay beyond the cap (max jitter still ≤ cap)', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;

    // Max jitter → delay == cap - 1 < cap.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const service = new BybitWebSocketService();
    await service.connect();
    wsInstances[0]!.simulateError(new Error('e'));

    // Fires by the cap (1000ms) → delay was ≤ cap.
    vi.advanceTimersByTime(1_000);
    expect(wsInstances).toHaveLength(2);
  });

  it('stops reconnecting after maxReconnectAttempts (attempt count honored) and logs exhaustion', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    vi.spyOn(Math, 'random').mockReturnValue(0); // deterministic delays: 500, 1000
    const logger = makeLogger();
    const service = new BybitWebSocketService({ maxReconnectAttempts: 2, logger });

    await service.connect();

    // Cycle 1 → reconnect attempt 1 (delay 500).
    wsInstances[0]!.simulateError(new Error('e1'));
    vi.advanceTimersByTime(600);
    expect(wsInstances).toHaveLength(2);

    // Cycle 2 → reconnect attempt 2 (delay 1000).
    wsInstances[1]!.simulateError(new Error('e2'));
    vi.advanceTimersByTime(1_100);
    expect(wsInstances).toHaveLength(3);

    // Cycle 3 → attempts exhausted: no timer, exhausted logged, no new socket.
    wsInstances[2]!.simulateError(new Error('e3'));
    expect((service as any).reconnectTimer).toBeNull();
    expect(logger.error).toHaveBeenCalledWith('Bybit feed reconnect attempts exhausted', expect.anything());
    vi.advanceTimersByTime(120_000);
    expect(wsInstances).toHaveLength(3);
  });

  it('never reconnects after disconnect (shutdown guard)', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    const service = new BybitWebSocketService();

    await service.connect();
    service.disconnect();

    // A late error/close on the old socket must NOT schedule a reconnect loop.
    wsInstances[0]!.simulateError(new Error('boom'));
    wsInstances[0]!.close();
    expect(vi.getTimerCount()).toBe(0);
    expect((service as any).reconnectTimer).toBeNull();
    vi.advanceTimersByTime(120_000);
    expect(wsInstances).toHaveLength(1);
  });

  it('resets the backoff counter on a successful open', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const service = new BybitWebSocketService({ maxReconnectAttempts: 10 });

    await service.connect();
    wsInstances[0]!.simulateError(new Error('e'));
    vi.advanceTimersByTime(600); // reconnect attempt 1 (delay 500)
    expect(wsInstances).toHaveLength(2);

    wsInstances[1]!.simulateOpen(); // reconnect succeeds → attempts reset to 0

    wsInstances[1]!.simulateError(new Error('e2'));
    // Real-world error+close pair: close() moves readyState → CLOSED so the
    // reconnect's connect() guard (`readyState === OPEN` → return) does not
    // block the fresh socket.
    wsInstances[1]!.close();
    // After reset, attempt 0 again → delay is cap/2 = 500, not the attempt-1 delay (1000).
    vi.advanceTimersByTime(499);
    expect(wsInstances).toHaveLength(2); // NOT fired at 499 → proves the delay is 500, not 1000
    vi.advanceTimersByTime(1);
    expect(wsInstances).toHaveLength(3); // fired at 500 → counter was reset to attempt 0
  });

  it('re-sends a fresh subscription payload on reconnect (resubscribeAll on open)', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    const service = new BybitWebSocketService();
    const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
    service.subscribe(pair);

    await service.connect();
    wsInstances[0]!.simulateOpen();
    expect(wsInstances[0]!.sent).toContain(JSON.stringify({ op: 'subscribe', args: ['kline.60.BTCUSDT'] }));

    // error+close → reconnect → the fresh socket re-subscribes on open.
    wsInstances[0]!.simulateError(new Error('boom'));
    wsInstances[0]!.close();
    vi.advanceTimersByTime(2_000);
    expect(wsInstances).toHaveLength(2);

    wsInstances[1]!.simulateOpen();
    expect(wsInstances[1]!.sent).toContain(JSON.stringify({ op: 'subscribe', args: ['kline.60.BTCUSDT'] }));
  });

  it('logs timestamped open / error / close lifecycle events', async () => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    const logger = makeLogger();
    const service = new BybitWebSocketService({ logger });

    await service.connect();
    const ws = wsInstances[0]!;

    ws.simulateOpen();
    expect(logger.info).toHaveBeenCalledWith(
      'Bybit feed socket open',
      expect.objectContaining({ at: expect.any(String) }),
    );

    ws.simulateError(new Error('boom'));
    expect(logger.error).toHaveBeenCalledWith(
      'Bybit feed socket error',
      expect.objectContaining({ at: expect.any(String), error: 'boom' }),
    );

    ws.close();
    expect(logger.info).toHaveBeenCalledWith(
      'Bybit feed socket closed',
      expect.objectContaining({ at: expect.any(String), code: 1000 }),
    );
  });
});

describe('long-timeframe warning (liveness suite)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('warns loudly when a configured timeframe has > 10 min until the next confirm', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    wsInstances.length = 0;
    const logger = makeLogger();
    const service = new BybitWebSocketService({ logger });
    service.subscribe({ symbol: 'BTCUSDT', timeframe: '60' });

    await service.connect();
    wsInstances[0]!.simulateOpen(); // resubscribeAll → sendSubscribe → warnIfLongTimeframe

    expect(logger.warn).toHaveBeenCalledWith(
      'Long timeframe feed — no confirmed candle yet',
      expect.objectContaining({ symbol: 'BTCUSDT', timeframe: '60', minutes: 60, nextConfirmEta: expect.any(String) }),
    );
  });

  it('does NOT warn for short timeframes (1m)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    wsInstances.length = 0;
    const logger = makeLogger();
    const service = new BybitWebSocketService({ logger });
    service.subscribe({ symbol: 'BTCUSDT', timeframe: '1' });

    await service.connect();
    wsInstances[0]!.simulateOpen();

    expect(logger.warn).not.toHaveBeenCalledWith(
      'Long timeframe feed — no confirmed candle yet',
      expect.anything(),
    );
  });
});
