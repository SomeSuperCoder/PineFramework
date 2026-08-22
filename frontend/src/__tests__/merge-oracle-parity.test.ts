import { describe, it, expect } from 'vitest';
import { mergeDiffIntoResult } from '../hooks/indicator-merge';
import { legacyMergeDiffIntoResult } from './fixtures/legacy-merge';
import {
  FIELD_SEMANTICS,
  normalizeExecutionResultMessage,
  type ExecutionResultDiffMessage,
  type ExecutionResultMessage,
  type ExecutionResultMessageInput,
  type TableCellData,
} from 'pine-framework/contracts';
import type { ScriptResult } from '../types';

/**
 * F3 PARITY ORACLE GUARDRAILS (shared execution-result contract refactor).
 *
 * The Director's requirement: "everything was passed even if empty so WS and
 * REST never drop the data of the other one." F2 replaced the hand-written
 * mergeDiffIntoResult with a map-driven driver over FIELD_SEMANTICS; the old
 * implementation is frozen VERBATIM at fixtures/legacy-merge.ts. These tests
 * feed the SAME diffs to both and assert identical output — except the
 * DOCUMENTED empty-diff-skip delta (B1 hazard fix): when a diff carries an
 * EMPTY value for a tail-merge map / full-replace field (plotColors: {},
 * fillColorData: {}, tables: []), the new driver SKIPS (preserves prev) while
 * the legacy CL OBBERED the accumulated data to the empty value. The tests
 * assert legacy's clobber is the bug and the new driver preserves.
 */

const SEC = 1000;

/**
 * A fully-shaped TableCellData fixture. The shared contract refactor made the
 * cell fields REQUIRED (text_color, text_halign, text_valign, bgcolor, width,
 * text_size, tooltip); the merge drivers treat cells as opaque data, so the
 * extra fields do not change any assertion — they only satisfy the type.
 */
function makeCell(text: string): TableCellData {
  return {
    text,
    text_color: '#fff',
    text_halign: 'center',
    text_valign: 'middle',
    bgcolor: '#000',
    width: 0,
    text_size: 'small',
    tooltip: '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** A representative REST-accumulated state the frontend holds pre-tick. */
function buildPrev(): ScriptResult {
  return {
    overlay: true,
    plots: [
      { type: 'line', data: [{ time: 1, value: 10, color: '#f00' }, { time: 2, value: 11, color: '#f00' }], color: '#f00', title: 'p0' },
      { type: 'line', data: [{ time: 1, value: 20, color: '#0f0' }], color: '#0f0', title: 'p1' },
    ],
    shapes: [{ type: 'circle', time: 100, price: 10, color: '#f00', text: 'S', location: 'abovebar', overlay: true }],
    fills: [{ from: 'A', to: 'B', color: '#abc' }],
    linefills: [
      {
        line1: { x1: 1, y1: 1, x2: 2, y2: 1, color: '#111' },
        line2: { x1: 1, y1: 2, x2: 2, y2: 2, color: '#222' },
        color: 'rgba(0,0,0,0.2)',
        fillgaps: true,
      },
    ],
    lines: [{ points: [{ time: 100, price: 10 }, { time: 101, price: 11 }], color: '#00f', width: 1, style: 'solid' }],
    labels: [{ time: 100, price: 10, text: 'L', color: '#0ff' }],
    boxes: [{ startTime: 100, startPrice: 5, endTime: 200, endPrice: 15, borderColor: '#abc' }],
    tables: [
      { position: 1, columns: 1, rows: 1, bgcolor: '#000', border_color: '#fff', border_width: 1, frame_color: '#aaa', frame_width: 1, cells: { '0,0': makeCell('v') }, mergedCells: [] },
    ],
    bgcolor: [{ time: 1, color: '#123' }],
    plotColors: { p0: ['#f00', '#0f0'] },
    fillColorData: { 'A::B': ['#111', '#222'] },
    barColors: [{ time: 5, body: '#f00', wick: '#0f0', border: '#00f', offset: 0 }],
    strategyMarkers: [
      { type: 'entry', name: 'm0', direction: 'long', action: 'buy', quantity: 1, price: 10, barIndex: 0, timestamp: 1000, color: '#fff' },
    ],
    alertTriggers: [{ alertId: 'a0', barIndex: 0, timestamp: 1000 }],
  };
}

/**
 * A fully-shaped diff message: every collection key DEFINED (the WS diff
 * serializer always emits all 17 — empty values included). barIndex 0 keeps
 * the mergeOutputs else-if "extend last value" branch inert by default so the
 * per-strategy tests stay focused.
 */
function makeDiff(
  overrides: Partial<Omit<ExecutionResultDiffMessage, 'isConfirmed'>> = {},
): ExecutionResultDiffMessage {
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
    linefills: [],
    bgcolor: [],
    barColors: [],
    strategyMarkers: [],
    lines: [],
    labels: [],
    boxes: [],
    tables: [],
    alertConditions: [],
    alertTriggers: [],
    hlines: [],
    barTimestamps: [],
    barIndex: 0,
    formingCandle: true,
    ...overrides,
  };
}

/** Run the same diff through BOTH implementations. */
function runBoth(prev: ScriptResult, msg: ExecutionResultMessage): { newResult: ScriptResult; legacyResult: ScriptResult } {
  return {
    newResult: mergeDiffIntoResult(prev, msg),
    legacyResult: legacyMergeDiffIntoResult(prev, msg),
  };
}

/** The fields the merge writes (from FIELD_SEMANTICS ∪ plots). */
const MERGED_FIELDS = [
  'plots', 'shapes', 'fills', 'linefills', 'lines', 'labels', 'boxes',
  'strategyMarkers', 'alertTriggers', 'plotColors', 'fillColorData',
  'bgcolor', 'barColors', 'tables',
] as const;

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) return false;
    return a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
  }
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const isMapEmpty = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;
const isEmptyArr = (v: unknown): boolean => Array.isArray(v) && v.length === 0;

/**
 * Assert full parity, applying the DOCUMENTED empty-diff-skip delta:
 * plotColors/fillColorData (maps) + tables (replace) with an EMPTY diff value
 * → the new driver preserves prev, the legacy clobbered to the empty value.
 * Every other field must be byte-identical.
 */
function assertParity(prev: ScriptResult, msg: ExecutionResultMessage, newR: ScriptResult, legacyR: ScriptResult, label: string): void {
  for (const f of MERGED_FIELDS) {
    const msgValue = (msg as unknown as Record<string, unknown>)[f];
    if ((f === 'plotColors' || f === 'fillColorData') && isMapEmpty(msgValue)) {
      expect(deepEqual(newR[f], prev[f]), `${label}: [${f}] new driver must PRESERVE prev on empty diff`).toBe(true);
      expect(deepEqual(legacyR[f], {}), `${label}: [${f}] legacy clobbered to {} (documented legacy bug)`).toBe(true);
    } else if (f === 'tables' && isEmptyArr(msgValue)) {
      expect(deepEqual(newR[f], prev[f]), `${label}: [tables] new driver must PRESERVE prev on empty diff`).toBe(true);
      expect(deepEqual(legacyR[f], []), `${label}: [tables] legacy clobbered to [] (documented legacy bug)`).toBe(true);
    } else {
      expect(deepEqual(newR[f], legacyR[f]), `${label}: [${f}] new !== legacy\n  new:    ${JSON.stringify(newR[f])}\n  legacy: ${JSON.stringify(legacyR[f])}`).toBe(true);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Deterministic hand-written diffs — one per merge strategy
// ─────────────────────────────────────────────────────────────────────────────

describe('merge oracle parity — deterministic diffs (new driver === legacy oracle)', () => {
  it('shapes: accumulate-dedupe by time — same-time replaces, new time appends', () => {
    const prev = buildPrev();
    const msg = makeDiff({
      shapes: [
        { style: 'circle', location: 'abovebar', color: '#f00', time: 100 * SEC, text: 'S-replaced' },
        { style: 'square', location: 'belowbar', color: '#00f', time: 300 * SEC, text: 'S-new' },
      ],
    });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'shapes');
    expect(newResult.shapes).toHaveLength(2);
    expect(newResult.shapes[0]!.text).toBe('S-replaced');
    expect(newResult.shapes[1]!.time).toBe(300);
  });

  it('fills: accumulate-dedupe by [from,to] — same pair replaces, new pair appends', () => {
    const prev = buildPrev();
    const msg = makeDiff({ fills: [{ from: 'A', to: 'B', color: '#new' }, { from: 'C', to: 'D', color: '#xyz' }] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'fills');
    expect(newResult.fills).toHaveLength(2);
    expect(newResult.fills![0]!.color).toBe('#new');
  });

  it('linefills: accumulate-dedupe by [line1.x1,line2.x1] — 6dbfa57 class: a NEW fill never replaces the accumulated ones', () => {
    const prev = buildPrev();
    // Same key as prev (1,2) with a new color → replaces that ONE element;
    // new key (7,8) → appended. ACCUMULATE, not replace: prev fill survives.
    const msg = makeDiff({
      linefills: [
        {
          line1: { x1: 1, y1: 1, x2: 2, y2: 1, color: '#111' },
          line2: { x1: 1, y1: 2, x2: 2, y2: 2, color: '#222' },
          color: 'rgba(9,9,9,0.5)',
          fillgaps: true,
        },
        {
          line1: { x1: 7, y1: 7, x2: 8, y2: 7, color: '#333' },
          line2: { x1: 7, y1: 8, x2: 8, y2: 8, color: '#444' },
          color: 'rgba(3,3,3,0.5)',
          fillgaps: true,
        },
      ],
    });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'linefills');
    expect(newResult.linefills).toHaveLength(2);
    expect(newResult.linefills![1]!.line1.x1).toBe(7);
  });

  it('lines: accumulate-dedupe by points[0].time', () => {
    const prev = buildPrev();
    const msg = makeDiff({
      lines: [
        { points: [{ time: 100 * SEC, price: 99 }, { time: 101 * SEC, price: 99 }], color: '#0ff', width: 2, style: 'dashed' },
        { points: [{ time: 400 * SEC, price: 40 }, { time: 401 * SEC, price: 41 }], color: '#f0f', width: 1, style: 'solid' },
      ],
    });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'lines');
    expect(newResult.lines).toHaveLength(2);
    expect(newResult.lines[0]!.style).toBe('dashed');
  });

  it('labels: accumulate-dedupe by time', () => {
    const prev = buildPrev();
    const msg = makeDiff({ labels: [{ time: 100 * SEC, price: 9, text: 'L-replaced', color: '#fff' }, { time: 500 * SEC, price: 5, text: 'L-new', color: '#999' }] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'labels');
    expect(newResult.labels).toHaveLength(2);
    expect(newResult.labels[0]!.text).toBe('L-replaced');
  });

  it('boxes: accumulate-dedupe by startTime', () => {
    const prev = buildPrev();
    const msg = makeDiff({ boxes: [{ startTime: 100 * SEC, startPrice: 5, endTime: 150 * SEC, endPrice: 15, borderColor: '#new' }, { startTime: 600 * SEC, startPrice: 6, endTime: 700 * SEC, endPrice: 16, borderColor: '#999' }] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'boxes');
    expect(newResult.boxes).toHaveLength(2);
    expect(newResult.boxes[0]!.borderColor).toBe('#new');
  });

  it('strategyMarkers: pure append with NO dedupe (dedupeKeys: []) — a duplicate marker is appended twice', () => {
    const prev = buildPrev();
    const dup = { type: 'entry', name: 'm0', direction: 'long', action: 'buy', quantity: 1, price: 10, barIndex: 0, timestamp: 1000, color: '#fff' };
    const msg = makeDiff({ strategyMarkers: [dup] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'strategyMarkers');
    expect(newResult.strategyMarkers).toHaveLength(2);
  });

  it('plotColors: tail-merge per key (prev tail sliced by diff length) + new keys added', () => {
    const prev = buildPrev();
    const msg = makeDiff({ plotColors: { p0: ['#00f', '#ff0'], p2: ['#111'] } });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'plotColors');
    // Tail-merge REPLACES the last N entries per key (prev p0 had 2 entries, diff has 2 → both replaced).
    expect(newResult.plotColors).toEqual({ p0: ['#00f', '#ff0'], p2: ['#111'] });
  });

  it('fillColorData: tail-merge + transformFillKey strips metadata from the diff key', () => {
    const prev = buildPrev();
    const msg = makeDiff({ fillColorData: { 'A__style:line::B__lw:2': ['#333'] } });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'fillColorData');
    expect(newResult.fillColorData).toEqual({ 'A::B': ['#111', '#333'] });
  });

  it('bgcolor: tail-merge with ms→s time conversion (diff replaces the LAST N prev entries)', () => {
    const prev = buildPrev();
    const msg = makeDiff({ bgcolor: [{ time: 2000, color: '#456' }] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'bgcolor');
    expect(newResult.bgcolor).toEqual([{ time: 2, color: '#456' }]);
  });

  it('barColors: time-map merge + sort (same time updates, new times inserted, result sorted ascending)', () => {
    const prev = buildPrev();
    const msg = makeDiff({ barColors: [{ time: 5, bodyColor: '#new', wickColor: '#w', borderColor: '#b', offset: 1 }, { time: 3, bodyColor: '#333' }] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'barColors');
    expect(newResult.barColors).toEqual([
      { time: 3, body: '#333', wick: undefined, border: undefined, offset: undefined },
      { time: 5, body: '#new', wick: '#w', border: '#b', offset: 1 },
    ]);
  });

  it('outputs: same-bar update replaces the LAST value (barIndex < data.length)', () => {
    const prev = buildPrev();
    const msg = makeDiff({ outputs: { p0: [12] }, barIndex: 1 });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'outputs update');
    expect(newResult.plots[0]!.data).toEqual([
      { time: 1, value: 10, color: '#f00' },
      { time: 2, value: 12, color: '#f00' },
    ]);
  });

  it('outputs: new-bar append pushes a new point with the ms→s timestamp (barIndex >= data.length)', () => {
    const prev = buildPrev();
    const msg = makeDiff({ outputs: { p0: [13] }, barIndex: 2, barTimestamps: [1000, 2000, 3000] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'outputs append');
    expect(newResult.plots[0]!.data).toHaveLength(3);
    expect(newResult.plots[0]!.data[2]).toEqual({ time: 3, value: 13, color: '#f00' });
  });

  it('tables: full replace when the diff carries a NON-empty table', () => {
    const prev = buildPrev();
    const replacement = { position: 2, columns: 2, rows: 2, bgcolor: '#111', border_color: '#222', border_width: 2, frame_color: '#333', frame_width: 2, cells: { '0,0': makeCell('new') }, mergedCells: [] };
    const msg = makeDiff({ tables: [replacement] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'tables replace');
    expect(newResult.tables).toEqual([replacement]);
  });

  it('alertTriggers: accumulate-dedupe by alertId+barIndex — duplicates dropped, new appended', () => {
    const prev = buildPrev();
    const msg = makeDiff({ alertTriggers: [{ alertId: 'a0', barIndex: 0, timestamp: 9999 }, { alertId: 'a1', barIndex: 1, timestamp: 2000 }] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'alertTriggers');
    expect(newResult.alertTriggers).toEqual([
      { alertId: 'a0', barIndex: 0, timestamp: 1000 },
      { alertId: 'a1', barIndex: 1, timestamp: 2000 },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Empty-diff-skip delta — the B1 hazard fix, asserted EXPLICITLY
// ─────────────────────────────────────────────────────────────────────────────

describe('merge oracle parity — documented empty-diff-skip delta (new driver preserves, legacy clobbers)', () => {
  it('tables: [] diff → new PRESERVES prev.tables; legacy replaced them with []', () => {
    const prev = buildPrev();
    const msg = makeDiff({ tables: [] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    expect(newResult.tables).toEqual(prev.tables);
    expect(legacyResult.tables).toEqual([]);
  });

  it('plotColors: {} diff → new PRESERVES prev.plotColors; legacy clobbered to {}', () => {
    const prev = buildPrev();
    const msg = makeDiff({ plotColors: {} });
    const { newResult, legacyResult } = runBoth(prev, msg);
    expect(newResult.plotColors).toEqual(prev.plotColors);
    expect(legacyResult.plotColors).toEqual({});
  });

  it('fillColorData: {} diff → new PRESERVES prev.fillColorData; legacy clobbered to {}', () => {
    const prev = buildPrev();
    const msg = makeDiff({ fillColorData: {} });
    const { newResult, legacyResult } = runBoth(prev, msg);
    expect(newResult.fillColorData).toEqual(prev.fillColorData);
    expect(legacyResult.fillColorData).toEqual({});
  });

  it('bgcolor: [] diff → NO delta — both preserve prev (legacy slice guard kept the data)', () => {
    const prev = buildPrev();
    const msg = makeDiff({ bgcolor: [] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'bgcolor empty');
    expect(newResult.bgcolor).toEqual(prev.bgcolor);
  });

  it('barColors: [] diff → NO delta — both skip (explicit guard on both sides)', () => {
    const prev = buildPrev();
    const msg = makeDiff({ barColors: [] });
    const { newResult, legacyResult } = runBoth(prev, msg);
    assertParity(prev, msg, newResult, legacyResult, 'barColors empty');
    expect(newResult.barColors).toEqual(prev.barColors);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Seeded random diffs — N=50, deterministic (mulberry32)
// ─────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX = ['#f00', '#0f0', '#00f', '#ff0', '#f0f', '#0ff', '#123', '#abc', '#999', '#111', '#222', '#333'];

function randInt(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

function randColor(rnd: () => number): string {
  return HEX[randInt(rnd, 0, HEX.length - 1)]!;
}

/** Build a random diff message: every collection either empty or 1-2 elements. */
function randomDiff(rnd: () => number): ExecutionResultMessage {
  const maybe = <T>(chanceEmpty: number, make: () => T): T[] => (rnd() < chanceEmpty ? [] : Array.from({ length: randInt(rnd, 1, 2) }, make));
  const times = () => randInt(rnd, 50, 500) * SEC;
  return makeDiff({
    outputs: rnd() < 0.3 ? {} : { p0: [randInt(rnd, 1, 999)], 'p1__lw:2': [randInt(rnd, 1, 999)], p2: [randInt(rnd, 1, 999)] },
    plotColors: rnd() < 0.3 ? {} : { p0: [randColor(rnd), randColor(rnd)] },
    fillColorData: rnd() < 0.3 ? {} : { 'A__style:line::B__lw:2': [randColor(rnd)] },
    hiddenPlotKeys: rnd() < 0.5 ? [] : ['h1__lw:1'],
    plotOverlayKeys: rnd() < 0.5 ? [] : ['o1__style:line'],
    shapes: maybe(0.3, () => ({ style: 'circle', location: 'abovebar', color: randColor(rnd), time: times(), text: 's', overlay: true })),
    fills: maybe(0.3, () => ({ from: ['A', 'B', 'C'][randInt(rnd, 0, 2)]!, to: ['B', 'C', 'D'][randInt(rnd, 0, 2)]!, color: randColor(rnd) })),
    linefills: maybe(0.3, () => ({
      line1: { x1: randInt(rnd, 1, 12), y1: randInt(rnd, 1, 9), x2: randInt(rnd, 1, 12), y2: randInt(rnd, 1, 9), color: randColor(rnd) },
      line2: { x1: randInt(rnd, 1, 12), y1: randInt(rnd, 1, 9), x2: randInt(rnd, 1, 12), y2: randInt(rnd, 1, 9), color: randColor(rnd) },
      color: randColor(rnd),
      fillgaps: true,
    })),
    lines: maybe(0.3, () => ({ points: [{ time: times(), price: randInt(rnd, 1, 999) }, { time: times(), price: randInt(rnd, 1, 999) }], color: randColor(rnd), width: randInt(rnd, 1, 3), style: 'solid' })),
    labels: maybe(0.3, () => ({ time: times(), price: randInt(rnd, 1, 999), text: 'l', color: randColor(rnd) })),
    boxes: maybe(0.3, () => ({ startTime: times(), startPrice: randInt(rnd, 1, 99), endTime: times(), endPrice: randInt(rnd, 1, 99), borderColor: randColor(rnd) })),
    strategyMarkers: maybe(0.3, () => ({ type: 'entry', name: 'm', direction: 'long', action: 'buy', quantity: 1, price: randInt(rnd, 1, 999), barIndex: randInt(rnd, 0, 5), timestamp: times(), color: randColor(rnd) })),
    alertTriggers: maybe(0.3, () => ({ alertId: ['a0', 'a1', 'a2'][randInt(rnd, 0, 2)]!, barIndex: randInt(rnd, 0, 3), timestamp: times() })),
    bgcolor: maybe(0.3, () => ({ time: randInt(rnd, 1000, 9000), color: randColor(rnd) })),
    barColors: maybe(0.3, () => ({ time: randInt(rnd, 1, 8), bodyColor: randColor(rnd) })),
    tables: rnd() < 0.5 ? [] : [{ position: 1, columns: 1, rows: 1, bgcolor: '#000', border_color: '#fff', border_width: 1, frame_color: '#aaa', frame_width: 1, cells: { '0,0': makeCell('v') }, mergedCells: [] }],
    barTimestamps: rnd() < 0.5 ? undefined : Array.from({ length: 10 }, (_, i) => (i + 1) * 1000),
    barIndex: randInt(rnd, 0, 8),
  });
}

describe(`merge oracle parity — seeded random diffs (N=50, seed=20260818)`, () => {
  it('both merges produce IDENTICAL output on 50 random diffs (modulo the documented empty-diff-skip delta)', () => {
    const rnd = mulberry32(20260818);
    for (let i = 0; i < 50; i++) {
      const prev = buildPrev();
      const msg = randomDiff(rnd);
      const { newResult, legacyResult } = runBoth(prev, msg);
      assertParity(prev, msg, newResult, legacyResult, `seed=20260818 iter=${i}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. FIELD_SEMANTICS exhaustiveness — runtime reflection guard
// ─────────────────────────────────────────────────────────────────────────────

const CONTRACT_COLLECTION_KEYS = [
  'outputs', 'plotColors', 'fillColorData', 'hiddenPlotKeys', 'plotOverlayKeys',
  'shapes', 'fills', 'linefills', 'bgcolor', 'barColors', 'strategyMarkers',
  'lines', 'labels', 'boxes', 'tables', 'alertConditions', 'alertTriggers',
];

describe('FIELD_SEMANTICS exhaustiveness (runtime reflection vs the contract)', () => {
  it('FIELD_SEMANTICS keys == the 16 mergeable diff-variant collection keys (alertConditions is intentionally NOT merged)', () => {
    const expected = [...CONTRACT_COLLECTION_KEYS].filter((k) => k !== 'alertConditions').sort();
    expect(Object.keys(FIELD_SEMANTICS).sort()).toEqual(expected);
  });

  it('every FIELD_SEMANTICS key is a real normalized payload key (no phantom / as-any escape)', () => {
    const sample = normalizeExecutionResultMessage({});
    const payloadKeys = new Set(Object.keys(sample));
    for (const k of Object.keys(FIELD_SEMANTICS)) {
      expect(payloadKeys.has(k), `FIELD_SEMANTICS key "${k}" missing from normalized payload`).toBe(true);
    }
  });

  it('normalize guarantees all 17 collections on every message — arrays for lists, maps for outputs/colors (the "even if empty" mandate)', () => {
    const sample = normalizeExecutionResultMessage({}) as unknown as Record<string, unknown>;
    for (const k of CONTRACT_COLLECTION_KEYS) {
      expect(k in sample, `missing collection key "${k}"`).toBe(true);
      if (k === 'outputs' || k === 'plotColors' || k === 'fillColorData') {
        expect(typeof sample[k]).toBe('object');
        expect(Array.isArray(sample[k])).toBe(false);
      } else {
        expect(Array.isArray(sample[k]), `"${k}" should be an array`).toBe(true);
      }
    }
  });

  it('every semantics entry is well-formed: kind/merge enums + dedupeKeys declared for accumulate-dedupe (strategyMarkers = empty = plain append)', () => {
    for (const [k, s] of Object.entries(FIELD_SEMANTICS)) {
      expect(['static', 'diff', 'full']).toContain(s.kind);
      expect(['replace', 'accumulate-dedupe', 'tail-merge', 'outputs-append-update']).toContain(s.merge);
      if (s.merge === 'accumulate-dedupe') {
        expect(Array.isArray(s.dedupeKeys), `accumulate-dedupe field "${k}" must declare dedupeKeys`).toBe(true);
      }
    }
    expect(FIELD_SEMANTICS.strategyMarkers.dedupeKeys).toEqual([]);
    expect(FIELD_SEMANTICS.outputs.merge).toBe('outputs-append-update');
    expect(FIELD_SEMANTICS.tables.merge).toBe('replace');
  });

  it('unknown keys are stripped by normalize (payload key set == contract key set, nothing extra)', () => {
    const input = { success: true, bogus: 'x', outputs: { p: [1] } } as ExecutionResultMessageInput;
    const out = normalizeExecutionResultMessage(input) as unknown as Record<string, unknown>;
    expect('bogus' in out).toBe(false);
    expect(out.outputs).toEqual({ p: [1] });
  });
});
