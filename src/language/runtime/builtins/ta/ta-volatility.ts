import { Decimal } from 'decimal.js';
import { NA, isNa, type PineValue } from '../../../types/na.js';
import { isFiniteNumber } from '../../float-guards.js';
import { pineValueToDecimal, decimalToPineValue } from '../../numbers/index.js';
import type { ExecutionEngine } from '../../execution-engine.js';

export function registerTaVolatility(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eng = engine as any;

  // Parabolic SAR — Decimal state (R4 upgrade, M7c). The classic PSAR algorithm
  // accumulates the SAR value via sar_t = prevSar + af·(ep − prevSar), with
  // trend-following acceleration (af ↑ on new extremes) and trend reversal when
  // price pierces the SAR line. All arithmetic runs EXACTLY at DP=20 — no
  // Number round-trip per bar, so constant series converge EXACTLY (fp-final-gate).
  // State layout: the 12 numeric fields (sar, ep, af, afStart, afInc, afMax,
  // prevSar, prevEp, prevLow1/2, prevHigh1/2) are Decimal; initialized, trend,
  // barCount stay boolean/string/number. Snapshot/rollback: state-manager.ts
  // captures via { ...v } shallow copy — safe because Decimal instances are
  // immutable (arithmetic returns fresh Decimals) and bar values (pineValueToDecimal)
  // are fresh per call — no in-place mutation risk.
  // R4: non-finite OHLC collapses to NA via isFiniteNumber BEFORE conversion,
  // so Infinity never reaches Decimal state. The decimalToPineValue exit
  // subsumes the old guardFinite/isNa guard chain (decimal NaN → NA).
  // R5: no division in SAR (additive/multiplicative only); no div-by-zero risk.
  // af defaults: 0.02/0.02/0.2 (Pine standard). Non-finite args → defaults (R4).
  eng.builtins.set('ta.sar', (start: PineValue, inc: PineValue, max: PineValue): PineValue => {
    if (!eng.currentContext) return NA;
    const ctx = eng.currentContext;
    const high = ctx.high.getRelative(0);
    const low = ctx.low.getRelative(0);
    const close = ctx.close.getRelative(0);
    // R4 boundary: non-finite bar values → NA. Guard BEFORE decimal conversion
    // so Infinity/NaN never enters Decimal state (decimal.js would propagate
    // them silently, violating the contract that no non-finite leaks to output).
    if (!isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) return NA;
    const highD = pineValueToDecimal(high);
    const lowD = pineValueToDecimal(low);
    const closeD = pineValueToDecimal(close);

    // af defaults: non-finite args → standard Pine defaults (0.02/0.02/0.2).
    const afStart = isFiniteNumber(start) ? new Decimal(start) : new Decimal('0.02');
    const afInc = isFiniteNumber(inc) ? new Decimal(inc) : new Decimal('0.02');
    const afMax = isFiniteNumber(max) ? new Decimal(max) : new Decimal('0.2');
    const key = `sar_${eng.currentCallSiteId}`;

    if (!eng.sarState.has(key)) {
      eng.sarState.set(key, {
        initialized: false,
        trend: 'up',
        sar: new Decimal(0),
        ep: new Decimal(0),
        af: afStart,
        afStart,
        afInc,
        afMax,
        prevSar: new Decimal(0),
        prevEp: new Decimal(0),
        prevLow1: new Decimal(0),
        prevLow2: new Decimal(0),
        prevHigh1: new Decimal(0),
        prevHigh2: new Decimal(0),
        barCount: 0,
      });
    }

    const state = eng.sarState.get(key)!;
    state.barCount++;

    // Previous-bar data for initialization and rotation — always Decimal.
    const prevHighRaw = ctx.high.getRelative(1);
    const prevLowRaw = ctx.low.getRelative(1);
    const prevCloseRaw = ctx.close.getRelative(1);
    const hasPrevBar =
      isFiniteNumber(prevHighRaw) && isFiniteNumber(prevLowRaw) && isFiniteNumber(prevCloseRaw);
    const prevHighD = hasPrevBar ? pineValueToDecimal(prevHighRaw) : highD;
    const prevLowD = hasPrevBar ? pineValueToDecimal(prevLowRaw) : lowD;
    const prevCloseD = hasPrevBar ? pineValueToDecimal(prevCloseRaw) : closeD;

    if (!state.initialized) {
      if (!hasPrevBar) {
        // Pre-init buffer (bar 0): store raw bar Decimals, return low. These
        // references are safe from mutation — they are pineValueToDecimal fresh
        // instances used only in comparisons (lt/gt/min/max).
        state.prevHigh1 = highD;
        state.prevLow1 = lowD;
        state.prevHigh2 = highD;
        state.prevLow2 = lowD;
        state.prevSar = lowD;
        state.prevEp = highD;
        state.sar = lowD;
        state.ep = highD;
        return decimalToPineValue(lowD);
      }

      // Direction: close > prevClose → up trend.
      if (closeD.gt(prevCloseD)) {
        state.trend = 'up';
        state.sar = Decimal.min(lowD, prevLowD);
        state.ep = Decimal.max(highD, prevHighD);
      } else {
        state.trend = 'down';
        state.sar = Decimal.max(highD, prevHighD);
        state.ep = Decimal.min(lowD, prevLowD);
      }

      state.af = afStart;
      state.prevSar = state.sar;
      state.prevEp = state.ep;
      state.prevLow1 = lowD;
      state.prevLow2 = prevLowD;
      state.prevHigh1 = highD;
      state.prevHigh2 = prevHighD;
      state.initialized = true;
      return decimalToPineValue(state.sar);
    }

    // ── Main loop ──
    // Local copies of rotated lookback (read state BEFORE mutation).
    const prevLow1 = state.prevLow1;
    const prevLow2 = state.prevLow2;
    const prevHigh1 = state.prevHigh1;
    const prevHigh2 = state.prevHigh2;
    const prevEp = state.prevEp;

    // SAR increment: sar_t = prevSar + af·(ep − prevSar) — exact DP=20.
    // Every arithmetic op (plus/minus/times) returns a NEW Decimal — no
    // in-place mutation of state.prevSar or state.ep.
    let sar = state.prevSar.plus(state.af.times(state.ep.minus(state.prevSar)));

    if (state.trend === 'up') {
      sar = Decimal.min(sar, prevLow1, prevLow2);

      if (lowD.lt(sar)) {
        // Trend reversal: up → down.
        state.trend = 'down';
        sar = prevEp;
        state.ep = lowD;
        state.af = afStart;
      } else {
        if (highD.gt(state.ep)) {
          state.ep = highD;
          state.af = Decimal.min(state.af.plus(afInc), afMax);
        }
      }
    } else {
      sar = Decimal.max(sar, prevHigh1, prevHigh2);

      if (highD.gt(sar)) {
        // Trend reversal: down → up.
        state.trend = 'up';
        sar = prevEp;
        state.ep = highD;
        state.af = afStart;
      } else {
        if (lowD.lt(state.ep)) {
          state.ep = lowD;
          state.af = Decimal.min(state.af.plus(afInc), afMax);
        }
      }
    }

    // Rotate lookback + persist. Every assignment is a fresh Decimal — either
    // from arithmetic ops (plus/minus/times/min/max) or from pineValueToDecimal.
    // No in-place mutation of existing instances — safe for shallow-copy snapshot.
    state.prevSar = sar;
    state.prevEp = state.ep;
    state.prevLow1 = lowD;
    state.prevLow2 = prevLow1;
    state.prevHigh1 = highD;
    state.prevHigh2 = prevHigh1;

    return decimalToPineValue(sar);
  });

  // Average True Range — Decimal state (R4 upgrade, M7a). ta.atr IS rma of the
  // true range: the TR is computed at the bar boundary as exact Decimal, then
  // accumulated with the seed-then-Wilder recursion (prev*(count-1)+tr)/count →
  // (prev*(len-1)+tr)/len entirely at DP=20 — no Number round-trip per bar, so
  // the ATR converges EXACTLY on constant series (fp-final-gate). State layout
  // mirrors rmaState (ta.rma in ta-overlap.ts) — one algorithm, two call-site
  // key namespaces. The values[] history keeps PineValue[] semantics for the
  // ta.atr(N)[i] historical-index path in expression-executor: the first bar
  // pushes the NA sentinel; warm-up and Wilder entries are decimalToPineValue'd.
  // count/len stay INTEGER number math (Math.trunc guard). R4: non-finite OHLC
  // collapses to NA via isFiniteNumber BEFORE conversion, so Infinity never
  // reaches Decimal state (a NaN close[1] also falls back to close). R5: count/
  // len are positive integers by guard, so every div denominator is non-zero.
  eng.builtins.set('ta.atr', (length: PineValue): PineValue => {
    if (!eng.currentContext) return NA;
    const len = Math.trunc(typeof length === 'number' ? length : 14);
    if (len <= 0) return NA;
    const ctx = eng.currentContext;
    const high = ctx.high.getRelative(0);
    const low = ctx.low.getRelative(0);
    const close = ctx.close.getRelative(0);
    if (!isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) return NA;
    // Convert ONCE at the bar boundary — the guard above guarantees finite
    // numbers, so pineValueToDecimal cannot produce the NaN marker here.
    const highD = pineValueToDecimal(high);
    const lowD = pineValueToDecimal(low);
    const closeD = pineValueToDecimal(close);
    // On bar 0 there is no close[1]; fall back to close so TR degrades to
    // max(high-low, |high-close|, |low-close|) — identical to the ta.tr path.
    const prevClose = ctx.close.getRelative(1);
    const prevCloseD = isFiniteNumber(prevClose) ? pineValueToDecimal(prevClose) : closeD;
    const tr = Decimal.max(
      highD.minus(lowD),
      highD.minus(prevCloseD).abs(),
      lowD.minus(prevCloseD).abs(),
    );
    const key = `atr_${len}_${eng.currentCallSiteId}`;
    if (!eng.atrState.has(key)) {
      eng.atrState.set(key, { prev: tr, count: 1, values: [] });
      eng.atrState.get(key)!.values.push(NA);
      return NA;
    }
    const state = eng.atrState.get(key)!;
    state.count++;
    if (state.count <= len) {
      state.prev = state.prev
        .times(new Decimal(state.count - 1))
        .plus(tr)
        .div(new Decimal(state.count));
      state.values.push(decimalToPineValue(state.prev));
      return NA;
    }
    state.prev = state.prev
      .times(new Decimal(len - 1))
      .plus(tr)
      .div(new Decimal(len));
    state.values.push(decimalToPineValue(state.prev));
    return decimalToPineValue(state.prev);
  });

  // True range: max(high - low, |high - close[1]|, |low - close[1]|). Stateless —
  // a per-bar value with at most close[1] lookback. The `useMA` parameter is
  // accepted for signature compatibility with ta.tr(useMA): per the Pine v6
  // reference, ta.tr(true) is the canonical RAW true-range calculation (it is
  // paired with ta.rma(trueRange, len) to build ATRs), so the flag does not
  // alter the returned series. The LuxAlgo supertrend-3d script depends on this:
  // it computes `ta.tr(true)` once and derives 10 ATRs via ta.rma.
  // Decimal (R4 upgrade, M7a): the three terms are computed EXACTLY at DP=20
  // (high-low / |high-close[1]| / |low-close[1]| carry no IEEE 754 drift), and
  // decimalToPineValue double-guards the exit — the old guardFinite(tr) is
  // subsumed. Non-finite OHLC collapses to NA at the isFiniteNumber boundary
  // BEFORE conversion, so Infinity never reaches Decimal.
  eng.builtins.set('ta.tr', (useMA?: PineValue): PineValue => {
    void useMA; // accepted for Pine signature parity; does not change semantics
    if (!eng.currentContext) return NA;
    const ctx = eng.currentContext;
    const high = ctx.high.getRelative(0);
    const low = ctx.low.getRelative(0);
    const close = ctx.close.getRelative(0);
    if (!isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) {
      return NA;
    }
    // Convert ONCE at the bar boundary — the guard above guarantees finite
    // numbers, so pineValueToDecimal cannot produce the NaN marker here.
    const highD = pineValueToDecimal(high);
    const lowD = pineValueToDecimal(low);
    const closeD = pineValueToDecimal(close);
    // On bar 0 there is no close[1]; fall back to close so TR degrades to
    // max(high-low, |high-close|, |low-close|) — identical to the ta.atr path.
    const prevClose = ctx.close.getRelative(1);
    const prevCloseD = isFiniteNumber(prevClose) ? pineValueToDecimal(prevClose) : closeD;
    const tr = Decimal.max(
      highD.minus(lowD),
      highD.minus(prevCloseD).abs(),
      lowD.minus(prevCloseD).abs(),
    );
    return decimalToPineValue(tr);
  });

  // Supertrend: factor * ATR band channel around hl2 with the classic
  // band-following rule (upper = min(current, prior), lower = max(current, prior),
  // trend = close vs final band). Returns [supertrend, direction] as a JS tuple —
  // the runtime's destructuring assignment ([a, b] = fn()) unpacks it. Direction is
  // 1 when close is above the line (uptrend), -1 below. NA-safe: while the internal
  // ATR warms up the function returns [na, na] without ever comparing against NA.
  // Decimal (R4 upgrade, M7b): TR, the internal seed-then-Wilder RMA, and the band
  // math (hl2 ± mult·atr, min/max band-following, close-vs-band compare) all run
  // EXACTLY at DP=20 — no Number round-trip per bar, so constant series converge
  // EXACTLY (fp-final-gate). Values convert once at the bar boundary
  // (pineValueToDecimal) and back at the exit (decimalToPineValue double-guards:
  // decimal NaN/±Inf AND JS Number overflow → NA — subsumes the old guardFinite).
  // R4: non-finite OHLC collapses to NA via isFiniteNumber BEFORE conversion, so
  // Infinity never reaches Decimal state; a NaN close[1] falls back to close.
  // mult defaults to 3.0 for a missing/NA/non-finite factor. period stays an
  // integer via Math.trunc — only VALUES are decimal, window sizing stays int.
  // prevUpper/prevLower are stored Decimal | null so band-following compares
  // exact decimals across bars. R5: period ≥ 1 by guard, so every div denominator
  // (count, period) is non-zero.
  eng.builtins.set('ta.supertrend', (factor: PineValue, atrPeriod: PineValue): PineValue => {
    if (!eng.currentContext) return [NA, NA] as PineValue;
    const mult = isFiniteNumber(factor) ? new Decimal(factor) : new Decimal(3.0);
    const period = Math.trunc(typeof atrPeriod === 'number' ? (atrPeriod as number) : 10);
    if (period <= 0) return [NA, NA] as PineValue;
    const ctx = eng.currentContext;
    const high = ctx.high.getRelative(0);
    const low = ctx.low.getRelative(0);
    const close = ctx.close.getRelative(0);
    if (!isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) {
      return [NA, NA] as PineValue;
    }
    // Convert ONCE at the bar boundary — the guard above guarantees finite
    // numbers, so pineValueToDecimal cannot produce the NaN marker here.
    const highD = pineValueToDecimal(high);
    const lowD = pineValueToDecimal(low);
    const closeD = pineValueToDecimal(close);
    // On bar 0 there is no close[1]; fall back to close so TR degrades to
    // max(high-low, |high-close|, |low-close|) — identical to ta.tr/ta.atr.
    //
    // Prefer ohlcHistory (the interpreter populates it with full bar history).
    // Fall back to ctx.close.getRelative(1) for direct calls (e.g. tests) where
    // the series carries the full history via contextAt.
    const ohlcClose = eng.ohlcHistory.close;
    let prevCloseD: Decimal;
    if (ohlcClose.length >= 2) {
      const prevCloseNum = ohlcClose[ohlcClose.length - 2];
      prevCloseD = isFinite(prevCloseNum) ? new Decimal(prevCloseNum) : closeD;
    } else {
      const rel1 = ctx.close.getRelative(1);
      prevCloseD =
        !isNa(rel1) && isFinite(Number(rel1))
          ? new Decimal(Number(rel1))
          : closeD;
    }
    const tr = Decimal.max(
      highD.minus(lowD),
      highD.minus(prevCloseD).abs(),
      lowD.minus(prevCloseD).abs(),
    );

    const key = `st_${period}_${eng.currentCallSiteId}`;
    if (!eng.supertrendState.has(key)) {
      eng.supertrendState.set(key, {
        atrCount: 0,
        atrPrev: new Decimal(0),
        prevUpper: null,
        prevLower: null,
        prevDirection: 1,  // PineScript: initial direction is downtrend (1)
      });
    }
    const state = eng.supertrendState.get(key)!;

    // Internal ATR via the same seed-then-Wilder RMA as ta.atr/ta.rma — the
    // warm-up SMA and the Wilder smoothing both accumulate EXACTLY at DP=20.
    let atr: Decimal | null;
    state.atrCount++;
    if (state.atrCount === 1) {
      state.atrPrev = tr;
      atr = null;
    } else if (state.atrCount <= period) {
      state.atrPrev = state.atrPrev
        .times(new Decimal(state.atrCount - 1))
        .plus(tr)
        .div(new Decimal(state.atrCount));
      atr = null;
    } else {
      state.atrPrev = state.atrPrev
        .times(new Decimal(period - 1))
        .plus(tr)
        .div(new Decimal(period));
      atr = state.atrPrev;
    }

    if (atr === null) {
      state.prevUpper = null;
      state.prevLower = null;
      return [NA, NA] as PineValue;
    }

    const hl2 = highD.plus(lowD).div(2);
    const upper = hl2.plus(mult.times(atr));
    const lower = hl2.minus(mult.times(atr));
    // Upper band: ratchet down only if close[1] was below previous upper;
    // otherwise reset to current upper (PineScript conditional band-following).
    const finalUpper = state.prevUpper === null
      ? upper
      : prevCloseD.lt(state.prevUpper)
        ? Decimal.min(upper, state.prevUpper)
        : upper;

    // Lower band: ratchet up only if close[1] was above previous lower;
    // otherwise reset to current lower (PineScript conditional band-following).
    const finalLower = state.prevLower === null
      ? lower
      : prevCloseD.gt(state.prevLower)
        ? Decimal.max(lower, state.prevLower)
        : lower;

    state.prevUpper = finalUpper;
    state.prevLower = finalLower;

    // PineScript: supertrend value depends on previous direction
    let st: Decimal;
    let direction: number;
    if (state.prevDirection === -1) {
      // Was uptrend: supertrend = lower band (support)
      // Flip to downtrend if close breaks below lower band (support)
      if (closeD.lt(finalLower)) {
        st = finalUpper;
        direction = 1;
      } else {
        st = finalLower;
        direction = -1;
      }
    } else {
      // Was downtrend: supertrend = upper band (resistance)
      // Flip to uptrend if close breaks above upper band (resistance)
      if (closeD.gt(finalUpper)) {
        st = finalLower;
        direction = -1;
      } else {
        st = finalUpper;
        direction = 1;
      }
    }
    state.prevDirection = direction;
    return [decimalToPineValue(st), direction] as PineValue;
  });
}
