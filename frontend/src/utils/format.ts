/**
 * Shared formatting helpers for the bot dashboard (moved out of
 * LiveDashboard so the Overview / Trade History / Statistics views render
 * identical values — single source of truth, design D6).
 */

import { tokens } from '../theme/tokens';

/** Em-dash placeholder for absent values (house convention). */
export const DASH = '\u2014';

/** Human duration: "1h 2m 3s"; em-dash when not positive. */
export function fmtDur(ms: number): string {
  if (ms <= 0) return DASH;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

/** Signed USD PnL text + house color (green profit / red loss). */
export function fmtPnl(pnl: number): { text: string; color: string } {
  return {
    text: pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`,
    color: pnl >= 0 ? tokens.colors.semantic.success : tokens.colors.semantic.error,
  };
}

/** Strip the quote currency to show the base (target) token: "BTCUSDT" -> "BTC". */
export function fmtBaseSymbol(sym: string): string {
  return sym.replace(/(USDT|USDC|BUSD|FDUSD|TUSD|USD)$/, '') || sym;
}

/** Compact quantity with 4 significant figures; em-dash when not positive. */
export function fmtSize(q: number): string {
  return !isFinite(q) || q <= 0
    ? DASH
    : Number(q.toPrecision(4)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** Positive USD amount, 2 decimals + thousands separator; em-dash when not
 *  positive/finite (used for notionals, balances, fees). */
export function fmtUsd(n: number): string {
  return !isFinite(n) || n <= 0
    ? DASH
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Plain USD amount, 2 decimals + thousands separator; 0 renders as "$0.00". */
export function fmtAmount(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Signed USD value (+/- prefix) for PnL-style fields that may be 0/negative. */
export function fmtSignedUsd(n: number): string {
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact millisecond timestamp for table cells ("Jan 5, 14:32"). */
export function fmtTimestamp(ts: number): string {
  if (!isFinite(ts) || ts <= 0) return DASH;
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Timeframe token → label ("60" -> "1h"); em-dash when absent. */
export function fmtTimeframe(tf: string | undefined): string {
  if (!tf) return DASH;
  const map: Record<string, string> = {
    '1': '1m',
    '5': '5m',
    '15': '15m',
    '30': '30m',
    '60': '1h',
    '240': '4h',
    '1440': '1d',
  };
  return map[tf] ?? tf;
}
