import { describe, it, expect } from 'vitest';
import { mergeDiffIntoResult } from '../hooks/indicator-merge';
import type { ScriptResult, LineData, LinefillData } from '../types';
import type { ExecutionResultMessage } from '../hooks/chart-data-transform';

/**
 * REGRESSION — supertrend-3d LINEFILL-vanish bug (vector: supertrend-3d-fills-vanish-v1).
 *
 * Ground truth (Director): on indicator add, REST full result carries 81 linefills +
 * 339 lines. Lines persist past the WS arrival, but the 81 fills vanished ~n seconds
 * after adding (first live forming tick); re-add restores, then they vanish again.
 *
 * Root cause (PROVEN): `mergeDiffIntoResult` (frontend/src/hooks/indicator-merge.ts)
 * treated linefills as FULL-STATE REPLACE. The WS forming-tick serializer ALWAYS emits
 * a defined `linefills` array (FormingCandleManager.toFormingCandleOutputs —
 * `(result.diffLinefills || []).map(...)`), and forming-candle.ts carries ONLY
 * newly-created fills (0-2, then consumes them). So the first forming tick delivered
 * `linefills: []` — an EMPTY ARRAY IS TRUTHY in JS — which CLOBBERED the accumulated
 * 81 to []. PRE-FIX behavior: empty tick → 81→0; tick with 1 new fill → 81→1.
 * Lines use `diffX.length > 0 ? [...prev.filter(!dup), ...diffX] : prev` —
 * ACCUMULATE + preserve — which is why lines survived and fills died.
 *
 * FIX (landed): the linefills branch now ACCUMULATE+dedupe mirroring lines/fills:
 *   diffLinefills.length > 0
 *     ? [...(prev.linefills || []).filter(!dup by line1.x1 + line2.x1), ...diffLinefills]
 *     : prev.linefills || []
 *
 * The tests below assert PRESERVATION (the FIXED behavior). They fail RED against
 * the pre-fix replace semantics — that is intentional: the bug is fixed, so the
 * old expectations (81→0, 81→1) are gone. The pre-fix numbers are documented above
 * so the regression's purpose stays clear.
 */

const EMPTY_RESULT: ScriptResult = {
  overlay: true,
  plots: [],
  shapes: [],
  lines: [],
  boxes: [],
  labels: [],
  tables: [],
};

function makeLine(time1: number, time2: number, price: number): LineData {
  return {
    points: [
      { time: time1, price },
      { time: time2, price },
    ],
    color: '#ff0000',
    width: 1,
    style: 'dotted',
    extend: 'none',
  };
}

function makeLinefill(seed: number): LinefillData {
  return {
    line1: {
      x1: seed,
      y1: 100 + seed,
      x2: seed + 1,
      y2: 100 + seed,
      color: '#00ff00',
    },
    line2: {
      x1: seed,
      y1: 200 + seed,
      x2: seed + 1,
      y2: 200 + seed,
      color: '#ff0000',
    },
    color: 'rgba(0, 255, 0, 0.2)',
    fillgaps: true,
  };
}

/** Director's ground truth counts for supertrend-3d on add (REST full result). */
const FILL_COUNT = 81;
const LINE_COUNT = 339;

/** The REST-accumulated state the frontend holds before the first WS forming tick. */
function makePrevState(): ScriptResult {
  return {
    ...EMPTY_RESULT,
    lines: Array.from({ length: LINE_COUNT }, (_, i) => makeLine(i * 1000, i * 1000 + 100, 50000 + i)),
    linefills: Array.from({ length: FILL_COUNT }, (_, i) => makeLinefill(i)),
  };
}

/**
 * Minimal forming-tick diff message, shaped exactly as the WS serializer emits it:
 * `linefills` is ALWAYS a defined array — `[]` when the tick created no new fills
 * (FCM.ts:357-362,399), `formingCandle: true` (FCM.ts:403).
 */
function makeTickMsg(overrides: Partial<ExecutionResultMessage> = {}): ExecutionResultMessage {
  return {
    isConfirmed: false,
    success: true,
    overlay: true,
    outputs: {},
    plotColors: {},
    fillColorData: {},
    hiddenPlotKeys: [],
    plotOverlayKeys: [],
    shapes: [],
    fills: [],
    strategyMarkers: [],
    bgcolor: [],
    barColors: [],
    labels: [],
    boxes: [],
    tables: [],
    alertConditions: [],
    alertTriggers: [],
    lines: [
      {
        points: [
          { time: 9_999_999, price: 99_999 },
          { time: 9_999_999 + 100, price: 99_999 },
        ],
        color: '#ff0000',
        width: 1,
        style: 'dotted',
      },
    ], // one new forming-candle line
    linefills: [], // ← the linchpin: a DEFINED empty array (truthy in JS)
    formingCandle: true,
    barIndex: 0,
    ...overrides,
  };
}

describe('mergeDiffIntoResult linefills accumulate+dedupe (supertrend-3d fills-vanish regression)', () => {
  it('PROOF: a forming tick with EMPTY linefills PRESERVES all 81 accumulated fills (pre-fix: clobbered to 0)', () => {
    const prev = makePrevState();
    const msg = makeTickMsg();

    const result = mergeDiffIntoResult(prev, msg);

    // FIXED (accumulate+preserve, mirrors lines): empty diff array → all 81 survive.
    // Pre-fix replace semantics: `linefills: msg.linefills || prev.linefills || []`
    // → msg.linefills is `[]` (truthy) → prev.linefills (81) REPLACED by [] → 0.
    expect((result.linefills ?? []).length).toBe(FILL_COUNT);
    expect(result.lines.length).toBeGreaterThanOrEqual(LINE_COUNT);
  });

  it('PROOF: a forming tick that creates ONE new fill ACCUMULATES — 81 preserved + 1 new = 82 (pre-fix: 1)', () => {
    const prev = makePrevState();
    const msg = makeTickMsg({ linefills: [makeLinefill(9_999)] });

    const result = mergeDiffIntoResult(prev, msg);

    // FIXED: prev 81 kept (dedupe is a no-op — seed 9_999 is new) + 1 new fill = 82.
    // Pre-fix replace semantics: msg.linefills = [1 new] replaced the 81 → 1.
    expect((result.linefills ?? []).length).toBe(FILL_COUNT + 1);
    // Spot-check the ORIGINAL fills survived (not replaced by the diff).
    expect(result.linefills?.some((lf) => lf.line1.x1 === 0)).toBe(true);
    expect(result.lines.length).toBeGreaterThanOrEqual(LINE_COUNT);
  });

  it('REGRESSION (was the RED marker pre-fix, now GREEN): linefills must ACCUMULATE+dedupe like lines — a tick with empty linefills preserves prev.linefills', () => {
    const prev = makePrevState();
    const msg = makeTickMsg();

    const result = mergeDiffIntoResult(prev, msg);

    // This was the RED marker ('expected +0 to be 81') before the merge fix landed:
    // the buggy replace produced `linefills: []`. Correct behavior mirrors the
    // lines branch (indicator-merge.ts): with an empty diff array, ALL 81
    // accumulated fills survive.
    expect((result.linefills ?? []).length).toBe(FILL_COUNT);
  });
});
