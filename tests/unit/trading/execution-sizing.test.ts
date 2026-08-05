/**
 * Regression tests for DEX execution sizing and the risk gate
 * (OpenSpec change: fix-trading-bot-machinery — specs trading-execution-correctness
 * and wallet-balance-safety-guard).
 *
 * Target behavior:
 *  - Buy input = availableBalanceUsdc * positionFraction (whole USDC) then
 *    converted to micro-USDC (* 1_000_000). NEVER divided by the asset price.
 *  - Sell input = token quantity * 10^decimals (token registry: ETH/BTC = 8,
 *    SOL = 9). Fractional quantities must NOT floor to zero lamports.
 *  - Risk gate: canEnterPosition() is checked before every buy; when false the
 *    signal returns { success: false, error: 'Entry blocked by risk controls' }
 *    and dex.swap is never called.
 *
 * NOTE: These assert the TARGET behavior. Until the executor fix lands
 * (parallel backend work), the sizing/risk-gate cases are expected to fail —
 * see DEPENDS-ON-BACKEND notes in the handoff.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock modules before importing
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
    getEquity: vi.fn().mockReturnValue(1_000_000_000),
    getPosition: vi.fn().mockReturnValue({ direction: 'flat', quantity: 0 }),
    entry: vi.fn(),
    close: vi.fn(),
    getNewMarkers: vi.fn().mockReturnValue([]),
  })),
}));

import {
  LiveStrategyExecutor,
  type LiveStrategyConfig,
} from '../../../src/trading/live-strategy-executor.js';
import type { TradeSignal } from '../../../src/trading/live-strategy-executor.js';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ETH_MINT = '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs'; // token-registry ETHUSDT

function createDexMock() {
  return {
    name: 'mock-dex',
    commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock DEX' },
    slippageConfig: { bps: 50, configurable: true },
    quote: vi.fn().mockResolvedValue({
      inputMint: USDC_MINT,
      outputMint: ETH_MINT,
      inAmount: '100000000',
      outAmount: '3333333',
      priceImpactPct: 0.1,
      slippageBps: 50,
      feeBps: 0,
    }),
    swap: vi.fn().mockResolvedValue({ success: true, signature: 'mock-signature' }),
    getBalance: vi.fn().mockResolvedValue({ mint: USDC_MINT, amount: '1000000000', decimals: 6 }), // 1000 USDC
    getTransactionStatus: vi.fn().mockResolvedValue('confirmed'),
  } as any;
}

function createConfig(overrides?: Partial<LiveStrategyConfig>): LiveStrategyConfig {
  return {
    strategySource: '//@version=5\nstrategy("Test")',
    dex: createDexMock(),
    walletManager: {
      getKeypair: vi.fn().mockResolvedValue({
        value: { publicKey: 'mock-public-key', privateKey: new Uint8Array(64) },
        dispose: vi.fn(),
      }),
    } as any,
    pairs: [{ symbol: 'ETHUSDT', timeframe: '60' }],
    initialCapital: BigInt(1_000_000_000),
    positionSizePercent: 10, // 10% of balance
    maxDailyLoss: 100,
    ...overrides,
  };
}

function buySignal(price = 3000): TradeSignal {
  // quantity is the token amount the strategy wants; sizing must derive the
  // USDC input from the balance, not from this quantity / price.
  return {
    action: 'buy',
    symbol: 'ETHUSDT',
    quantity: 100 / price, // ≈ 0.0333 ETH at $3000
    expectedPrice: price,
    timestamp: 1_000_000,
    timeframe: '60',
  };
}

function sellSignal(quantity = 0.02, price = 3000): TradeSignal {
  return {
    action: 'sell',
    symbol: 'ETHUSDT',
    quantity,
    expectedPrice: price,
    timestamp: 1_000_000,
    timeframe: '60',
  };
}

/** The third arg (input amount) passed to dex.quote on the last call. */
function quotedAmount(dex: any): bigint {
  return (dex.quote as ReturnType<typeof vi.fn>).mock.calls.at(-1)![2] as bigint;
}

describe('LiveStrategyExecutor — execution sizing (trading-execution-correctness)', () => {
  it('buy input = balance * positionFraction in micro-USDC, NOT divided by price', async () => {
    const config = createConfig();
    // $1,000 available USDC, positionFraction 0.10 → 100 USDC → 100_000_000 lamports
    (config.dex as any).getBalance.mockResolvedValue({
      mint: USDC_MINT,
      amount: '1000000000', // 1,000 USDC in lamports
      decimals: 6,
    });
    const executor = new LiveStrategyExecutor(config);

    const result = await executor.executeSignal(buySignal(3000));

    expect(result.success).toBe(true);
    expect(config.dex.quote).toHaveBeenCalledTimes(1);
    expect(quotedAmount(config.dex)).toBe(100_000_000n); // 100 USDC in micro-USDC
    expect(quotedAmount(config.dex)).not.toBe(0n);
    expect(config.dex.swap).toHaveBeenCalledTimes(1);
  });

  it('buy input is independent of the asset price (regression: no price division)', async () => {
    const config = createConfig();
    (config.dex as any).getBalance.mockResolvedValue({
      mint: USDC_MINT,
      amount: '1000000000',
      decimals: 6,
    });
    const executor = new LiveStrategyExecutor(config);

    // Same balance/fraction at a wildly different price must yield the SAME
    // 100 USDC input — a price-divided amount would change.
    await executor.executeSignal(buySignal(60_000));

    expect(quotedAmount(config.dex)).toBe(100_000_000n);
  });

  it('sell of 0.02 ETH submits 2_000_000 lamports (8 decimals), not 0', async () => {
    const config = createConfig();
    const executor = new LiveStrategyExecutor(config);

    const result = await executor.executeSignal(sellSignal(0.02));

    expect(result.success).toBe(true);
    expect(config.dex.quote).toHaveBeenCalledTimes(1);
    const call = (config.dex.quote as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const [inputMint, outputMint, amount] = call;
    // Sell direction: token → USDC
    expect(inputMint).toBe(ETH_MINT);
    expect(outputMint).toBe(USDC_MINT);
    expect(amount).toBe(2_000_000n); // 0.02 * 10^8
    expect(amount).not.toBe(0n); // fractional quantity must not floor to zero
    expect(config.dex.swap).toHaveBeenCalledTimes(1);
  });
});

describe('LiveStrategyExecutor — risk gate (wallet-balance-safety-guard)', () => {
  function createRiskManagerMock(canEnter: boolean) {
    return {
      canEnterPosition: vi.fn().mockReturnValue(canEnter),
      recordTrade: vi.fn().mockReturnValue(false),
      recordBalance: vi.fn().mockReturnValue(false),
      onEvent: vi.fn(),
      isWalletBalanceEnabled: true,
    } as any;
  }

  it('blocks a buy when canEnterPosition() is false and never calls dex.swap', async () => {
    const riskManager = createRiskManagerMock(false);
    const config = createConfig({ riskManager });
    const executor = new LiveStrategyExecutor(config);

    const result = await executor.executeSignal(buySignal(3000));

    expect(riskManager.canEnterPosition).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Entry blocked by risk controls');
    expect(config.dex.quote).not.toHaveBeenCalled();
    expect(config.dex.swap).not.toHaveBeenCalled();
  });

  it('proceeds with quote and swap when canEnterPosition() is true', async () => {
    const riskManager = createRiskManagerMock(true);
    const config = createConfig({ riskManager });
    const executor = new LiveStrategyExecutor(config);

    const result = await executor.executeSignal(buySignal(3000));

    expect(riskManager.canEnterPosition).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(config.dex.quote).toHaveBeenCalledTimes(1);
    expect(config.dex.swap).toHaveBeenCalledTimes(1);
  });
});
