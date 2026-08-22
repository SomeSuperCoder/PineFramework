import { describe, it, expect, vi } from 'vitest';

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

import {
  LiveStrategyExecutor,
  LiveStrategyConfig,
  TradeSignal,
} from '../../../src/trading/live-strategy-executor.js';

describe('getPositions legacy single-pair regression (B4 keying)', () => {
  it('returns 1 confirmed position after a confirmed BUY in legacy mode', async () => {
    const config: LiveStrategyConfig = {
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
        getBalance: vi.fn().mockResolvedValue({
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '10000000',
          decimals: 6,
        }),
        getTransactionStatus: vi.fn().mockResolvedValue('confirmed'),
      } as any,
      walletManager: {
        importWallet: vi.fn(),
        getKeypair: vi.fn().mockResolvedValue({
          value: { publicKey: 'mock-public-key', privateKey: new Uint8Array(64) },
          dispose: vi.fn(),
        }),
        hasWallet: vi.fn().mockResolvedValue(true),
      } as any,
      // Legacy single-pair config: NO `worlds`, only `pairs` (2-part path).
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
      initialCapital: BigInt(1000000000),
      positionSizePercent: 100,
      maxDailyLoss: 100,
    };

    const executor = new LiveStrategyExecutor(config);
    await executor.initializeStrategy({ symbol: 'BTCUSDT', timeframe: '60' });

    const signal: TradeSignal = {
      symbol: 'BTCUSDT',
      timeframe: '60',
      action: 'buy',
      direction: 'long',
      quantity: 0.01,
      expectedPrice: 50000,
      timestamp: Date.now(),
    } as TradeSignal;

    const result = await executor.executeSignal(signal);
    expect(result.success).toBe(true);

    const positions = executor.getPositions();
    expect(positions).toHaveLength(1);
  });
});
