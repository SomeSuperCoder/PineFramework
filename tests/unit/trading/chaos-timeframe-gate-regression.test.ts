/**
 * REGRESSION SUITE — Incident 2026-08-06 15:31 UTC (ETHUSDT, chaos mode).
 *
 * Money bug: a chaos buy succeeds on-chain, but `getPositions()` returns [] at
 * stop time, so CloseManager snapshots 0 and sells nothing — the real DEX
 * position is stranded. Root cause: chaos buy signals carried NO `timeframe`,
 * so `updatePositionState` bailed at the `!signal.timeframe` gate BEFORE
 * `confirmedPositions.set(...)`; getPositions() is confirmed-fill gated, so a
 * confirmed chaos fill never became visible and close-on-stop sold 0.
 *
 * Pre-fix, the Bug Hunter's repro (tests/unit/trading/repro-bug-timeframe-gate
 * .test.ts) FAILED with: `assertion error: expected [] to have a length of 1`.
 *
 * FIX (now landed in production — this suite locks it):
 *  1. live-strategy-executor.ts processCandleChaos (~L1147) adds
 *     `timeframe: candle.timeframe` to the chaos buy signal.
 *  2. bot-engine.ts submitOrders→executorSignal (~L1118) restores
 *     `timeframe: signal.pair.timeframe` through the scheduler round-trip
 *     (which drops it).
 *  3. updatePositionState (~L1253-1279) replaced the hard `!signal.timeframe`
 *     bail with `getStateKeyForSignal`: exact `symbol:timeframe` → non-flat
 *     symbol fallback → LOUD console.error (never a silent return) when no
 *     state matches. confirmedPositions is keyed by the resolved key.
 *
 * These tests drive the REAL chaos path (processCandleChaos) through a mocked
 * DEX / StrategyEngine (hermetic — no network), then assert the confirmed-fill
 * recorder never silently drops a chaos position.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Boundary mocks — hermetic, deterministic (mirrors live-strategy-executor.test).
vi.mock('../../../src/trading/solana-config.js', () => ({
  createSolanaConnection: vi.fn().mockReturnValue({}),
  getDefaultSolanaConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../src/trading/solana-wallet.js', () => ({
  createConnection: vi.fn().mockReturnValue({}),
  getSolBalance: vi.fn(),
  getTokenBalance: vi.fn(),
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
}));

// Faithful in-memory StrategyEngine for the chaos drive path
// (processCandleChaos): updateBar / getEquity / getPosition / entry / close.
vi.mock('../../../src/strategy/strategy-engine.js', () => ({
  StrategyEngine: vi.fn().mockImplementation(() => {
    const markers: any[] = [];
    let pos: { direction: string; quantity: number } = { direction: 'flat', quantity: 0 };
    return {
      updateBar: vi.fn(),
      getEquity: vi.fn().mockReturnValue(10_000_000_000),
      getPosition: vi.fn().mockImplementation(() => pos),
      entry: vi.fn().mockImplementation((_name: string, direction: string, quantity: number) => {
        pos = { direction, quantity };
        markers.push({
          type: 'entry',
          name: 'Long',
          direction,
          quantity,
          price: 50000,
          barIndex: 0,
          timestamp: Date.now(),
          color: direction === 'long' ? '#00FF00' : '#FF0000',
        });
        return undefined;
      }),
      close: vi.fn().mockImplementation((name: string) => {
        markers.push({
          type: 'close',
          name,
          direction: pos.direction,
          quantity: pos.quantity,
          price: 50000,
          barIndex: 0,
          timestamp: Date.now(),
          color: '#FF0000',
        });
        pos = { direction: 'flat', quantity: 0 };
        return undefined;
      }),
      getNewMarkers: vi.fn().mockImplementation(() => markers.splice(0)),
    };
  }),
}));

import {
  LiveStrategyExecutor,
  LiveStrategyConfig,
  TradeSignal,
} from '../../../src/trading/live-strategy-executor.js';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Incident pair + a candle the chaos drive uses. */
const PAIR = { symbol: 'ETHUSDT', timeframe: '1' };

function makeCandle(timestamp = Date.now(), close = 1916.97) {
  return {
    symbol: PAIR.symbol,
    timeframe: PAIR.timeframe,
    timestamp,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  };
}

function makeConfig(generator: any): LiveStrategyConfig {
  return {
    strategySource: '//@version=5\nstrategy("Test")',
    dex: {
      name: 'mock-dex',
      commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock DEX' },
      slippageConfig: { bps: 50, configurable: true },
      quote: vi.fn().mockResolvedValue({
        inputMint: USDC,
        outputMint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
        inAmount: '1000000000',
        outAmount: '10000000',
        priceImpactPct: 0.1,
        route: 'mock-route',
        slippageBps: 50,
        feeBps: 0,
      }),
      swap: vi.fn().mockResolvedValue({
        success: true,
        signature: 'mock-signature',
        inputAmount: '1000000',
        outputAmount: '5000000',
        fee: '0',
      }),
      getBalance: vi.fn().mockResolvedValue({
        mint: USDC,
        amount: '10000000', // 10 USDC
        decimals: 6,
      }),
      getTransactionStatus: vi.fn().mockResolvedValue('confirmed'),
    } as any,
    walletManager: {
      importWallet: vi.fn(),
      getKeypair: vi.fn().mockResolvedValue({
        value: {
          publicKey: 'mock-public-key',
          privateKey: new Uint8Array(64),
        },
        dispose: vi.fn(),
      }),
      hasWallet: vi.fn().mockResolvedValue(true),
    } as any,
    pairs: [PAIR],
    initialCapital: BigInt(1000000000),
    positionSizePercent: 10,
    maxDailyLoss: 100,
    chaosGenerator: generator,
  };
}

describe('chaos timeframe-gate regression (incident 2026-08-06)', () => {
  // `chaosAction` drives the engine's long→exit flow across candles.
  let chaosAction: 'long' | 'exit';
  let executor: LiveStrategyExecutor;

  function makeGenerator() {
    return {
      generate: vi.fn().mockImplementation(() => ({
        action: chaosAction,
        sizeFraction: 0.1,
        equity: 10_000,
        timestamp: Date.now(),
      })),
      getSignalCount: vi.fn().mockReturnValue(1),
    } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    chaosAction = 'long';
    executor = new LiveStrategyExecutor(makeConfig(makeGenerator()));
  });

  it('1) (INCIDENT) confirmed chaos buy → getPositions() non-empty, driven through the real processCandleChaos path', async () => {
    await executor.initializeStrategy(PAIR);

    // Drive the REAL chaos path: the mocked generator emits 'long' while flat,
    // so processCandleChaos produces a chaos BUY signal.
    const signals = await executor.processCandle(makeCandle() as any);
    expect(signals.length).toBe(1);
    expect(signals[0]!.action).toBe('buy');

    // FIX #1 locked: processCandleChaos must carry candle.timeframe on the buy
    // signal — the missing field was the root of the incident.
    expect(signals[0]!.timeframe).toBe(PAIR.timeframe);

    // The chaos buy fills on-chain (mocked swap) → confirmed.
    const result = await executor.executeSignal(signals[0]!);
    expect(result.success).toBe(true);

    // The confirmed-fill recorder must expose the position to getPositions()
    // (CloseManager's snapshot source). This was [] before the fix.
    const positions = executor.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      symbol: PAIR.symbol,
      timeframe: PAIR.timeframe,
      direction: 'long',
    });
  });

  it('2a. DEFENSE-IN-DEPTH: buy genuinely missing `timeframe` still resolves via the symbol fallback (never silently dropped)', async () => {
    await executor.initializeStrategy(PAIR);

    // Mirror the ORIGINAL Bug Hunter repro precondition: a buy reached
    // executeSignal WITHOUT timeframe, the chaos drive had staged the long
    // optimistically, and the swap confirms.
    const state = (executor as any).strategyStates.get('ETHUSDT:1');
    expect(state).toBeTruthy();
    state.position = {
      symbol: PAIR.symbol,
      direction: 'long',
      quantity: 0.00023605705882624516, // incident quantity
      entryPrice: 1916.97, // incident price
      entryTime: Date.now(),
    };

    const noTimeframeBuy: TradeSignal = {
      action: 'buy',
      symbol: PAIR.symbol,
      quantity: 0.00023605705882624516,
      expectedPrice: 1916.97,
      timestamp: Date.now(),
      // NOTE: `timeframe` deliberately ABSENT — exactly what the incident
      // delivered to executeSignal before both hop plumbings landed.
    };

    const result = await executor.executeSignal(noTimeframeBuy);
    expect(result.success).toBe(true);

    // BEFORE the fix this returned [] (the hard `!signal.timeframe` bail).
    const positions = executor.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0]!.symbol).toBe(PAIR.symbol);
    expect(positions[0]!.timeframe).toBe(PAIR.timeframe);
  });

  it('2b. DEFENSE-IN-DEPTH: no matching state → LOUD console.error, never a silent empty getPositions()', async () => {
    // Intentionally NOT initialized for any pair → no strategy state matches.

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await executor.executeSignal({
        action: 'buy',
        symbol: 'UNKNOWNUSDT',
        quantity: 0.1,
        expectedPrice: 100,
        timestamp: Date.now(),
      });
      // Confirm swap still reports success; the guard must not throw.
      expect(result.success).toBe(true);

      // No state can map this fill, so no position is tracked — but it MUST be
      // LOUD, not a silent drop that looks like a genuine no-op (the incident's
      // failure mode was exactly the silent return).
      expect(errorSpy).toHaveBeenCalled();
      const loud = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(loud).toContain('Cannot track confirmed fill');
      expect(loud).toContain('no strategy state');
      expect(loud).toContain('UNKNOWNUSDT');
      expect(loud).toContain('(no timeframe)');
      expect(executor.getPositions()).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('3. CHAOS→CLOSE: the stop path sees the confirmed chaos position and can close it', async () => {
    await executor.initializeStrategy(PAIR);

    // Open leg — real chaos path produces the buy.
    const buySignals = await executor.processCandle(makeCandle() as any);
    expect(buySignals[0]!.action).toBe('buy');
    const buy = await executor.executeSignal(buySignals[0]!);
    expect(buy.success).toBe(true);

    // Link that was broken: the confirmed chaos fill must NOW report in
    // getPositions(), so CloseManager (which snapshots getPositions()) would
    // see it and sell it at stop time.
    expect(executor.getPositions()).toHaveLength(1);

    // Exit leg: generator emits 'exit' on the long → chaos close/exit sell.
    chaosAction = 'exit';
    const closeSignals = await executor.processCandle(makeCandle(Date.now() + 60000) as any);
    const sell = closeSignals.find((s: TradeSignal) => s.action === 'sell' || s.action === 'close');
    expect(sell).toBeTruthy();

    // The executor's own chaos sell lacks timeframe, but bot-engine.submitOrders
    // restores it from the pair (fix #2, bot-engine.ts ~L1118). Mirror that.
    const sellWithTimeframe: TradeSignal = { ...sell!, timeframe: PAIR.timeframe };
    const closed = await executor.executeSignal(sellWithTimeframe);
    expect(closed.success).toBe(true);

    // DEX flat → confirmed close → position gone from getPositions().
    expect(executor.getPositions()).toEqual([]);
  });
});
