/**
 * Execution result wire contract — SINGLE SOURCE OF TRUTH for the
 * execution-result payload shared by WebSocket and REST.
 *
 * WHY THIS MODULE EXISTS (Director mandate):
 *   WS and REST historically built their response shapes independently
 *   (backend ScriptOutputs, frontend ExecuteResponse/ExecutionResultMessage —
 *   three copies of the same payload that drifted: optionality, extend,
 *   maxLookback, mergedCells, isConfirmed). The mandate: build both from ONE
 *   source of truth so neither drops the other's data — "everything passed
 *   even if empty".
 *
 * RULES OF THE CONTRACT:
 *   1. Collection fields are REQUIRED (never optional) — "empty = []" is
 *      enforced by the type AND by normalizeExecutionResultMessage().
 *   2. formingCandle? / barIndex? / barTimestamps? stay OPTIONAL on BOTH
 *      union members (Frontend Lead carve-out): six existing frontend callers
 *      access them un-narrowed (useChartData.ts:351-357 isDiff heuristic).
 *      Only the collection fields above are required.
 *   3. Field-complete vs the WIRE: every key the producers emit must exist
 *      here (incl. tables.mergedCells — ScriptOutputs omitted it while the
 *      mapper EMITS it; REST-only maxLookback; lines[].extend; shape/label/
 *      alertCondition text that the REST mapper HTML-escapes). normalize()
 *      strips unknown keys — a field missing from this file would be silently
 *      deleted on the wire.
 *   4. Pure wire types: zero imports (no engine internals, no Node built-ins,
 *      no Buffer/process). Safe in backend (Node) AND frontend (Vite
 *      source-condition alias via frontend-safe.ts).
 *
 * Wire-format invariance: this file describes what the wire ALREADY emits
 * (plus the deliberate empty-array fixes). normalize() fills + strips only;
 * it never renames keys or relocates data. The output is a fresh object in a
 * canonical key order — JSON object key order is not part of the wire
 * contract (consumers read by key).
 */

// ---------------------------------------------------------------------------
// Wire element types (pure JSON shapes — no engine internals)
// ---------------------------------------------------------------------------

export type OutputValue = number | string | boolean | null;
export type OutputValuesMap = Record<string, OutputValue[]>;
export type ColorValuesMap = Record<string, (string | null)[]>;

export interface ShapeData {
  style: string;
  location: string;
  color: string;
  time: number;
  /** REST mapper HTML-escapes this; WS passes it raw. Field must exist or normalize would strip it. */
  text: string;
  /** Absent on the WS forming-diff producer (FormingCandleManager diff mapping). */
  price?: number;
  overlay?: boolean;
  /** Carried by the engine (ShapeEntry) — not emitted by current mappers, kept for forward-compat. */
  textcolor?: string;
}

export interface FillData {
  from: string;
  to: string;
  color: string;
}

export interface LinePointData {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface LinefillData {
  line1: LinePointData;
  line2: LinePointData;
  color: string;
  fillgaps: boolean;
}

export interface LineData {
  points: Array<{ time: number; price: number }>;
  color: string;
  width?: number;
  /** Mappers normalize engine style_* to these three. */
  style?: 'solid' | 'dotted' | 'dashed';
  /** REST-only today (execute.ts emits `extend || 'none'`); absent on WS — field must exist or normalize would strip it. */
  extend?: 'none' | 'left' | 'right' | 'both';
}

export interface LabelData {
  time: number;
  price: number;
  /** REST mapper HTML-escapes this; WS passes it raw. */
  text: string;
  color?: string;
  textColor?: string;
  style?: string;
  size?: string;
}

export interface BoxData {
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  borderColor?: string;
  backgroundColor?: string;
}

export interface StrategyMarkerData {
  type: string;
  name: string;
  direction: string;
  action: string;
  quantity: number;
  price: number;
  barIndex: number;
  timestamp: number;
  color: string;
  comment?: string;
}

export interface BgColorData {
  time: number;
  color: string;
}

export interface BarColorData {
  time: number;
  bodyColor?: string;
  wickColor?: string;
  borderColor?: string;
  offset?: number;
  /** Backward-compat alias for bodyColor — the backend emits both (execute.ts, FormingCandleManager). */
  color?: string;
}

export interface TableCellData {
  text: string;
  text_color: string;
  text_halign: string;
  text_valign: string;
  bgcolor: string;
  width: number;
  text_size: string;
  text_font_family?: string;
  tooltip: string;
}

export interface MergedRegionData {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

export interface TableData {
  position: number;
  columns: number;
  rows: number;
  bgcolor: string;
  border_color: string;
  border_width: number;
  frame_color: string;
  frame_width: number;
  cells: Record<string, TableCellData>; // key: "col,row"
  /**
   * CRITICAL field-completeness fix: the backend mappers EMIT mergedCells
   * while the old ScriptOutputs type OMITTED it — a contract without it would
   * let normalize() silently delete live table merges.
   */
  mergedCells: MergedRegionData[];
}

export interface AlertConditionData {
  id: string;
  /** REST mapper HTML-escapes title+message; WS passes them raw. */
  title: string;
  message: string;
}

export interface AlertTriggerData {
  alertId: string;
  /** 0-based bar index; the frontend shifts it by the prepend count (prependIndicatorResult). */
  barIndex: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Shared payload fields — the WIRE surface common to WS messages and REST
// ---------------------------------------------------------------------------

export interface ExecutionResultPayloadFields {
  success: boolean;
  error?: string;
  /** REST emits `version ?? null`; WS emits `version ?? undefined`. */
  version?: number | null;
  overlay: boolean;
  /** Added by the WS gateway wrapper (gateway.ts), not by the payload producers. */
  indicatorId?: string;

  // ── Collection fields — REQUIRED, never optional. "Empty = []" is the
  //    Director's core mandate: a message must never silently drop data by
  //    omitting a collection key. normalize() fills any the producers miss.
  outputs: OutputValuesMap;
  plotColors: ColorValuesMap;
  fillColorData: ColorValuesMap;
  hiddenPlotKeys: string[];
  plotOverlayKeys: string[];
  shapes: ShapeData[];
  fills: FillData[];
  linefills: LinefillData[];
  bgcolor: BgColorData[];
  barColors: BarColorData[];
  strategyMarkers: StrategyMarkerData[];
  lines: LineData[];
  labels: LabelData[];
  boxes: BoxData[];
  tables: TableData[];
  alertConditions: AlertConditionData[];
  alertTriggers: AlertTriggerData[];

  // ── Frontend Lead carve-out — optional on BOTH union members (only the
  //    collection fields above are required). Six existing frontend callers
  //    access these un-narrowed (useChartData.ts:351-357 isDiff heuristic);
  //    making them required would force a behavior-changing rewrite.
  barTimestamps?: number[];
  barIndex?: number;
  formingCandle?: boolean;
}

// ---------------------------------------------------------------------------
// The discriminated union — the WS message payload
// ---------------------------------------------------------------------------

export interface ExecutionResultFullMessage extends ExecutionResultPayloadFields {
  /** Full-dataset snapshot (REST-equivalent). */
  isConfirmed: true;
}

export interface ExecutionResultDiffMessage extends ExecutionResultPayloadFields {
  /** Incremental forming-candle update — the frontend merges it into the full snapshot. */
  isConfirmed: false;
}

/** WS execution-result payload, discriminated on the existing isConfirmed field. */
export type ExecutionResultMessage =
  | ExecutionResultFullMessage
  | ExecutionResultDiffMessage;

// ---------------------------------------------------------------------------
// The REST response shape (separate named shape — do NOT fold into the union)
// ---------------------------------------------------------------------------

export interface ExecuteResponse extends ExecutionResultPayloadFields {
  /**
   * REST-only: how many bars the engine consumed for this run. execute.ts
   * always emits it (`result.maxLookback ?? 0`). Field must exist here or
   * normalize() would strip it from the REST payload.
   */
  maxLookback: number;
  // NOTE: REST has NO isConfirmed today — B3 adds `isConfirmed: true` to the
  // REST response later. Keeping ExecuteResponse as its own named shape NOW
  // keeps the type correct, and it is structurally compatible with the full
  // variant: B3 constructs `{ ...ExecuteResponse, isConfirmed: true }` and
  // gets ExecutionResultFullMessage.
}

// ---------------------------------------------------------------------------
// Loose input for normalize() — every wire key optional. Producers that still
// omit required collections (the pre-B2 gaps) are legal INPUTS; normalize()
// guarantees the OUTPUT satisfies the contract.
// ---------------------------------------------------------------------------

export interface ExecutionResultMessageInput {
  success?: boolean;
  error?: string;
  version?: number | null;
  overlay?: boolean;
  indicatorId?: string;
  outputs?: OutputValuesMap;
  plotColors?: ColorValuesMap;
  fillColorData?: ColorValuesMap;
  hiddenPlotKeys?: string[];
  plotOverlayKeys?: string[];
  shapes?: ShapeData[];
  fills?: FillData[];
  linefills?: LinefillData[];
  bgcolor?: BgColorData[];
  barColors?: BarColorData[];
  strategyMarkers?: StrategyMarkerData[];
  lines?: LineData[];
  labels?: LabelData[];
  boxes?: BoxData[];
  tables?: TableData[];
  alertConditions?: AlertConditionData[];
  alertTriggers?: AlertTriggerData[];
  barTimestamps?: number[];
  barIndex?: number;
  formingCandle?: boolean;
  maxLookback?: number;
  isConfirmed?: boolean;
}

// ---------------------------------------------------------------------------
// Per-field merge semantics — data, not code (the F2 driver iterates this map
// instead of inline merge branches). EXHAUSTIVE over the diff-variant data
// keys: the FieldSemanticsMap type makes a missing key a compile error and an
// extra key an excess-property error.
// ---------------------------------------------------------------------------

export type FieldMergeKind = 'static' | 'diff' | 'full';
export type FieldMergeStrategy =
  | 'replace'
  | 'accumulate-dedupe'
  | 'tail-merge'
  | 'outputs-append-update';

export interface FieldSemantics {
  /** Message kind the field is meaningful on. */
  kind: FieldMergeKind;
  merge: FieldMergeStrategy;
  /**
   * Per-element dedupe paths for merge === 'accumulate-dedupe'
   * (e.g. 'points[0].time' resolves points[0].time on each element).
   * Empty array = plain accumulate with NO dedupe (e.g. strategyMarkers) —
   * the driver MUST support an empty dedupeKeys array.
   */
  dedupeKeys?: string[];
}

/** Exhaustive key surface of the mergeable diff-variant data fields. */
export interface FieldSemanticsMap {
  outputs: FieldSemantics;
  plotColors: FieldSemantics;
  fillColorData: FieldSemantics;
  hiddenPlotKeys: FieldSemantics;
  plotOverlayKeys: FieldSemantics;
  shapes: FieldSemantics;
  fills: FieldSemantics;
  linefills: FieldSemantics;
  bgcolor: FieldSemantics;
  barColors: FieldSemantics;
  strategyMarkers: FieldSemantics;
  lines: FieldSemantics;
  labels: FieldSemantics;
  boxes: FieldSemantics;
  tables: FieldSemantics;
  alertTriggers: FieldSemantics;
}

/**
 * The EXACT semantics of the current mergeDiffIntoResult implementation
 * (frontend/src/hooks/indicator-merge.ts) — verified field by field against
 * the merge code. If a collection's merge behavior changes, THIS map is the
 * single place to change it (plus the F2 driver's strategy function).
 */
export const FIELD_SEMANTICS: FieldSemanticsMap = {
  hiddenPlotKeys: { kind: 'static', merge: 'replace' },
  plotOverlayKeys: { kind: 'static', merge: 'replace' },
  shapes: { kind: 'diff', merge: 'accumulate-dedupe', dedupeKeys: ['time'] },
  fills: { kind: 'diff', merge: 'accumulate-dedupe', dedupeKeys: ['from', 'to'] },
  linefills: {
    kind: 'diff',
    merge: 'accumulate-dedupe',
    dedupeKeys: ['line1.x1', 'line2.x1'],
  },
  lines: {
    kind: 'diff',
    merge: 'accumulate-dedupe',
    dedupeKeys: ['points[0].time'],
  },
  labels: { kind: 'diff', merge: 'accumulate-dedupe', dedupeKeys: ['time'] },
  boxes: { kind: 'diff', merge: 'accumulate-dedupe', dedupeKeys: ['startTime'] },
  strategyMarkers: { kind: 'diff', merge: 'accumulate-dedupe', dedupeKeys: [] },
  alertTriggers: {
    kind: 'diff',
    merge: 'accumulate-dedupe',
    dedupeKeys: ['alertId', 'barIndex'],
  },
  plotColors: { kind: 'diff', merge: 'tail-merge' },
  fillColorData: { kind: 'diff', merge: 'tail-merge' },
  bgcolor: { kind: 'diff', merge: 'tail-merge' },
  barColors: { kind: 'diff', merge: 'tail-merge' },
  outputs: { kind: 'diff', merge: 'outputs-append-update' },
  tables: { kind: 'full', merge: 'replace' },
};

// ---------------------------------------------------------------------------
// normalizeExecutionResultMessage — pure wire normalizer
// ---------------------------------------------------------------------------

function copyArray<T>(value: readonly T[] | undefined): T[] {
  return value === undefined ? [] : [...value];
}

function copyRecord<T>(value: Record<string, readonly T[]> | undefined): Record<string, T[]> {
  if (value === undefined) return {};
  const out: Record<string, T[]> = {};
  for (const key of Object.keys(value)) {
    out[key] = [...value[key]];
  }
  return out;
}

function copyOptionalArray<T>(value: readonly T[] | undefined): T[] | undefined {
  return value === undefined ? undefined : [...value];
}

/**
 * Pure wire normalizer — the ONLY place unknown keys are stripped and missing
 * required collections are filled.
 *
 * Contract with callers:
 *  - Returns a NEW object (never the input), and never freezes it — the
 *    frontend MUTATES the result's arrays in place (seed-trim slices,
 *    handleExecutionResult trim path), so the result must stay mutable.
 *  - Never mutates the input: every array is a defensive copy, so a caller's
 *    in-place mutation of the result cannot leak back into the producer's
 *    message.
 *  - Known scalar/optional keys (error, version, barTimestamps, barIndex,
 *    formingCandle, maxLookback, indicatorId) pass through untouched.
 *  - Unknown keys are dropped by construction (only known keys are copied).
 *  - isConfirmed is preserved when present; a MISSING isConfirmed defaults to
 *    false (diff) — producers must emit it (B3 adds `true` on REST before
 *    normalizing, so a REST response never misnormalizes to diff).
 */
export function normalizeExecutionResultMessage(
  msg: ExecutionResultMessageInput,
): ExecutionResultMessage {
  const isConfirmed = msg.isConfirmed === true;
  const shared = {
    success: msg.success ?? false,
    error: msg.error,
    version: msg.version,
    overlay: msg.overlay ?? false,
    indicatorId: msg.indicatorId,
    outputs: copyRecord(msg.outputs),
    plotColors: copyRecord(msg.plotColors),
    fillColorData: copyRecord(msg.fillColorData),
    hiddenPlotKeys: copyArray(msg.hiddenPlotKeys),
    plotOverlayKeys: copyArray(msg.plotOverlayKeys),
    shapes: copyArray(msg.shapes),
    fills: copyArray(msg.fills),
    linefills: copyArray(msg.linefills),
    bgcolor: copyArray(msg.bgcolor),
    barColors: copyArray(msg.barColors),
    strategyMarkers: copyArray(msg.strategyMarkers),
    lines: copyArray(msg.lines),
    labels: copyArray(msg.labels),
    boxes: copyArray(msg.boxes),
    tables: copyArray(msg.tables),
    alertConditions: copyArray(msg.alertConditions),
    alertTriggers: copyArray(msg.alertTriggers),
    barTimestamps: copyOptionalArray(msg.barTimestamps),
    barIndex: msg.barIndex,
    formingCandle: msg.formingCandle,
    maxLookback: msg.maxLookback,
  };
  return isConfirmed
    ? { ...shared, isConfirmed: true }
    : { ...shared, isConfirmed: false };
}
