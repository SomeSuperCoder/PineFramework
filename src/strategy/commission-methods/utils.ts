/**
 * Shared constants and utility functions for commission calculation methods.
 * Extracted from commission-calculator.ts.
 */

import type {
  CommissionMethodSettings,
  JupiterPairCategory,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Solana base fee per signature in lamports. See https://solana.com/docs/core/fees */
const SOLANA_LAMPORTS_PER_SIG = 5_000;

/** Lamports per SOL (1 SOL = 10⁹ lamports). */
const LAMPORTS_PER_SOL = 1_000_000_000;

/** Typical number of signatures in a Jupiter swap transaction (~2 for basic swap). */
const DEFAULT_SIGS_PER_SWAP = 2;

/** Default SOL/USD price (~$150, reasonable for 2024–2025). Set to 0 to disable. */
const DEFAULT_SOL_PRICE_USD = 150;

/** Default DEX swap fee in bps (25 bps = 0.25%, Raydium standard). */
const DEFAULT_DEX_FEE_BPS = 25;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Extract the dexFeeBps from settings, falling back to the default.
 */
export function getDexFeeBps(settings: CommissionMethodSettings | null | undefined): number {
  if (!settings) return DEFAULT_DEX_FEE_BPS;
  const s = settings as Record<string, unknown>;
  if (typeof s.dexFeeBps === 'number') return s.dexFeeBps;
  return DEFAULT_DEX_FEE_BPS;
}

/**
 * Extract the SOL/USD price from commission settings, falling back to the
 * default when not set. Returns 0 when settings explicitly disable it.
 */
export function getSolPriceUsd(settings: CommissionMethodSettings | null | undefined): number {
  if (!settings) return DEFAULT_SOL_PRICE_USD;
  const s = settings as Record<string, unknown>;
  if (typeof s.solPriceUsd === 'number') return s.solPriceUsd;
  return DEFAULT_SOL_PRICE_USD;
}

/**
 * Calculate the Solana network fee in USD for a single swap transaction.
 * @returns USD amount of the network fee, or 0 if solPriceUsd is ≤ 0.
 */
export function calculateSolanaNetworkFee(
  settings: CommissionMethodSettings | null | undefined,
): number {
  const solPriceUsd = getSolPriceUsd(settings);
  if (solPriceUsd <= 0) return 0;
  const solFee = (DEFAULT_SIGS_PER_SWAP * SOLANA_LAMPORTS_PER_SIG) / LAMPORTS_PER_SOL;
  return solFee * solPriceUsd;
}

// ---------------------------------------------------------------------------
// Jupiter fee schedule
// ---------------------------------------------------------------------------

/** Maps each Jupiter pair category to its fee in basis points (1 bps = 0.01%). */
export const JUPITER_FEE_BPS: Record<
  Exclude<JupiterPairCategory, 'custom'>,
  number
> = {
  jupiter_ecosystem: 0, // 0%
  pegged_asset: 0, // 0%
  sol_stable: 2, // 0.02%
  lst_stable: 5, // 0.05%
  default: 10, // 0.1%
  new_token: 50, // 0.5%
};

// ---------------------------------------------------------------------------
// Token classification for Jupiter auto-tier-detection
// ---------------------------------------------------------------------------

/** Recognised stablecoin symbols (uppercase). */
const STABLECOINS = new Set([
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'USD', 'USDE', 'FDUSD', 'USDD',
]);

/** Recognised liquid-staking-token symbols (uppercase). */
const LST_TOKENS = new Set([
  'MSOL', 'STSOL', 'BSOL', 'JUPSOL',
]);

/** Jupiter ecosystem tokens (uppercase). */
const JUPITER_ECOSYSTEM_TOKENS = new Set([
  'JUP', 'JLP', 'JUPSOL',
]);

/**
 * Known quote-currency suffixes used to decompose exchange pair symbols.
 * Ordered longest-first to match greedily (e.g. "USDT" before "USD").
 */
const KNOWN_QUOTE_CURRENCIES = [
  'USDT', 'USDC', 'BUSD', 'FDUSD', 'USDD', 'TUSD', 'FRAX',
  'USD', 'DAI',
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT',
];

type TokenType = 'jupiter_ecosystem' | 'sol' | 'lst' | 'stablecoin' | 'other';

/** Classify a single token symbol into its Jupiter fee tier category. */
function classifyToken(token: string): TokenType {
  const upper = token.toUpperCase();
  if (JUPITER_ECOSYSTEM_TOKENS.has(upper)) return 'jupiter_ecosystem';
  if (upper === 'SOL') return 'sol';
  if (LST_TOKENS.has(upper)) return 'lst';
  if (STABLECOINS.has(upper)) return 'stablecoin';
  return 'other';
}

/**
 * Parse a trading pair symbol into its base and quote tokens.
 * Handles both concatenated (e.g. "SOLUSDT") and separator-delimited
 * (e.g. "SOL/USDT", "SOL-USDT") formats.
 */
export function parsePairSymbol(
  symbol: string,
): { base: string; quote: string } | undefined {
  // Try separator-based first
  const sepMatch = symbol.match(/^([A-Za-z0-9]+)[/_-]([A-Za-z0-9]+)$/);
  if (sepMatch) {
    return {
      base: sepMatch[1]!.toUpperCase(),
      quote: sepMatch[2]!.toUpperCase(),
    };
  }

  // Try suffix matching against known quote currencies (longest first)
  const upper = symbol.toUpperCase();
  for (const quote of KNOWN_QUOTE_CURRENCIES) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      const base = upper.slice(0, upper.length - quote.length);
      return { base, quote };
    }
  }

  return undefined;
}

/**
 * Auto-detect the Jupiter Ultra fee tier for a given trading pair symbol.
 * Uses token classification against known Jupiter fee schedule categories.
 * Returns 'default' (10 bps) when the pair cannot be determined.
 */
export function detectJupiterPairCategory(symbol: string): JupiterPairCategory {
  const pair = parsePairSymbol(symbol);
  if (!pair) return 'default';

  const baseType = classifyToken(pair.base);
  const quoteType = classifyToken(pair.quote);

  // Jupiter ecosystem tokens (0 bps): if either side is Jupiter ecosystem
  if (baseType === 'jupiter_ecosystem' || quoteType === 'jupiter_ecosystem') {
    return 'jupiter_ecosystem';
  }

  // Pegged assets (0 bps): stable↔stable or LST↔LST
  if (
    (baseType === 'stablecoin' && quoteType === 'stablecoin') ||
    (baseType === 'lst' && quoteType === 'lst')
  ) {
    return 'pegged_asset';
  }

  // SOL ↔ Stable (2 bps)
  if (
    (baseType === 'sol' && quoteType === 'stablecoin') ||
    (baseType === 'stablecoin' && quoteType === 'sol')
  ) {
    return 'sol_stable';
  }

  // LST ↔ Stable (5 bps)
  if (
    (baseType === 'lst' && quoteType === 'stablecoin') ||
    (baseType === 'stablecoin' && quoteType === 'lst')
  ) {
    return 'lst_stable';
  }

  // Everything else (10 bps)
  return 'default';
}
