/**
 * Trade-capture wiring tests (OpenSpec change add-trade-history-stats-dashboard,
 * spec `trade-history`, design D2+D3).
 *
 * Scope: the LiveStrategyExecutor wiring that persists a TradeRecord on a
 * closed trade and notifies the onTradeClosed observer — confirmed closes,
 * chaos closes, unknown-outcome closes, and the fail-safe guarantees.
 *
 * These tests drive executeSignal through the real close path with a mocked
 * DEX / wallet / store (the house harness used by live-strategy-executor.test.ts)
 * and assert the exact TradeRecord content and the fail-safe behavior. They do
 * NOT test TradeHistoryStore itself — that is covered by
 * trade-history-store-extension.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock modules before importing (house style — live-strategy-executor imports these).
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
    getEquity: vi.fn().mockReturnValue(10_000_000_000),
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
import type { TradeRecord } from '../../../src/trading/types.js';

/** Build a fresh executor config with mocked DEX/wallet (house harness). */
function createMockConfig(overrides: Partial<LiveStrategyConfig> = {}): LiveStrategyConfig {
  return {
    strategySource: '//@version=5\nstrategy("Momentum Trader")',
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
        value: {
          publicKey: 'mock-public-key',
          privateKey: new Uint8Array(64),
        },
        dispose: vi.fn(),
      }),
      hasWallet: vi.fn().mockResolvedValue(true),
    } as any,
    pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
    initialCapital: BigInt(1000000000), // 1000 USDC
    positionSizePercent: 10,
    maxDailyLoss: 100,
    ...overrides,
  };
}

/**
 * A deterministic closing sell signal. Carries the B1 entry snapshot
 * (positionEntryPrice) by default; pass `positionEntryPrice: undefined` to
 * simulate a close whose entry is unknown.
 */
function closeSignal(overrides: Partial<TradeSignal> = {}): TradeSignal {
  return {
    action: 'sell',
    symbol: 'BTCUSDT',
    quantity: 0.1,
    expectedPrice: 51000,
    timestamp: 1_700_000_000_000,
    timeframe: '60',
    positionEntryPrice: 50000,
    ...overrides,
  };
}

/** Seed a long position in the executor's per-pair state (state-fallback path). */
function seedLongState(
  exec: LiveStrategyExecutor,
  entryPrice = 50000,
  entryTime = 1_699_999_400_000,
): void {
  (exec as any).strategyStates.set('BTCUSDT:60', {
    position: { symbol: 'BTCUSDT', direction: 'long', quantity: 0.1, entryPrice, entryTime },
  });
}

function createRiskManagerMock() {
  return {
    recordTrade: vi.fn().mockReturnValue(false),
    recordBalance: vi.fn().mockReturnValue(false),
    onEvent: vi.fn(),
    isWalletBalanceEnabled: true,
  } as any;
}

function recordTradeMock() {
  // Append-first boolean contract: the store returns true when the record
  // persisted (disk BEFORE memory); the executor broadcasts to the observer
  // only for persisted records.
  return { recordTrade: vi.fn().mockReturnValue(true) } as any;
}

describe('trade-capture wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('live confirmed close', () => {
    it('records a confirmed trade with every field on a completed sell close', async () => {
      const store = recordTradeMock();
      const exec = new LiveStrategyExecutor(
        createMockConfig({ botId: 'bot-live', tradeHistoryStore: store }),
      );

      const signal = closeSignal({ expectedPrice: 51000, positionEntryPrice: 50000 });
      const result = await exec.executeSignal(signal);

      expect(result.success).toBe(true);
      expect(store.recordTrade).toHaveBeenCalledTimes(1);

      const trade = store.recordTrade.mock.calls[0][0] as TradeRecord;
      expect(trade).toMatchObject({
        botId: 'bot-live',
        symbol: 'BTCUSDT',
        side: 'buy',
        entryPrice: 50000,
        exitPrice: 51000,
        size: 0.1,
        fees: 0,
        // (51000 − 50000) × 0.1 = 100
        realizedPnl: 100,
        dex: 'mock-dex',
        transactionSignature: 'mock-signature',
        timeframe: '60',
        strategy: 'Momentum Trader',
        mode: 'live',
        status: 'confirmed',
      });
      // B1 entry snapshot with no tracked state → openedAt falls back to the
      // signal timestamp; closedAt is the wall-clock close time.
      expect(trade.openedAt).toBe(signal.timestamp);
      expect(typeof trade.closedAt).toBe('number');
      expect(trade.closedAt).toBeGreaterThanOrEqual(signal.timestamp);
      // id scheme: `${botId}-${closedAt}-${seq}`
      expect(trade.id).toBe(`bot-live-${trade.closedAt}-0`);
    });

    it('resolves realized PnL from tracked state when the signal carries no entry snapshot', async () => {
      const store = recordTradeMock();
      const exec = new LiveStrategyExecutor(
        createMockConfig({ botId: 'bot-live', tradeHistoryStore: store }),
      );
      seedLongState(exec, 49000);

      const result = await exec.executeSignal(
        closeSignal({ expectedPrice: 51000, positionEntryPrice: undefined }),
      );

      expect(result.success).toBe(true);
      const trade = store.recordTrade.mock.calls[0][0] as TradeRecord;
      expect(trade.entryPrice).toBe(49000);
      expect(trade.realizedPnl).toBeCloseTo((51000 - 49000) * 0.1, 6);
      expect(trade.openedAt).toBe(1_699_999_400_000);
    });

    it('skips a confirmed close whose entry is unknown — no fake zero-PnL trade', async () => {
      const store = recordTradeMock();
      const exec = new LiveStrategyExecutor(createMockConfig({ tradeHistoryStore: store }));

      const result = await exec.executeSignal(closeSignal({ positionEntryPrice: undefined }));

      expect(result.success).toBe(true);
      expect(store.recordTrade).not.toHaveBeenCalled();
    });

    it('truncates the extracted strategy name to 50 characters', async () => {
      const longName = 'X'.repeat(60);
      const store = recordTradeMock();
      const exec = new LiveStrategyExecutor(
        createMockConfig({
          strategySource: `//@version=5\nstrategy("${longName}")`,
          tradeHistoryStore: store,
        }),
      );

      await exec.executeSignal(closeSignal());

      const trade = store.recordTrade.mock.calls[0][0] as TradeRecord;
      expect(trade.strategy).toBe('X'.repeat(50));
    });
  });

  describe('chaos close', () => {
    it('records a close with strategy "Chaos Mode" and mode "chaos"', async () => {
      const store = recordTradeMock();
      const chaosGenerator = { generate: vi.fn() } as any;
      // No botId configured → defaults to 'default-bot'.
      const exec = new LiveStrategyExecutor(
        createMockConfig({ chaosGenerator, tradeHistoryStore: store }),
      );

      const result = await exec.executeSignal(closeSignal({ expectedPrice: 51000 }));

      expect(result.success).toBe(true);
      const trade = store.recordTrade.mock.calls[0][0] as TradeRecord;
      expect(trade.mode).toBe('chaos');
      expect(trade.strategy).toBe('Chaos Mode');
      expect(trade.botId).toBe('default-bot');
      expect(trade.status).toBe('confirmed');
      expect(trade.realizedPnl).toBeCloseTo((51000 - 50000) * 0.1, 6);
    });
  });

  describe('unknown-outcome close', () => {
    it('records an unknown-status close when the swap throws, without rethrowing', async () => {
      const store = recordTradeMock();
      const config = createMockConfig({ botId: 'bot-live', tradeHistoryStore: store });
      (config.dex as any).swap.mockRejectedValue(new Error('RPC timeout after broadcast'));
      const exec = new LiveStrategyExecutor(config);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await exec.executeSignal(closeSignal({ expectedPrice: 51000 }));

      // No rethrow — the caller receives a normal failed result.
      expect(result.success).toBe(false);
      expect(result.error).toContain('RPC timeout after broadcast');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('UNKNOWN ORDER OUTCOME'));

      expect(store.recordTrade).toHaveBeenCalledTimes(1);
      const trade = store.recordTrade.mock.calls[0][0] as TradeRecord;
      expect(trade.status).toBe('unknown');
      expect(trade.mode).toBe('live');
      expect(trade.strategy).toBe('Momentum Trader');
      // Entry is known via the B1 snapshot → real PnL, not a guessed zero.
      expect(trade.realizedPnl).toBeCloseTo((51000 - 50000) * 0.1, 6);
      // No swap result on the throw path → no transaction signature.
      expect(trade.transactionSignature).toBeUndefined();
      errorSpy.mockRestore();
    });

    it('records the unknown close with zero PnL when the entry is unknown', async () => {
      const store = recordTradeMock();
      const config = createMockConfig({ tradeHistoryStore: store });
      (config.dex as any).swap.mockRejectedValue(new Error('ack lost'));
      const exec = new LiveStrategyExecutor(config);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await exec.executeSignal(closeSignal({ positionEntryPrice: undefined }));

      expect(result.success).toBe(false);
      const trade = store.recordTrade.mock.calls[0][0] as TradeRecord;
      expect(trade.status).toBe('unknown');
      expect(trade.realizedPnl).toBe(0);
      expect(trade.entryPrice).toBe(0);
      errorSpy.mockRestore();
    });

    it('does not record a close for a buy whose swap throws — a buy throw is not a close', async () => {
      const store = recordTradeMock();
      const config = createMockConfig({ tradeHistoryStore: store });
      (config.dex as any).swap.mockRejectedValue(new Error('broadcast timeout'));
      const exec = new LiveStrategyExecutor(config);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await exec.executeSignal({
        action: 'buy',
        symbol: 'BTCUSDT',
        quantity: 0.1,
        expectedPrice: 51000,
        timestamp: 1_700_000_000_000,
      });

      expect(result.success).toBe(false);
      expect(store.recordTrade).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('fail-safe', () => {
    it('completes the close normally when the store recordTrade reports failure (returns false)', async () => {
      const riskManager = createRiskManagerMock();
      const onTradeClosed = vi.fn();
      const store = {
        recordTrade: vi.fn().mockReturnValue(false),
      } as any;
      const exec = new LiveStrategyExecutor(
        createMockConfig({ tradeHistoryStore: store, onTradeClosed, riskManager }),
      );

      const result = await exec.executeSignal(closeSignal({ expectedPrice: 51000 }));

      // The trade itself is done and must not be demoted by the store failure.
      expect(result.success).toBe(true);
      expect(result.swapResult?.signature).toBe('mock-signature');
      // The risk feed and balance snapshot are unaffected — trading is
      // byte-identical to a healthy store.
      expect(riskManager.recordTrade).toHaveBeenCalledWith(100);
      expect(riskManager.recordBalance).toHaveBeenCalledWith(10000000n);
      // A record that failed to append is NOT in memory — broadcasting it
      // would create a phantom trade that vanishes on restart.
      expect(onTradeClosed).not.toHaveBeenCalled();
    });

    it('executes byte-identically with no store and no observer — no recording, no throw', async () => {
      const exec = new LiveStrategyExecutor(createMockConfig());

      const result = await exec.executeSignal(closeSignal({ expectedPrice: 51000 }));

      expect(result.success).toBe(true);
      expect(result.swapResult?.signature).toBe('mock-signature');
    });
  });

  describe('onTradeClosed observer', () => {
    it('invokes the observer with the exact trade the store persisted', async () => {
      const store = recordTradeMock();
      const onTradeClosed = vi.fn();
      const exec = new LiveStrategyExecutor(
        createMockConfig({ botId: 'bot-live', tradeHistoryStore: store, onTradeClosed }),
      );

      await exec.executeSignal(closeSignal({ expectedPrice: 51000 }));

      expect(onTradeClosed).toHaveBeenCalledTimes(1);
      const observed = onTradeClosed.mock.calls[0][0] as TradeRecord;
      expect(observed.status).toBe('confirmed');
      expect(observed.botId).toBe('bot-live');
      expect(observed.realizedPnl).toBeCloseTo((51000 - 50000) * 0.1, 6);
      expect(observed.id).toBe(store.recordTrade.mock.calls[0][0].id);
    });

    it('does not break the close path when the observer throws', async () => {
      const store = recordTradeMock();
      const onTradeClosed = vi.fn().mockImplementation(() => {
        throw new Error('ws broadcast failed');
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exec = new LiveStrategyExecutor(
        createMockConfig({ tradeHistoryStore: store, onTradeClosed }),
      );

      const result = await exec.executeSignal(closeSignal({ expectedPrice: 51000 }));

      expect(result.success).toBe(true);
      // The store write still happened before the observer ran.
      expect(store.recordTrade).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('onTradeClosed hook failed'),
        expect.anything(),
      );
      errorSpy.mockRestore();
    });
  });
});
