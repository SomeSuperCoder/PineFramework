/**
 * Contract test suite for src/pnl — the SINGLE SOURCE OF TRUTH for PnL + fee math.
 *
 * Proves the spec (openspec/changes/pnl-single-source-of-truth/specs/pnl-calculation/spec.md)
 * and the module's own documented anchor semantics. This file is the PnL contract:
 * if a consumer inlines its own price×qty arithmetic or double-counts venue/platform
 * fees, these tests describe the behavior that must hold.
 *
 * File is `.test.ts` (NOT `.spec.ts`) because vitest.config.ts includes
 * `tests/**\/*.test.ts` only.
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateRealizedPnl,
  feeBreakdownToQuote,
  feeToQuote,
  feeTotal,
  grossPnlLong,
  grossPnlShort,
  modelFees,
  netPnl,
  QUOTE_MINT,
  SOL_MINT_CODE,
} from '../../../src/pnl/index.js';
import type {
  FeeComponent,
  FeeKind,
  Fill,
  RealizedPnl,
  TokenPrice,
} from '../../../src/pnl/index.js';
// Decimal arithmetic is importable directly by path (documented in decimal.ts).
import { dAdd, dCompare, dDiv, dMul, dSub, tenPow, ZERO } from '../../../src/pnl/decimal.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** The exact FeeKind taxonomy (F7). Kept as the module contract. */
/** Contextual typing of these literals against FeeKind[] doubles as the compile-time guard.
 *  Every member must still be a valid FeeKind (guards the JIT rename). */
const FEE_KINDS: readonly FeeKind[] = [
  'VENUE',
  'PLATFORM',
  'PRIORITY',
  'BASE',
  'JITO',
  'SLIPPAGE_MEMO',
];

/** Kinds subtracted from net when gross is anchored on fill prices (aggregate.ts SUBTRACTED_FILLS). */
const FILLS_SUBTRACTED: readonly FeeKind[] = ['VENUE', 'PLATFORM', 'PRIORITY', 'BASE', 'JITO'];
/** Kinds subtracted from net when gross is anchored on outAmount (aggregate.ts SUBTRACTED_OUT_AMOUNT). */
const OUT_AMOUNT_SUBTRACTED: readonly FeeKind[] = ['PRIORITY', 'BASE', 'JITO'];

const SOL_PRICE: TokenPrice = { SOL: { priceUsd: '150', decimals: 9 } };
const USDC_PRICE: TokenPrice = { USDC: { priceUsd: '1', decimals: 6 } };
const PRICES: TokenPrice = { ...SOL_PRICE, ...USDC_PRICE };

function fill(side: 'BUY' | 'SELL', fillPrice: string, qty: string, ts = 't0'): Fill {
  return { side, fillPrice, qty, ts };
}

/** LONG entry 100×1, exit 110×1 → gross '10'. */
const LONG_FILLS = { entryFill: fill('BUY', '100', '1'), exitFill: fill('SELL', '110', '1') };

/** Sum an iterable of decimal strings with the module's exact add. */
function sumDecs(values: Iterable<string>): string {
  let acc = ZERO;
  for (const v of values) acc = dAdd(acc, v);
  return acc;
}

/** Independent expected net: gross minus exactly the kinds listed as subtracted. */
function expectedNet(result: RealizedPnl): string {
  let net = result.gross;
  for (const kind of result.subtractedFromNet) {
    net = dSub(net, result.feeBreakdown[kind] as string);
  }
  return net;
}

// ---------------------------------------------------------------------------
// F1 — Singular math: same fills → same gross regardless of consumer style.
// ---------------------------------------------------------------------------

describe('F1 singular math', () => {
  it('LONG gross is identical via direct core math and via the shared runner (both anchors)', () => {
    const direct = grossPnlLong('110', '100', '1');
    expect(direct).toBe('10');

    for (const anchor of ['fills', 'outAmount'] as const) {
      const viaRunner = aggregateRealizedPnl({
        side: 'LONG',
        ...LONG_FILLS,
        feesSource: { components: [] },
        prices: PRICES,
        anchor,
      });
      expect(viaRunner.gross).toBe(direct);
    }
  });

  it('SHORT gross is identical via direct core math and via the shared runner', () => {
    const direct = grossPnlShort('90', '100', '2');
    expect(direct).toBe('20');

    const viaRunner = aggregateRealizedPnl({
      side: 'SHORT',
      entryFill: fill('SELL', '100', '2'),
      exitFill: fill('BUY', '90', '2'),
      feesSource: 'none',
      prices: PRICES,
    });
    expect(viaRunner.gross).toBe(direct);
  });

  it('gross is unaffected by fees — fee components never leak into gross', () => {
    const withFees = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: {
        components: [
          { kind: 'VENUE', tokenMint: QUOTE_MINT, amountAtomic: '0.25' },
          { kind: 'PRIORITY', tokenMint: SOL_MINT_CODE, amountAtomic: '10000' },
        ],
      },
      prices: PRICES,
    });
    expect(withFees.gross).toBe('10');
  });
});

// ---------------------------------------------------------------------------
// F2 — Identity property: net === gross − subtracted fees (audited via
//      subtractedFromNet). Fuzzed with a deterministic seed (≥200 cases).
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) so the fuzz is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randDec(r: () => number, min: number, max: number, frac: number): string {
  return (min + r() * (max - min)).toFixed(frac);
}

function randFeeComponent(r: () => number): FeeComponent {
  const kind = FEE_KINDS[Math.floor(r() * FEE_KINDS.length)];
  if (kind === 'VENUE' || kind === 'PLATFORM') {
    // ~30% denominated in a 6-decimal token, rest quote-denominated.
    if (r() < 0.3) {
      return { kind, tokenMint: 'USDC', amountAtomic: String(Math.floor(r() * 100_000_000) + 1) };
    }
    return { kind, tokenMint: QUOTE_MINT, amountAtomic: randDec(r, 0.001, 5, 4) };
  }
  if (kind === 'SLIPPAGE_MEMO') {
    return { kind, tokenMint: QUOTE_MINT, amountAtomic: randDec(r, 0.001, 5, 4) };
  }
  // PRIORITY / BASE / JITO — SOL lamports.
  return { kind, tokenMint: SOL_MINT_CODE, amountAtomic: String(Math.floor(r() * 1_000_000) + 1) };
}

describe('F2 identity property', () => {
  it('net === gross − subtractedFromNet, feesTotal === Σ breakdown, anchor subsets hold — 250 deterministic fuzz cases', () => {
    const r = mulberry32(0x5eed_f2);
    const NUM_CASES = 250;

    for (let i = 0; i < NUM_CASES; i++) {
      const side: 'LONG' | 'SHORT' = r() < 0.5 ? 'LONG' : 'SHORT';
      const entry = randDec(r, 0.01, 1000, 2);
      const exit = randDec(r, 0.01, 1000, 2);
      const qty = randDec(r, 0.001, 100, 3);
      const anchor: 'fills' | 'outAmount' = r() < 0.5 ? 'fills' : 'outAmount';

      const componentCount = Math.floor(r() * 5); // 0..4 components
      const components: FeeComponent[] = [];
      for (let c = 0; c < componentCount; c++) components.push(randFeeComponent(r));

      const result = aggregateRealizedPnl({
        side,
        entryFill: fill(side === 'LONG' ? 'BUY' : 'SELL', entry, qty),
        exitFill: fill(side === 'LONG' ? 'SELL' : 'BUY', exit, qty),
        feesSource: { components },
        prices: PRICES,
        anchor,
      });

      // 1) Identity: net === gross − Σ(subtractedFromNet).
      expect(dCompare(result.net, expectedNet(result))).toBe(0);

      // 2) feesTotal === Σ of every breakdown value (reporting total).
      expect(
        dCompare(
          result.feesTotal,
          sumDecs(Object.values(result.feeBreakdown).filter((v) => v !== undefined)),
        ),
      ).toBe(0);

      // 3) Each breakdown value equals the per-kind sum of feeToQuote conversions.
      for (const kind of FEE_KINDS) {
        const kindComponents = components.filter((c) => c.kind === kind);
        if (kindComponents.length === 0) {
          expect(result.feeBreakdown[kind]).toBeUndefined();
        } else {
          const expectedQuote = sumDecs(kindComponents.map((c) => feeToQuote(c, PRICES)));
          expect(dCompare(result.feeBreakdown[kind] as string, expectedQuote)).toBe(0);
        }
      }

      // 4) subtractedFromNet is exactly the anchor rule applied to present kinds.
      const rule = anchor === 'outAmount' ? OUT_AMOUNT_SUBTRACTED : FILLS_SUBTRACTED;
      const expectedSubtracted = rule.filter((kind) => result.feeBreakdown[kind] !== undefined);
      expect(result.subtractedFromNet).toEqual(expectedSubtracted);

      // 5) Both fills present → fills count 2.
      expect(result.fills).toBe(2);
    }
  });

  it('zero-fee trade: net === gross and subtractedFromNet is empty', () => {
    const result = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: { components: [] },
      prices: PRICES,
    });
    expect(result.net).toBe(result.gross);
    expect(result.net).toBe('10');
    expect(result.feesTotal).toBe('0');
    expect(result.subtractedFromNet).toEqual([]);
  });

  it("feesSource 'none' still satisfies the identity but flags feesUnknown", () => {
    const result = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: 'none',
      prices: PRICES,
    });
    expect(result.net).toBe(result.gross);
    expect(result.feesTotal).toBe('0');
    expect(result.feeSource.feesUnknown).toBe(true);
    expect(result.feeSource.observed).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F3 — The anchor seam (the critical one).
// ---------------------------------------------------------------------------

/** A breakdown containing EVERY FeeKind. */
const ALL_KIND_COMPONENTS: FeeComponent[] = [
  { kind: 'VENUE', tokenMint: QUOTE_MINT, amountAtomic: '0.25' }, // 25 bps on $100
  { kind: 'PLATFORM', tokenMint: QUOTE_MINT, amountAtomic: '0.10' },
  { kind: 'PRIORITY', tokenMint: SOL_MINT_CODE, amountAtomic: '10000' }, // 0.0015 @ $150
  { kind: 'BASE', tokenMint: SOL_MINT_CODE, amountAtomic: '10000' }, // 0.0015 @ $150
  { kind: 'JITO', tokenMint: SOL_MINT_CODE, amountAtomic: '10000' }, // 0.0015 @ $150
  { kind: 'SLIPPAGE_MEMO', tokenMint: QUOTE_MINT, amountAtomic: '0.50' }, // informational only
];

describe('F3 anchor seam', () => {
  it('outAmount anchor: only PRIORITY/BASE/JITO reduce net; VENUE/PLATFORM/SLIPPAGE_MEMO never change net', () => {
    const result = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: { components: ALL_KIND_COMPONENTS },
      prices: PRICES,
      anchor: 'outAmount',
    });

    // SOL-side total = 3 × 0.0015 = 0.0045; gross 10 → net 9.9955.
    expect(result.subtractedFromNet).toEqual(['PRIORITY', 'BASE', 'JITO']);
    expect(result.net).toBe('9.9955');
    // Reporting still shows every kind.
    expect(Object.keys(result.feeBreakdown).sort()).toEqual([
      'BASE',
      'JITO',
      'PLATFORM',
      'PRIORITY',
      'SLIPPAGE_MEMO',
      'VENUE',
    ]);
    expect(result.feesTotal).toBe('0.8545');
  });

  it('outAmount anchor: adding/removing VENUE, PLATFORM, SLIPPAGE_MEMO changes feesTotal but NEVER net', () => {
    const solOnly = [ALL_KIND_COMPONENTS[2], ALL_KIND_COMPONENTS[3], ALL_KIND_COMPONENTS[4]];
    const withoutQuoteKinds = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: { components: solOnly },
      prices: PRICES,
      anchor: 'outAmount',
    });
    const withQuoteKinds = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: { components: ALL_KIND_COMPONENTS },
      prices: PRICES,
      anchor: 'outAmount',
    });

    // Net identical (no double-counting of venue/platform/slippage).
    expect(withQuoteKinds.net).toBe(withoutQuoteKinds.net);
    expect(withQuoteKinds.net).toBe('9.9955');
    expect(withQuoteKinds.subtractedFromNet).toEqual(withoutQuoteKinds.subtractedFromNet);
    // But the display total and breakdown DO grow.
    expect(dCompare(withQuoteKinds.feesTotal, withoutQuoteKinds.feesTotal)).toBe(1);
    expect(withQuoteKinds.feesTotal).toBe('0.8545');
  });

  it('fills anchor: every charged kind (incl. VENUE/PLATFORM) reduces net; SLIPPAGE_MEMO stays informational', () => {
    const result = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: { components: ALL_KIND_COMPONENTS },
      prices: PRICES,
      anchor: 'fills',
    });

    // VENUE+PLATFORM+PRIORITY+BASE+JITO = 0.25+0.10+0.0045 = 0.3545 → net 9.6455.
    expect(result.subtractedFromNet).toEqual(['VENUE', 'PLATFORM', 'PRIORITY', 'BASE', 'JITO']);
    expect(result.net).toBe('9.6455');
    expect(result.feesTotal).toBe('0.8545');

    // SLIPPAGE_MEMO is reported but never subtracted (spec: informational only).
    expect(result.feeBreakdown['SLIPPAGE_MEMO']).toBe('0.5');
    expect(result.subtractedFromNet).not.toContain('SLIPPAGE_MEMO');
  });

  it('fills vs outAmount differ exactly by the venue/platform amount — same gross, different net', () => {
    const fillsResult = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: { components: ALL_KIND_COMPONENTS },
      prices: PRICES,
      anchor: 'fills',
    });
    const outResult = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: { components: ALL_KIND_COMPONENTS },
      prices: PRICES,
      anchor: 'outAmount',
    });

    expect(fillsResult.gross).toBe(outResult.gross);
    // outAmount net is fills net plus the venue/platform charge (0.35): the
    // fills anchor subtracts venue/platform, the outAmount anchor does not.
    expect(dSub(outResult.net, fillsResult.net)).toBe('0.35');
  });
});

// ---------------------------------------------------------------------------
// F4 — Fixed fixtures with known-good expected values.
// ---------------------------------------------------------------------------

describe('F4 fixed fixtures', () => {
  it('buy-all-in winner: LONG 100→110×1, fills anchor, venue 25bps, base 2×5000 lamports SOL@$150', () => {
    // Modeled fees: venue 25bps on $100 trade value + base fee (default 5000 lamports × 2 sigs).
    const components = modelFees(
      { tradeValue: '100', side: 'LONG' },
      { tag: 'flat-bps', venueBps: '25', solUsdPrice: '150' },
    );
    expect(components).toEqual([
      { kind: 'VENUE', tokenMint: QUOTE_MINT, amountAtomic: '0.25' },
      { kind: 'BASE', tokenMint: SOL_MINT_CODE, amountAtomic: '10000' },
    ]);

    const result = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: { components },
      prices: PRICES,
      anchor: 'fills',
    });

    expect(result.gross).toBe('10');
    // base = 10000 lamports / 1e9 × $150 = 0.0015
    expect(result.feeBreakdown['BASE']).toBe('0.0015');
    expect(result.feesTotal).toBe('0.2515');
    expect(result.subtractedFromNet).toEqual(['VENUE', 'BASE']);
    expect(result.net).toBe('9.7485'); // 10 − 0.2515
    expect(result.net).toBe(expectedNet(result));
  });

  it('partial fills (2 entry fills, 1 exit): consumer passes the weighted-average entry — gross uses avg qty', () => {
    // Two entry fills at 100 (qty 0.5) and 102 (qty 0.5) → avg entry (100·0.5 + 102·0.5)/1 = 101.
    const avgEntryFill = fill('BUY', '101', '1');
    const result = aggregateRealizedPnl({
      side: 'LONG',
      entryFill: avgEntryFill,
      exitFill: fill('SELL', '110', '1'),
      feesSource: { components: [] },
      prices: PRICES,
    });
    expect(result.gross).toBe('9'); // (110 − 101) × 1
    expect(result.fills).toBe(2);
  });

  it('stop-big-loss: fees exceed gross → net is negative beyond gross', () => {
    const components = modelFees(
      { tradeValue: '100', side: 'LONG' },
      { tag: 'flat-bps', venueBps: '200', solUsdPrice: '150' },
    );
    const result = aggregateRealizedPnl({
      side: 'LONG',
      entryFill: fill('BUY', '100', '1'),
      exitFill: fill('SELL', '99', '1'), // gross = −1
      feesSource: { components },
      prices: PRICES,
      anchor: 'fills',
    });

    expect(result.gross).toBe('-1');
    expect(result.feesTotal).toBe('2.0015'); // 2.00 venue + 0.0015 base
    expect(dCompare(result.net, result.gross)).toBe(-1); // net < gross
    expect(dCompare(result.net, '0')).toBe(-1); // net negative
    expect(result.net).toBe('-3.0015');
  });

  it('zero-fee trade: no components → feesTotal 0 and net === gross', () => {
    const result = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: { components: [] },
      prices: PRICES,
    });
    expect(result.feesTotal).toBe('0');
    expect(result.net).toBe(result.gross);
    expect(result.net).toBe('10');
    expect(result.feeSource.observed).toBe(true);
    expect(result.feeSource.feesUnknown).toBeUndefined();
  });

  it('SLIPPAGE_MEMO-only in outAmount anchor: net unchanged', () => {
    const result = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: {
        components: [{ kind: 'SLIPPAGE_MEMO', tokenMint: QUOTE_MINT, amountAtomic: '0.50' }],
      },
      prices: PRICES,
      anchor: 'outAmount',
    });
    expect(result.net).toBe(result.gross);
    expect(result.net).toBe('10');
    expect(result.feesTotal).toBe('0.5');
    expect(result.subtractedFromNet).toEqual([]);
    expect(result.feeBreakdown['SLIPPAGE_MEMO']).toBe('0.5');
  });
});

// ---------------------------------------------------------------------------
// F5 — Fill absence.
// ---------------------------------------------------------------------------

describe('F5 fill absence', () => {
  it('no fills → gross 0, net 0, feesUnknown true, fills 0 (even with components supplied)', () => {
    const result = aggregateRealizedPnl({
      side: 'LONG',
      feesSource: { components: ALL_KIND_COMPONENTS },
      prices: PRICES,
    });
    expect(result.gross).toBe('0');
    expect(result.net).toBe('0');
    expect(result.fills).toBe(0);
    expect(result.feeSource.feesUnknown).toBe(true);
    // Fees may still be reported for inspection but never subtracted from a 0 gross.
    expect(result.feesTotal).toBe('0.8545');
    // Documented contract (types.ts): subtractedFromNet = "which fee kinds were
    // ACTUALLY subtracted to compute net". Nothing is subtracted here (net is
    // hard-pinned to gross 0), so the audit list MUST be empty and the identity
    // net === gross − Σ(subtractedFromNet) MUST hold.
    expect(result.subtractedFromNet).toEqual([]);
    expect(expectedNet(result)).toBe(result.net);
  });

  it('one fill only (unrealized leg) → gross 0, net 0, feesUnknown true, fills 1', () => {
    const result = aggregateRealizedPnl({
      side: 'LONG',
      entryFill: fill('BUY', '100', '1'),
      feesSource: { components: [] },
      prices: PRICES,
    });
    expect(result.fills).toBe(1);
    expect(result.gross).toBe('0');
    expect(result.net).toBe('0');
    expect(result.feeSource.feesUnknown).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F6 — Fee conversion boundary.
// ---------------------------------------------------------------------------

describe('F6 fee conversion boundary', () => {
  it('converts lamports (decimals 9) exactly: 5000 lamports @ $150 = 0.00075', () => {
    expect(
      feeToQuote({ kind: 'PRIORITY', tokenMint: SOL_MINT_CODE, amountAtomic: '5000' }, SOL_PRICE),
    ).toBe('0.00075');
    expect(
      feeToQuote({ kind: 'JITO', tokenMint: SOL_MINT_CODE, amountAtomic: '10000' }, SOL_PRICE),
    ).toBe('0.0015');
  });

  it('converts a 6-decimal token feeAmount exactly: 1_000_000 base units @ $1 = 1', () => {
    expect(
      feeToQuote({ kind: 'VENUE', tokenMint: 'USDC', amountAtomic: '1000000' }, USDC_PRICE),
    ).toBe('1');
  });

  it('quote-denominated components are the identity (no price lookup needed)', () => {
    expect(feeToQuote({ kind: 'VENUE', tokenMint: QUOTE_MINT, amountAtomic: '0.25' }, {})).toBe(
      '0.25',
    );
    expect(
      feeToQuote({ kind: 'SLIPPAGE_MEMO', tokenMint: QUOTE_MINT, amountAtomic: '0.50' }, {}),
    ).toBe('0.50');
  });

  it('throws on a missing TokenPrice entry — a missing price is a caller bug, fail loud', () => {
    expect(() =>
      feeToQuote({ kind: 'PRIORITY', tokenMint: SOL_MINT_CODE, amountAtomic: '1' }, {}),
    ).toThrow(/no price\/decimals supplied for mint "SOL"/);
    // Same failure propagates through the shared runner.
    expect(() =>
      aggregateRealizedPnl({
        side: 'LONG',
        ...LONG_FILLS,
        feesSource: {
          components: [{ kind: 'BASE', tokenMint: SOL_MINT_CODE, amountAtomic: '10000' }],
        },
        prices: {}, // SOL missing → must throw, never silently understate fees
      }),
    ).toThrow(/no price\/decimals supplied/);
  });
});

// ---------------------------------------------------------------------------
// F7 — Taxonomy + fee total == converted components.
// ---------------------------------------------------------------------------

describe('F7 taxonomy', () => {
  it('FeeKind taxonomy is exactly VENUE, PLATFORM, PRIORITY, BASE, JITO, SLIPPAGE_MEMO', () => {
    expect(FEE_KINDS).toEqual(['VENUE', 'PLATFORM', 'PRIORITY', 'BASE', 'JITO', 'SLIPPAGE_MEMO']);
    // Every kind round-trips through the breakdown converter.
    for (const kind of FEE_KINDS) {
      const component: FeeComponent = { kind, tokenMint: QUOTE_MINT, amountAtomic: '0.10' };
      const breakdown = feeBreakdownToQuote([component], PRICES);
      expect(breakdown[kind]).toBe('0.1'); // dAdd normalizes trailing zeros
    }
  });

  it('JITO is a real, SOL-side kind: it appears in the breakdown and reduces net in BOTH anchors', () => {
    const components: FeeComponent[] = [
      { kind: 'JITO', tokenMint: SOL_MINT_CODE, amountAtomic: '10000' },
    ];
    for (const anchor of ['fills', 'outAmount'] as const) {
      const result = aggregateRealizedPnl({
        side: 'LONG',
        ...LONG_FILLS,
        feesSource: { components },
        prices: PRICES,
        anchor,
      });
      expect(result.feeBreakdown['JITO']).toBe('0.0015');
      expect(result.subtractedFromNet).toContain('JITO');
      expect(result.net).toBe('9.9985'); // 10 − 0.0015
    }
  });

  it('feesTotal === Σ of feeToQuote conversions (aggregate, feeTotal, and manual sum agree)', () => {
    const components: FeeComponent[] = [
      { kind: 'VENUE', tokenMint: QUOTE_MINT, amountAtomic: '0.25' },
      { kind: 'PLATFORM', tokenMint: QUOTE_MINT, amountAtomic: '0.10' },
      { kind: 'PRIORITY', tokenMint: SOL_MINT_CODE, amountAtomic: '10000' },
      { kind: 'BASE', tokenMint: SOL_MINT_CODE, amountAtomic: '10000' },
    ];
    const expectedManual = sumDecs(components.map((c) => feeToQuote(c, PRICES))); // 0.25+0.10+0.0015+0.0015
    expect(expectedManual).toBe('0.353');

    const breakdown = feeBreakdownToQuote(components, PRICES);
    expect(feeTotal(breakdown)).toBe('0.353');

    const result = aggregateRealizedPnl({
      side: 'LONG',
      ...LONG_FILLS,
      feesSource: { components },
      prices: PRICES,
      anchor: 'fills',
    });
    expect(result.feesTotal).toBe('0.353');
    expect(result.net).toBe('9.647'); // 10 − 0.353
  });
});

// ---------------------------------------------------------------------------
// F8 — Decimal truth: no IEEE754 artifacts on the money path.
// ---------------------------------------------------------------------------

describe('F8 decimal truth', () => {
  it('classic float-drift cases hold exactly in DecimalStr space', () => {
    expect(dAdd('0.1', '0.2')).toBe('0.3'); // not 0.30000000000000004
    expect(dAdd('0.1', '0.7')).toBe('0.8');
    expect(dSub('1', '0.9')).toBe('0.1');
    expect(dSub('0.3', '0.1')).toBe('0.2');
    expect(dMul('0.1', '0.2')).toBe('0.02');
    expect(dMul('1.10', '100')).toBe('110');
  });

  it('module arithmetic composes without float artifacts', () => {
    // (0.3 − 0.1) × 1 via the same path a consumer uses.
    expect(grossPnlLong('0.3', '0.1', '1')).toBe('0.2');
    expect(netPnl('0.3', '0.1')).toBe('0.2');
    // Division is exact where a precision is meaningful.
    expect(dDiv('1', '4', 2)).toBe('0.25');
    expect(dDiv('1', '3', 2)).toBe('0.33'); // half-away-from-zero
    expect(dDiv('2', '3', 2)).toBe('0.67');
    expect(tenPow(9)).toBe('1000000000');
    // feeToQuote of lamports is exact — no 1e-7-style float residue.
    expect(
      feeToQuote({ kind: 'BASE', tokenMint: SOL_MINT_CODE, amountAtomic: '5000' }, SOL_PRICE),
    ).toBe('0.00075');
  });
});
