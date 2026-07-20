/**
 * Pluggable Commission Calculation Methods
 *
 * Provides a CommissionCalculator interface and built-in implementations for
 * computing trading commission during backtests. Each method encapsulates
 * a distinct fee model (percentage-based, per-order, Jupiter DEX fees, etc.).
 *
 * The StrategyEngine delegates commission calculation to the active calculator
 * when one is configured via commissionMethod. Legacy commission_type /
 * commission_value from strategy() declarations remain supported as fallback.
 *
 * ── Jupiter Fee Reality (from official Jupiter docs) ──
 *
 * Jupiter is a **liquidity aggregator** — it routes swaps through DEXs
 * (Raydium, Orca, Meteora, etc.) that charge their own pool fees. The
 * total cost of a Jupiter swap consists of:
 *
 *   a) **DEX swap fee** — paid to the liquidity pool (always applies).
 *      Raydium: 25 bps, Orca: 1–30 bps, Meteora: dynamic.
 *      Configurable via `dexFeeBps` (default: 25 bps / 0.25%).
 *
 *   b) **Jupiter commission** — Jupiter's own markup.
 *      Router path (basic swap): 0% (Jupiter charges nothing).
 *      Ultra path (Meta-Aggregator): tiered 0–50 bps.
 *
 *   c) **Solana network fee** — paid to validators.
 *      ~5,000 lamports/sig × ~2 sigs = 0.00001 SOL ≈ $0.0015 at $150/SOL.
 *
 *   d) **Integrator fees** — OPTIONAL (0% by default), only if the
 *      integrator explicitly adds via `platformFeeBps`.
 *
 * ── Fee breakdown by swap path ──
 *
 * 1. Router path (basic swap) — `/build` + `/submit`
 *    - DEX swap fee  +  0% Jupiter commission  +  network fee
 *    - This is what a trading bot should use.
 *    - See https://developers.jup.ag/docs/swap
 *
 * 2. Meta-Aggregator path (Ultra) — `/order` + `/execute`
 *    - DEX swap fee  +  tiered Jupiter commission  +  network fee
 *    | Category                  | Jupiter bps | Total (DEX 25 + Jupiter) |
 *    |---------------------------|-------------|--------------------------|
 *    | Jupiter ecosystem tokens  |     0       |  25 bps (0.25%)         |
 *    | Pegged assets (Stable/LST)|     0       |  25 bps (0.25%)         |
 *    | SOL ↔ Stable              |     2       |  27 bps (0.27%)         |
 *    | LST ↔ Stable              |     5       |  30 bps (0.30%)         |
 *    | Everything else           |    10       |  35 bps (0.35%)         |
 *    | New tokens (<24h old)     |    50       |  75 bps (0.75%)         |
 *    - See https://developers.jup.ag/docs/ultra/fees
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Solana base fee per signature in lamports.
 * See https://solana.com/docs/core/fees
 */
const SOLANA_LAMPORTS_PER_SIG = 5_000;

/**
 * Lamports per SOL (1 SOL = 10⁹ lamports).
 */
const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Typical number of signatures in a Jupiter swap transaction.
 * A basic swap (Router path) uses ~2 signatures.
 */
const DEFAULT_SIGS_PER_SWAP = 2;

/**
 * Default SOL/USD price used when `solPriceUsd` is not configured in settings.
 * ~$150 is a reasonable long-term estimate for SOL in 2024–2025.
 * Set to 0 to disable network fee calculation.
 */
const DEFAULT_SOL_PRICE_USD = 150;

/**
 * Default DEX swap fee in basis points (1 bps = 0.01%).
 * Jupiter is a liquidity aggregator — it routes swaps through DEXs like
 * Raydium (0.25%), Orca (0.01–0.30%), and Meteora. The DEX fee is paid
 * to the liquidity pool, not to Jupiter. 25 bps is the Raydium standard
 * and a reasonable average for typical token pairs.
 */
const DEFAULT_DEX_FEE_BPS = 25;

/**
 * Extract the dexFeeBps from settings, falling back to the default.
 */
function getDexFeeBps(settings: CommissionMethodSettings | null | undefined): number {
  if (!settings) return DEFAULT_DEX_FEE_BPS;
  const s = settings as Record<string, unknown>;
  if (typeof s.dexFeeBps === 'number') return s.dexFeeBps;
  return DEFAULT_DEX_FEE_BPS;
}

/**
 * Extract the SOL/USD price from commission settings, falling back to the
 * default when not set. Returns 0 when settings explicitly disable it.
 */
function getSolPriceUsd(settings: CommissionMethodSettings | null | undefined): number {
  if (!settings) return DEFAULT_SOL_PRICE_USD;
  const s = settings as Record<string, unknown>;
  if (typeof s.solPriceUsd === 'number') return s.solPriceUsd;
  return DEFAULT_SOL_PRICE_USD;
}

/**
 * Calculate the Solana network fee in USD for a single swap transaction.
 *
 * The base Solana fee is 5,000 lamports per signature. A typical Jupiter swap
 * uses ~2 signatures, totaling 0.00001 SOL. This is converted to USD using
 * the provided SOL price.
 *
 * @returns USD amount of the network fee, or 0 if solPriceUsd is ≤ 0.
 */
function calculateSolanaNetworkFee(settings: CommissionMethodSettings | null | undefined): number {
  const solPriceUsd = getSolPriceUsd(settings);
  if (solPriceUsd <= 0) return 0;
  const solFee = (DEFAULT_SIGS_PER_SWAP * SOLANA_LAMPORTS_PER_SIG) / LAMPORTS_PER_SOL;
  return solFee * solPriceUsd;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal trade data needed for commission calculation. */
export interface TradeContext {
  direction: 'long' | 'short';
  /**
   * Price at which the position was entered (0 for exit-only fills).
   */
  entryPrice: number;
  /**
   * Price at which the position was exited (0 for entry-only fills).
   */
  exitPrice: number;
  quantity: number;
  /** Absolute value of (current fillPrice * quantity) for this fill. */
  tradeValue: number;
  /** True if this fill is opening (entry), false if closing (exit). */
  isEntry: boolean;
  /**
   * Trading pair symbol (e.g. "SOLUSDT", "BTCUSDT").
   * Used by JupiterUltraCalculator to auto-detect the fee tier from the token pair.
   * Optional — when omitted, falls back to explicit rate or pairCategory setting.
   */
  symbol?: string;
}

/** Identifies a built-in commission calculation method. */
export type CommissionMethodId =
  | 'percent_fixed'
  | 'percent_commission'
  | 'per_order_fixed'
  | 'jupiter_ultra'
  | 'jupiter_manual'
  | 'none';

/** Settings for the percent_fixed method. */
export interface PercentFixedSettings {
  /** Commission rate as a fraction (e.g. 0.001 = 0.1%). */
  rate: number;
}

/** Settings for the per_order_fixed method. */
export interface PerOrderFixedSettings {
  /** Flat cash amount charged per order. */
  amount: number;
}

/**
 * Jupiter Ultra fee tier, matched to the actual Jupiter DEX fee schedule.
 *
 * See https://docs.jup.ag/user-docs/trade/swap/fees and
 * https://developers.jup.ag/docs/ultra/fees for up-to-date fee details.
 */
export type JupiterPairCategory =
  /** Buying Jupiter ecosystem tokens: SOL/Stable → JUP/JLP/jupSOL (0 bps). */
  | 'jupiter_ecosystem'
  /** Pegged asset pairs: LST↔LST, Stable↔Stable (0 bps). */
  | 'pegged_asset'
  /** SOL ↔ Stablecoin (2 bps). */
  | 'sol_stable'
  /** Liquid Staking Token ↔ Stablecoin (5 bps). */
  | 'lst_stable'
  /** Default: all other token pairs not in a special tier (10 bps). */
  | 'default'
  /** Tokens less than 24 hours old on Solana (50 bps). */
  | 'new_token'
  /** Use a custom rate via the `rate` field instead of a preset tier. */
  | 'custom';

/** Settings for the jupiter_ultra method. */
export interface JupiterUltraSettings {
  /**
   * Fee tier based on the traded token pair.
   * Maps to Jupiter Ultra's actual per-pair fee schedule.
   * When set to a named tier, `rate` is ignored and the tier's bps is used.
   * When set to 'custom' or omitted, `rate` is used (backward compatible).
   * Default: 'default' (10 bps).
   */
  pairCategory?: JupiterPairCategory;
  /**
   * Custom rate override as a decimal fraction (e.g. 0.001 = 0.1%).
   * Only used when pairCategory is 'custom' or when pairCategory is unset
   * (backward compatibility with existing configs).
   */
  rate?: number;
  /**
   * SOL/USD price used to convert the Solana network fee (in lamports)
   * to a USD commission amount. At ~$150/SOL and ~2 sigs/swap, this is
   * roughly $0.0015 per trade. Set to 0 or omit to skip network fees.
   */
  solPriceUsd?: number;
  /**
   * DEX liquidity pool swap fee in basis points (1 bps = 0.01%).
   * Jupiter routes through DEXs like Raydium (25 bps), Orca (1-30 bps),
   * and Meteora. This fee is ALWAYS paid on every swap regardless of
   * Jupiter's commission. Default: 25 bps (Raydium standard).
   */
  dexFeeBps?: number;
}

/** Settings for the jupiter_manual (basic swap) method. */
export interface JupiterManualSettings {
  /**
   * SOL/USD price used to convert the Solana network fee (in lamports)
   * to a USD commission amount. Defaults to $150 when unset.
   * Set to 0 to skip network fee calculation entirely.
   */
  solPriceUsd?: number;
  /**
   * DEX liquidity pool swap fee in basis points (1 bps = 0.01%).
   * Jupiter routes through DEXs like Raydium (25 bps), Orca (1-30 bps),
   * and Meteora. This fee is ALWAYS paid on every swap.
   * Default: 25 bps (Raydium standard). Set to 0 to simulate a zero-fee DEX.
   */
  dexFeeBps?: number;
}

/** Maps each Jupiter pair category to its fee in basis points (1 bps = 0.01%). */
export const JUPITER_FEE_BPS: Record<Exclude<JupiterPairCategory, 'custom'>, number> = {
  jupiter_ecosystem: 0,    // 0%
  pegged_asset: 0,         // 0%
  sol_stable: 2,           // 0.02%
  lst_stable: 5,           // 0.05%
  default: 10,             // 0.1%
  new_token: 50,           // 0.5%
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
export function parsePairSymbol(symbol: string): { base: string; quote: string } | undefined {
  // Try separator-based first
  const sepMatch = symbol.match(/^([A-Za-z0-9]+)[/_-]([A-Za-z0-9]+)$/);
  if (sepMatch) {
    return { base: sepMatch[1]!.toUpperCase(), quote: sepMatch[2]!.toUpperCase() };
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

/** Settings for the percent_commission method (legacy-compatible). */
export interface PercentCommissionSettings {
  /** Commission as a percentage (e.g., 0.1 = 0.1%), matching legacy commissionType: 'percent'. */
  rate: number;
}

/** Union of all method-specific settings. */
export type CommissionMethodSettings =
  | PercentFixedSettings
  | PercentCommissionSettings
  | PerOrderFixedSettings
  | JupiterUltraSettings
  | JupiterManualSettings
  | Record<string, never>
  | null;

/** Configuration passed to a CommissionCalculator. */
export interface CommissionConfig {
  method: CommissionMethodId;
  settings: CommissionMethodSettings;
}

/** Metadata describing a commission method for UI rendering. */
export interface CommissionMethodDescriptor {
  id: CommissionMethodId;
  name: string;
  description: string;
  enforceLongOnly: boolean;
  defaultSettings: CommissionMethodSettings;
  /** Schema for settings fields the UI should render. */
  settingsFields: SettingsFieldDescriptor[];
}

/** Supported UI field types for method-specific settings. */
export type SettingsFieldType = 'number' | 'select';

/** Describes a single settings field for the UI. */
export interface SettingsFieldDescriptor {
  key: string;
  label: string;
  type: SettingsFieldType;
  defaultValue: number | string;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  /** Options for 'select' type fields. */
  options?: Array<{ value: string; label: string }>;
}

// ---------------------------------------------------------------------------
// CommissionCalculator interface
// ---------------------------------------------------------------------------

/**
 * Computes the commission charged for a single trade or order fill.
 *
 * Implementations must be pure functions of the context and config —
 * no internal state that persists across calls.
 */
export interface CommissionCalculator {
  /** Compute the commission amount in account currency. */
  calculate(context: TradeContext, config: CommissionConfig): number;
}

// ---------------------------------------------------------------------------
// Built-in method implementations
// ---------------------------------------------------------------------------

class PercentFixedCalculator implements CommissionCalculator {
  calculate(context: TradeContext, config: CommissionConfig): number {
    const rate = (config.settings as PercentFixedSettings)?.rate ?? 0;
    return context.tradeValue * rate;
  }
}

class PercentCommissionCalculator implements CommissionCalculator {
  /**
   * Legacy-compatible commission calculator.
   * Takes `commission` as a percentage (e.g., 0.1 = 0.1%), matching the legacy `commission` + `commissionType: 'percent'` behavior.
   * This provides a drop-in replacement for legacy commission configuration.
   */
  calculate(context: TradeContext, config: CommissionConfig): number {
    const settings = config.settings as PercentCommissionSettings | undefined;
    const rate = settings?.rate ?? 0;
    return context.tradeValue * (rate / 100);
  }
}

class PerOrderFixedCalculator implements CommissionCalculator {
  calculate(_context: TradeContext, config: CommissionConfig): number {
    return (config.settings as PerOrderFixedSettings)?.amount ?? 0;
  }
}

class JupiterUltraCalculator implements CommissionCalculator {
  /**
   * Models Jupiter Ultra (Meta-Aggregator path) swap fees.
   *
   * Total cost = DEX swap fee + Jupiter Ultra tiered fee + network fee.
   *
   * Jupiter Ultra charges its own tiered fee (0–50 bps, see schedule below)
   * ON TOP of the underlying DEX liquidity pool fee.
   *
   * Jupiter fee tier resolution order:
   *   1. Explicit `pairCategory` in settings (manual override)
   *   2. Auto-detected from `context.symbol` (if provided)
   *   3. Explicit `rate` in settings (backward compatible fallback)
   *   4. Default rate of 0.001 (10 bps)
   *
   * Jupiter Ultra tiered schedule:
   *   - Jupiter ecosystem / pegged assets: 0 bps
   *   - SOL ↔ Stable:                      2 bps
   *   - LST ↔ Stable:                      5 bps
   *   - Everything else (default):         10 bps
   *   - New tokens (<24h):                 50 bps
   *
   * See https://developers.jup.ag/docs/swap and https://developers.jup.ag/docs/ultra/fees
   */
  calculate(context: TradeContext, config: CommissionConfig): number {
    const settings = config.settings as JupiterUltraSettings | undefined;

    // 1. Compute DEX swap fee (always applies — Jupiter routes through DEXs)
    const dexFeeBps = getDexFeeBps(config.settings);
    const dexFee = context.tradeValue * (dexFeeBps / 10000);

    // 2. Compute Jupiter Ultra tiered fee
    let jupiterFee: number;

    if (settings?.pairCategory && settings.pairCategory !== 'custom') {
      const bps = JUPITER_FEE_BPS[settings.pairCategory] ?? 10;
      jupiterFee = context.tradeValue * (bps / 10000);
    } else if (context.symbol) {
      const category = detectJupiterPairCategory(context.symbol);
      // category is never 'custom' here because we're in the else branch
      const bps = JUPITER_FEE_BPS[category as Exclude<JupiterPairCategory, 'custom'>];
      jupiterFee = context.tradeValue * (bps / 10000);
    } else {
      const rate = settings?.rate ?? 0.001;
      jupiterFee = context.tradeValue * rate;
    }

    // 3. Add Solana network fee
    return dexFee + jupiterFee + calculateSolanaNetworkFee(config.settings);
  }
}

class JupiterManualCalculator implements CommissionCalculator {
  /**
   * Standard Jupiter Swap (Router path).
   *
   * Jupiter charges 0% commission, but the swap still routes through a DEX
   * (Raydium, Orca, etc.) that charges a liquidity pool fee. So total cost:
   *   DEX swap fee  +  Solana network fee
   *
   * This is the correct model for a trading bot using the basic swap API.
   */
  calculate(context: TradeContext, config: CommissionConfig): number {
    const dexFeeBps = getDexFeeBps(config.settings);
    const dexFee = context.tradeValue * (dexFeeBps / 10000);
    return dexFee + calculateSolanaNetworkFee(config.settings);
  }
}

class NoneCalculator implements CommissionCalculator {
  calculate(_context: TradeContext, _config: CommissionConfig): number {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const CALCULATORS: Record<CommissionMethodId, CommissionCalculator> = {
  percent_fixed: new PercentFixedCalculator(),
  percent_commission: new PercentCommissionCalculator(),
  per_order_fixed: new PerOrderFixedCalculator(),
  jupiter_ultra: new JupiterUltraCalculator(),
  jupiter_manual: new JupiterManualCalculator(),
  none: new NoneCalculator(),
};

// ---------------------------------------------------------------------------
// Method descriptors (UI metadata)
// ---------------------------------------------------------------------------

const METHOD_DESCRIPTORS: CommissionMethodDescriptor[] = [
  {
    id: 'percent_fixed',
    name: 'Percent (Fixed)',
    description: 'Fixed percentage of trade value (fraction)',
    enforceLongOnly: false,
    defaultSettings: { rate: 0.001 } as PercentFixedSettings,
    settingsFields: [
      {
        key: 'rate',
        label: 'Rate',
        type: 'number',
        defaultValue: 0.001,
        min: 0,
        max: 1,
        step: 0.0001,
        tooltip: 'Commission rate as a fraction (e.g. 0.001 = 0.1%)',
      },
    ],
  },
  {
    id: 'percent_commission',
    name: 'Percent Commission (Legacy)',
    description: 'Percentage commission matching legacy commissionType: percent (e.g. 0.1 = 0.1%)',
    enforceLongOnly: false,
    defaultSettings: { rate: 0.1 } as PercentCommissionSettings,
    settingsFields: [
      {
        key: 'rate',
        label: 'Rate (%)',
        type: 'number',
        defaultValue: 0.1,
        min: 0,
        max: 100,
        step: 0.01,
        tooltip: 'Commission as a percentage (e.g. 0.1 = 0.1%)',
      },
    ],
  },
  {
    id: 'per_order_fixed',
    name: 'Per Order (Fixed)',
    description: 'Fixed cash amount per order',
    enforceLongOnly: false,
    defaultSettings: { amount: 0 } as PerOrderFixedSettings,
    settingsFields: [
      {
        key: 'amount',
        label: 'Amount',
        type: 'number',
        defaultValue: 0,
        min: 0,
        step: 0.01,
        tooltip: 'Flat fee charged per order in account currency',
      },
    ],
  },
  {
    id: 'jupiter_ultra',
    name: 'Jupiter Ultra',
    description: 'Jupiter Ultra (Meta-Aggregator) — tiered 0–50 bps Jupiter fee + DEX swap fee + network fee',
    enforceLongOnly: true,
    defaultSettings: { pairCategory: 'default', dexFeeBps: 25, solPriceUsd: 150 } as JupiterUltraSettings,
    settingsFields: [
      {
        key: 'pairCategory',
        label: 'Pair Category',
        type: 'select',
        defaultValue: 'default',
        options: [
          { value: 'jupiter_ecosystem', label: 'Jupiter Ecosystem (0 bps) — SOL/Stable → JUP/JLP/jupSOL' },
          { value: 'pegged_asset', label: 'Pegged Assets (0 bps) — LST↔LST, Stable↔Stable' },
          { value: 'sol_stable', label: 'SOL↔Stable (2 bps)' },
          { value: 'lst_stable', label: 'LST↔Stable (5 bps)' },
          { value: 'default', label: 'Default (10 bps) — everything else' },
          { value: 'new_token', label: 'New Token (50 bps) — <24 hours old' },
          { value: 'custom', label: 'Custom Rate' },
        ],
        tooltip: 'Fee tier based on the traded token pair, matching Jupiter Ultra\'s actual fee schedule.',
      },
      {
        key: 'rate',
        label: 'Custom Rate',
        type: 'number',
        defaultValue: 0.001,
        min: 0,
        max: 0.01,
        step: 0.0001,
        tooltip: 'Custom fee rate (used when Pair Category is "Custom Rate").',
      },
      {
        key: 'dexFeeBps',
        label: 'DEX Swap Fee (bps)',
        type: 'number',
        defaultValue: 25,
        min: 0,
        max: 100,
        step: 1,
        tooltip: 'Underlying DEX liquidity pool fee in bps. Raydium=25, Orca=1-30, Meteora=dynamic. This is paid on every swap regardless of Jupiter.',
      },
      {
        key: 'solPriceUsd',
        label: 'SOL Price (USD)',
        type: 'number',
        defaultValue: 150,
        min: 0,
        step: 0.01,
        tooltip: 'SOL/USD price for converting Solana network fees (lamports → USD). 0 disables network fee.',
      },
    ],
  },
  {
    id: 'jupiter_manual',
    name: 'Jupiter (Basic Swap)',
    description: 'Jupiter Router path — 0% Jupiter fee + DEX swap fee (default 25 bps) + network fee',
    enforceLongOnly: true,
    defaultSettings: { dexFeeBps: 25, solPriceUsd: 150 } as JupiterManualSettings,
    settingsFields: [
      {
        key: 'dexFeeBps',
        label: 'DEX Swap Fee (bps)',
        type: 'number',
        defaultValue: 25,
        min: 0,
        max: 100,
        step: 1,
        tooltip: 'Underlying DEX liquidity pool fee in bps. Jupiter routes through Raydium (25 bps), Orca (1-30 bps), Meteora. This is paid on every swap.',
      },
      {
        key: 'solPriceUsd',
        label: 'SOL Price (USD)',
        type: 'number',
        defaultValue: 150,
        min: 0,
        step: 0.01,
        tooltip: 'SOL/USD price for converting Solana network fees (lamports → USD). 0 disables network fee.',
      },
    ],
  },
  {
    id: 'none',
    name: 'None',
    description: 'No commission applied',
    enforceLongOnly: false,
    defaultSettings: null,
    settingsFields: [],
  },
];

const DESCRIPTOR_MAP = new Map<CommissionMethodId, CommissionMethodDescriptor>(
  METHOD_DESCRIPTORS.map((d) => [d.id, d]),
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the CommissionCalculator for the given method ID.
 * Returns undefined if the method ID is not recognized.
 */
export function getCommissionCalculator(
  methodId: CommissionMethodId,
): CommissionCalculator | undefined {
  return CALCULATORS[methodId];
}

/**
 * Get the descriptor for the given method ID.
 * Returns undefined if the method ID is not recognized.
 */
export function getCommissionMethodDescriptor(
  methodId: CommissionMethodId,
): CommissionMethodDescriptor | undefined {
  return DESCRIPTOR_MAP.get(methodId);
}

/** Get descriptors for all built-in commission methods. */
export function getAllCommissionMethodDescriptors(): CommissionMethodDescriptor[] {
  return [...METHOD_DESCRIPTORS];
}

/**
 * Check whether the given method enforces long-only trading.
 * Returns false for unknown method IDs.
 */
export function isLongOnlyEnforced(methodId: CommissionMethodId): boolean {
  return DESCRIPTOR_MAP.get(methodId)?.enforceLongOnly ?? false;
}

/**
 * Compute commission using the pluggable system.
 *
 * This is the main entry point that the StrategyEngine should call
 * when a commissionMethod is configured. Falls back to 0 for unknown methods.
 */
export function computeCommission(context: TradeContext, config: CommissionConfig): number {
  const calculator = CALCULATORS[config.method];
  if (!calculator) return 0;
  return calculator.calculate(context, config);
}

/**
 * Build a TradeContext from order fill data.
 * Used by the StrategyEngine when commission is computed at fill time
 * (before a full Trade object exists).
 */
export function buildTradeContextFromFill(params: {
  direction: 'long' | 'short';
  fillPrice: number;
  quantity: number;
  /** True for an entry fill (opening a position), false for exit. */
  isEntry: boolean;
  /** Trading pair symbol for Jupiter tier auto-detection. */
  symbol?: string;
}): TradeContext {
  const tradeValue = Math.abs(params.fillPrice * params.quantity);
  return {
    direction: params.direction,
    entryPrice: params.isEntry ? params.fillPrice : 0,
    exitPrice: params.isEntry ? 0 : params.fillPrice,
    quantity: params.quantity,
    tradeValue,
    isEntry: params.isEntry,
    symbol: params.symbol,
  };
}

/**
 * Build a TradeContext from a completed trade's data.
 * Used when commission is recomputed at trade close.
 */
export function buildTradeContextFromTrade(params: {
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  /** Trading pair symbol for Jupiter tier auto-detection. */
  symbol?: string;
}): TradeContext {
  const tradeValue = Math.abs(params.entryPrice * params.quantity);
  return {
    direction: params.direction,
    entryPrice: params.entryPrice,
    exitPrice: params.exitPrice,
    quantity: params.quantity,
    tradeValue,
    symbol: params.symbol,
  };
}
