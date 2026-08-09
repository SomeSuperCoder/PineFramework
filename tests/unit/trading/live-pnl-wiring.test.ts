/**
 * M5 — live executor PnL wiring tests.
 *
 * Proves the LIVE side of the PnL SSOT change in LiveStrategyExecutor:
 *   - `resolveClosedTradeRealizedPnl` computes gross through the shared pnl
 *     module with the SAME gross the old (exit − entry) × qty formula produced;
 *   - feesSource mapping: complete SwapResult → observed components; feeUnknown
 *     or absent swap result → 'none' (feesUnknown);
 *   - SOL-always-priced conversion: buildCloseFeePrices supplies prices['SOL']
 *     (default $73) so lamport fees CONVERT instead of degrading to feesUnknown;
 *   - `persistClosedTradeRecord` writes grossPnl / fees / feeBreakdown /
 *     feesUnknown / net realizedPnl;
 *   - TradeRecord backward-compat: a legacy row without the new fields reads
 *     fine (no crash, stats identity still holds).
 *
 * Private members are exercised via `(executor as any)` — the house pattern
 * used by trade-capture-wiring.test.ts for executor internals.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

import { LiveStrategyExecutor } from '../../../src/trading/live-strategy-executor.js';
import type { LiveStrategyConfig } from '../../../src/trading/live-strategy-executor.js';
import type { SwapResult } from '../../../src/trading/dex/dex-adapter.js';
import { TradeHistoryStore } from '../../../src/trading/trade-history-store.js';
import type { TradeRecord } from '../../../src/trading/types.js';
import type { FeeComponent, RealizedPnl } from '../../../src/pnl/index.js';

/** Build a fresh executor config with mocked DEX/wallet (house harness). */
function createMockConfig(overrides: Partial<LiveStrategyConfig> = {}): LiveStrategyConfig {
  return {
    strategySource: '//@version=5\nstrategy("Momentum Trader")',
    dex: {
      name: 'mock-dex',
      commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock DEX' },
      slippageConfig: { bps: 50, configurable: true },
      quote: vi.fn(),
      swap: vi.fn(),
      getBalance: vi.fn(),
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
    pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
    initialCapital: BigInt(1000000000),
    positionSizePercent: 10,
    maxDailyLoss: 100,
    ...overrides,
  };
}

/** A deterministic closing sell signal carrying the B1 entry snapshot. */
function closeSignal(overrides: Record<string, unknown> = {}): any {
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

/** A SwapResult-shaped fee observation. feeComponents are always present (M4). */
function swapResultWith(components: FeeComponent[], extra: Partial<SwapResult> = {}): SwapResult {
  return {
    success: true,
    signature: 'mock-signature',
    inputAmount: '10000000',
    outputAmount: '9800000',
    feeComponents: components,
    ...extra,
  };
}

/** Canonical entry 50000 → exit 51000 × 0.1 → gross 100 (old formula: (51000−50000)×0.1). */
const GROSS = '100';

/** A module-shaped RealizedPnl (as produced by aggregateRealizedPnl at the executor edge). */
function realizedPnlFixture(): RealizedPnl {
  return {
    side: 'LONG',
    gross: '100',
    feesTotal: '0.6',
    net: '99.5',
    fills: 2,
    feeBreakdown: { VENUE: '0.25', BASE: '0.25', SLIPPAGE_MEMO: '0.1' },
    // fills anchor: VENUE + BASE reduce net; SLIPPAGE_MEMO is display-only.
    subtractedFromNet: ['VENUE', 'BASE'],
    feeSource: { observed: true },
  };
}

describe('M5 — resolveClosedTradeRealizedPnl', () => {
  let exec: LiveStrategyExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    exec = new LiveStrategyExecutor(createMockConfig());
  });

  it('gross is module-exact and matches the old (exit − entry) × qty formula', () => {
    const pnl = (exec as any).resolveClosedTradeRealizedPnl(closeSignal());
    expect(pnl.gross).toBe(GROSS);
    expect(pnl.gross).toBe(String((51000 - 50000) * 0.1));
    expect(pnl.fills).toBe(2);
  });

  it('returns undefined when the closed position entry is unknown (fail-safe skip)', () => {
    const pnl = (exec as any).resolveClosedTradeRealizedPnl(
      closeSignal({ positionEntryPrice: undefined }),
    );
    expect(pnl).toBeUndefined();
  });

  it('maps a COMPLETE swapResult to observed components — fills anchor: every kind reduces net', () => {
    // REAL-output fixture (M9): VENUE/PLATFORM in the swap's input mint
    // (Wormhole BTC), PRIORITY/BASE in SOL lamports. buildCloseFeePrices
    // supplies prices['SOL'] = { priceUsd: '73', decimals: 9 } so lamports
    // CONVERT — no throw, no degradation.
    const BTC_MINT = '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh';
    const swapResult = swapResultWith([
      { kind: 'VENUE', tokenMint: BTC_MINT, amountAtomic: '25000' }, // 0.00025 BTC × 51000 = 12.75
      { kind: 'PLATFORM', tokenMint: BTC_MINT, amountAtomic: '10000' }, // 0.0001 BTC × 51000 = 5.1
      { kind: 'PRIORITY', tokenMint: 'SOL', amountAtomic: '100000' }, // 100_000 × 73 / 1e9 = 0.0073
      { kind: 'BASE', tokenMint: 'SOL', amountAtomic: '10000' }, // 10_000 × 73 / 1e9 = 0.00073
    ]);
    const pnl = (exec as any).resolveClosedTradeRealizedPnl(closeSignal(), swapResult);

    expect(pnl.gross).toBe(GROSS);
    expect(pnl.feeBreakdown).toEqual({
      VENUE: '12.75',
      PLATFORM: '5.1',
      PRIORITY: '0.0073',
      BASE: '0.00073',
    });
    expect(pnl.feeSource.observed).toBe(true);
    expect(pnl.feeSource.feesUnknown).toBeUndefined();
    // fills anchor (MAJOR-2): every observed kind reduces net.
    expect(pnl.subtractedFromNet).toEqual(['VENUE', 'PLATFORM', 'PRIORITY', 'BASE']);
    expect(pnl.feesTotal).toBe('17.85803');
    expect(pnl.net).toBe('82.14197');
  });

  it('maps a feeUnknown swapResult to feesSource "none" — feesUnknown flagged, net === gross', () => {
    const swapResult = swapResultWith([{ kind: 'BASE', tokenMint: 'SOL', amountAtomic: '10000' }], {
      feeUnknown: true,
    });
    const pnl = (exec as any).resolveClosedTradeRealizedPnl(closeSignal(), swapResult);

    expect(pnl.feesTotal).toBe('0');
    expect(pnl.feeSource.feesUnknown).toBe(true);
    expect(pnl.feeSource.observed).toBeUndefined();
    expect(pnl.net).toBe(GROSS);
  });

  it('maps an ABSENT swapResult to feesSource "none" — feesUnknown, net === gross', () => {
    const pnl = (exec as any).resolveClosedTradeRealizedPnl(closeSignal(), undefined);
    expect(pnl.feeSource.feesUnknown).toBe(true);
    expect(pnl.net).toBe(GROSS);
  });

  it('converts SOL BASE lamports with the always-supplied SOL price — no degradation, no throw', () => {
    // M9-FIX: buildCloseFeePrices ALWAYS supplies prices['SOL'] (default $73),
    // so a SOL-denominated BASE fee CONVERTS (10_000 × 73 / 1e9 = 0.00073)
    // instead of degrading to feesUnknown. The old "SOL intentionally not
    // priced → degradation" expectation is obsolete — SOL is always priced.
    const swapResult = swapResultWith([{ kind: 'BASE', tokenMint: 'SOL', amountAtomic: '10000' }]);
    const pnl = (exec as any).resolveClosedTradeRealizedPnl(closeSignal(), swapResult);

    expect(pnl.gross).toBe(GROSS);
    expect(pnl.feeBreakdown['BASE']).toBe('0.00073');
    expect(pnl.feesTotal).toBe('0.00073');
    expect(pnl.subtractedFromNet).toEqual(['BASE']);
    expect(pnl.net).toBe('99.99927');
    expect(pnl.feeSource.feesUnknown).toBeUndefined();
  });
});

describe('M5 — persistClosedTradeRecord writes the SSOT fields', () => {
  let exec: LiveStrategyExecutor;
  let store: { recordTrade: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    store = { recordTrade: vi.fn().mockReturnValue(true) };
    exec = new LiveStrategyExecutor(
      createMockConfig({ botId: 'bot-live', tradeHistoryStore: store as any }),
    );
  });

  it('persists grossPnl, fees, feeBreakdown, feesUnknown and NET realizedPnl', () => {
    const signal = closeSignal();
    (exec as any).persistClosedTradeRecord(signal, {
      status: 'confirmed',
      realizedPnl: realizedPnlFixture(),
      swapResult: swapResultWith([], { signature: 'sig-1' }),
    });

    expect(store.recordTrade).toHaveBeenCalledTimes(1);
    const trade = store.recordTrade.mock.calls[0][0] as TradeRecord;

    expect(trade.grossPnl).toBe(100);
    // M9-FIX: fees = Σ(subtractedFromNet) — the ANCHOR-SUBTRACTED total
    // (VENUE 0.25 + BASE 0.25 = 0.5), NOT feesTotal of all kinds (0.6).
    // Identity per record: realizedPnl === gross − fees exactly.
    expect(trade.fees).toBe(0.5);
    // feeBreakdown keeps the FULL display of every kind incl. the memo.
    expect(trade.feeBreakdown).toEqual({ VENUE: 0.25, BASE: 0.25, SLIPPAGE_MEMO: 0.1 });
    // realizedPnl is NET since M5.
    expect(trade.realizedPnl).toBe(99.5);
    expect(trade.transactionSignature).toBe('sig-1');
  });

  it('flags feesUnknown on the record when the module flags it', () => {
    const pnl = realizedPnlFixture();
    pnl.feeSource = { feesUnknown: true };
    (exec as any).persistClosedTradeRecord(closeSignal(), {
      status: 'confirmed',
      realizedPnl: pnl,
    });

    const trade = store.recordTrade.mock.calls[0][0] as TradeRecord;
    expect(trade.feesUnknown).toBe(true);
  });

  it('omits grossPnl/feeBreakdown/feesUnknown entirely when no realizedPnl was resolved', () => {
    (exec as any).persistClosedTradeRecord(closeSignal(), {
      status: 'unknown', // unknown-outcome closes are recorded with best-known data
    });

    const trade = store.recordTrade.mock.calls[0][0] as TradeRecord;
    expect(trade.grossPnl).toBeUndefined();
    expect(trade.feeBreakdown).toBeUndefined();
    expect(trade.feesUnknown).toBeUndefined();
    expect(trade.realizedPnl).toBe(0);
    expect(trade.fees).toBe(0);
  });
});

describe('M5 — TradeRecord backward compatibility', () => {
  let tmpDir: string;
  let store: TradeHistoryStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pnl-wiring-'));
    store = new TradeHistoryStore({ baseDir: tmpDir, botId: 'legacy-test' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads a legacy row without the new PnL fields (no crash, absent fields stay absent)', () => {
    // Pre-M5 row shape: no grossPnl, no feeBreakdown, no feesUnknown.
    const legacy: TradeRecord = {
      id: 'legacy-1',
      botId: 'legacy-test',
      symbol: 'BTCUSDC',
      side: 'buy',
      entryPrice: 100,
      exitPrice: 110,
      size: 1,
      fees: 0,
      realizedPnl: 10, // legacy wrote GROSS here
      dex: 'jupiter-swap',
      openedAt: 0,
      closedAt: 1000,
      mode: 'live',
      status: 'confirmed',
    };
    store.recordTrade(legacy);

    const read = store.getTrades();
    expect(read).toHaveLength(1);
    expect(read[0]!.id).toBe('legacy-1');
    expect(read[0]!.realizedPnl).toBe(10);
    // New fields are absent on legacy rows — readers fall back to realizedPnl.
    expect(read[0]!.grossPnl).toBeUndefined();
    expect(read[0]!.feeBreakdown).toBeUndefined();
    expect(read[0]!.feesUnknown).toBeUndefined();

    // Stats do not crash on such records; the legacy identity holds:
    // netPnl = Σ realizedPnl(as gross) − Σ fees = 10 − 0.
    const stats = store.getStats();
    expect(stats.totalTrades).toBe(1);
    expect(stats.netPnl).toBe(10);
  });
});
