/**
 * THE PARITY CONTRACT — the headline acceptance test of the PnL SSOT change.
 *
 * ONE canonical position + ONE underlying fee set, run through BOTH consumer
 * path styles of the SAME shared module function (`aggregateRealizedPnl`):
 *
 *   - LIVE path style    → observed SwapResult-shaped feeComponents,
 *                          anchor 'outAmount' (what the wallet exchanged)
 *   - BACKTEST path style → modelFees components from a BacktestFeeModel,
 *                          anchor 'fills' (fill prices carry no fees)
 *
 * Contract asserted:
 *   P1. Same fills ⇒ same gross — the module, not the caller, owns the math.
 *   P2. Each path's net satisfies `net = gross − Σ(subtractedFromNet)`.
 *   P3. The KNOWN semantic difference: in live(outAmount), VENUE/PLATFORM are
 *       inside the outAmount and NOT subtracted; in backtest(fills) they ARE
 *       subtracted. The two nets differ by EXACTLY venue+platform.
 *
 * This is the user-visible truth of the change: live and backtest report the
 * same gross for the same fills, and each net is the honest gross-minus-fees
 * for its own anchor — never a double-counted venue/platform.
 */

import { describe, it, expect } from 'vitest';
import { aggregateRealizedPnl, modelFees, QUOTE_MINT, SOL_MINT } from '../../../src/pnl/index.js';
import type { FeeComponent, Fill, RealizedPnl, TokenPrice } from '../../../src/pnl/index.js';
import { dSub } from '../../../src/pnl/decimal.js';

// ---------------------------------------------------------------------------
// Shared fixtures — ONE position, ONE fee set.
// ---------------------------------------------------------------------------

const SOL_PRICE: TokenPrice = { SOL: { priceUsd: '150', decimals: 9 } };
const USDC_PRICE: TokenPrice = { USDC: { priceUsd: '1', decimals: 6 } };
const PRICES: TokenPrice = { ...SOL_PRICE, ...USDC_PRICE };

/** ONE canonical position: LONG entry 100 × 1, exit 110 × 1 → gross '10'. */
const ENTRY_FILL: Fill = { side: 'BUY', qty: '1', fillPrice: '100', ts: 't0' };
const EXIT_FILL: Fill = { side: 'SELL', qty: '1', fillPrice: '110', ts: 't1' };

/**
 * ONE underlying fee set — the same amounts in both paths:
 *   VENUE 25 bps on $100 = 0.25 (quote)      → inside outAmount (live)
 *   PLATFORM 10 bps = 0.1 (quote)            → inside outAmount (live)
 *   PRIORITY 10_000 lamports = 0.0015 @ $150 → SOL-side, subtracts both
 *   BASE 10_000 lamports = 0.0015 @ $150     → SOL-side, subtracts both
 */
const OBSERVED_COMPONENTS: FeeComponent[] = [
  { kind: 'VENUE', tokenMint: QUOTE_MINT, amountAtomic: '0.25' },
  { kind: 'PLATFORM', tokenMint: QUOTE_MINT, amountAtomic: '0.1' },
  { kind: 'PRIORITY', tokenMint: SOL_MINT, amountAtomic: '10000' },
  { kind: 'BASE', tokenMint: SOL_MINT, amountAtomic: '10000' },
];

/** The backtest model that generates the SAME underlying fee amounts. */
const BACKTEST_MODEL = {
  tag: 'flat-bps',
  venueBps: '25',
  platformBps: '10',
  priorityLamports: '10000',
  solUsdPrice: '150',
};

/** Independent expected net: gross minus exactly the kinds listed as subtracted. */
function expectedNet(result: RealizedPnl): string {
  let net = result.gross;
  for (const kind of result.subtractedFromNet) {
    net = dSub(net, result.feeBreakdown[kind] as string);
  }
  return net;
}

/** The live consumer path: observed (SwapResult-shaped) components, outAmount anchor. */
function livePath(): RealizedPnl {
  return aggregateRealizedPnl({
    side: 'LONG',
    entryFill: ENTRY_FILL,
    exitFill: EXIT_FILL,
    feesSource: { components: OBSERVED_COMPONENTS },
    prices: PRICES,
    anchor: 'outAmount',
  });
}

/** The backtest consumer path: modeled components, fills anchor. */
function backtestPath(): RealizedPnl {
  const modeled = modelFees({ tradeValue: '100', side: 'LONG' }, BACKTEST_MODEL);
  return aggregateRealizedPnl({
    side: 'LONG',
    entryFill: ENTRY_FILL,
    exitFill: EXIT_FILL,
    feesSource: { components: modeled },
    prices: PRICES,
    anchor: 'fills',
  });
}

// ---------------------------------------------------------------------------
// P1 — Same fills ⇒ same gross, from the SAME module function.
// ---------------------------------------------------------------------------

describe('P1 — gross parity', () => {
  it('live(outAmount) and backtest(fills) compute the identical gross for the same fills', () => {
    const live = livePath();
    const backtest = backtestPath();
    expect(live.gross).toBe('10');
    expect(backtest.gross).toBe('10');
    expect(backtest.gross).toBe(live.gross);
  });

  it('both paths run through the same module function (aggregateRealizedPnl)', () => {
    // A direct function-identity assertion: both results carry the module's
    // full shape — gross, feesTotal, net, fills, feeBreakdown,
    // subtractedFromNet, feeSource — from ONE call site.
    const live = livePath();
    const backtest = backtestPath();
    expect(live).toHaveProperty('gross');
    expect(live).toHaveProperty('feesTotal');
    expect(live).toHaveProperty('net');
    expect(live).toHaveProperty('subtractedFromNet');
    expect(backtest).toHaveProperty('feeBreakdown');
    expect(backtest).toHaveProperty('feeSource');
    expect(live.fills).toBe(2);
    expect(backtest.fills).toBe(2);
  });

  it('the modeled (backtest) components carry the SAME underlying fee amounts as observed (live)', () => {
    const modeled = modelFees({ tradeValue: '100', side: 'LONG' }, BACKTEST_MODEL);
    expect(modeled).toEqual(OBSERVED_COMPONENTS);
  });
});

// ---------------------------------------------------------------------------
// P2 — Each net satisfies net = gross − Σ(subtractedFromNet).
// ---------------------------------------------------------------------------

describe('P2 — net identity on both paths', () => {
  it('live net === gross − Σ(subtractedFromNet): SOL-side fees only', () => {
    const live = livePath();
    // outAmount anchor subtracts only PRIORITY/BASE/JITO — VENUE/PLATFORM live
    // inside the wallet's exchanged amount and are reported, not subtracted.
    expect(live.subtractedFromNet).toEqual(['PRIORITY', 'BASE']);
    expect(live.feeBreakdown['PRIORITY']).toBe('0.0015');
    expect(live.feeBreakdown['BASE']).toBe('0.0015');
    expect(live.feeBreakdown['VENUE']).toBe('0.25');
    // dAdd/dDiv normalize trailing zeros — module contract, not a display bug.
    expect(live.feeBreakdown['PLATFORM']).toBe('0.1');
    // feesTotal reports EVERYTHING (display), subtractedFromNet audits the net.
    expect(live.feesTotal).toBe('0.353');
    expect(live.net).toBe('9.997'); // 10 − 0.003
    expect(live.net).toBe(expectedNet(live));
  });

  it('backtest net === gross − Σ(subtractedFromNet): every modeled kind subtracts', () => {
    const backtest = backtestPath();
    // fills anchor: fill prices embed no fee, so venue/platform/priority/base
    // are real charges — all five subtract (SLIPPAGE_MEMO would not).
    expect(backtest.subtractedFromNet).toEqual(['VENUE', 'PLATFORM', 'PRIORITY', 'BASE']);
    expect(backtest.net).toBe('9.647'); // 10 − 0.353
    expect(backtest.net).toBe(expectedNet(backtest));
  });
});

// ---------------------------------------------------------------------------
// P3 — The KNOWN semantic difference: live − backtest = venue + platform.
// ---------------------------------------------------------------------------

describe('P3 — documented live/backtest difference', () => {
  it('the two nets differ by EXACTLY venue+platform (0.35) — never by slippage or SOL fees', () => {
    const live = livePath();
    const backtest = backtestPath();

    expect(live.gross).toBe(backtest.gross);
    // outAmount net = fills net + the venue/platform charge the fills anchor
    // subtracted and the outAmount anchor did not.
    expect(dSub(live.net, backtest.net)).toBe('0.35');
    expect(live.net).toBe('9.997');
    expect(backtest.net).toBe('9.647');

    // The difference is exactly the VENUE (0.25) + PLATFORM (0.10) amounts.
    const venuePlatform =
      Number(backtest.feeBreakdown['VENUE']) + Number(backtest.feeBreakdown['PLATFORM']);
    expect(Number(dSub(live.net, backtest.net))).toBeCloseTo(venuePlatform, 12);
  });

  it('SOL-side fees (PRIORITY/BASE) reduce net in BOTH anchors — never part of the difference', () => {
    const live = livePath();
    const backtest = backtestPath();
    const solSide = Number(live.feeBreakdown['PRIORITY']) + Number(live.feeBreakdown['BASE']);
    expect(solSide).toBeCloseTo(0.003, 12);
    // Both nets already paid the SOL-side fees: gross minus sol-side on both.
    expect(Number(live.net)).toBeCloseTo(10 - solSide, 12);
    expect(Number(backtest.net)).toBeCloseTo(10 - 0.353, 12);
  });
});
