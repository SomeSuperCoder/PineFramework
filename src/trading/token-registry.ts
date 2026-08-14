/**
 * Token Type System — Single source of truth for all token symbols and addresses.
 *
 * This module establishes a typed registry where:
 * - ONE SYMBOL = ONE TOKEN ADDRESS (enforced by TypeScript)
 * - All dropdowns import TRADABLE_PAIRS from here
 * - All trading code imports token info from here
 * - No other file should hardcode token addresses or symbol lists
 *
 * Last verified: 2026-08-14 against Jupiter Swap API (lite-api.jup.ag/swap/v1/quote)
 * and Solana mainnet RPC (api.mainnet-beta.solana.com) — every mint's existence,
 * decimals, USDC swap route, and primary-pool fee config confirmed on-chain.
 * 2026-08-14 — reduced to single gold pair (GOLDUSDC/Oro) per Director decision;
 * PAXGUSDC and GLDXUSDC removed.
 * 2026-08-15 — Bybit ticker mapping: GOLDUSDC→XAUTUSDT, TSLAXUSDC→TSLAXUSDT,
 * AAPLXUSDC→AAPLXUSDT (all spot); price fetch via Bybit, execution stays mint-based.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Branded type for valid trading pair symbols.
 * Only values present in TRADABLE_PAIRS are assignable to this type.
 */
export type PairSymbol = string & { readonly __brand: 'PairSymbol' };

/**
 * Complete token information for a trading pair.
 */
export interface TokenInfo {
  /** Base token symbol (e.g., "BTC", "ETH", "SOL") */
  readonly symbol: string;
  /** Quote token symbol (e.g., "USDT") */
  readonly quote: string;
  /** Trading pair symbol (e.g., "BTCUSDT", "ETHUSDT") */
  readonly pairSymbol: PairSymbol;
  /** Display name (e.g., "Bitcoin", "Ethereum") */
  readonly name: string;
  /** Solana mint address */
  readonly mint: string;
  /** Token decimals */
  readonly decimals: number;
  /** Bybit instrument symbol for price/chart data (defaults to pairSymbol). */
  readonly bybitSymbol?: string;
  /** Bybit API category ('spot' | 'linear'). Defaults to 'linear'. */
  readonly bybitCategory?: 'spot' | 'linear';
}

// ---------------------------------------------------------------------------
// Canonical list of tradable pairs
// ---------------------------------------------------------------------------

/**
 * The canonical list of all trading pairs the bot can trade.
 * This is the SINGLE SOURCE OF TRUTH for dropdowns and symbol references.
 */
export const TRADABLE_PAIRS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'GOLDUSDC',
  'TSLAXUSDC',
  'AAPLXUSDC',
] as const;

/** Type-safe array of tradable pair symbols. */
export type TradablePair = (typeof TRADABLE_PAIRS)[number];

// ---------------------------------------------------------------------------
// Token Registry
// ---------------------------------------------------------------------------

/**
 * The SINGLE SOURCE OF TRUTH for all token information.
 * Maps each pair symbol to its complete token metadata.
 */
export const TOKEN_REGISTRY: Record<TradablePair, TokenInfo> = {
  BTCUSDT: {
    symbol: 'BTC',
    quote: 'USDT',
    pairSymbol: 'BTCUSDT' as PairSymbol,
    name: 'Bitcoin',
    mint: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', // Wormhole BTC
    decimals: 8,
  },
  ETHUSDT: {
    symbol: 'ETH',
    quote: 'USDT',
    pairSymbol: 'ETHUSDT' as PairSymbol,
    name: 'Ethereum',
    mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // Wormhole ETH
    decimals: 8,
  },
  SOLUSDT: {
    symbol: 'SOL',
    quote: 'USDT',
    pairSymbol: 'SOLUSDT' as PairSymbol,
    name: 'Solana',
    mint: 'So11111111111111111111111111111111111111112', // Wrapped SOL
    decimals: 9,
  },
  BNBUSDT: {
    symbol: 'BNB',
    quote: 'USDT',
    pairSymbol: 'BNBUSDT' as PairSymbol,
    name: 'BNB',
    mint: 'bnj35V3tC6ELwYceVAKJkWkLn8mCRgxiUc2K9NJs3bN', // Wrapped BNB
    decimals: 8,
  },
  XRPUSDT: {
    symbol: 'XRP',
    quote: 'USDT',
    pairSymbol: 'XRPUSDT' as PairSymbol,
    name: 'XRP',
    mint: 'rH5ZthAZQXo3FLkZkRQyaRWEKx6aaF8Yw', // XRP on Solana (Wormhole)
    decimals: 6,
  },
  DOGEUSDT: {
    symbol: 'DOGE',
    quote: 'USDT',
    pairSymbol: 'DOGEUSDT' as PairSymbol,
    name: 'Dogecoin',
    mint: 'DoU5JGDfFLwRBB6hPkD2wEuDmXZwFqYKzUFCiQ9qZUn', // DOGE on Solana (Wormhole)
    decimals: 8,
  },
  ADAUSDT: {
    symbol: 'ADA',
    quote: 'USDT',
    pairSymbol: 'ADAUSDT' as PairSymbol,
    name: 'Cardano',
    mint: 'ADA4pFMhWm2jzFJEBEv2NpgvNoSEHbMnY6hC1R8gvrkj', // ADA on Solana (Wormhole)
    decimals: 6,
  },
  GOLDUSDC: {
    symbol: 'GOLD',
    quote: 'USDC',
    pairSymbol: 'GOLDUSDC' as PairSymbol,
    name: 'Oro GOLD',
    mint: 'GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A', // Oro GOLD (SPL)
    decimals: 6,
    // Bybit has no Oro listing — Tether Gold (XAUT) is the gold proxy for
    // chart/price data. Execution stays mint-based (Oro SPL), verified live
    // against api.bybit.com 2026-08-15.
    bybitSymbol: 'XAUTUSDT',
    bybitCategory: 'spot',
  },
  TSLAXUSDC: {
    symbol: 'TSLAx',
    quote: 'USDC',
    pairSymbol: 'TSLAXUSDC' as PairSymbol,
    name: 'Tesla xStock (Backed)',
    mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', // Backed TSLAx (Token-2022)
    decimals: 8,
    // Bybit xStocks instrument (spot category), verified live 2026-08-15.
    bybitSymbol: 'TSLAXUSDT',
    bybitCategory: 'spot',
  },
  AAPLXUSDC: {
    symbol: 'AAPLx',
    quote: 'USDC',
    pairSymbol: 'AAPLXUSDC' as PairSymbol,
    name: 'Apple xStock (Backed)',
    mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', // Backed AAPLx (Token-2022)
    decimals: 8,
    // Bybit xStocks instrument (spot category), verified live 2026-08-15.
    bybitSymbol: 'AAPLXUSDT',
    bybitCategory: 'spot',
  },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Get token info for a pair symbol.
 * @param pairSymbol - Trading pair symbol (e.g., "BTCUSDT")
 * @returns Complete token information
 * @throws Error if pair symbol is not in the registry
 */
export function getTokenInfo(pairSymbol: string): TokenInfo {
  const upperSymbol = pairSymbol.toUpperCase() as TradablePair;
  const info = TOKEN_REGISTRY[upperSymbol];
  if (!info) {
    throw new Error(
      `Unknown pair symbol: "${pairSymbol}". ` +
        `Available pairs: ${Object.keys(TOKEN_REGISTRY).join(', ')}`,
    );
  }
  return info;
}

/**
 * Get the list of all tradable pair symbols.
 * @returns Array of valid pair symbols
 */
export function getTradablePairs(): readonly TradablePair[] {
  return TRADABLE_PAIRS;
}

/**
 * Bybit instrument symbol for a pair. Falls back to pairSymbol (existing
 * behavior). MUST NOT throw for unknown symbols — callers pass arbitrary
 * strings (REST query params, WS topics); fall back to the input uppercased.
 */
export function getBybitSymbol(pairSymbol: string): string {
  const info = TOKEN_REGISTRY[pairSymbol.toUpperCase() as TradablePair];
  return info?.bybitSymbol ?? pairSymbol.toUpperCase();
}

/**
 * Bybit API category for a pair. Falls back to 'linear' (existing behavior).
 */
export function getBybitCategory(pairSymbol: string): 'spot' | 'linear' {
  const info = TOKEN_REGISTRY[pairSymbol.toUpperCase() as TradablePair];
  return info?.bybitCategory ?? 'linear';
}

/**
 * Check if a value is a valid pair symbol.
 * @param value - Value to check
 * @returns true if the value is a valid pair symbol
 */
export function isValidPairSymbol(value: string): value is TradablePair {
  return (TRADABLE_PAIRS as readonly string[]).includes(value.toUpperCase());
}

// ---------------------------------------------------------------------------
// Backward-compatible exports (derived from registry)
// ---------------------------------------------------------------------------

/**
 * Canonical USDC mint address on Solana mainnet.
 *
 * USDC is NOT a tradable pair in TOKEN_REGISTRY (it is the quote/stablecoin
 * the bot swaps against), but it MUST resolve at runtime for every module that
 * imports `USDC_MINT` (solana-wallet, DEX adapters, spot-trading, executor,
 * jupiter-fee-fetcher). Declared once here — single source of truth; consumers
 * import this constant instead of duplicating the address literal.
 */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/**
 * Token mint addresses by base symbol (backward-compatible).
 * Use getTokenInfo() for new code.
 */
export const TOKEN_MINTS: Record<string, string> = {
  ...Object.values(TOKEN_REGISTRY).reduce(
    (acc, info) => ({ ...acc, [info.symbol]: info.mint }),
    {} as Record<string, string>,
  ),
  // USDC: previously TOKEN_MINTS.USDC was undefined at runtime, so every
  // balance query passed `undefined` as the mint and returned 0 — the bot
  // could never see its funds. Keep the key populated from the canonical
  // constant above (SSOT).
  USDC: USDC_MINT,
};
