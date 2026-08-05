/**
 * Unit tests for the shared `bot:snapshot` payload builder (design D2 —
 * OpenSpec change fix-chaos-live-invisibility, task 5.1).
 *
 * Contract under test (task 2.1/2.2):
 *  - EVERY snapshot broadcast site (gateway connect handler, null-engine
 *    fallback, state-change re-broadcast) produces a shape-identical payload
 *    through `buildSnapshotPayload`.
 *  - `chaosSignals` is ALWAYS present (the historical omission that wiped
 *    collected markers on every Running transition).
 *  - Positions live in `status.positions` and come from the ENGINE accessor
 *    (`engine.getPositions()`), never the legacy always-empty snapshot stub.
 *  - `status.pairs` (running pairs) and `status.feedState` (feed telemetry)
 *    are carried so a fresh page load on a silent feed is not blind.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildSnapshotPayload, type BotSnapshotPayload } from '../src/ws/snapshot-payload.js';
import type { BotEngine, BotStatusSnapshot } from 'pine-framework';

// The builder imports `BotState` (a value) from 'pine-framework', which
// resolves to the built dist at runtime. Mock it so the unit under test never
// depends on the state of the compiled output.
vi.mock('pine-framework', () => ({
  BotState: {
    Idle: 'Idle',
    Starting: 'Starting',
    Running: 'Running',
    Stopping: 'Stopping',
    Stopped: 'Stopped',
    Error: 'Error',
  },
}));

function makeSnapshot(overrides: Partial<BotStatusSnapshot> = {}): BotStatusSnapshot {
  return {
    state: 'Running',
    strategyName: 'chaos-test',
    dex: 'jupiter-swap',
    walletPublicKey: null,
    startedAt: 1_700_000_000_000,
    uptimeMs: 60_000,
    balance: 1000,
    realizedPnl: 42,
    unrealizedPnl: -7,
    // Legacy stub — the builder MUST overwrite this with engine truth.
    positions: [{ symbol: 'LEGACY', side: 'long', size: 1, entryPrice: 1, currentPrice: 1, unrealizedPnl: 0, openedAt: 1 }],
    exposure: 0,
    errors: [],
    lastTransition: null,
    chaosMode: { enabled: true, executionMode: 'live' },
    totalCandleErrors: 3,
    chaosHeartbeat: null,
    warmUpComplete: true,
    ...overrides,
  } as BotStatusSnapshot;
}

function makeEngine(overrides: Partial<Record<keyof BotEngine, unknown>> = {}): BotEngine {
  return {
    getPositions: vi.fn(() => []),
    getRunningPairs: vi.fn(() => []),
    getFeedStatus: vi.fn(() => ({
      connected: false,
      subscriptions: [],
      lastCandleAt: null,
      candleCount: 0,
    })),
    getChaosHistory: vi.fn(() => []),
    ...overrides,
  } as unknown as BotEngine;
}

const ENGINE_POSITIONS = [
  {
    symbol: 'BTCUSDT',
    timeframe: '60',
    direction: 'long' as const,
    quantity: 0.1,
    entryPrice: 50_000,
    entryTime: 1_700_000_000_000,
  },
];

const ENGINE_PAIRS = [{ symbol: 'BTCUSDT', timeframe: '60' }];

const ENGINE_FEED_STATE = {
  connected: true,
  subscriptions: [{ pair: 'BTCUSDT', timeframe: '60', ok: true }],
  lastCandleAt: 1_700_000_000_000,
  candleCount: 12,
};

describe('buildSnapshotPayload contract (design D2)', () => {
  it('null engine / null snapshot still yields the full payload shape', () => {
    const payload = buildSnapshotPayload(null, null);

    // Every field the frontend reads exists — nothing omitted in the fallback.
    expect(payload.chaosSignals).toEqual([]);
    expect(payload.chaosHeartbeat).toBeNull();
    expect(payload.totalCandleErrors).toBe(0);
    expect(payload.chaosMode).toEqual({ enabled: false, executionMode: 'live' });
    expect(payload.status.positions).toEqual([]);
    expect(payload.status.pairs).toEqual([]);
    expect(payload.status.feedState).toEqual({
      connected: false,
      subscriptions: [],
      lastCandleAt: null,
      candleCount: 0,
    });
    // status.positions is array-typed truth, never undefined.
    expect(Array.isArray(payload.status.positions)).toBe(true);
  });

  it('null-engine and live-engine payloads are shape-identical (SSOT for every site)', () => {
    const engine = makeEngine({
      getPositions: vi.fn(() => ENGINE_POSITIONS),
      getRunningPairs: vi.fn(() => ENGINE_PAIRS),
      getFeedStatus: vi.fn(() => ENGINE_FEED_STATE),
      getChaosHistory: vi.fn(() => [
        {
          marker: { type: 'entry', name: 'Long', direction: 'long', action: 'buy', quantity: 0.1, price: 50_000, barIndex: 0, timestamp: 1_700_000_000_000, color: '#00FF00' },
          symbol: 'BTCUSDT',
          timeframe: '60',
          success: true,
          timestamp: 1_700_000_000_000,
        },
      ]),
    });

    const live = buildSnapshotPayload(makeSnapshot(), engine);
    const empty = buildSnapshotPayload(null, null);

    // Same top-level channels and same status field set — only values differ.
    expect(Object.keys(live).sort()).toEqual(Object.keys(empty).sort());
    expect(Object.keys(live.status).sort()).toEqual(Object.keys(empty.status).sort());
    expect(Object.keys(live.status.feedState).sort()).toEqual(
      Object.keys(empty.status.feedState).sort(),
    );
  });

  it('chaosSignals is always present and mirrors engine.getChaosHistory()', () => {
    const history = [
      {
        marker: { type: 'entry', name: 'Long', direction: 'long', action: 'buy', quantity: 0.1, price: 50_000, barIndex: 0, timestamp: 1_700_000_000_000, color: '#00FF00' },
        symbol: 'BTCUSDT',
        timeframe: '60',
        success: true,
        timestamp: 1_700_000_000_000,
      },
    ];
    const engine = makeEngine({ getChaosHistory: vi.fn(() => history) });

    const payload = buildSnapshotPayload(makeSnapshot(), engine);
    expect(payload.chaosSignals).toBe(history);
    expect(engine.getChaosHistory).toHaveBeenCalled();

    // Empty history → [] (never undefined) so clients replacing arrays on
    // snapshot don't crash.
    const emptyEngine = makeEngine({ getChaosHistory: vi.fn(() => []) });
    const emptyPayload = buildSnapshotPayload(makeSnapshot(), emptyEngine);
    expect(emptyPayload.chaosSignals).toEqual([]);
  });

  it('status.positions carries engine truth, NOT the legacy snapshot stub', () => {
    const engine = makeEngine({ getPositions: vi.fn(() => ENGINE_POSITIONS) });

    const payload = buildSnapshotPayload(makeSnapshot(), engine);

    expect(payload.status.positions).toEqual(ENGINE_POSITIONS);
    // The snapshot's own positions field is ignored — the stub never leaks.
    expect(payload.status.positions).not.toEqual(makeSnapshot().positions);
    expect(engine.getPositions).toHaveBeenCalled();
  });

  it('status.pairs and status.feedState come from the engine accessors', () => {
    const engine = makeEngine({
      getRunningPairs: vi.fn(() => ENGINE_PAIRS),
      getFeedStatus: vi.fn(() => ENGINE_FEED_STATE),
    });

    const payload = buildSnapshotPayload(makeSnapshot(), engine);

    expect(payload.status.pairs).toEqual(ENGINE_PAIRS);
    expect(payload.status.feedState).toEqual(ENGINE_FEED_STATE);
    expect(engine.getRunningPairs).toHaveBeenCalled();
    expect(engine.getFeedStatus).toHaveBeenCalled();
  });

  it('hoists chaosHeartbeat, totalCandleErrors and chaosMode from the snapshot', () => {
    const heartbeat = {
      pair: 'BTCUSDT:60',
      timeframe: '60',
      candleTimestamp: 1_700_000_000_000,
      outcome: 'noop' as const,
      reason: 'long while already long',
    };
    const snapshot = makeSnapshot({
      totalCandleErrors: 7,
      chaosHeartbeat: heartbeat,
      chaosMode: { enabled: true, executionMode: 'simulated', reason: 'wallet-empty' },
    });

    const payload = buildSnapshotPayload(snapshot, makeEngine());

    expect(payload.chaosHeartbeat).toEqual(heartbeat);
    expect(payload.totalCandleErrors).toBe(7);
    expect(payload.chaosMode).toEqual({
      enabled: true,
      executionMode: 'simulated',
      reason: 'wallet-empty',
    });
  });

  it('returns the null-engine defaults when only the snapshot is missing (engine exists)', () => {
    const engine = makeEngine();
    const payload = buildSnapshotPayload(null, engine);

    expect(payload.status.positions).toEqual([]);
    expect(payload.chaosSignals).toEqual([]);
    expect(payload.status.feedState.connected).toBe(false);
  });

  it('the payload satisfies the typed BotSnapshotPayload contract', () => {
    const engine = makeEngine({
      getPositions: vi.fn(() => ENGINE_POSITIONS),
      getRunningPairs: vi.fn(() => ENGINE_PAIRS),
      getFeedStatus: vi.fn(() => ENGINE_FEED_STATE),
    });
    const payload: BotSnapshotPayload = buildSnapshotPayload(makeSnapshot(), engine);
    // Compile-time contract check + runtime sanity: positions type carries
    // the PositionInfo shape (symbol/timeframe/direction/quantity/entryPrice).
    expect(payload.status.positions[0]).toMatchObject({
      symbol: 'BTCUSDT',
      timeframe: '60',
      direction: 'long',
      quantity: 0.1,
      entryPrice: 50_000,
    });
  });
});
