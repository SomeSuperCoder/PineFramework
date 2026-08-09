/**
 * The SHARED realized-PnL runner. Live executor, adapters, backtest and stats
 * all compute a filled trade's PnL through this one function so the anchor
 * semantics (below) are enforced in exactly one place.
 *
 * ## THE ANCHOR SEAM — read before changing anything here
 *
 * The anchor follows the GROSS SOURCE, not the runtime. The same gross can be
 * computed from two different "truths":
 *
 * - **anchor 'fills' (default)** — gross derives from entry/exit FILL (or
 *   ideal) prices. A fill price embeds NO fee, so EVERY present fee kind
 *   (VENUE, PLATFORM, PRIORITY, BASE, JITO) reduces net. Both the backtest
 *   (modeled bps venue/platform are real charges) and the live executor
 *   (fills built from signal prices — no outAmount flows into gross) use this
 *   anchor.
 *
 * - **anchor 'outAmount'** — gross is literally anchored on Jupiter's executed
 *   OUT-AMOUNT (the actual amount of quote the wallet exchanged). VENUE,
 *   PLATFORM and slippage are already INSIDE that outAmount; subtracting them
 *   again would double-count. Only SOL-side fees (PRIORITY, BASE, JITO)
 *   reduce net. Use ONLY when the gross number truly came from an outAmount.
 *
 * In ALL cases `feeBreakdown` shows every kind and `feesTotal` sums all of
 * them (reporting). `subtractedFromNet` records which kinds were actually
 * subtracted, so consumers can audit the net.
 *
 * ## Fill absence
 * If either fill is missing, the trade is not realizable: gross = 0, net = 0
 * and `feeSource.feesUnknown = true`. Fee components may still be reported in
 * the breakdown (for inspection) but are never subtracted from a 0 gross.
 * `subtractedFromNet` is therefore `[]` when fills are absent.
 */

import type {
  DecimalStr,
  FeeComponent,
  FeeKind,
  Fill,
  RealizedPnl,
  Side,
  TokenPrice,
} from './types.js';
import { dAdd, ZERO } from './decimal.js';
import { feeBreakdownToQuote } from './fees.js';
import { feeTotal, grossPnlLong, grossPnlShort, netPnl } from './core.js';

/** Which fee kinds reduce net when the gross is anchored on fill prices. */
const SUBTRACTED_FILLS: FeeKind[] = ['VENUE', 'PLATFORM', 'PRIORITY', 'BASE', 'JITO'];

/** Which fee kinds reduce net when the gross is anchored on outAmount. */
const SUBTRACTED_OUT_AMOUNT: FeeKind[] = ['PRIORITY', 'BASE', 'JITO'];

/** Gross anchor: 'fills' when gross derives from fill/ideal prices (embeds no
 *  fees ⇒ all kinds subtract); 'outAmount' only when gross is literally
 *  anchored on an executed outAmount (embeds venue/platform ⇒ only
 *  priority/base/jito subtract). */
export type PnlAnchor = 'fills' | 'outAmount';

export interface AggregateRealizedPnlArgs {
  side: Side;
  entryFill?: Fill;
  exitFill?: Fill;
  feesSource: { components: FeeComponent[] } | 'none';
  /** Mint→(priceUsd, decimals) map for converting fee atoms to quote units. */
  prices: TokenPrice;
  /** Gross anchor — see module JSDoc. Defaults to 'fills'. */
  anchor?: PnlAnchor;
}

export function aggregateRealizedPnl(args: AggregateRealizedPnlArgs): RealizedPnl {
  const { side, entryFill, exitFill, prices, anchor = 'fills' } = args;
  const feesSource = args.feesSource;

  const hasFills = entryFill !== undefined && exitFill !== undefined;
  const fills = (entryFill !== undefined ? 1 : 0) + (exitFill !== undefined ? 1 : 0);

  // --- Gross: anchored on the actual FILL prices (never modeled). --------
  // qty is taken from the entry fill (the position size); when only an exit
  // fill is supplied its own qty stands in (documented; fills==1 is unusual).
  let gross: DecimalStr = ZERO;
  if (hasFills && entryFill !== undefined && exitFill !== undefined) {
    const qty = entryFill.qty ?? exitFill.qty;
    gross =
      side === 'LONG'
        ? grossPnlLong(exitFill.fillPrice, entryFill.fillPrice, qty)
        : grossPnlShort(exitFill.fillPrice, entryFill.fillPrice, qty);
  }

  // --- Fees: components → quote units per kind. ---------------------------
  let breakdown: Partial<Record<FeeKind, DecimalStr>> = {};
  let feesUnknown = feesSource === 'none';
  if (feesSource !== 'none') {
    breakdown = feeBreakdownToQuote(feesSource.components, prices);
  }
  if (!hasFills) {
    // No fills ⇒ nothing realized; fee numbers for an open/unrealized leg are unknown.
    feesUnknown = true;
  }

  const feesTotalQuote = feeTotal(breakdown);

  // --- Anchor seam: pick the subtractable kinds. ---
  // Must live INSIDE hasFills: with no fills, gross and net are both 0, so an
  // audit list here would break the F2 contract `net === gross − Σ(subtractedFromNet)`.
  // The breakdown is still reported above for inspection; nothing is subtracted from 0.
  let subtractedFromNet: FeeKind[] = [];
  let subtractedTotal: DecimalStr = ZERO;
  if (hasFills) {
    const subtractable = anchor === 'outAmount' ? SUBTRACTED_OUT_AMOUNT : SUBTRACTED_FILLS;
    subtractedFromNet = subtractable.filter((kind) => breakdown[kind] !== undefined);
    for (const kind of subtractedFromNet) {
      subtractedTotal = dAdd(subtractedTotal, breakdown[kind] as DecimalStr);
    }
  }

  // Only a realized (fill-anchored) trade reduces fees from net; otherwise
  // the leg is open and net stays 0 (we never report a loss on an open trade).
  const net = hasFills ? netPnl(gross, subtractedTotal) : gross;

  return {
    side,
    gross,
    feesTotal: feesTotalQuote,
    net,
    fills,
    feeBreakdown: breakdown,
    subtractedFromNet,
    feeSource: {
      ...(feesSource !== 'none' ? { observed: true } : {}),
      ...(feesUnknown ? { feesUnknown: true } : {}),
    },
  };
}
