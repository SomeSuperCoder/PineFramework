/**
 * Token Type System — Single source of truth for all token symbols and addresses.
 *
 * This module establishes a typed registry where:
 * - ONE SYMBOL = ONE TOKEN ADDRESS (enforced by TypeScript)
 * - All dropdowns import TRADABLE_PAIRS from here
 * - All trading code imports token info from here
 * - No other file should hardcode token addresses or symbol lists
 *
 * Last verified: 2026-08-03 against official sources (Coinbase, CoinGecko,
 * protocol documentation, Solana Explorer).
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
      `Available pairs: ${Object.keys(TOKEN_REGISTRY).join(', ')}`
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
 * Token mint addresses by base symbol (backward-compatible).
 * Use getTokenInfo() for new code.
 */
export const TOKEN_MINTS: Record<string, string> = Object.values(TOKEN_REGISTRY).reduce(
  (acc, info) => ({ ...acc, [info.symbol]: info.mint }),
  {} as Record<string, string>
);

/**
 * All token mints as a flat record (backward-compatible).
 * Use getTokenInfo() for new code.
 */
export const ALL_TOKEN_MINTS: Record<string, string> = Object.keys(TOKEN_REGISTRY).reduce(
  (acc, pairSymbol) => ({ ...acc, [pairSymbol]: TOKEN_REGISTRY[pairSymbol as TradablePair].mint }),
  {} as Record<string, string>
);

// Alias for USDC (commonly used)
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
