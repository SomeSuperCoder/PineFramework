/**
 * Pure PnL + fee arithmetic in QUOTE units (US-Dollar or whatever the quote
 * currency is). Every function here works exclusively on `DecimalStr` — the
 * exact-value string math lives in `./decimal.ts` (no floats on money).
 *
 * ## Anchor rule (README the call sites)
 * `feeTotal` sums EVERYTHING, including VENUE/PLATFORM. That sum is for
 * DISPLAY/reporting. Deciding which kinds actually reduce `net` is the
 * caller's job — the shared runner in `src/pnl/aggregate.ts` owns that
 * decision via its `anchor` seam. Do NOT pass a feeTotal that includes
 * venue/platform into `netPnl` for an outAmount-anchored gross: their amounts
 * are already inside the outAmount and would be double-counted.
 */

import type { DecimalStr, FeeKind } from './types.js';
import { dAdd, dMul, dSub, ZERO } from './decimal.js';

/**
 * Gross PnL for a LONG position: (exit − entry) × qty.
 * All amounts quote units; entry/exit are FILL prices (the anchor values).
 */
export function grossPnlLong(exit: DecimalStr, entry: DecimalStr, qty: DecimalStr): DecimalStr {
  return dMul(dSub(exit, entry), qty);
}

/**
 * Gross PnL for a SHORT position: (entry − exit) × qty.
 */
export function grossPnlShort(exit: DecimalStr, entry: DecimalStr, qty: DecimalStr): DecimalStr {
  return dMul(dSub(entry, exit), qty);
}

/**
 * Sum of ALL fee kinds present in `breakdown` (quote units).
 *
 * ⚠️ ANCHOR WARNING: this returns the total of every kind INCLUDING venue &
 * platform. It is correct for display, but `netPnl()` must NOT receive a total
 * that includes venue/platform for an outAmount-anchored gross — those fees
 * are inside outAmount already. `aggregateRealizedPnl` handles this: use it
 * rather than hand-feeding netPnl from feeTotal.
 */
export function feeTotal(breakdown: Partial<Record<FeeKind, DecimalStr>>): DecimalStr {
  let total: DecimalStr = ZERO;
  for (const value of Object.values(breakdown)) {
    if (value !== undefined) {
      total = dAdd(total, value);
    }
  }
  return total;
}

/**
 * `gross − fees` (exact decimal subtraction). The caller is responsible for
 * passing ONLY the fee kinds that should reduce this particular gross value —
 * see the anchor rule above.
 */
export function netPnl(gross: DecimalStr, fees: DecimalStr): DecimalStr {
  return dSub(gross, fees);
}
