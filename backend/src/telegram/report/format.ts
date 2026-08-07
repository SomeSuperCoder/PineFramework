/**
 * format.ts — Shared deterministic number formatters for the Telegram /report
 * output (global PnL image AND the future text builder).
 *
 * Deliberately PURE and deterministic: every helper derives from `round2`
 * (globalPnl.ts) so image and text can never disagree about a rendered value.
 * No i18n, no telegram, no Date-timezone dependencies — generatedAt uses UTC
 * fields only, so output is stable on any host/CI.
 *
 * Money sign convention (plain ASCII '-', never the typographic '−'):
 *   +value -> '+$1,234.56'
 *   -value -> '-$1,234.56'
 *   zero   -> '$0.00'  (no sign — deterministic for the no-trades card)
 */

import { round2 } from '../../services/globalPnl.js';
import type { BotLanguage } from '../i18n.js';

/** Localized short month names by language (UTC-safe abbreviations). */
const MONTHS_BY_LANG: Record<BotLanguage, readonly string[]> = {
  en: [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ],
  es: [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ],
  ru: [
    'янв', 'фев', 'мар', 'апр', 'май', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
  ],
};

/**
 * Format a signed dollar amount with thousands separators, 2 decimals.
 * Values are rounded through round2 first (so -0.001 renders '$0.00',
 * never '-$0.00').
 */
export function formatMoney(n: number): string {
  const r = round2(n);
  const sign = r < 0 ? '-' : r > 0 ? '+' : '';
  const abs = Math.abs(r);
  const [intPart, decPart] = abs.toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${grouped}.${decPart}`;
}

/**
 * Format a win-rate FRACTION (0..1) as a percent with 1 decimal.
 * e.g. 0.684 -> '68.4%', 0.7 -> '70%'. Rounded at the percent level so the
 * displayed rate never drifts from the store's fraction.
 */
export function formatRate(winRateFraction: number): string {
  const pct = Math.round(winRateFraction * 1000) / 10;
  return `${pct.toFixed(1).replace(/\.0$/, '')}%`;
}

/**
 * Format the profit factor with 2 decimals. The "wins, no losses" sentinel
 * (Number.MAX_SAFE_INTEGER, preserved verbatim by buildGlobalPnlSnapshot)
 * renders as the infinity glyph '∞'.
 */
export function formatProfitFactor(n: number): string {
  if (n >= Number.MAX_SAFE_INTEGER) return '∞';
  return round2(n).toFixed(2);
}

/**
 * Format a UTC epoch (ms) as a human-readable generated-at stamp, e.g.
 * 'Aug 7, 2026 · 14:32 UTC'. UTC-only fields — deterministic on any host.
 *
 * @param lang  Locale for the month name; defaults to 'en' for back-compat.
 */
export function formatGeneratedAt(ts: number, lang: BotLanguage = 'en'): string {
  const d = new Date(ts);
  const months = MONTHS_BY_LANG[lang] ?? MONTHS_BY_LANG.en;
  const month = months[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year} · ${hh}:${mm} UTC`;
}
