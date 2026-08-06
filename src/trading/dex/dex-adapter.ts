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
  /** Fee paid in input token. */
  fee: string;
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
