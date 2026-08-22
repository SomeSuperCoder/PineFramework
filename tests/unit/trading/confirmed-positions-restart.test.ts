import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../src/trading/solana-config.js', () => ({
  createSolanaConnection: vi.fn().mockReturnValue({}),
  getDefaultSolanaConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../src/strategy/strategy-engine.js', () => ({
  StrategyEngine: vi.fn().mockImplementation(() => ({
    updateBar: vi.fn(),
    setWarningSink: vi.fn(),
    getEquity: vi.fn().mockReturnValue(10_000),
    getPosition: vi.fn().mockReturnValue({ direction: 'flat', quantity: 0 }),
    entry: vi.fn(),
    close: vi.fn(),
    getNewMarkers: vi.fn().mockReturnValue([]),
  })),
}));

import { LiveStrategyExecutor, LiveStrategyConfig } from '../../../src/trading/live-strategy-executor.js';

function makeConfig(dataDir: string): LiveStrategyConfig {
  return {
    strategySource: '//@version=5\nstrategy("Test")',
    dex: {
      name: 'mock-dex',
      commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock DEX' },
      slippageConfig: { bps: 50, configurable: true },
      quote: vi.fn().mockResolvedValue({
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'So11111111111111111111111111111111111111112',
        inAmount: '1000000',
        outAmount: '5000000',
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
      getBalance: vi.fn().mockResolvedValue({ mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: '10000000', decimals: 6 }),
      getTransactionStatus: vi.fn().mockResolvedValue('confirmed'),
    } as any,
    walletManager: {
      importWallet: vi.fn(),
      getKeypair: vi.fn().mockResolvedValue({ value: { publicKey: 'pk', privateKey: new Uint8Array(64) }, dispose: vi.fn() }),
      hasWallet: vi.fn().mockResolvedValue(true),
    } as any,
    pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
    dataDir,
    initialCapital: BigInt(1000000000),
    positionSizePercent: 100,
    maxDailyLoss: 100,
  };
}

describe('F7 — confirmedPositions restored from disk on restart', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'f7-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reports a persisted non-flat position via getPositions() after loadState', async () => {
    // Simulate a prior run that saved an open long position (v2 envelope).
    const file = {
      schemaVersion: 2,
      states: {
        'BTCUSDT:60:__legacy__': {
          position: { symbol: 'BTCUSDT', direction: 'long', quantity: 0.05, entryPrice: 50000, entryTime: 123 },
          variables: {},
        },
      },
    };
    writeFileSync(join(dir, 'strategy-state.json'), JSON.stringify(file));

    const executor = new LiveStrategyExecutor(makeConfig(dir));
    // Startup sequence: engines initialized, THEN state restored.
    await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });
    const restored = await executor.loadState();
    expect(restored).toBe(true);

    const positions = executor.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      symbol: 'BTCUSDT',
      timeframe: '60',
      direction: 'long',
      quantity: 0.05,
      entryPrice: 50000,
    });
  });

  it('returns [] (and does not throw) when no state file exists', async () => {
    const executor = new LiveStrategyExecutor(makeConfig(dir));
    const restored = await executor.loadState();
    expect(restored).toBe(false);
    expect(executor.getPositions()).toEqual([]);
  });
});
