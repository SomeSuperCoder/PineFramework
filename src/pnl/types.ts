/**
 * PnL + fee domain types — the canonical contract for realized P&L math.
 *
 * This module is the SINGLE SOURCE OF TRUTH for PnL and fee aggregation in the
 * trading bot. Everything that reports a filled trade's profit (live executor,
 * adapters, backtest, stats) must derive its numbers from here — never inline
 * its own price×qty arithmetic.
 *
 * ## Money policy
 * Every amount is a `DecimalStr` (scaled decimal string) or an atomic-string
 * (`amountAtomic`, native token units). No IEEE754 floats are ever used for
 * money in this module (see `src/pnl/decimal.ts`).
 */

/** Scaled decimal string. Policy: NO floats on money — always this type. */
export type DecimalStr = string;

/** Position direction the realized PnL is attributed to. */
export type Side = 'LONG' | 'SHORT';

/**
 * One executed fill. Prices/quantities are the ANCHOR values for realized PnL
 * (the actual observed print, not a modeled estimate).
 */
export interface Fill {
  side: 'BUY' | 'SELL';
  qty: DecimalStr;
  fillPrice: DecimalStr;
  ts: string;
}

/**
 * Identifies a fee component.
 *
 * - `VENUE` / `PLATFORM` — bps/markup charges (DEX, aggregator, platform).
 * - `PRIORITY` / `BASE` / `JITO` — SOL-side fees (priority fee, base fee per
 *   signature).
 * - `JITO` is the Solana Jito MEV tip (spec `pnl-calculation`).
 * - `SLIPPAGE_MEMO` — slippage shortfall, reported INFORMATIONALLY ONLY. It
 *   is never a charged fee; see `RealizedPnl` anchor semantics.
 */
export type FeeKind = 'VENUE' | 'PLATFORM' | 'PRIORITY' | 'BASE' | 'JITO' | 'SLIPPAGE_MEMO';

/**
 * A single fee charge in native/atomic units (lamports for SOL, base units
 * for SPL tokens). For `tokenMint === 'quote'` the amount is already in quote
 * currency (bps-modeled fees) — atomic conversion is a no-op for quote.
 */
export interface FeeComponent {
  kind: FeeKind;
  tokenMint: string;
  amountAtomic: string;
}

/**
 * Token price metadata: US-Dollar price for one whole token plus its on-chain
 * decimals. Passed to the mint→quote conversion (`feeToQuote`).
 */
export interface TokenPrice {
  [mint: string]: {
    priceUsd: DecimalStr;
    decimals: number;
  };
}

/**
 * Result of aggregating a trade's realized PnL and its fees.
 *
 * ## The `anchor` semantics (READ — prevents double-counting venue/platform)
 * - When the gross is anchored on the **outAmount** (what the wallet actually
 *   exchanged), VENUE/PLATFORM/SLIPPAGE are already embedded inside outAmount.
 *   Only SOL-side fees (PRIORITY, BASE, JITO) are subtracted → `net`.
 * - When the gross is anchored on **fill prices**, the fill price does NOT
 *   include any fee, so every kind present (incl. VENUE/PLATFORM) reduces net.
 *
 * `feeBreakdown` is always the *display* breakdown in quote units of each kind;
 * `feesTotal` sums ALL kinds (reporting). `subtractedFromNet` lists exactly
 * which kinds were subtracted for this entry — the audit trail of the net.
 */
export interface RealizedPnl {
  side: 'LONG' | 'SHORT';
  /** Gross PnL in quote units directly from entry/exit fill prices. */
  gross: DecimalStr;
  /** SUM of ALL fee kinds (incl. display-only venue/platform/memo), quote units. */
  feesTotal: DecimalStr;
  /** gross minus ONLY the kinds listed in `subtractedFromNet` (quote units). */
  net: DecimalStr;
  /** Number of fills used (0, 1 or 2). */
  fills: number;
  /** Per-kind fee amounts converted to quote units (display/audit). */
  feeBreakdown: Partial<Record<FeeKind, DecimalStr>>;
  /** Which fee kinds were actually subtracted to compute `net` (the anchor seam). */
  subtractedFromNet: FeeKind[];
  /** Metadata describing the reliability of the fee numbers. */
  feeSource: {
    /** True when components were observed from a real execution. */
    observed?: boolean;
    /** Which backtest fee model produced the components (when not observed). */
    backtestFeeModel?: 'constant-tier' | 'flat-bps' | 'quote';
    /** True when fees could not be determined (no source, or no fills). */
    feesUnknown?: boolean;
  };
}

/**
 * Inputs from which the backtest derives fees. `solUsdPrice` is REQUIRED
 * (the old $150 hard-coded price is banned — the model carries it).
 *
 * @field priorityLamports — Jito/priority alloc per swap, in lamports.
 * @field baseLamports     — base fee per SIGNATURE, in lamports (default 5_000).
 *                           The model applies ×2 signatures per round trip.
 */
export interface BacktestFeeModel {
  tag: string;
  venueBps?: DecimalStr;
  platformBps?: DecimalStr;
  priorityLamports?: DecimalStr;
  baseLamports?: DecimalStr;
  /** SOL/USD price (STRING, no floats) for lamport→quote conversion. */
  solUsdPrice: DecimalStr;
}
