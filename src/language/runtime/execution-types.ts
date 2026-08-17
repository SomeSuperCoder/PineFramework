import type { Decimal } from 'decimal.js';
import type { PineValue } from '../types/na.js';
import type { Series } from './series.js';
import type { RuntimeScope } from './scope.js';
import type { SourceSpan } from '../../common/source-location.js';

/**
 * Structured error payload for execution failures.
 * Carries enough context for callers to render, log, or display
 * without losing structural information (unlike a bare string).
 */
export interface EngineError {
  /** Human-readable description of the error. */
  message: string;
  /** Source location in the original Pine Script (if available). */
  span?: SourceSpan;
  /** Bar index at which the error occurred (if available). */
  barIndex?: number;
  /** Stack trace (if available from caught Error). */
  stack?: string;
}

// ---- Data entry types ----

export interface ShapeEntry {
  style: string;
  location: string;
  color: string;
  time: number;
  text: string;
  textcolor?: string;
  price?: number;
  overlay: boolean;
}

export interface LineEntry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style: string;
  width: number;
  xloc: string;
  extend?: string;
}

export interface LabelEntry {
  time: number;
  price: number;
  text: string;
  color: string;
  textcolor: string;
  style: string;
  size: string;
}

export interface TableCellEntry {
  text: string;
  text_color: string;
  text_halign: string;
  text_valign: string;
  bgcolor: string;
  width: number;
  text_size: string;
  tooltip: string;
}

// Region defined by start/end column and row, used by table.merge_cells
export interface MergedRegion {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

export interface TableEntry {
  position: number;
  columns: number;
  rows: number;
  bgcolor: string;
  border_color: string;
  border_width: number;
  frame_color: string;
  frame_width: number;
  cells: Record<string, TableCellEntry>; // key: "col,row"
  mergedCells: MergedRegion[];
}

export interface LinefillEntry {
  line1: LineEntry;
  line2: LineEntry;
  color: string;
  fillgaps: boolean;
}

export interface BoxEntry {
  left: number;
  top: number;
  right: number;
  bottom: number;
  border_color: string;
  bgcolor: string;
}

export interface AlertConditionEntry {
  id: string;
  title: string;
  message: string;
}

export interface AlertTriggerEntry {
  alertId: string;
  /** 0-based index within the bars batch passed to `executeBars()`.
   *  On the frontend this maps directly to the `candles[]` array index,
   *  and must be shifted by the prepend count whenever older bars are
   *  inserted at the beginning of the dataset (see `prependIndicatorResult`). */
  barIndex: number;
  timestamp: number;
}

export interface StrategyMarkerEntry {
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

// ---- Candle color entry ----

export interface CandleColorEntry {
  time: number;
  /** Primary body color. Absent = no override. */
  bodyColor?: string;
  /** Wick color. Absent = falls back to bodyColor then default bull/bear. */
  wickColor?: string;
  /** Border color. Absent = falls back to bodyColor then default bull/bear. */
  borderColor?: string;
  /** Bar offset shift (resolved at frontend). */
  offset?: number;
}

// ---- Execution context ----

export interface ExecutionContext {
  barIndex: number;
  barCount: number;
  timestamp: number;
  open: Series;
  high: Series;
  low: Series;
  close: Series;
  volume: Series;
}

// ---- Results ----

export interface ExecutionResult {
  success: boolean;
  error?: EngineError;
  version?: number;
  overlay: boolean;
  outputs: Map<string, Series>;
  shapes: ShapeEntry[];
  fills: Array<{ from: string; to: string; color: string }>;
  strategyMarkers: StrategyMarkerEntry[];
  bgcolor: Array<{ time: number; color: string }>;
  plotColors?: Map<string, (string | null)[]>;
  fillColorData?: Map<string, (string | null)[]>;
  hiddenPlotKeys?: string[];
  lines?: LineEntry[];
  linefills?: LinefillEntry[];
  labels?: LabelEntry[];
  boxes?: BoxEntry[];
  tables?: TableEntry[];
  plotOverlayKeys?: string[];
  barTimestamps?: number[];
  alertConditions?: AlertConditionEntry[];
  alertTriggers?: AlertTriggerEntry[];
  barColorData?: Array<CandleColorEntry>;
  maxLookback?: number;
}

export interface FormingCandleResult {
  success: boolean;
  error?: string | EngineError;
  overlay: boolean;
  diffOutputs: Record<string, PineValue>;
  diffShapes: ShapeEntry[];
  diffFills: Array<{ from: string; to: string; color: string }>;
  diffLines: LineEntry[];
  diffLinefills?: LinefillEntry[];
  diffLabels: LabelEntry[];
  diffPlotColors?: Record<string, (string | null)[]>;
  diffFillColorData?: Record<string, (string | null)[]>;
  diffBgcolor?: Array<{ time: number; color: string }>;
  diffBarColors?: Array<CandleColorEntry>;
  diffAlertTriggers?: AlertTriggerEntry[];
  tables?: TableEntry[];
  barTimestamps: number[];
  barIndex: number;
  isDiff: boolean;
  /** True when the engine processed a confirmed (closed) bar, false for forming candle ticks */
  isConfirmed?: boolean;
}

export interface ExecutionMetrics {
  totalBars: number;
  successfulBars: number;
  failedBars: number;
  averageExecutionTimeMs: number;
  lastExecutionTimeMs: number;
}

// ---- Snapshot (state-manager) ----

export interface SarStateValue {
  initialized: boolean;
  trend: 'up' | 'down';
  sar: Decimal;
  ep: Decimal;
  af: Decimal;
  afStart: Decimal;
  afInc: Decimal;
  afMax: Decimal;
  prevSar: Decimal;
  prevEp: Decimal;
  prevLow1: Decimal;
  prevLow2: Decimal;
  prevHigh1: Decimal;
  prevHigh2: Decimal;
  barCount: number;
}

export interface ExecutionSnapshot {
  scope: RuntimeScope;
  outputs: Map<string, Series>;
  shapes: ShapeEntry[];
  fills: Array<{ from: string; to: string; color: string }>;
  lines: Map<number, LineEntry>;
  lineIdCounter: number;
  linefills: Map<number, { line1Id: number; line2Id: number; color: string; fillgaps: boolean }>;
  linefillIdCounter: number;
  labels: LabelEntry[];
  bgcolorData: Array<{ time: number; color: string }>;
  barColorData: Array<CandleColorEntry>;
  sarState: Map<string, SarStateValue>;
  barIndex: number;
  plotColors?: Map<string, (string | null)[]>;
  fillColorData?: Map<string, (string | null)[]>;
  hiddenPlotKeys?: string[];
  alertConditionEntries?: AlertConditionEntry[];
  alertTriggers?: AlertTriggerEntry[];
  boxes?: Map<number, BoxEntry>;
  tables?: Array<[number, TableEntry]>;
  tableIdCounter?: number;
  barTimestamps?: number[];
  ohlcHistory?: {
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
  };
}
