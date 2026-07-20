import type { PineValue } from '../types/na.js';
import type { Series } from './series.js';
import type { RuntimeScope } from './scope.js';

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
  error?: string;
  version?: number;
  overlay: boolean;
  outputs: Map<string, Series>;
  shapes: ShapeEntry[];
  fills: Array<{ from: string; to: string; color: string }>;
  strategyMarkers: StrategyMarkerEntry[];
  bgcolor: Array<{ time: number; color: string }>;
  plotColors?: Map<string, (string | null)[]>;
  fillColorData?: Map<string, (string | null)[]>;
  lines?: LineEntry[];
  labels?: LabelEntry[];
  boxes?: BoxEntry[];
  barTimestamps?: number[];
  alertConditions?: AlertConditionEntry[];
  alertTriggers?: AlertTriggerEntry[];
  barColorData?: Array<{ time: number; color: string }>;
  maxLookback?: number;
}

export interface FormingCandleResult {
  success: boolean;
  error?: string;
  overlay: boolean;
  diffOutputs: Record<string, PineValue>;
  diffShapes: ShapeEntry[];
  diffFills: Array<{ from: string; to: string; color: string }>;
  diffLines: LineEntry[];
  diffLabels: LabelEntry[];
  diffPlotColors?: Record<string, (string | null)[]>;
  diffFillColorData?: Record<string, (string | null)[]>;
  diffBgcolor?: Array<{ time: number; color: string }>;
  diffAlertTriggers?: AlertTriggerEntry[];
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
  sar: number;
  ep: number;
  af: number;
  afStart: number;
  afInc: number;
  afMax: number;
  prevSar: number;
  prevEp: number;
  prevLow1: number;
  prevLow2: number;
  prevHigh1: number;
  prevHigh2: number;
  barCount: number;
}

export interface ExecutionSnapshot {
  scope: RuntimeScope;
  outputs: Map<string, Series>;
  shapes: ShapeEntry[];
  fills: Array<{ from: string; to: string; color: string }>;
  lines: Map<number, LineEntry>;
  lineIdCounter: number;
  labels: LabelEntry[];
  bgcolorData: Array<{ time: number; color: string }>;
  barColorData: Array<{ time: number; color: string }>;
  sarState: Map<string, SarStateValue>;
  barIndex: number;
  plotColors?: Map<string, (string | null)[]>;
  fillColorData?: Map<string, (string | null)[]>;
  alertConditionEntries?: AlertConditionEntry[];
  alertTriggers?: AlertTriggerEntry[];
  boxes?: Map<number, BoxEntry>;
  barTimestamps?: number[];
}
