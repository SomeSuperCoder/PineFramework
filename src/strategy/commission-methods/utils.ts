/**
 * Shared constants and utility functions for commission calculation methods.
 * Extracted from commission-calculator.ts.
 */

import type { CommissionMethodSettings, JupiterPairCategory } from './types.js';
import { DEFAULT_DEX_FEE_BPS, DEFAULT_SOL_USD_PRICE } from './config.js';

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
 * named default in `config.ts`. The old hard-coded `$150` in this file is
 * gone (D7) — the default is a config constant, and `0` explicitly disables
 * the network fee (the src/pnl model then converts lamports at $0 → 0 USD).
 */
export function getSolUsdPrice(settings: CommissionMethodSettings | null | undefined): number {
  if (!settings) return DEFAULT_SOL_USD_PRICE;
  const s = settings as Record<string, unknown>;
  if (typeof s.solPriceUsd === 'number') return s.solPriceUsd;
  return DEFAULT_SOL_USD_PRICE;
}

// ---------------------------------------------------------------------------
// Token classification for Jupiter auto-tier-detection
// ---------------------------------------------------------------------------

/** Recognised stablecoin symbols (uppercase). */
const STABLECOINS = new Set([
  'USDT',
  'USDC',
  'DAI',
  'BUSD',
  'TUSD',
  'FRAX',
  'USD',
  'USDE',
  'FDUSD',
  'USDD',
]);

/** Recognised liquid-staking-token symbols (uppercase). */
const LST_TOKENS = new Set(['MSOL', 'STSOL', 'BSOL', 'JUPSOL']);

/** Jupiter ecosystem tokens (uppercase). */
const JUPITER_ECOSYSTEM_TOKENS = new Set(['JUP', 'JLP', 'JUPSOL']);

/**
 * Known quote-currency suffixes used to decompose exchange pair symbols.
 * Ordered longest-first to match greedily (e.g. "USDT" before "USD").
 */
const KNOWN_QUOTE_CURRENCIES = [
  'USDT',
  'USDC',
  'BUSD',
  'FDUSD',
  'USDD',
  'TUSD',
  'FRAX',
  'USD',
  'DAI',
  'BTC',
  'ETH',
  'SOL',
  'BNB',
  'XRP',
  'ADA',
  'DOGE',
  'DOT',
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
export function parsePairSymbol(symbol: string): { base: string; quote: string } | undefined {
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
