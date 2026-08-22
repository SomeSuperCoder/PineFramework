import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';

// Mock heavy Solana deps before importing (not under test). The strategy engine
// and language runtime are left REAL so markers flow through the actual engine.
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

import {
  LiveStrategyExecutor,
  type LiveStrategyConfig,
} from '../../../src/trading/live-strategy-executor.js';
import type { PairId, ClosedCandle } from '../../../src/trading/scheduler.js';
import { parse } from '../../../src/language/parser/index.js';
import { compile } from '../../../src/language/compiler/index.js';
import { ExecutionEngine } from '../../../src/language/runtime/execution-engine.js';
import { createExecutionContextFromBar } from '../../../src/api.js';

const CROSS_SOURCE =
  '//@version=5\n' +
  'strategy("Cross", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=100)\n' +
  'if (close > ta.sma(close, 3))\n' +
  '    strategy.entry("Long", strategy.long)\n' +
  'if (close < ta.sma(close, 3))\n' +
  '    strategy.close("Long")\n';

function makeBars(count: number, baseTime = 1_000_000): ClosedCandle[] {
  const bars: ClosedCandle[] = [];
  let prevClose = 100;
  for (let i = 0; i < count; i++) {
    // Oscillating price so close crosses its own sma3 repeatedly → entries/closes.
    const close = 100 + Math.sin(i * 0.8) * 10;
    const open = i === 0 ? prevClose : bars[i - 1]!.close;
    bars.push({
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: baseTime + i * 60000,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1000,
    });
    prevClose = close;
  }
  return bars;
}

function makeUptrendBars(count: number, baseTime = 2_000_000): ClosedCandle[] {
  const bars: ClosedCandle[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    bars.push({
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: baseTime + i * 60000,
      open: price,
      high: price + 2,
      low: price - 1,
      close: price + 1,
      volume: 1000,
    });
    price = price + 1;
  }
  return bars;
}

function makeDowntrendBars(count: number, baseTime = 2_000_000): ClosedCandle[] {
  const bars: ClosedCandle[] = [];
  let price = 110;
  for (let i = 0; i < count; i++) {
    bars.push({
      symbol: 'BTCUSDT',
      timeframe: '60',
      timestamp: baseTime + i * 60000,
      open: price,
      high: price + 1,
      low: price - 2,
      close: price - 1,
      volume: 1000,
    });
    price = price - 1;
  }
  return bars;
}

function makeConfig(overrides?: Partial<LiveStrategyConfig>): LiveStrategyConfig {
  const dex = overrides?.dex ?? {
    name: 'mock-dex',
    commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock DEX' },
    slippageConfig: { bps: 50, configurable: true },
    quote: vi.fn().mockResolvedValue({
      inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      outputMint: 'So11111111111111111111111111111111111111112',
      inAmount: '0',
      outAmount: '0',
      priceImpactPct: 0,
      route: 'mock-route',
      slippageBps: 50,
      feeBps: 0,
    }),
    swap: vi.fn().mockResolvedValue({
      success: true,
      signature: 'mock-signature',
      inputAmount: '0',
      outputAmount: '0',
      fee: '0',
    }),
    getBalance: vi.fn().mockResolvedValue({
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '10000000000',
      decimals: 6,
    }),
    getTransactionStatus: vi.fn().mockResolvedValue('confirmed'),
  };
  const config: LiveStrategyConfig = {
    strategySource: overrides?.strategySource ?? CROSS_SOURCE,
    dex,
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
    pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
    initialCapital: BigInt(1_000_000_000),
    positionSizePercent: 100,
    maxDailyLoss: 0,
    dataDir: mkdtempSync(join(tmpdir(), 'lse-test-')),
  };
  return config;
}

const PAIR: PairId = { symbol: 'BTCUSDT', timeframe: '60' };

describe('LiveStrategyExecutor — real Pine strategy execution (5.x)', () => {
  it('5.1 live incremental produces identical markers to batch execution', async () => {
    const bars = makeBars(40);
    const executor = new LiveStrategyExecutor(makeConfig());
    await executor.initializeStrategy(PAIR);

    const signals: Array<{ action: string; quantity: number }> = [];
    for (const bar of bars) {
      signals.push(...(await executor.processCandle(bar)));
    }
    const buySignals = signals.filter((s) => s.action === 'buy');
    const sellSignals = signals.filter((s) => s.action === 'sell');

    // Batch run over the same bars with a fresh engine.
    const parseResult = parse(CROSS_SOURCE);
    const compileResult = compile(parseResult.ast);
    const engine = new ExecutionEngine(compileResult);
    const batchResult = await engine.executeBars(
      bars.map((b, i) => createExecutionContextFromBar(b, i)),
    );
    const markers = batchResult.strategyMarkers ?? [];
    const entryLong = markers.filter((m) => m.type === 'entry' && m.direction === 'long');
    const closes = markers.filter(
      (m) => m.type === 'close' || m.type === 'exit' || m.type === 'close_all',
    );

    expect(buySignals.length).toBe(entryLong.length);
    expect(sellSignals.length).toBe(closes.length);
    buySignals.forEach((s, i) => {
      expect(s.quantity).toBeCloseTo(entryLong[i]!.quantity, 6);
    });
  });

  it('5.2 warm start seeds indicator state, produces no orders, and live candle continues it', async () => {
    const executor = new LiveStrategyExecutor(makeConfig());
    await executor.initializeStrategy(PAIR);

    const seed = makeDowntrendBars(10);
    await executor.warmUp(PAIR, seed);

    expect(executor.isWarmUpComplete()).toBe(true);

    // No markers leak from the seed: the marker cursor was consumed by executeBars.
    const state = (executor as any).strategyStates.get('BTCUSDT:60');
    expect(state.runtime.getStrategyMarkers()).toHaveLength(0);

    // Engine position stays flat through the downtrend seed.
    expect(state.engine.getPosition().direction).toBe('flat');

    // A live candle that jumps above sma3 (continuing from seeded history)
    // triggers a fresh long entry → buy signal.
    const last = seed[seed.length - 1]!;
    const live: ClosedCandle = {
      ...last,
      timestamp: last.timestamp + 60000,
      open: last.close,
      close: last.close + 12,
      high: last.close + 13,
      low: last.close + 8,
    };
    const signals = await executor.processCandle(live);
    expect(signals.some((s) => s.action === 'buy')).toBe(true);
  });

  it('5.3 live path records mock DEX orders implied by strategy markers', async () => {
    const dex = makeConfig().dex;
    const executor = new LiveStrategyExecutor(makeConfig({ dex }));
    await executor.initializeStrategy(PAIR);
    const bars = makeUptrendBars(12);

    let executedBuys = 0;
    for (const bar of bars) {
      for (const signal of await executor.processCandle(bar)) {
        if (signal.action === 'buy') {
          const result = await executor.executeSignal({ ...signal, timeframe: '60' });
          if (result.success) executedBuys++;
        }
      }
    }

    expect(executedBuys).toBeGreaterThan(0);
    expect(dex.swap).toHaveBeenCalled();

    // A filled buy is tracked on the correct per-pair state.
    const pos = executor.getPosition(PAIR);
    expect(pos?.direction).toBe('long');
    expect(pos?.quantity ?? 0).toBeGreaterThan(0);
  });

  it('5.3b executeSignal updates the correct per-pair position state (fixes symbol:timestamp bug)', async () => {
    const executor = new LiveStrategyExecutor(makeConfig());
    await executor.initializeStrategy(PAIR);

    const result = await executor.executeSignal({
      action: 'buy',
      symbol: 'BTCUSDT',
      quantity: 0.5,
      expectedPrice: 50000,
      timestamp: Date.now(),
      timeframe: '60',
    });

    expect(result.success).toBe(true);
    const pos = executor.getPosition(PAIR);
    expect(pos?.direction).toBe('long');
    expect(pos?.quantity).toBe(0.5);
  });

  it('5.4 strategy source with a parse error fails start with a descriptive error', async () => {
    const executor = new LiveStrategyExecutor(
      makeConfig({ strategySource: '//@version=5\nstrategy("x")\nif (' }),
    );
    await expect(executor.initializeStrategy(PAIR)).rejects.toThrow(/Failed to parse/i);
  });

  it('5.4b strategy source with an empty body fails start', async () => {
    const executor = new LiveStrategyExecutor(makeConfig({ strategySource: '   ' }));
    await expect(executor.initializeStrategy(PAIR)).rejects.toThrow(/No strategy source/i);
  });
});
