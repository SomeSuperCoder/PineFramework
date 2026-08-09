/**
 * The mint→quote conversion border + modeled (backtest) fee generation.
 *
 * `feeToQuote` is the ONE place in the codebase where a raw atomic amount
 * (lamports, SPL base units) becomes a quote-currency amount. It needs both
 * the token PRICE and its DECIMALS — costs live in the `TokenPrice` map
 * (price alone is not enough: 5_000 lamports ⇄ 0.000005 SOL requires
 * knowing SOL has 9 decimals).
 *
 * ## Mint codes
 * - `SOL_MINT` ('SOL') — lamport-based fees (PRIORITY/BASE/JITO). Requires a
 *   `TokenPrice['SOL']` entry { priceUsd, decimals: 9 }.
 * - `QUOTE_MINT` ('quote') — a fee that is already denominated in quote
 *   currency (bps-modeled venue/platform). Conversion is the identity: the
 *   fee amount is already what we want. A 'quote' component is NOT looked up
 *   in `TokenPrice` (its price is by definition 1 quote unit).
 */

import type { BacktestFeeModel, DecimalStr, FeeComponent, FeeKind, TokenPrice } from './types.js';
import { dAdd, dDiv, dMul, isZero, tenPow, ZERO } from './decimal.js';

/** Token mint used for SOL-denominated (lamport) fees. */
export const SOL_MINT = 'SOL';

/** Pseudo-mint for fees already expressed in quote currency. */
export const QUOTE_MINT = 'quote';

/** Basis points denominator: 10000 bps = 100%. */
const BPS_BASE: DecimalStr = '10000';

/** Base fee signatures per round-trip order (entry+exit), see `modelFees`. */
const SIGS_PER_ORDER = 2;

/** Default base fee per signature in lamports (Solana minimum). */
const DEFAULT_BASE_LAMPORTS: DecimalStr = '5000';

/**
 * Convert ONE fee component from its native/atomic units to quote units.
 *
 * - `mint === 'quote'` → identity: the amount IS the quote amount.
 * - otherwise        → amountAtomic / 10^decimals × priceUsd (exact string
 *   math; atomic division keeps enough precision, no floats).
 *
 * @throws if a non-quote mint has no TokenPrice entry — a missing price is a
 * caller bug that would silently understate fees; fail loud instead.
 */
export function feeToQuote(fee: FeeComponent, prices: TokenPrice): DecimalStr {
  if (fee.tokenMint === QUOTE_MINT) {
    // Already in quote currency — no conversion (10^0 × 1 quote unit).
    return fee.amountAtomic;
  }
  const info = prices[fee.tokenMint];
  if (!info) {
    throw new Error(
      `[pnl:feeToQuote] no price/decimals supplied for mint "${fee.tokenMint}" ` +
        `(supply a TokenPrice entry to convert "${fee.kind}" fee)`,
    );
  }
  const wholeTokens = dDiv(fee.amountAtomic, tenPow(info.decimals), 18);
  return dMul(wholeTokens, info.priceUsd);
}

/**
 * Convert an array of fee components into a per-kind breakdown in quote
 * units. Identical kinds are summed (a trade can carry multiple charges of
 * the same kind, e.g. several priority tips).
 */
export function feeBreakdownToQuote(
  components: FeeComponent[],
  prices: TokenPrice,
): Partial<Record<FeeKind, DecimalStr>> {
  const breakdown: Partial<Record<FeeKind, DecimalStr>> = {};
  for (const component of components) {
    const quote = feeToQuote(component, prices);
    breakdown[component.kind] = dAdd(breakdown[component.kind] ?? ZERO, quote);
  }
  return breakdown;
}

/**
 * Derive modeled (backtest) fee components from a `BacktestFeeModel`.
 *
 * mints: `venueBps`/`platformBps` become `'quote'`-denominated components
 * (bps × tradeValue — the backtest treats them as real charges; whether they
 * reduce net is decided downstream by `aggregateRealizedPnl`'s anchor). The
 * lamport-based kinds become `'SOL'` components with `amountAtomic` in
 * lamports: `priorityLamports` ×1 per order, `baseLamports` ×2 signatures.
 *
 * `order.side` is currently ignored by the fee math (reserved for
 * asymmetric fee models) — documented, not dead weight.
 */
export function modelFees(
  order: { tradeValue: DecimalStr; side: 'LONG' | 'SHORT' },
  model: BacktestFeeModel,
): FeeComponent[] {
  const components: FeeComponent[] = [];

  if (model.venueBps !== undefined && !isZero(model.venueBps)) {
    components.push({
      kind: 'VENUE',
      tokenMint: QUOTE_MINT,
      amountAtomic: dDiv(dMul(order.tradeValue, model.venueBps), BPS_BASE, 18),
    });
  }

  if (model.platformBps !== undefined && !isZero(model.platformBps)) {
    components.push({
      kind: 'PLATFORM',
      tokenMint: QUOTE_MINT,
      amountAtomic: dDiv(dMul(order.tradeValue, model.platformBps), BPS_BASE, 18),
    });
  }

  if (model.priorityLamports !== undefined && !isZero(model.priorityLamports)) {
    components.push({
      kind: 'PRIORITY',
      tokenMint: SOL_MINT,
      amountAtomic: model.priorityLamports,
    });
  }

  const baseLamports = model.baseLamports ?? DEFAULT_BASE_LAMPORTS;
  if (!isZero(baseLamports)) {
    components.push({
      kind: 'BASE',
      tokenMint: SOL_MINT,
      amountAtomic: dMul(baseLamports, String(SIGS_PER_ORDER)),
    });
  }

  return components;
}
