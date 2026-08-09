/**
 * Pluggable DEX adapter interface for live trading.
 *
 * Each DEX implements this interface to provide quote, swap, balance,
 * and transaction status operations. Commission and slippage models
 * are part of the implementation, ensuring consistency between live
 * trading, backtesting, and auto-selection.
 *
 * @module trading
 */

import { TOKEN_MINTS } from '../token-registry.js';
import { QUOTE_MINT, SOL_MINT } from '../../pnl/index.js';
import type { FeeComponent } from '../../pnl/index.js';

/**
 * A quote for a potential swap.
 */
export interface Quote {
  /** Input token mint address. */
  inputMint: string;
  /** Output token mint address. */
  outputMint: string;
  /** Input amount in smallest units (lamports). */
  inAmount: string;
  /** Expected output amount in smallest units. */
  outAmount: string;
  /** Price impact percentage. */
  priceImpactPct: number;
  /**
   * Route information (human-readable).
   * Optional — prefer routePlan for API requests.
   */
  route?: string;
  /** Slippage in basis points used for this quote. */
  slippageBps: number;
  /** Fee in basis points for this route. */
  feeBps: number;
  /**
   * Route plan array from Jupiter API v6.
   * Preserves the original route plan for swap requests.
   * Optional for backward compatibility with other adapters.
   */
  routePlan?: unknown[];
  /**
   * Raw /quote API response, passed verbatim to /swap.
   * Jupiter's designed flow — the /swap endpoint expects the exact
   * quoteResponse object returned by /quote. Optional for backward
   * compatibility with Quotes constructed outside this adapter.
   */
  rawQuoteResponse?: unknown;
  /** Minimum output after slippage, returned by Jupiter v1 /quote. */
  otherAmountThreshold?: string;
  /** Swap mode (ExactIn/ExactOut), returned by Jupiter v1 /quote. */
  swapMode?: string;
}

/**
 * Result of a executed swap.
 */
export interface SwapResult {
  /** Whether the swap succeeded. */
  success: boolean;
  /**
   * Transaction signature, when one was obtained.
   *
   * Always present on success. May also be present on failure when the
   * swap's transaction was accepted by the RPC but confirmation failed or
   * timed out — callers can verify on-chain status rather than assume no
   * swap occurred (no-double-sell close retry rule).
   */
  signature?: string;
  /** Input amount that was swapped. */
  inputAmount: string;
  /** Output amount received. */
  outputAmount: string;
  /**
   * Fee paid in the input token (legacy display field).
   *
   * Present ONLY when the input-token fee was observable from the exchange
   * response (VENUE/PLATFORM components denominated in the input mint). When
   * fee data is missing it is OMITTED — never '0' — and `feeUnknown` is set
   * instead, so callers never mistake "unknown" for "free" (M4).
   */
  fee?: string;
  /**
   * Canonical fee components captured from the real execution (atomic units:
   * lamports for SOL, base units for SPL tokens).
   *
   * Always present — empty when the exchange response surfaced no fee data
   * (see `feeUnknown`). Consumed by the live-executor PnL wiring (M5) through
   * pnl's `feeBreakdownToQuote`/`feeToQuote`.
   */
  feeComponents: FeeComponent[];
  /**
   * True when fee data could NOT be observed from the exchange response — the
   * variable fee layers (VENUE/PLATFORM/PRIORITY) are unknown and were NEVER
   * fabricated. The protocol-constant BASE component may still be present.
   */
  feeUnknown?: boolean;
  /** Error message if failed. */
  error?: string;
}

/**
 * Current balance for a token.
 */
export interface TokenBalance {
  /** Token mint address. */
  mint: string;
  /** Balance in smallest units. */
  amount: string;
  /** Number of decimals for this token. */
  decimals: number;
}

/**
 * Transaction status.
 */
export type TxStatus = 'confirmed' | 'failed' | 'unknown';

/**
 * Commission model for a DEX.
 */
export interface CommissionModel {
  /** Name of the commission model (e.g., "jupiter-swap", "jupiter-ultra"). */
  name: string;
  /** Base fee in basis points. */
  feeBps: number;
  /** Whether fee varies by route. */
  variable: boolean;
  /** Description of how fees are calculated. */
  description: string;
}

/**
 * Slippage configuration.
 */
export interface SlippageConfig {
  /** Slippage tolerance in basis points. */
  bps: number;
  /** Whether slippage is configurable. */
  configurable: boolean;
}

// ---------------------------------------------------------------------------
// Real fee capture (M4) — canonical FeeComponent[] from live exchange responses.
// Shared by every DEX adapter so fee semantics stay identical across DEXs.
// ---------------------------------------------------------------------------

/** Native SOL mint (wrapped SOL) — venue fees charged in SOL are normalized to
 *  the pnl `SOL_MINT` code so every lamport fee converts through the one
 *  canonical SOL entry (pnl's feeToQuote expects a TokenPrice['SOL'] entry). */
const NATIVE_SOL_MINT = TOKEN_MINTS.SOL;

/** Solana base fee per signature in lamports (protocol constant). */
const BASE_FEE_LAMPORTS_PER_SIG = 5000n;

/** Signatures per swap — a Jupiter swap transaction carries 2 (user + fee payer). */
const SIGS_PER_SWAP = 2n;

/**
 * Fee-mint whitelist (Security F2): a fee component may only be denominated in
 * SOL ('SOL'), the quote pseudo-mint ('quote' — identity conversion), or a
 * token registered in the canonical registry. Anything else (a compromised or
 * unexpected Jupiter response mint) is DROPPED — a raw foreign address never
 * flows into PnL.
 */
const ALLOWED_FEE_MINTS: ReadonlySet<string> = new Set([
  SOL_MINT,
  QUOTE_MINT,
  ...Object.values(TOKEN_MINTS),
]);

/**
 * Absolute cap for SOL-side lamport fees (PRIORITY/BASE/JITO) when the swap
 * touches SOL on neither side (no atomic cross-mint comparison exists). 10 SOL
 * in lamports is far above any real priority/base fee — an amount above it is
 * a corrupt/absurd response and is dropped (Security F2).
 */
const MAX_LAMPORT_FEE_ATOMS = 10_000_000_000n; // 10 SOL

/** Swap-size context used to clamp extracted fee amounts (Security F2). */
interface FeeSanitizeCtx {
  inputMint: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
}

/**
 * Validate one extracted fee component at the trust boundary (Security F2):
 * (a) mint whitelist — unknown/foreign mints are dropped; (b) amount clamps —
 * a fee may never exceed the swap's atomic size in the SAME mint, and SOL-side
 * lamport fees are capped generously; malformed/absent amounts are dropped.
 * Returns null when the component must not flow into PnL.
 */
function sanitizeFeeComponent(
  component: FeeComponent,
  ctx: FeeSanitizeCtx,
): FeeComponent | null {
  if (
    component.tokenMint !== SOL_MINT &&
    component.tokenMint !== QUOTE_MINT &&
    !ALLOWED_FEE_MINTS.has(component.tokenMint)
  ) {
    return null;
  }
  let amount: bigint;
  try {
    amount = BigInt(component.amountAtomic);
  } catch {
    return null; // malformed amount — never fabricate, never crash the swap
  }
  if (amount <= 0n) return null;

  // Input-mint-denominated fee (VENUE/PLATFORM charged in the swap's input):
  // cannot exceed the input amount atomically. Uncomparable context (no
  // inAmount) keeps the whitelisted component rather than dropping it.
  if (component.tokenMint === ctx.inputMint && ctx.inAmount !== undefined) {
    let inAtoms: bigint;
    try {
      inAtoms = BigInt(ctx.inAmount);
    } catch {
      return component;
    }
    return amount > inAtoms ? null : component;
  }

  // Output-mint-denominated fee: cannot exceed the output amount atomically.
  if (
    ctx.outputMint !== undefined &&
    component.tokenMint === ctx.outputMint &&
    ctx.outAmount !== undefined
  ) {
    let outAtoms: bigint;
    try {
      outAtoms = BigInt(ctx.outAmount);
    } catch {
      return component;
    }
    return amount > outAtoms ? null : component;
  }

  // SOL-side lamport fee (PRIORITY/BASE/JITO): compare atomically when the
  // swap touches SOL on either side; otherwise fall back to the absolute cap.
  // The sanitizer sits on the trust boundary and must NEVER throw — a
  // malformed context amount falls through to the generous cap, not to the
  // adapter's failure path.
  if (component.tokenMint === SOL_MINT) {
    if (ctx.inputMint === SOL_MINT && ctx.inAmount !== undefined) {
      try {
        if (amount > BigInt(ctx.inAmount)) return null;
      } catch {
        return component;
      }
    } else if (ctx.outputMint === SOL_MINT && ctx.outAmount !== undefined) {
      try {
        if (amount > BigInt(ctx.outAmount)) return null;
      } catch {
        return component;
      }
    } else if (amount > MAX_LAMPORT_FEE_ATOMS) {
      return null;
    }
  }
  return component;
}

/** Sanitize every extracted component, dropping the ones that fail validation. */
function sanitizeComponents(
  components: FeeComponent[],
  ctx: FeeSanitizeCtx,
): FeeComponent[] {
  const out: FeeComponent[] = [];
  for (const component of components) {
    const clean = sanitizeFeeComponent(component, ctx);
    if (clean !== null) out.push(clean);
  }
  return out;
}

/** Extract per-leg venue fees from a quote response `routePlan`. Defensive:
 *  the official typings omit swapInfo.feeAmount/feeMint — when they are absent
 *  (or malformed) that leg records nothing rather than fabricating a fee. One
 *  component per leg: a route can carry several venue charges, possibly in
 *  different mints (pnl's feeBreakdownToQuote sums identical kinds). */
function extractVenueFees(routePlan: unknown): FeeComponent[] {
  if (!Array.isArray(routePlan)) return [];
  const components: FeeComponent[] = [];
  for (const leg of routePlan) {
    const swapInfo = (leg as { swapInfo?: { feeAmount?: unknown; feeMint?: unknown } }).swapInfo;
    const { feeAmount, feeMint } = swapInfo ?? {};
    if (feeAmount === undefined || feeMint === undefined) continue;
    let amount: bigint;
    try {
      amount = BigInt(feeAmount as string);
    } catch {
      continue; // malformed field — never fabricate, never crash the swap
    }
    if (amount <= 0n) continue;
    const mint = String(feeMint);
    components.push({
      kind: 'VENUE',
      tokenMint: mint === NATIVE_SOL_MINT ? SOL_MINT : mint,
      amountAtomic: amount.toString(),
    });
  }
  return components;
}

/** Extract the platform fee from a quote response. Jupiter's
 *  `platformFee.amount` is denominated in the input mint; empty when
 *  absent/zero/malformed. */
function extractPlatformFee(platformFee: unknown, inputMint: string): FeeComponent[] {
  if (!platformFee || typeof platformFee !== 'object') return [];
  const { amount } = platformFee as { amount?: unknown };
  if (amount === undefined) return [];
  let parsed: bigint;
  try {
    parsed = BigInt(amount as string);
  } catch {
    return [];
  }
  if (parsed <= 0n) return [];
  return [{ kind: 'PLATFORM', tokenMint: inputMint, amountAtomic: parsed.toString() }];
}

/** Extract the priority fee echoed by /swap (lamports, SOL). Empty when absent. */
function extractPriorityFee(prioritizationFeeLamports: unknown): FeeComponent[] {
  if (prioritizationFeeLamports === undefined || prioritizationFeeLamports === null) return [];
  let parsed: bigint;
  try {
    parsed = BigInt(prioritizationFeeLamports as string | number);
  } catch {
    return [];
  }
  if (parsed <= 0n) return [];
  return [{ kind: 'PRIORITY', tokenMint: SOL_MINT, amountAtomic: parsed.toString() }];
}

/** True when any observable fee layer came back from the exchange — used to
 *  decide `feeUnknown` (the always-recorded protocol BASE fee alone does not
 *  make the variable fee layers "known"). */
function hasObservableFees(
  venue: FeeComponent[],
  platform: FeeComponent[],
  priority: FeeComponent[],
): boolean {
  return venue.length > 0 || platform.length > 0 || priority.length > 0;
}

/** Legacy display fee: the observable VENUE+PLATFORM fees denominated in the
 *  input token. Undefined when none are — the caller then omits `fee` rather
 *  than claiming a fabricated '0'. */
function inputTokenFee(components: FeeComponent[], inputMint: string): string | undefined {
  const inputCode = inputMint === NATIVE_SOL_MINT ? SOL_MINT : inputMint;
  let total = 0n;
  let found = false;
  for (const component of components) {
    if (component.kind !== 'VENUE' && component.kind !== 'PLATFORM') continue;
    if (component.tokenMint !== inputCode) continue;
    total += BigInt(component.amountAtomic);
    found = true;
  }
  return found ? total.toString() : undefined;
}

/** Solana base fee — 2 signatures × 5_000 lamports per swap (protocol
 *  constant, not fabricated; mirrors pnl's modelFees base ×2 per round trip). */
function baseFeeComponent(): FeeComponent {
  return {
    kind: 'BASE',
    tokenMint: SOL_MINT,
    amountAtomic: (BASE_FEE_LAMPORTS_PER_SIG * SIGS_PER_SWAP).toString(),
  };
}

/**
 * Assemble the canonical fee components for a swap result from the REAL fee
 * data present in the exchange responses (M4 — never fabricates fees).
 *
 * - VENUE:    per-leg `routePlan[].swapInfo.feeAmount/feeMint` from the quote.
 * - PLATFORM: `platformFee.amount` from the quote (input-mint denominated).
 * - PRIORITY: `prioritizationFeeLamports` echoed by /swap (lamports, SOL).
 * - BASE:     Solana protocol constant — 2 signatures × 5_000 lamports (SOL).
 *
 * `feeUnknown` is true when NO observable layer (venue/platform/priority) was
 * returned — the variable fees are unknown; only the protocol BASE is recorded.
 * `inputTokenFee` is the legacy `fee` display value when an input-mint
 * VENUE/PLATFORM charge was observed (undefined otherwise — never '0').
 */
export function captureSwapFeeComponents(input: {
  /** The quote response `routePlan` (undefined for non-Jupiter quotes). */
  routePlan?: unknown;
  /** The quote response `platformFee` object (may be undefined). */
  platformFee?: unknown;
  /** The /swap response `prioritizationFeeLamports` (may be undefined). */
  prioritizationFeeLamports?: unknown;
  /** Input token mint of the swap — mint used for PLATFORM + legacy fee. */
  inputMint: string;
  /** Output token mint of the swap — used for amount clamps (Security F2). */
  outputMint?: string;
  /** Swap input amount in atomic units — used for amount clamps. */
  inAmount?: string;
  /** Swap output amount in atomic units — used for amount clamps. */
  outAmount?: string;
}): { components: FeeComponent[]; feeUnknown: boolean; inputTokenFee?: string } {
  const ctx: FeeSanitizeCtx = {
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    inAmount: input.inAmount,
    outAmount: input.outAmount,
  };
  const venue = sanitizeComponents(extractVenueFees(input.routePlan), ctx);
  const platform = sanitizeComponents(
    extractPlatformFee(input.platformFee, input.inputMint),
    ctx,
  );
  const priority = sanitizeComponents(extractPriorityFee(input.prioritizationFeeLamports), ctx);
  // BASE is the Solana protocol constant (2 × 5_000 lamports) — always valid,
  // never sanitized. The whitelist/clamp guards apply to the EXTERNAL layers
  // (venue/platform/priority arrive from the Jupiter trust boundary).
  const components = [...venue, ...platform, ...priority, baseFeeComponent()];
  return {
    components,
    feeUnknown: !hasObservableFees(venue, platform, priority),
    inputTokenFee: inputTokenFee(components, input.inputMint),
  };
}

/**
 * Abstract base class for DEX adapters.
 * Each supported DEX must implement this interface.
 */
export abstract class DexAdapter {
  /** Human-readable DEX name. */
  abstract readonly name: string;

  /** Commission model for this DEX. */
  abstract readonly commissionModel: CommissionModel;

  /** Slippage configuration for this DEX. */
  abstract readonly slippageConfig: SlippageConfig;

  /**
   * Get a quote for swapping tokens.
   */
  abstract quote(
    inputMint: string,
    outputMint: string,
    amount: bigint,
    slippageBps: number,
  ): Promise<Quote>;

  /**
   * Execute a swap based on a previously obtained quote.
   */
  abstract swap(quote: Quote, privateKey: Uint8Array): Promise<SwapResult>;

  /**
   * Get the balance of a token for a given wallet.
   */
  abstract getBalance(mint: string, publicKey: string): Promise<TokenBalance>;

  /**
   * Check the status of a transaction.
   */
  abstract getTransactionStatus(signature: string): Promise<TxStatus>;
}
