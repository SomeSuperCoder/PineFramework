import type {
  ProgramNode,
  StatementNode,
  ExpressionNode,
  VariableDeclarationNode,
  AssignmentNode,
  ExpressionStatementNode,
  IfStatementNode,
  ForStatementNode,
  WhileStatementNode,
  SwitchStatementNode,
  TypeDeclarationNode,
  ReturnStatementNode,
  NumberLiteralNode,
  StringLiteralNode,
  BooleanLiteralNode,
  ColorLiteralNode,
  NaLiteralNode,
  IdentifierNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  TernaryExpressionNode,
  CallExpressionNode,
  MemberExpressionNode,
  IndexExpressionNode,
  ArrayExpressionNode,
  MapExpressionNode,
  FunctionExpressionNode,
  ParenthesizedExpressionNode,
  SwitchExpressionNode,
} from '../parser/ast/nodes.js';
import type { CompileResult, CompiledScript } from '../compiler/ir.js';
import { NA, isNa, pineTruthy, type PineValue } from '../types/na.js';
import { FLOAT_TYPE, INT_TYPE } from '../types/pine-types.js';
import {
  StrategyEngine,
  type OrderDirection,
  type StrategyMarker,
} from '../../strategy/strategy-engine.js';
import { parseStrategyDeclaration, getStrategyConfig } from '../script-declarations.js';
import {
  type RuntimeScope,
  createRuntimeScope,
  declareVariable,
  resolveVariable,
  setVariableValue,
  getVariableValue,
  pushBarValues,
  cloneRuntimeScope,
} from './scope.js';
import { type Series, createSeries } from './series.js';

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

export interface ExecutionMetrics {
  totalBars: number;
  successfulBars: number;
  failedBars: number;
  averageExecutionTimeMs: number;
  lastExecutionTimeMs: number;
}

interface ExecutionSnapshot {
  scope: RuntimeScope;
  outputs: Map<string, Series>;
  shapes: ShapeEntry[];
  fills: Array<{ from: string; to: string; color: string }>;
  lines: Map<number, LineEntry>;
  lineIdCounter: number;
  labels: LabelEntry[];
  bgcolorData: Array<{ time: number; color: string }>;
  barColorData: Array<{ time: number; color: string }>;
  sarState: Map<
    string,
    {
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
  >;
  barIndex: number;
}

export class ExecutionEngine {
  private compiledScript: CompiledScript;
  private sourceProgram: ProgramNode;
  private globalScope: RuntimeScope;
  private functions: Map<string, FunctionExpressionNode>;
  private functionPersistentScopes: Map<string, RuntimeScope>;
  private builtins: Map<string, (...args: any[]) => PineValue>;
  private outputs: Map<string, Series>;
  private shapes: ShapeEntry[];
  private barColorData: Array<{ time: number; color: string }> = [];
  private bgcolorData: Array<{ time: number; color: string }> = [];
  private alertConditionEntries: AlertConditionEntry[] = [];
  private alertTriggers: AlertTriggerEntry[] = [];
  private snapshots: ExecutionSnapshot[];
  private metrics: ExecutionMetrics;
  private executionTimes: number[];
  private maxSnapshots: number;
  private currentTimestamp: number = 0;
  private currentContext: ExecutionContext | null = null;
  private barTimestamps: number[] = [];
  private isFormingCandle: boolean = false;

  constructor(
    compileResult: CompileResult,
    strategyConfigOverride?: Partial<import('../../strategy/strategy-engine.js').StrategyConfig>,
  ) {
    this.compiledScript = compileResult.ir;
    this.sourceProgram = compileResult.source;
    this.globalScope = createRuntimeScope();
    this.functions = new Map();
    this.functionPersistentScopes = new Map<string, RuntimeScope>();
    this.builtins = new Map();
    this.outputs = new Map();
    this.shapes = [];
    this.snapshots = [];
    this.executionTimes = [];
    this.maxSnapshots = 10;

    this.metrics = {
      totalBars: 0,
      successfulBars: 0,
      failedBars: 0,
      averageExecutionTimeMs: 0,
      lastExecutionTimeMs: 0,
    };

    this.registerBuiltins();
    this.initializeGlobals();

    if (this.sourceProgram.scriptKind === 'strategy') {
      this.initializeStrategy(strategyConfigOverride);
    }
  }

  private smaBuffers: Map<string, number[]> = new Map();
  private emaState: Map<string, { prev: number; initialized: boolean }> = new Map();
  private hmaBuffers: Map<string, { half: number[]; full: number[]; diff: number[] }> = new Map();
  private sarState: Map<
    string,
    {
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
  > = new Map();
  private fills: Array<{ from: string; to: string; color: string }> = [];
  private lines: Map<number, LineEntry> = new Map();
  private lineIdCounter: number = 0;
  private labels: LabelEntry[] = [];
  private boxes: Map<number, BoxEntry> = new Map();
  private boxIdCounter: number = 0;
  private userTypeFields: Map<string, string[]> = new Map();
  private plotColors: Map<string, (string | null)[]> = new Map();
  private fillColorData: Map<string, (string | null)[]> = new Map();
  private inputs: Map<string, { type: string; default: PineValue }> = new Map();
  private crossPrevValues: Map<string, { src: number; cmp: number }> = new Map();
  private changePrevValues: Map<string, number> = new Map();
  private atrState: Map<string, { prev: number; count: number; values: PineValue[] }> = new Map();
  private highestBuffers: Map<string, number[]> = new Map();
  private lowestBuffers: Map<string, number[]> = new Map();
  private currentCallSiteId = 0;
  private rsiState: Map<
    string,
    { prevAvgGain: number; prevAvgLoss: number; count: number; prevSource: number }
  > = new Map();
  private strategyEngine: StrategyEngine | null = null;

  getMaxLookback(): number {
    let max = 0;
    for (const key of this.smaBuffers.keys()) {
      const parts = key.split('_');
      if (parts.length >= 2) {
        const len = parseInt(parts[1], 10);
        if (len > max) max = len;
      }
    }
    for (const key of this.emaState.keys()) {
      const parts = key.split('_');
      if (parts.length >= 2) {
        const len = parseInt(parts[1], 10);
        if (len > max) max = len;
      }
    }
    for (const key of this.rsiState.keys()) {
      const parts = key.split('_');
      if (parts.length >= 2) {
        const len = parseInt(parts[1], 10);
        if (len > max) max = len;
      }
    }
    for (const key of this.hmaBuffers.keys()) {
      const parts = key.split('_');
      if (parts.length >= 2) {
        const len = parseInt(parts[1], 10);
        const sqrtLen = Math.round(Math.sqrt(len));
        if (len > max) max = len;
        if (sqrtLen > max) max = sqrtLen;
      }
    }
    for (const key of this.atrState.keys()) {
      const parts = key.split('_');
      if (parts.length >= 2) {
        const len = parseInt(parts[1], 10);
        if (len > max) max = len;
      }
    }
    return max;
  }

  setFormingCandle(v: boolean): void {
    this.isFormingCandle = v;
  }

  private registerBuiltins(): void {
    this.builtins.set('ta.sma', (source: PineValue, length: PineValue): PineValue => {
      if (isNa(source) || isNa(length)) return NA;
      const len = Math.trunc(length as number);
      if (len <= 0) return NA;

      const key = `sma_${len}_${this.currentCallSiteId}`;
      if (!this.smaBuffers.has(key)) {
        this.smaBuffers.set(key, []);
      }
      const buf = this.smaBuffers.get(key)!;
      buf.push(source as number);
      if (buf.length > len) {
        buf.shift();
      }
      if (buf.length < len) {
        return NA;
      }
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        sum += buf[i];
      }
      return sum / buf.length;
    });

    this.builtins.set('ta.ema', (source: PineValue, length: PineValue): PineValue => {
      if (isNa(source) || isNa(length)) return NA;
      const len = Math.trunc(length as number);
      if (len <= 0) return NA;

      const key = `ema_${len}_${this.currentCallSiteId}`;
      const k = 2 / (len + 1);
      if (!this.emaState.has(key)) {
        this.emaState.set(key, { prev: source as number, initialized: false });
        return source as number;
      }
      const state = this.emaState.get(key)!;
      state.prev = (source as number) * k + state.prev * (1 - k);
      return state.prev;
    });

    this.builtins.set('ta.rsi', (source: PineValue, length: PineValue): PineValue => {
      if (isNa(source) || isNa(length)) return NA;
      const len = Math.trunc(length as number);
      if (len <= 0) return NA;
      const val = source as number;
      if (isNaN(val)) return NA;

      const key = `rsi_${len}_${this.currentCallSiteId}`;
      if (!this.rsiState.has(key)) {
        this.rsiState.set(key, { prevAvgGain: 0, prevAvgLoss: 0, count: 0, prevSource: val });
        return NA;
      }
      const state = this.rsiState.get(key)!;
      state.count++;

      const change = val - state.prevSource;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      state.prevSource = val;

      if (state.count <= len) {
        state.prevAvgGain = (state.prevAvgGain * (state.count - 1) + gain) / state.count;
        state.prevAvgLoss = (state.prevAvgLoss * (state.count - 1) + loss) / state.count;
        if (state.count < len) return NA;
      } else {
        state.prevAvgGain = (state.prevAvgGain * (len - 1) + gain) / len;
        state.prevAvgLoss = (state.prevAvgLoss * (len - 1) + loss) / len;
      }

      if (state.prevAvgLoss === 0) return state.prevAvgGain === 0 ? 50 : 100;
      const rs = state.prevAvgGain / state.prevAvgLoss;
      return 100 - 100 / (1 + rs);
    });

    this.builtins.set('ta.sar', (start: PineValue, inc: PineValue, max: PineValue): PineValue => {
      if (!this.currentContext) return NA;
      const ctx = this.currentContext;
      const high = ctx.high.getRelative(0);
      const low = ctx.low.getRelative(0);
      const close = ctx.close.getRelative(0);
      if (typeof high !== 'number' || typeof low !== 'number' || typeof close !== 'number')
        return NA;

      const afStart = typeof start === 'number' ? start : 0.02;
      const afInc = typeof inc === 'number' ? inc : 0.02;
      const afMax = typeof max === 'number' ? max : 0.2;
      const key = 'sar';

      if (!this.sarState.has(key)) {
        this.sarState.set(key, {
          initialized: false,
          trend: 'up',
          sar: 0,
          ep: 0,
          af: afStart,
          afStart,
          afInc,
          afMax,
          prevSar: 0,
          prevEp: 0,
          prevLow1: 0,
          prevLow2: 0,
          prevHigh1: 0,
          prevHigh2: 0,
          barCount: 0,
        });
      }

      const state = this.sarState.get(key)!;
      state.barCount++;

      const prevHigh = ctx.high.getRelative(1);
      const prevLow = ctx.low.getRelative(1);
      const prevClose = ctx.close.getRelative(1);

      if (!state.initialized) {
        if (
          typeof prevHigh !== 'number' ||
          typeof prevLow !== 'number' ||
          typeof prevClose !== 'number'
        ) {
          state.prevHigh1 = high;
          state.prevLow1 = low;
          state.prevHigh2 = high;
          state.prevLow2 = low;
          state.prevSar = low;
          state.prevEp = high;
          state.sar = low;
          state.ep = high;
          return low;
        }

        if (close > prevClose) {
          state.trend = 'up';
          state.sar = Math.min(low, prevLow);
          state.ep = Math.max(high, prevHigh);
        } else {
          state.trend = 'down';
          state.sar = Math.max(high, prevHigh);
          state.ep = Math.min(low, prevLow);
        }

        state.af = afStart;
        state.prevSar = state.sar;
        state.prevEp = state.ep;
        state.prevLow1 = low;
        state.prevLow2 = prevLow;
        state.prevHigh1 = high;
        state.prevHigh2 = prevHigh;
        state.initialized = true;
        return state.sar;
      }

      const prevLow1 = state.prevLow1;
      const prevLow2 = state.prevLow2;
      const prevHigh1 = state.prevHigh1;
      const prevHigh2 = state.prevHigh2;
      const prevEp = state.prevEp;

      let sar = state.prevSar + state.af * (state.ep - state.prevSar);

      if (state.trend === 'up') {
        sar = Math.min(sar, prevLow1, prevLow2);

        if (low < sar) {
          state.trend = 'down';
          sar = prevEp;
          state.ep = low;
          state.af = afStart;
        } else {
          if (high > state.ep) {
            state.ep = high;
            state.af = Math.min(state.af + afInc, afMax);
          }
        }
      } else {
        sar = Math.max(sar, prevHigh1, prevHigh2);

        if (high > sar) {
          state.trend = 'up';
          sar = prevEp;
          state.ep = high;
          state.af = afStart;
        } else {
          if (low < state.ep) {
            state.ep = low;
            state.af = Math.min(state.af + afInc, afMax);
          }
        }
      }

      state.prevSar = sar;
      state.prevEp = state.ep;
      state.prevLow1 = low;
      state.prevLow2 = prevLow1;
      state.prevHigh1 = high;
      state.prevHigh2 = prevHigh1;

      return sar;
    });

    this.builtins.set('ta.atr', (length: PineValue): PineValue => {
      if (!this.currentContext) return NA;
      const len = Math.trunc(typeof length === 'number' ? length : 14);
      if (len <= 0) return NA;
      const ctx = this.currentContext;
      const high = ctx.high.getRelative(0);
      const low = ctx.low.getRelative(0);
      const close = ctx.close.getRelative(0);
      if (typeof high !== 'number' || typeof low !== 'number' || typeof close !== 'number')
        return NA;
      const prevClose = ctx.close.getRelative(1);
      const tr = Math.max(
        high - low,
        Math.abs(high - (typeof prevClose === 'number' ? prevClose : close)),
        Math.abs(low - (typeof prevClose === 'number' ? prevClose : close)),
      );
      const key = `atr_${len}_${this.currentCallSiteId}`;
      if (!this.atrState.has(key)) {
        this.atrState.set(key, { prev: tr, count: 1, values: [] });
        this.atrState.get(key)!.values.push(NA);
        return NA;
      }
      const state = this.atrState.get(key)!;
      state.count++;
      if (state.count <= len) {
        state.prev = (state.prev * (state.count - 1) + tr) / state.count;
        state.values.push(state.prev);
        return NA;
      }
      state.prev = (state.prev * (len - 1) + tr) / len;
      state.values.push(state.prev);
      // Return the current ATR value, which can be indexed with [1] for previous bar
      // Create a temporary array-like object that supports getRelative
      return state.prev;
    });

    this.builtins.set('ta.highest', (source: PineValue, length: PineValue): PineValue => {
      if (isNa(source) || isNa(length)) return NA;
      const len = Math.trunc(length as number);
      if (len <= 0) return NA;
      const key = `highest_${len}_${this.currentCallSiteId}`;
      if (!this.highestBuffers.has(key)) {
        this.highestBuffers.set(key, []);
      }
      const buf = this.highestBuffers.get(key)!;
      buf.push(source as number);
      if (buf.length > len) buf.shift();
      if (buf.length < len) return NA;
      let max = buf[0];
      for (let i = 1; i < buf.length; i++) {
        if (buf[i] > max) max = buf[i];
      }
      return max;
    });

    this.builtins.set('ta.lowest', (source: PineValue, length: PineValue): PineValue => {
      if (isNa(source) || isNa(length)) return NA;
      const len = Math.trunc(length as number);
      if (len <= 0) return NA;
      const key = `lowest_${len}_${this.currentCallSiteId}`;
      if (!this.lowestBuffers.has(key)) {
        this.lowestBuffers.set(key, []);
      }
      const buf = this.lowestBuffers.get(key)!;
      buf.push(source as number);
      if (buf.length > len) buf.shift();
      if (buf.length < len) return NA;
      let min = buf[0];
      for (let i = 1; i < buf.length; i++) {
        if (buf[i] < min) min = buf[i];
      }
      return min;
    });

    this.builtins.set('ta.hma', (source: PineValue, length: PineValue): PineValue => {
      if (isNa(source) || isNa(length)) return NA;
      const len = Math.trunc(length as number);
      if (len <= 0) return NA;
      const halfLen = Math.floor(len / 2);
      const sqrtLen = Math.floor(Math.sqrt(len));

      const key = `hma_${len}_${this.currentCallSiteId}`;
      if (!this.hmaBuffers.has(key)) {
        this.hmaBuffers.set(key, { half: [], full: [], diff: [] });
      }
      const buf = this.hmaBuffers.get(key)!;
      const val = source as number;

      buf.half.push(val);
      if (buf.half.length > halfLen) buf.half.shift();

      buf.full.push(val);
      if (buf.full.length > len) buf.full.shift();

      // WMA of half-length
      let wmaHalf = 0;
      if (buf.half.length >= halfLen) {
        let wSum = 0;
        let wWeight = 0;
        for (let i = 0; i < buf.half.length; i++) {
          const weight = i + 1;
          wSum += buf.half[i] * weight;
          wWeight += weight;
        }
        wmaHalf = wSum / wWeight;
      }

      // WMA of full-length
      let wmaFull = 0;
      if (buf.full.length >= len) {
        let wSum = 0;
        let wWeight = 0;
        for (let i = 0; i < buf.full.length; i++) {
          const weight = i + 1;
          wSum += buf.full[i] * weight;
          wWeight += weight;
        }
        wmaFull = wSum / wWeight;
      }

      if (buf.half.length < halfLen || buf.full.length < len) {
        return NA;
      }

      buf.diff.push(2 * wmaHalf - wmaFull);
      if (buf.diff.length > sqrtLen) buf.diff.shift();

      // WMA of diff with sqrtLen
      if (buf.diff.length < sqrtLen) {
        return NA;
      }
      let dSum = 0;
      let dWeight = 0;
      for (let i = 0; i < buf.diff.length; i++) {
        const weight = i + 1;
        dSum += buf.diff[i] * weight;
        dWeight += weight;
      }
      return dSum / dWeight;
    });

    this.builtins.set('math.max', (...args: PineValue[]): PineValue => {
      const validArgs = args.filter((a) => !isNa(a) && typeof a === 'number') as number[];
      return validArgs.length > 0 ? Math.max(...validArgs) : NA;
    });

    this.builtins.set('math.min', (...args: PineValue[]): PineValue => {
      const validArgs = args.filter((a) => !isNa(a) && typeof a === 'number') as number[];
      return validArgs.length > 0 ? Math.min(...validArgs) : NA;
    });

    this.builtins.set('math.abs', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.abs(value as number);
    });

    this.builtins.set('math.round', (value: PineValue, precision?: PineValue): PineValue => {
      if (isNa(value)) return NA;
      const p = precision === undefined || isNa(precision) ? 0 : (precision as number);
      const factor = Math.pow(10, p);
      return Math.round((value as number) * factor) / factor;
    });

    this.builtins.set('math.floor', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.floor(value as number);
    });

    this.builtins.set('math.ceil', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.ceil(value as number);
    });

    this.builtins.set('math.pow', (base: PineValue, exponent: PineValue): PineValue => {
      if (isNa(base) || isNa(exponent)) return NA;
      return Math.pow(base as number, exponent as number);
    });

    this.builtins.set('math.sqrt', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.sqrt(value as number);
    });

    this.builtins.set('math.log', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.log(value as number);
    });

    this.builtins.set('math.log10', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.log10(value as number);
    });

    this.builtins.set('math.exp', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.exp(value as number);
    });

    this.builtins.set('math.sin', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.sin(value as number);
    });

    this.builtins.set('math.cos', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.cos(value as number);
    });

    this.builtins.set('math.tan', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.tan(value as number);
    });

    this.builtins.set('math.asin', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.asin(value as number);
    });

    this.builtins.set('math.acos', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.acos(value as number);
    });

    this.builtins.set('math.atan', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.atan(value as number);
    });

    this.builtins.set('math.atan2', (y: PineValue, x: PineValue): PineValue => {
      if (isNa(y) || isNa(x)) return NA;
      return Math.atan2(y as number, x as number);
    });

    this.builtins.set('math.sign', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return Math.sign(value as number);
    });

    this.builtins.set('math.sum', (...args: PineValue[]): PineValue => {
      const validArgs = args.filter((a) => !isNa(a)) as number[];
      return validArgs.reduce((sum, val) => sum + val, 0);
    });

    this.builtins.set('str.format', (template: PineValue, ...args: PineValue[]): PineValue => {
      if (isNa(template)) return NA;
      let result = template as string;
      const strArgs = args.filter((a) => typeof a !== 'object' && typeof a !== 'function');
      for (let i = 0; i < strArgs.length; i++) {
        const arg = isNa(strArgs[i]) ? 'na' : String(strArgs[i]);
        result = result.replace(`{${i}}`, arg);
      }
      return result;
    });

    this.builtins.set('str.length', (str: PineValue): PineValue => {
      if (isNa(str)) return NA;
      return (str as string).length;
    });

    this.builtins.set(
      'str.substring',
      (str: PineValue, start: PineValue, length?: PineValue): PineValue => {
        if (isNa(str) || isNa(start)) return NA;
        const s = str as string;
        const st = start as number;
        const len = length === undefined || isNa(length) ? s.length : (length as number);
        return s.substring(st, st + len);
      },
    );

    this.builtins.set('str.contains', (str: PineValue, substring: PineValue): PineValue => {
      if (isNa(str) || isNa(substring)) return NA;
      return (str as string).includes(substring as string);
    });

    this.builtins.set(
      'str.replace',
      (str: PineValue, from: PineValue, to: PineValue): PineValue => {
        if (isNa(str) || isNa(from) || isNa(to)) return NA;
        return (str as string).replace(from as string, to as string);
      },
    );

    this.builtins.set('str.split', (str: PineValue, separator: PineValue): PineValue => {
      if (isNa(str) || isNa(separator)) return NA;
      return (str as string).split(separator as string);
    });

    this.builtins.set('str.tolower', (str: PineValue): PineValue => {
      if (isNa(str)) return NA;
      return (str as string).toLowerCase();
    });

    this.builtins.set('str.toupper', (str: PineValue): PineValue => {
      if (isNa(str)) return NA;
      return (str as string).toUpperCase();
    });

    this.builtins.set('str.trim', (str: PineValue): PineValue => {
      if (isNa(str)) return NA;
      return (str as string).trim();
    });

    this.builtins.set('str.tonumber', (str: PineValue): PineValue => {
      if (isNa(str)) return NA;
      const num = Number(str as string);
      return Number.isNaN(num) ? NA : num;
    });

    this.builtins.set('str.tostring', (value: PineValue): PineValue => {
      if (isNa(value)) return NA;
      return String(value);
    });

    this.builtins.set('time.year', (timestamp: PineValue): PineValue => {
      if (isNa(timestamp)) return NA;
      return new Date(timestamp as number).getFullYear();
    });

    this.builtins.set('time.month', (timestamp: PineValue): PineValue => {
      if (isNa(timestamp)) return NA;
      return new Date(timestamp as number).getMonth() + 1;
    });

    this.builtins.set('time.dayofweek', (timestamp: PineValue): PineValue => {
      if (isNa(timestamp)) return NA;
      return new Date(timestamp as number).getDay() + 1;
    });

    this.builtins.set('time.hour', (timestamp: PineValue): PineValue => {
      if (isNa(timestamp)) return NA;
      return new Date(timestamp as number).getHours();
    });

    this.builtins.set('time.minute', (timestamp: PineValue): PineValue => {
      if (isNa(timestamp)) return NA;
      return new Date(timestamp as number).getMinutes();
    });

    this.builtins.set('time.second', (timestamp: PineValue): PineValue => {
      if (isNa(timestamp)) return NA;
      return new Date(timestamp as number).getSeconds();
    });

    this.builtins.set(
      'timestamp',
      (
        yearOrDate: PineValue,
        month?: PineValue,
        day?: PineValue,
        hour?: PineValue,
        minute?: PineValue,
        second?: PineValue,
      ): PineValue => {
        if (typeof yearOrDate === 'string') {
          const parsed = new Date(yearOrDate).getTime();
          return isNaN(parsed) ? NA : parsed;
        }
        if (isNa(yearOrDate)) return NA;
        const m = month !== undefined && !isNa(month) ? (month as number) - 1 : 0;
        const d = day !== undefined && !isNa(day) ? (day as number) : 1;
        const h = hour !== undefined && !isNa(hour) ? (hour as number) : 0;
        const min = minute !== undefined && !isNa(minute) ? (minute as number) : 0;
        const s = second !== undefined && !isNa(second) ? (second as number) : 0;
        return new Date(yearOrDate as number, m, d, h, min, s).getTime();
      },
    );

    this.builtins.set('plot', (...allArgs: PineValue[]): PineValue => {
      let seriesName = 'plot';
      let color: string | undefined;
      let linewidth: number | undefined;
      let style: string | undefined;
      let display: PineValue | undefined;
      const PINE_STYLE_MAP: Record<string, string> = {
        style_line: 'line',
        style_linebr: 'line',
        style_stepline: 'stepline',
        style_steplinebr: 'stepline',
        style_histogram: 'histogram',
        style_columns: 'columns',
        style_circles: 'circles',
        style_cross: 'cross',
        style_areabr: 'areabr',
        style_area: 'area',
        style_areaoutline: 'area',
        style_circledot: 'circles',
      };

      const lastArg = allArgs.length > 0 ? allArgs[allArgs.length - 1] : undefined;
      const namedArgs =
        typeof lastArg === 'object' &&
        lastArg !== null &&
        !Array.isArray(lastArg) &&
        !(lastArg as any).__isSeries
          ? (lastArg as unknown as Record<string, PineValue>)
          : undefined;
      const positionalArgs = namedArgs ? allArgs.slice(0, -1) : allArgs;

      // Pine Script plot(series, title, color, linewidth, style, trackprice, histbase, offset, join, editable, show_last, display)
      if (positionalArgs.length >= 2 && typeof positionalArgs[1] === 'string') {
        seriesName = positionalArgs[1] as string;
      }
      if (positionalArgs.length >= 3) {
        const c = positionalArgs[2];
        if (typeof c === 'string') color = c;
      }
      if (positionalArgs.length >= 4 && typeof positionalArgs[3] === 'number') {
        linewidth = positionalArgs[3] as number;
      }
      if (positionalArgs.length >= 5 && typeof positionalArgs[4] === 'string') {
        style = PINE_STYLE_MAP[positionalArgs[4] as string] || 'line';
      }
      if (positionalArgs.length >= 12) {
        display = positionalArgs[11];
      }

      if (namedArgs) {
        if (typeof namedArgs.title === 'string') seriesName = namedArgs.title;
        if (typeof namedArgs.color === 'string') color = namedArgs.color;
        if (typeof namedArgs.linewidth === 'number') linewidth = namedArgs.linewidth;
        if (typeof namedArgs.style === 'string') style = PINE_STYLE_MAP[namedArgs.style] || 'line';
        if (namedArgs.display !== undefined) display = namedArgs.display;
      }

      if (display === 'none' || display === 0) {
        return NA;
      }

      const metaParts = [seriesName];
      if (linewidth) metaParts.push(`__lw:${linewidth}`);
      if (style) metaParts.push(`__style:${style}`);
      const key = metaParts.join('');
      if (!this.outputs.has(key)) {
        this.outputs.set(key, createSeries(key));
      }
      this.outputs.get(key)!.push(isNa(positionalArgs[0]) ? null : positionalArgs[0]);
      if (!this.plotColors.has(key)) {
        this.plotColors.set(key, []);
      }
      this.plotColors.get(key)!.push(color ?? null);
      return `__plot_ref:${key}` as PineValue;
    });

    this.builtins.set('plotshape', (...args: PineValue[]): PineValue => {
      const namedArgs =
        args.length > 0 &&
        typeof args[args.length - 1] === 'object' &&
        !Array.isArray(args[args.length - 1])
          ? (args[args.length - 1] as unknown as Record<string, PineValue>)
          : {};
      const value = args[0] ?? NA;
      if (isNa(value)) return NA;
      let styleStr: string = 'circle';
      let locationStr: string = 'abovebar';
      let colorStr: string = '#2196f3';
      let textStr: string = '';
      let textColorStr: string = '#ffffff';
      if (typeof namedArgs.style === 'string') styleStr = namedArgs.style;
      if (typeof namedArgs.location === 'string') locationStr = namedArgs.location;
      if (typeof namedArgs.color === 'string') colorStr = namedArgs.color;
      if (typeof namedArgs.text === 'string') textStr = namedArgs.text;
      if (typeof namedArgs.textcolor === 'string') textColorStr = namedArgs.textcolor;
      // Positional args: (series, title, style, location, color, text, ...)
      // title (arg 1) is internal only — do NOT use it as display text
      for (let i = 1; i < args.length - (Object.keys(namedArgs).length > 0 ? 1 : 0) && i < 5; i++) {
        const a = args[i];
        if (typeof a === 'string') {
          if (i === 2)
            styleStr = a; // style
          else if (i === 3) locationStr = a; // location
        }
      }
      const isLocationBool = locationStr === 'abovebar' || locationStr === 'belowbar';
      if (isLocationBool) {
        if (value !== true && value !== 1) return NA;
      }
      this.shapes.push({
        style: styleStr,
        location: locationStr,
        color: colorStr,
        time: this.currentTimestamp,
        text: textStr,
        textcolor: textColorStr,
        price: typeof value === 'number' && !isLocationBool ? value : undefined,
        overlay: this.compiledScript.overlay,
      });
      return NA;
    });

    this.builtins.set('plotchar', (...allArgs: PineValue[]): PineValue => {
      const lastArg = allArgs.length > 0 ? allArgs[allArgs.length - 1] : undefined;
      const namedArgs =
        typeof lastArg === 'object' &&
        lastArg !== null &&
        !Array.isArray(lastArg) &&
        !(lastArg as any).__isSeries
          ? (lastArg as unknown as Record<string, PineValue>)
          : undefined;
      const positionalArgs = namedArgs ? allArgs.slice(0, -1) : allArgs;

      // Pine Script plotchar(series, title, char, location, color, offset, text, textcolor, editable, size, display)
      const value = positionalArgs[0] ?? NA;
      if (isNa(value)) return NA;
      const char =
        positionalArgs.length >= 3 && typeof positionalArgs[2] === 'string'
          ? (positionalArgs[2] as string)
          : '●';
      let locationStr =
        positionalArgs.length >= 4 && typeof positionalArgs[3] === 'string'
          ? (positionalArgs[3] as string)
          : 'abovebar';
      let colorStr =
        positionalArgs.length >= 5 && typeof positionalArgs[4] === 'string'
          ? (positionalArgs[4] as string)
          : '#2196f3';
      let textStr = '';

      if (namedArgs) {
        if (typeof namedArgs.location === 'string') locationStr = namedArgs.location;
        if (typeof namedArgs.color === 'string') colorStr = namedArgs.color;
        if (typeof namedArgs.text === 'string') textStr = namedArgs.text;
      }

      // Also handle positional named args (location as string like "location.belowbar")
      for (let i = 3; i < positionalArgs.length && i < 6; i++) {
        const a = positionalArgs[i];
        if (typeof a === 'string') {
          if (i === 3) locationStr = a;
          else if (i === 4) colorStr = a;
        }
      }

      // location.belowbar -> belowbar
      if (locationStr.startsWith('location.')) locationStr = locationStr.slice(9);

      const isLocationBool = locationStr === 'abovebar' || locationStr === 'belowbar';
      if (isLocationBool) {
        if (value !== true && value !== 1) return NA;
      }

      this.shapes.push({
        style: char,
        location: locationStr,
        color: colorStr,
        time: this.currentTimestamp,
        text: textStr,
        price: typeof value === 'number' && !isLocationBool ? value : undefined,
        overlay: this.compiledScript.overlay,
      });
      return NA;
    });

    this.builtins.set('bgcolor', (colorInput: PineValue): PineValue => {
      if (isNa(colorInput)) return NA;
      const colorStr = typeof colorInput === 'string' ? colorInput : '#000000';
      this.bgcolorData.push({ time: this.currentTimestamp, color: colorStr });
      return NA;
    });

    this.builtins.set('barcolor', (colorInput: PineValue): PineValue => {
      if (isNa(colorInput)) return NA;
      const colorStr = typeof colorInput === 'string' ? colorInput : '#000000';
      if (!this.barColorData) this.barColorData = [];
      this.barColorData.push({ time: this.currentTimestamp, color: colorStr });
      return NA;
    });

    this.builtins.set('plotcandle', (...args: PineValue[]): PineValue => {
      const namedArgs =
        args.length > 0 &&
        typeof args[args.length - 1] === 'object' &&
        !Array.isArray(args[args.length - 1])
          ? (args[args.length - 1] as unknown as Record<string, PineValue>)
          : {};
      let bodyColor = '#000000';
      if (typeof namedArgs.color === 'string') bodyColor = namedArgs.color;
      if (bodyColor !== 'na' && bodyColor !== '') {
        if (!this.barColorData) this.barColorData = [];
        this.barColorData.push({ time: this.currentTimestamp, color: bodyColor });
      }
      return NA;
    });

    this.builtins.set(
      'input.int',
      (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
        let defaultVal: PineValue = defaultValOrNamed ?? 0;
        if (
          typeof defaultValOrNamed === 'object' &&
          defaultValOrNamed !== null &&
          !Array.isArray(defaultValOrNamed)
        ) {
          const na = defaultValOrNamed as unknown as Record<string, PineValue>;
          if (na.defval !== undefined) defaultVal = na.defval;
          if (typeof na.title === 'string')
            this.inputs.set(na.title, { type: 'int', default: defaultVal });
        }
        return isNa(defaultVal) ? 0 : defaultVal;
      },
    );

    this.builtins.set(
      'input.float',
      (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
        let defaultVal: PineValue = defaultValOrNamed ?? 0;
        if (
          typeof defaultValOrNamed === 'object' &&
          defaultValOrNamed !== null &&
          !Array.isArray(defaultValOrNamed)
        ) {
          const na = defaultValOrNamed as unknown as Record<string, PineValue>;
          if (na.defval !== undefined) defaultVal = na.defval;
          if (typeof na.title === 'string')
            this.inputs.set(na.title, { type: 'float', default: defaultVal });
        }
        return isNa(defaultVal) ? 0 : defaultVal;
      },
    );

    this.builtins.set(
      'input.color',
      (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
        let defaultVal: PineValue = defaultValOrNamed ?? '#2196f3';
        if (
          typeof defaultValOrNamed === 'object' &&
          defaultValOrNamed !== null &&
          !Array.isArray(defaultValOrNamed)
        ) {
          const na = defaultValOrNamed as unknown as Record<string, PineValue>;
          if (na.defval !== undefined) defaultVal = na.defval;
        }
        return isNa(defaultVal) ? '#2196f3' : defaultVal;
      },
    );

    this.builtins.set(
      'input.bool',
      (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
        let defaultVal: PineValue = defaultValOrNamed ?? false;
        if (
          typeof defaultValOrNamed === 'object' &&
          defaultValOrNamed !== null &&
          !Array.isArray(defaultValOrNamed)
        ) {
          const na = defaultValOrNamed as unknown as Record<string, PineValue>;
          if (na.defval !== undefined) defaultVal = na.defval;
        }
        return isNa(defaultVal) ? false : defaultVal;
      },
    );

    this.builtins.set(
      'input.string',
      (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
        let defaultVal: PineValue = defaultValOrNamed ?? '';
        if (
          typeof defaultValOrNamed === 'object' &&
          defaultValOrNamed !== null &&
          !Array.isArray(defaultValOrNamed)
        ) {
          const na = defaultValOrNamed as unknown as Record<string, PineValue>;
          if (na.defval !== undefined) defaultVal = na.defval;
        }
        return isNa(defaultVal) ? '' : defaultVal;
      },
    );

    this.builtins.set(
      'input.time',
      (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
        let defaultVal: PineValue = defaultValOrNamed ?? 0;
        if (
          typeof defaultValOrNamed === 'object' &&
          defaultValOrNamed !== null &&
          !Array.isArray(defaultValOrNamed)
        ) {
          const na = defaultValOrNamed as unknown as Record<string, PineValue>;
          if (na.defval !== undefined) defaultVal = na.defval;
        }
        return isNa(defaultVal) ? 0 : defaultVal;
      },
    );

    this.builtins.set(
      'input.timeframe',
      (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
        let defaultVal: PineValue = defaultValOrNamed ?? '';
        if (
          typeof defaultValOrNamed === 'object' &&
          defaultValOrNamed !== null &&
          !Array.isArray(defaultValOrNamed)
        ) {
          const na = defaultValOrNamed as unknown as Record<string, PineValue>;
          if (na.defval !== undefined) defaultVal = na.defval;
        }
        return isNa(defaultVal) ? '' : defaultVal;
      },
    );

    this.builtins.set(
      'input.source',
      (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
        let defaultVal: PineValue = defaultValOrNamed ?? 0;
        if (
          typeof defaultValOrNamed === 'object' &&
          defaultValOrNamed !== null &&
          !Array.isArray(defaultValOrNamed)
        ) {
          const na = defaultValOrNamed as unknown as Record<string, PineValue>;
          if (na.defval !== undefined) defaultVal = na.defval;
        }
        return isNa(defaultVal) ? 0 : defaultVal;
      },
    );

    this.builtins.set('input', (...args: PineValue[]): PineValue => {
      let defaultVal: PineValue = args[0] ?? 0;
      if (
        args.length > 0 &&
        typeof args[0] === 'object' &&
        args[0] !== null &&
        !Array.isArray(args[0])
      ) {
        const na = args[0] as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
        if (typeof na.title === 'string')
          this.inputs.set(na.title, { type: 'source', default: defaultVal });
      }
      return isNa(defaultVal) ? 0 : defaultVal;
    });

    this.builtins.set('ta.pivothigh', (...args: PineValue[]): PineValue => {
      const ctx = this.currentContext;
      if (!ctx) return NA;
      // Last arg may be namedArgs {} from executeCallExpression(…args, namedArgs)
      const last = args[args.length - 1];
      const hasNamed = typeof last === 'object' && last !== null && !Array.isArray(last);
      const positionalCount = hasNamed ? args.length - 1 : args.length;
      if (positionalCount < 2) return NA;
      const leftBars = args[0] as number;
      const rightBars = args[1] as number;
      if (leftBars < 1 || rightBars < 1) return NA;
      const series = ctx.high;
      const len = series.length;
      if (len < leftBars + rightBars + 1) return NA;
      const candidateOffset = rightBars;
      const candidateValue = series.getRelative(candidateOffset);
      if (isNa(candidateValue)) return NA;
      for (let d = -leftBars; d <= rightBars; d++) {
        if (d === 0) continue;
        const v = series.getRelative(rightBars - d);
        if (!isNa(v) && (v as number) > (candidateValue as number)) return NA;
      }
      return candidateValue;
    });

    this.builtins.set('ta.pivotlow', (...args: PineValue[]): PineValue => {
      const ctx = this.currentContext;
      if (!ctx) return NA;
      const last = args[args.length - 1];
      const hasNamed = typeof last === 'object' && last !== null && !Array.isArray(last);
      const positionalCount = hasNamed ? args.length - 1 : args.length;
      if (positionalCount < 2) return NA;
      const leftBars = args[0] as number;
      const rightBars = args[1] as number;
      if (leftBars < 1 || rightBars < 1) return NA;
      const series = ctx.low;
      const len = series.length;
      if (len < leftBars + rightBars + 1) return NA;
      const candidateOffset = rightBars;
      const candidateValue = series.getRelative(candidateOffset);
      if (isNa(candidateValue)) return NA;
      for (let d = -leftBars; d <= rightBars; d++) {
        if (d === 0) continue;
        const v = series.getRelative(rightBars - d);
        if (!isNa(v) && (v as number) < (candidateValue as number)) return NA;
      }
      return candidateValue;
    });

    // @ts-expect-error size parameter unused in stub implementation
    this.builtins.set('array.new_float', (_size: PineValue): PineValue => {
      return [];
    });

    // @ts-expect-error size parameter unused in stub implementation
    this.builtins.set('array.new_int', (_size: PineValue): PineValue => {
      return [];
    });

    // @ts-expect-error size parameter unused in stub implementation
    this.builtins.set('array.new_line', (_size: PineValue): PineValue => {
      return [];
    });

    // Generic array.new<T>(size) - used as array.new<T>(size)
    this.builtins.set('array.new', (_size: PineValue): PineValue => {
      return [];
    });

    // array.from(...values) - create array from values
    this.builtins.set('array.from', (...values: PineValue[]): PineValue => {
      return values;
    });

    this.builtins.set(
      'line.new',
      (
        x1: PineValue,
        y1: PineValue,
        x2: PineValue,
        y2: PineValue,
        namedArgs?: Record<string, PineValue>,
      ): PineValue => {
        if (isNa(x1) || isNa(y1) || isNa(x2) || isNa(y2)) {
          return 0;
        }
        let colorStr = '#2196f3';
        let styleStr = 'solid';
        let widthNum = 1;
        let xlocStr = 'bar_index';
        if (typeof namedArgs === 'object' && namedArgs !== null) {
          if (typeof namedArgs.color === 'string') colorStr = namedArgs.color;
          if (typeof namedArgs.style === 'string') styleStr = namedArgs.style;
          if (typeof namedArgs.width === 'number') widthNum = namedArgs.width;
          if (typeof namedArgs.xloc === 'string') xlocStr = namedArgs.xloc;
        }
        const id = this.lineIdCounter++;
        this.lines.set(id, {
          x1: x1 as number,
          y1: y1 as number,
          x2: x2 as number,
          y2: y2 as number,
          color: colorStr,
          style: styleStr,
          width: widthNum,
          xloc: xlocStr,
        });
        return id;
      },
    );

    this.builtins.set('line.delete', (lineId: PineValue): PineValue => {
      if (typeof lineId === 'number' && this.lines.has(lineId)) {
        this.lines.delete(lineId);
      }
      return 0;
    });

    this.builtins.set('line.get_x2', (lineId: PineValue): PineValue => {
      if (typeof lineId === 'number') {
        const line = this.lines.get(lineId);
        if (line) return line.x2;
      }
      return 0;
    });

    this.builtins.set(
      'label.new',
      (
        x: PineValue,
        y: PineValue,
        text: PineValue,
        namedArgs?: Record<string, PineValue>,
      ): PineValue => {
        if (isNa(x) || isNa(y) || isNa(text)) return 0;
        let colorStr = '#2196f3';
        let textcolorStr = '#ffffff';
        let styleStr = 'label.style_label_down';
        let sizeStr = 'size.normal';
        if (typeof namedArgs === 'object' && namedArgs !== null) {
          if (typeof namedArgs.color === 'string') colorStr = namedArgs.color;
          if (typeof namedArgs.textcolor === 'string') textcolorStr = namedArgs.textcolor;
          if (typeof namedArgs.style === 'string') styleStr = namedArgs.style;
          if (typeof namedArgs.size === 'string') sizeStr = namedArgs.size;
        }
        // Member expression resolution strips prefixes: label.style_label_down → style_label_down
        if (!styleStr.startsWith('label.')) styleStr = 'label.' + styleStr;
        if (!sizeStr.startsWith('size.')) sizeStr = 'size.' + sizeStr;
        this.labels.push({
          time: this.currentTimestamp,
          price: y as number,
          text: String(text),
          color: colorStr,
          textcolor: textcolorStr,
          style: styleStr,
          size: sizeStr,
        });
        return 0;
      },
    );

    this.builtins.set('na', (value: PineValue): PineValue => {
      return isNa(value);
    });

    // Table builtins (stubs for indicators that use tables for dashboards)
    this.builtins.set('table.new', (): PineValue => {
      return 0; // table ID
    });

    this.builtins.set('table.cell', (): PineValue => {
      return NA;
    });

    this.builtins.set('table.get_cell_text', (): PineValue => {
      return '';
    });

    this.builtins.set('table.get_cell_text_color', (): PineValue => {
      return '';
    });

    this.builtins.set('table.get_cell_bgcolor', (): PineValue => {
      return '';
    });

    this.builtins.set('table.set_cell_text', (): PineValue => {
      return NA;
    });

    this.builtins.set('table.set_cell_text_color', (): PineValue => {
      return NA;
    });

    this.builtins.set('table.set_cell_bgcolor', (): PineValue => {
      return NA;
    });

    this.builtins.set('table.set_cell_width', (): PineValue => {
      return NA;
    });

    // Position namespace builtins (for table position)
    this.builtins.set('position.top_left', 0);
    this.builtins.set('position.top_center', 1);
    this.builtins.set('position.top_right', 2);
    this.builtins.set('position.middle_left', 3);
    this.builtins.set('position.middle_center', 4);
    this.builtins.set('position.middle_right', 5);
    this.builtins.set('position.bottom_left', 6);
    this.builtins.set('position.bottom_center', 7);
    this.builtins.set('position.bottom_right', 8);

    // Size namespace builtins (for table/text size)
    this.builtins.set('size.auto', 'auto');
    this.builtins.set('size.tiny', 'tiny');
    this.builtins.set('size.small', 'small');
    this.builtins.set('size.normal', 'normal');
    this.builtins.set('size.large', 'large');
    this.builtins.set('size.huge', 'huge');

    // Text alignment builtins
    this.builtins.set('text.align_left', 'left');
    this.builtins.set('text.align_center', 'center');
    this.builtins.set('text.align_right', 'right');

    this.builtins.set('box', (_arg?: PineValue): PineValue => {
      return NA;
    });

    this.builtins.set(
      'box.new',
      (
        left: PineValue,
        top: PineValue,
        right: PineValue,
        bottom: PineValue,
        namedArgs?: Record<string, PineValue>,
      ): PineValue => {
        if (isNa(left) || isNa(top) || isNa(right) || isNa(bottom)) return NA;
        let borderColor = '#00000000';
        let bgcolor = '#2196f380';
        if (typeof namedArgs === 'object' && namedArgs !== null) {
          if (typeof namedArgs.border_color === 'string') borderColor = namedArgs.border_color;
          if (typeof namedArgs.bgcolor === 'string') bgcolor = namedArgs.bgcolor;
        }
        const id = ++this.boxIdCounter;
        this.boxes.set(id, {
          left: left as number,
          top: top as number,
          right: right as number,
          bottom: bottom as number,
          border_color: borderColor,
          bgcolor,
        });
        return id;
      },
    );

    this.builtins.set('nz', (value: PineValue, fallback?: PineValue): PineValue => {
      if (isNa(value)) return fallback !== undefined ? fallback : 0;
      return value;
    });

    this.builtins.set('request.security', (...args: PineValue[]): PineValue => {
      return args.length > 2 ? args[2]! : NA;
    });

    this.builtins.set('ta.crossover', (source: PineValue, compare: PineValue): PineValue => {
      if (isNa(source) || isNa(compare)) return false;
      const key = `cross_${this.currentCallSiteId}`;
      const prev = this.crossPrevValues.get(key);
      if (!prev) {
        this.crossPrevValues.set(key, { src: source as number, cmp: compare as number });
        return false;
      }
      const result = prev.src <= prev.cmp && (source as number) > (compare as number);
      prev.src = source as number;
      prev.cmp = compare as number;
      return result;
    });

    this.builtins.set('ta.crossunder', (source: PineValue, compare: PineValue): PineValue => {
      if (isNa(source) || isNa(compare)) return false;
      const key = `cross_${this.currentCallSiteId}`;
      const prev = this.crossPrevValues.get(key);
      if (!prev) {
        this.crossPrevValues.set(key, { src: source as number, cmp: compare as number });
        return false;
      }
      const result = prev.src >= prev.cmp && (source as number) < (compare as number);
      prev.src = source as number;
      prev.cmp = compare as number;
      return result;
    });

    this.builtins.set('ta.cross', (source: PineValue, compare: PineValue): PineValue => {
      if (isNa(source) || isNa(compare)) return false;
      const key = `cross_${this.currentCallSiteId}`;
      const prev = this.crossPrevValues.get(key);
      if (!prev) {
        this.crossPrevValues.set(key, { src: source as number, cmp: compare as number });
        return false;
      }
      const crossed =
        (prev.src <= prev.cmp && (source as number) > (compare as number)) ||
        (prev.src >= prev.cmp && (source as number) < (compare as number));
      prev.src = source as number;
      prev.cmp = compare as number;
      return crossed;
    });

    this.builtins.set('ta.change', (source: PineValue): PineValue => {
      if (isNa(source)) return NA;
      const key = `change_${this.currentCallSiteId}`;
      const prev = this.changePrevValues.get(key);
      if (prev === undefined) {
        this.changePrevValues.set(key, source as number);
        return NA;
      }
      const result = (source as number) - prev;
      this.changePrevValues.set(key, source as number);
      return result;
    });

    this.builtins.set(
      'color.new',
      (color: PineValue, transp: PineValue, _namedOrNamed?: PineValue): PineValue => {
        const c = typeof color === 'string' ? color : '#2196f3';
        const t = isNa(transp) ? 0 : (transp as number);
        const alpha = Math.round(Math.max(0, Math.min(100, 100 - t)) * 2.55);
        const hex = alpha.toString(16).padStart(2, '0');
        if (c.startsWith('#')) {
          return c + hex;
        }
        return c;
      },
    );

    this.builtins.set(
      'color.from_gradient',
      (
        value: PineValue,
        minVal: PineValue,
        maxVal: PineValue,
        bottomColor: PineValue,
        topColor: PineValue,
      ): PineValue => {
        if (isNa(value) || isNa(minVal) || isNa(maxVal)) return '#80808080';
        const v = value as number;
        const min = minVal as number;
        const max = maxVal as number;
        if (Math.abs(max - min) < 1e-10)
          return typeof bottomColor === 'string' ? bottomColor : '#808080';
        const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
        const bot = typeof bottomColor === 'string' ? bottomColor : '#8BC34A';
        const top = typeof topColor === 'string' ? topColor : '#F44336';
        const parseRgb = (hex: string): [number, number, number] => {
          const c = hex.replace('#', '');
          return [
            parseInt(c.substring(0, 2), 16) || 0,
            parseInt(c.substring(2, 4), 16) || 0,
            parseInt(c.substring(4, 6), 16) || 0,
          ];
        };
        const [r1, g1, b1] = parseRgb(bot);
        const [r2, g2, b2] = parseRgb(top);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g2v = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return `#${r.toString(16).padStart(2, '0')}${g2v.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      },
    );

    this.builtins.set('fill', (...allArgs: PineValue[]): PineValue => {
      const lastArg = allArgs.length > 0 ? allArgs[allArgs.length - 1] : undefined;
      const namedArgs =
        typeof lastArg === 'object' &&
        lastArg !== null &&
        !Array.isArray(lastArg) &&
        !(lastArg as any).__isSeries
          ? (lastArg as unknown as Record<string, PineValue>)
          : undefined;
      const positionalArgs = namedArgs ? allArgs.slice(0, -1) : allArgs;

      // Pine Script fill(plot1, plot2, top_value, bottom_value, top_color, bottom_color, editable, fillgaps, title)
      const from =
        typeof positionalArgs[0] === 'string' &&
        (positionalArgs[0] as string).startsWith('__plot_ref:')
          ? (positionalArgs[0] as string).slice(11)
          : String(positionalArgs[0] ?? '');
      const to =
        typeof positionalArgs[1] === 'string' &&
        (positionalArgs[1] as string).startsWith('__plot_ref:')
          ? (positionalArgs[1] as string).slice(11)
          : String(positionalArgs[1] ?? '');

      let topColor: string | null = null;
      let bottomColor: string | null = null;
      if (positionalArgs.length >= 5 && typeof positionalArgs[4] === 'string')
        topColor = positionalArgs[4] as string;
      if (positionalArgs.length >= 6 && typeof positionalArgs[5] === 'string')
        bottomColor = positionalArgs[5] as string;

      if (namedArgs) {
        if (typeof namedArgs.color === 'string') topColor = namedArgs.color;
      }

      const fillKey = `${from}::${to}`;
      if (!this.fills.some((f) => f.from === from && f.to === to)) {
        this.fills.push({ from, to, color: topColor ?? bottomColor ?? 'rgba(33,150,243,0.2)' });
      }
      if (!this.fillColorData.has(fillKey)) {
        this.fillColorData.set(fillKey, []);
      }
      // Push the top color for this bar — the renderer uses one color per bar segment
      this.fillColorData.get(fillKey)!.push(topColor);
      return NA;
    });

    this.builtins.set('alertcondition', (...args: PineValue[]): PineValue => {
      const namedArgs =
        args.length > 0 &&
        typeof args[args.length - 1] === 'object' &&
        !Array.isArray(args[args.length - 1])
          ? (args[args.length - 1] as unknown as Record<string, PineValue>)
          : {};
      const condition = args[0] ?? NA;
      const titleVal = namedArgs['title'];
      const msgVal = namedArgs['message'];
      const title =
        typeof titleVal === 'string' ? titleVal : `Alert ${this.alertConditionEntries.length + 1}`;
      const message = typeof msgVal === 'string' ? msgVal : title;
      const existing = this.alertConditionEntries.find((e) => e.title === title);
      let id: string;
      if (existing) {
        id = existing.id;
      } else {
        id = `alert_${this.alertConditionEntries.length + 1}`;
        this.alertConditionEntries.push({ id, title, message });
      }
      if (pineTruthy(condition) && this.currentContext) {
        this.alertTriggers.push({
          alertId: id,
          barIndex: this.currentContext.barIndex,
          timestamp: this.currentContext.timestamp,
        });
      }
      return NA;
    });

    this.builtins.set('alert', (...args: PineValue[]): PineValue => {
      const message = typeof args[0] === 'string' ? args[0] : 'Alert triggered';
      if (this.currentContext) {
        this.alertTriggers.push({
          alertId: message,
          barIndex: this.currentContext.barIndex,
          timestamp: this.currentContext.timestamp,
        });
      }
      return NA;
    });
  }

  private initializeGlobals(): void {
    for (const global of this.compiledScript.globals) {
      declareVariable(
        this.globalScope,
        global.name,
        global.type,
        global.isVar,
        global.isVarip,
        global.isConst,
      );
    }
  }

  private initializeStrategy(
    override?: Partial<import('../../strategy/strategy-engine.js').StrategyConfig>,
  ): void {
    const args: Record<string, unknown> = {};
    for (const arg of this.sourceProgram.scriptArgs) {
      if (arg.name) {
        args[arg.name] = this.evaluateArgValue(arg.value);
      }
    }

    const config = parseStrategyDeclaration(args);
    let strategyConfig = getStrategyConfig(config);
    if (override && strategyConfig) {
      strategyConfig = { ...strategyConfig, ...override };
    }
    if (strategyConfig) {
      this.strategyEngine = new StrategyEngine(strategyConfig);
    }
    this.registerStrategyBuiltins();
  }

  private evaluateArgValue(expr: ExpressionNode): unknown {
    switch (expr.kind) {
      case 'NumberLiteral':
        return expr.value;
      case 'StringLiteral':
        return expr.value;
      case 'BooleanLiteral':
        return expr.value;
      case 'Identifier':
        return expr.name;
      case 'MemberExpression': {
        const obj = this.evaluateArgValue(expr.object);
        if (typeof obj === 'string') {
          return `${obj}.${expr.property}`;
        }
        return expr.property;
      }
      default:
        return undefined;
    }
  }

  private registerStrategyBuiltins(): void {
    this.builtins.set(
      'strategy.entry',
      (name: PineValue, directionOrQty: PineValue, ...rest: PineValue[]): PineValue => {
        if (!this.strategyEngine) return NA;

        const namedArgs =
          rest.length > 0 &&
          typeof rest[rest.length - 1] === 'object' &&
          rest[rest.length - 1] !== null &&
          !Array.isArray(rest[rest.length - 1])
            ? (rest[rest.length - 1] as unknown as Record<string, PineValue>)
            : undefined;
        const restArgs = namedArgs ? rest.slice(0, -1) : rest;

        let dir: OrderDirection;
        let qty: number | undefined;
        let pr: number;

        if (typeof directionOrQty === 'string') {
          dir = directionOrQty === 'short' ? 'short' : 'long';
          qty =
            typeof restArgs[0] === 'number'
              ? restArgs[0]
              : typeof namedArgs?.qty === 'number'
                ? namedArgs.qty
                : undefined;
          pr = typeof restArgs[1] === 'number' ? restArgs[1] : 0;
        } else {
          dir = 'long';
          qty =
            typeof directionOrQty === 'number'
              ? directionOrQty
              : typeof namedArgs?.qty === 'number'
                ? namedArgs.qty
                : undefined;
          pr = typeof restArgs[0] === 'number' ? restArgs[0] : 0;
        }

        const entryName = typeof name === 'string' ? name : 'entry';
        const sp = typeof restArgs[2] === 'number' ? restArgs[2] : undefined;
        const lp = typeof restArgs[3] === 'number' ? restArgs[3] : undefined;
        const cm =
          (typeof restArgs[4] === 'string' ? restArgs[4] : undefined) ??
          (typeof namedArgs?.comment === 'string' ? namedArgs.comment : undefined);
        this.strategyEngine.entry(entryName, dir, qty, pr, sp, lp, cm);
        return NA;
      },
    );

    this.builtins.set('strategy.exit', (name: PineValue, ...rest: PineValue[]): PineValue => {
      if (!this.strategyEngine) return NA;

      const namedArgs =
        rest.length > 0 &&
        typeof rest[rest.length - 1] === 'object' &&
        rest[rest.length - 1] !== null &&
        !Array.isArray(rest[rest.length - 1])
          ? (rest[rest.length - 1] as unknown as Record<string, PineValue>)
          : undefined;
      const restArgs = namedArgs ? rest.slice(0, -1) : rest;

      const exitName = typeof name === 'string' ? name : 'exit';
      const qty =
        typeof restArgs[0] === 'number'
          ? restArgs[0]
          : typeof namedArgs?.qty === 'number'
            ? namedArgs.qty
            : undefined;
      const pr = typeof restArgs[1] === 'number' ? restArgs[1] : 0;
      const sp =
        typeof restArgs[2] === 'number'
          ? restArgs[2]
          : typeof namedArgs?.stop === 'number'
            ? namedArgs.stop
            : undefined;
      const lp =
        typeof restArgs[3] === 'number'
          ? restArgs[3]
          : typeof namedArgs?.limit === 'number'
            ? namedArgs.limit
            : undefined;
      const cm =
        (typeof restArgs[4] === 'string' ? restArgs[4] : undefined) ??
        (typeof namedArgs?.comment === 'string' ? namedArgs.comment : undefined);
      this.strategyEngine.exit(exitName, qty, pr, sp, lp, cm);
      return NA;
    });

    this.builtins.set('strategy.close', (nameOrNamed?: PineValue): PineValue => {
      if (!this.strategyEngine) return NA;
      let closeName = 'close';
      let comment: string | undefined;
      if (typeof nameOrNamed === 'string') {
        closeName = nameOrNamed;
      } else if (
        typeof nameOrNamed === 'object' &&
        nameOrNamed !== null &&
        !Array.isArray(nameOrNamed)
      ) {
        const na = nameOrNamed as unknown as Record<string, PineValue>;
        if (typeof na.id === 'string') closeName = na.id;
        if (typeof na.comment === 'string') comment = na.comment;
      }
      this.strategyEngine.close(closeName, comment);
      return NA;
    });

    this.builtins.set('strategy.close_all', (name?: PineValue): PineValue => {
      if (!this.strategyEngine) return NA;
      const closeName = typeof name === 'string' ? name : 'close_all';
      this.strategyEngine.closeAll(closeName);
      return NA;
    });

    this.builtins.set('strategy.cancel', (orderId: PineValue): PineValue => {
      if (!this.strategyEngine) return NA;
      if (typeof orderId === 'string') {
        this.strategyEngine.cancel(orderId);
      }
      return NA;
    });

    this.builtins.set('strategy.cancel_all', (): PineValue => {
      if (!this.strategyEngine) return NA;
      this.strategyEngine.cancelAll();
      return NA;
    });

    this.builtins.set(
      'strategy.order',
      (
        name: PineValue,
        direction: PineValue,
        quantity?: PineValue,
        price?: PineValue,
      ): PineValue => {
        if (!this.strategyEngine) return NA;
        const orderName = typeof name === 'string' ? name : 'order';
        const dir: OrderDirection = direction === 'short' ? 'short' : 'long';
        const qty = typeof quantity === 'number' ? quantity : undefined;
        const pr = typeof price === 'number' ? price : 0;
        this.strategyEngine.order(orderName, dir, qty, pr);
        return NA;
      },
    );
  }

  createSnapshot(): void {
    const snapshot: ExecutionSnapshot = {
      scope: cloneRuntimeScope(this.globalScope),
      outputs: this.cloneOutputs(),
      shapes: [...this.shapes],
      fills: [...this.fills],
      lines: new Map(this.lines),
      lineIdCounter: this.lineIdCounter,
      labels: [...this.labels],
      bgcolorData: [...this.bgcolorData],
      barColorData: [...this.barColorData],
      sarState: new Map([...this.sarState].map(([k, v]) => [k, { ...v }])),
      barIndex: this.metrics.totalBars,
    };
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  rollbackToSnapshot(index: number = -1): boolean {
    if (this.snapshots.length === 0) {
      return false;
    }
    const snapshotIndex = index < 0 ? this.snapshots.length + index : index;
    if (snapshotIndex < 0 || snapshotIndex >= this.snapshots.length) {
      return false;
    }
    const snapshot = this.snapshots[snapshotIndex]!;
    this.globalScope = snapshot.scope;
    this.outputs = snapshot.outputs;
    this.shapes = snapshot.shapes;
    this.fills = snapshot.fills;
    this.lines = new Map(snapshot.lines);
    this.lineIdCounter = snapshot.lineIdCounter;
    this.labels = [...snapshot.labels];
    this.bgcolorData = snapshot.bgcolorData;
    this.barColorData = snapshot.barColorData;
    this.sarState = new Map([...snapshot.sarState].map(([k, v]) => [k, { ...v }]));
    this.snapshots = this.snapshots.slice(0, snapshotIndex);
    return true;
  }

  rollbackToPreviousBar(): boolean {
    if (this.metrics.totalBars <= 0) {
      return false;
    }
    return this.rollbackToSnapshot(-1);
  }

  private cloneOutputs(): Map<string, Series> {
    const cloned = new Map<string, Series>();
    for (const [name, series] of this.outputs) {
      cloned.set(name, createSeries(name, series.values.slice()));
    }
    return cloned;
  }

  executeBar(context: ExecutionContext): ExecutionResult {
    const startTime = performance.now();
    this.currentTimestamp = context.timestamp;
    this.currentContext = context;
    this.barTimestamps.push(context.timestamp);

    try {
      this.createSnapshot();
      pushBarValues(this.globalScope);

      if (this.strategyEngine) {
        const openVal = context.open.getRelative(0);
        const highVal = context.high.getRelative(0);
        const lowVal = context.low.getRelative(0);
        const closeVal = context.close.getRelative(0);
        const volVal = context.volume.getRelative(0);
        this.strategyEngine.updateBar(
          context.barIndex,
          context.timestamp,
          typeof openVal === 'number' ? openVal : 0,
          typeof highVal === 'number' ? highVal : 0,
          typeof lowVal === 'number' ? lowVal : 0,
          typeof closeVal === 'number' ? closeVal : 0,
          typeof volVal === 'number' ? volVal : 0,
        );
      }

      for (const stmt of this.sourceProgram.body) {
        this.executeStatement(stmt, this.globalScope, context);
      }

      const executionTime = performance.now() - startTime;
      this.updateMetrics(true, executionTime);

      const activeLines = [...this.lines.values()].map((l) => ({ ...l }));
      return {
        success: true,
        version: this.sourceProgram.version,
        overlay: this.compiledScript.overlay,
        outputs: this.outputs,
        shapes: [...this.shapes],
        fills: this.fills,
        strategyMarkers: this.getStrategyMarkers(),
        bgcolor: this.bgcolorData,
        plotColors: this.plotColors,
        fillColorData: this.fillColorData,
        lines: activeLines,
        labels: [...this.labels],
        boxes: [...this.boxes.values()],
        barTimestamps: [...this.barTimestamps],
        alertConditions: [...this.alertConditionEntries],
        alertTriggers: [...this.alertTriggers],
        barColorData: [...this.barColorData],
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      this.updateMetrics(false, executionTime);
      console.error(
        `[ExecutionEngine] Error at bar ${context.barIndex}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.rollbackToPreviousBar();

      const activeLines = [...this.lines.values()].map((l) => ({ ...l }));
      return {
        success: false,
        version: this.sourceProgram.version,
        overlay: this.compiledScript.overlay,
        error: error instanceof Error ? error.message : String(error),
        outputs: this.outputs,
        shapes: [...this.shapes],
        fills: this.fills,
        strategyMarkers: this.getStrategyMarkers(),
        bgcolor: this.bgcolorData,
        plotColors: this.plotColors,
        fillColorData: this.fillColorData,
        lines: activeLines,
        labels: [...this.labels],
        boxes: [...this.boxes.values()],
        barTimestamps: [...this.barTimestamps],
        alertConditions: [...this.alertConditionEntries],
        alertTriggers: [...this.alertTriggers],
        barColorData: [...this.barColorData],
      };
    }
  }

  executeBars(bars: ExecutionContext[]): ExecutionResult {
    const allMarkers: StrategyMarkerEntry[] = [];
    let lastResult: ExecutionResult = {
      success: true,
      version: this.sourceProgram.version,
      overlay: this.compiledScript.overlay,
      outputs: this.outputs,
      shapes: [...this.shapes],
      fills: this.fills,
      strategyMarkers: allMarkers,
      bgcolor: this.bgcolorData,
      plotColors: this.plotColors,
      fillColorData: this.fillColorData,
      lines: [...this.lines.values()].map((l) => ({ ...l })),
      labels: [...this.labels],
      barTimestamps: [...this.barTimestamps],
      alertConditions: this.alertConditionEntries,
      alertTriggers: [...this.alertTriggers],
      barColorData: [...this.barColorData],
      maxLookback: this.getMaxLookback(),
    };

    for (const bar of bars) {
      lastResult = this.executeBar(bar);
      if (!lastResult.success) {
        break;
      }
      allMarkers.push(...lastResult.strategyMarkers);
    }

    return {
      ...lastResult,
      strategyMarkers: allMarkers,
      maxLookback: this.getMaxLookback(),
    };
  }

  executeRealtimeBar(context: ExecutionContext): ExecutionResult {
    if (this.snapshots.length === 0) {
      this.createSnapshot();
    }
    return this.executeBar(context);
  }

  computeFormingCandle(context: ExecutionContext): FormingCandleResult {
    if (this.metrics.totalBars === 0) {
      const result = this.executeRealtimeBar(context);
      return {
        success: result.success,
        error: result.error,
        overlay: this.compiledScript.overlay,
        diffOutputs: Object.fromEntries(Array.from(result.outputs).map(([k, s]) => [k, s.last()])),
        diffShapes: [...result.shapes],
        diffFills: [...result.fills],
        diffLines: [...(result.lines || [])],
        diffLabels: [...(result.labels || [])],
        barTimestamps: [...(result.barTimestamps ?? [])],
        barIndex: (result.barTimestamps ?? []).length - 1,
        isDiff: true,
      };
    }

    const preOutputs = this.cloneOutputs();
    const preShapesLen = this.shapes.length;
    const preFillsLen = this.fills.length;
    const preLinesSize = this.lines.size;
    const preLabelsLen = this.labels.length;
    const preTimestampsLen = this.barTimestamps.length;
    const preTotalBars = this.metrics.totalBars;
    const preAlertTriggersLen = this.alertTriggers.length;
    const preSmaBuffers = new Map([...this.smaBuffers].map(([k, v]) => [k, [...v]]));
    const preEmaState = new Map([...this.emaState].map(([k, v]) => [k, { ...v }]));
    const preCrossPrevValues = new Map(this.crossPrevValues);
    const preChangePrevValues = new Map(this.changePrevValues);
    const preHighestBuffers = new Map([...this.highestBuffers].map(([k, v]) => [k, [...v]]));
    const preLowestBuffers = new Map([...this.lowestBuffers].map(([k, v]) => [k, [...v]]));
    const prePlotColors = new Map([...this.plotColors].map(([k, v]) => [k, [...v]]));
    const preFillColorData = new Map([...this.fillColorData].map(([k, v]) => [k, [...v]]));
    const preBgcolorDataLen = this.bgcolorData.length;
    const preRsiState = new Map([...this.rsiState].map(([k, v]) => [k, { ...v }]));
    const preAtrState = new Map([...this.atrState].map(([k, v]) => [k, { ...v }]));
    const preHmaBuffers = new Map(
      [...this.hmaBuffers].map(([k, v]) => [
        k,
        { half: [...v.half], full: [...v.full], diff: [...v.diff] },
      ]),
    );
    const preSarState = new Map([...this.sarState].map(([k, v]) => [k, { ...v }]));
    const preFunctionPersistentScopes = new Map(
      [...this.functionPersistentScopes].map(([k, v]) => [k, cloneRuntimeScope(v)]),
    );
    const preBarColorDataLen = this.barColorData.length;
    const preBoxesSize = this.boxes.size;
    const preBoxIdCounter = this.boxIdCounter;
    const preStrategyState = this.strategyEngine ? this.strategyEngine.saveState() : null;

    const result = this.executeBar(context);

    const snapshotsAdded = this.snapshots.length > 0 ? 1 : 0;
    for (let i = 0; i < snapshotsAdded; i++) {
      this.snapshots.pop();
    }

    this.barTimestamps.length = preTimestampsLen;
    this.metrics.totalBars = preTotalBars;
    this.metrics.successfulBars = result.success
      ? this.metrics.successfulBars - 1
      : this.metrics.successfulBars;
    this.metrics.failedBars = result.success
      ? this.metrics.failedBars
      : this.metrics.failedBars - 1;

    this.globalScope = cloneRuntimeScope(this.globalScope);
    this.smaBuffers = preSmaBuffers;
    this.emaState = preEmaState;
    this.crossPrevValues = preCrossPrevValues;
    this.changePrevValues = preChangePrevValues;
    this.highestBuffers = preHighestBuffers;
    this.lowestBuffers = preLowestBuffers;
    this.rsiState = preRsiState;
    this.atrState = preAtrState;
    this.hmaBuffers = preHmaBuffers;
    this.sarState = preSarState;
    this.functionPersistentScopes = preFunctionPersistentScopes;
    this.barColorData.length = preBarColorDataLen;
    if (this.boxes.size > preBoxesSize) {
      for (const [id] of this.boxes) {
        if (id >= preBoxesSize) {
          this.boxes.delete(id);
        }
      }
    }
    this.boxIdCounter = preBoxIdCounter;
    if (this.strategyEngine && preStrategyState) {
      this.strategyEngine.restoreState(preStrategyState);
    }

    const diffOutputs: Record<string, PineValue> = {};
    for (const [key, series] of this.outputs) {
      const preSeries = preOutputs.get(key);
      if (preSeries && series.length > 0 && preSeries.length > 0) {
        const lastVal = series.last();
        const preLastVal = preSeries.last();
        if (lastVal !== preLastVal) {
          diffOutputs[key] = lastVal;
        }
        series.values.length = preSeries.length;
      } else if (series.length > 0 && (!preSeries || preSeries.length === 0)) {
        diffOutputs[key] = series.last();
        this.outputs.delete(key);
      }
    }

    let diffShapes: ShapeEntry[] = [];
    if (this.shapes.length > preShapesLen) {
      diffShapes = this.shapes.slice(preShapesLen);
      this.shapes.length = preShapesLen;
    }

    let diffFills: Array<{ from: string; to: string; color: string }> = [];
    if (this.fills.length > preFillsLen) {
      diffFills = this.fills.slice(preFillsLen);
      this.fills.length = preFillsLen;
    }

    let diffLines: LineEntry[] = [];
    if (this.lines.size > preLinesSize) {
      diffLines = [];
      for (const [id, entry] of this.lines) {
        if (id >= preLinesSize) {
          diffLines.push({ ...entry });
          this.lines.delete(id);
        }
      }
    }

    let diffLabels: LabelEntry[] = [];
    if (this.labels.length > preLabelsLen) {
      diffLabels = this.labels.slice(preLabelsLen);
      this.labels.length = preLabelsLen;
    }

    let diffAlertTriggers: AlertTriggerEntry[] = [];
    if (this.alertTriggers.length > preAlertTriggersLen) {
      diffAlertTriggers = this.alertTriggers.slice(preAlertTriggersLen);
      this.alertTriggers.length = preAlertTriggersLen;
    }

    const diffPlotColors: Record<string, (string | null)[]> = {};
    for (const [key, colors] of this.plotColors) {
      const preColors = prePlotColors.get(key);
      if (!preColors || colors.length > preColors.length) {
        diffPlotColors[key] = colors.slice(preColors?.length ?? 0);
      }
    }

    const diffFillColorData: Record<string, (string | null)[]> = {};
    for (const [key, colors] of this.fillColorData) {
      const preColors = preFillColorData.get(key);
      if (!preColors || colors.length > preColors.length) {
        diffFillColorData[key] = colors.slice(preColors?.length ?? 0);
      }
    }

    let diffBgcolor: Array<{ time: number; color: string }> = [];
    if (this.bgcolorData.length > preBgcolorDataLen) {
      diffBgcolor = this.bgcolorData.slice(preBgcolorDataLen);
    }

    this.plotColors = prePlotColors;
    this.fillColorData = preFillColorData;
    this.bgcolorData.length = preBgcolorDataLen;

    const isDiff =
      Object.keys(diffOutputs).length > 0 ||
      diffShapes.length > 0 ||
      diffFills.length > 0 ||
      diffLines.length > 0 ||
      diffLabels.length > 0 ||
      diffAlertTriggers.length > 0;

    return {
      success: result.success,
      error: result.error,
      overlay: this.compiledScript.overlay,
      diffOutputs,
      diffShapes,
      diffFills,
      diffLines,
      diffLabels,
      diffPlotColors: Object.keys(diffPlotColors).length > 0 ? diffPlotColors : undefined,
      diffFillColorData: Object.keys(diffFillColorData).length > 0 ? diffFillColorData : undefined,
      diffBgcolor: diffBgcolor.length > 0 ? diffBgcolor : undefined,
      diffAlertTriggers: diffAlertTriggers.length > 0 ? diffAlertTriggers : undefined,
      barTimestamps: [...this.barTimestamps],
      barIndex: this.barTimestamps.length - 1,
      isDiff,
      isConfirmed: !this.isFormingCandle,
    };
  }

  private updateMetrics(success: boolean, executionTimeMs: number): void {
    this.metrics.totalBars++;
    if (success) {
      this.metrics.successfulBars++;
    } else {
      this.metrics.failedBars++;
    }
    this.executionTimes.push(executionTimeMs);
    if (this.executionTimes.length > 1000) {
      this.executionTimes.shift();
    }
    this.metrics.lastExecutionTimeMs = executionTimeMs;
    this.metrics.averageExecutionTimeMs =
      this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length;
  }

  getMetrics(): ExecutionMetrics {
    return { ...this.metrics };
  }

  getOutput(name: string): Series | undefined {
    return this.outputs.get(name);
  }

  getAllOutputs(): Map<string, Series> {
    return this.outputs;
  }

  getStrategyEngine(): StrategyEngine | null {
    return this.strategyEngine;
  }

  private getStrategyMarkers(): StrategyMarkerEntry[] {
    if (!this.strategyEngine) return [];
    return this.strategyEngine.getNewMarkers().map((m: StrategyMarker) => ({
      type: m.type,
      name: m.name,
      direction: m.direction,
      action: m.action,
      quantity: m.quantity,
      price: m.price,
      barIndex: m.barIndex,
      timestamp: m.timestamp,
      color: m.color,
      comment: m.comment,
    }));
  }

  private executeStatement(
    stmt: StatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    switch (stmt.kind) {
      case 'VariableDeclaration':
        return this.executeVariableDeclaration(stmt, scope, context);
      case 'Assignment':
        return this.executeAssignment(stmt, scope, context);
      case 'ExpressionStatement':
        return this.executeExpressionStatement(stmt, scope, context);
      case 'IfStatement':
        return this.executeIfStatement(stmt, scope, context);
      case 'ForStatement':
        return this.executeForStatement(stmt, scope, context);
      case 'WhileStatement':
        return this.executeWhileStatement(stmt, scope, context);
      case 'SwitchStatement':
        return this.executeSwitchStatement(stmt, scope, context);
      case 'TypeDeclaration':
        return this.executeTypeDeclaration(stmt, scope, context);
      case 'ReturnStatement':
        return this.executeReturnStatement(stmt, scope, context);
      case 'BreakStatement':
      case 'ContinueStatement':
        return NA;
      default:
        throw new Error(`Unsupported statement kind: ${(stmt as StatementNode).kind}`);
    }
  }

  private executeVariableDeclaration(
    decl: VariableDeclarationNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const existing = resolveVariable(scope, decl.name);

    if (existing && (decl.isVar || decl.isVarip)) {
      if (existing.series.length > 0) {
        return existing.series.last();
      }
      let value: PineValue = NA;
      if (decl.initializer) {
        value = this.executeExpression(decl.initializer, scope, context);
      }
      existing.series.push(value);
      return value;
    }

    let value: PineValue = NA;

    if (decl.initializer) {
      value = this.executeExpression(decl.initializer, scope, context);
    }

    if (existing) {
      existing.series.push(value);
    } else {
      const binding = declareVariable(
        scope,
        decl.name,
        FLOAT_TYPE,
        decl.isVar,
        decl.isVarip,
        decl.isConst,
      );
      binding.series.push(value);
    }

    return value;
  }

  private executeAssignment(
    stmt: AssignmentNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const value = this.executeExpression(stmt.value, scope, context);

    if (stmt.target.kind === 'Identifier') {
      const name = stmt.target.name;
      let binding = resolveVariable(scope, name);

      if (!binding && stmt.operator === '=') {
        binding = declareVariable(scope, name, FLOAT_TYPE);
      }

      if (!binding) {
        throw new Error(`Variable '${name}' is not defined`);
      }

      let result: PineValue = value;
      if (stmt.operator !== '=') {
        const current = binding.series.getRelative(0);
        switch (stmt.operator) {
          case '+=':
            result =
              (typeof current === 'number' ? current : 0) + (typeof value === 'number' ? value : 0);
            break;
          case '-=':
            result =
              (typeof current === 'number' ? current : 0) - (typeof value === 'number' ? value : 0);
            break;
          case '*=':
            result =
              (typeof current === 'number' ? current : 0) * (typeof value === 'number' ? value : 0);
            break;
          case '/=':
            result =
              typeof current === 'number' && typeof value === 'number' && value !== 0
                ? current / value
                : 0;
            break;
          case ':=':
            result = value;
            break;
        }
      }
      // For reassignment operators (:=, +=, -=, *=, /=), overwrite the current bar's value
      // instead of pushing a new value, to maintain one value per bar in the series.
      if (stmt.operator !== '=' && binding.series.length > 0) {
        binding.series.values[binding.series.values.length - 1] = result;
      } else {
        binding.series.push(result);
      }
      return result;
    }

    if (stmt.target.kind === 'MemberExpression') {
      return value;
    }

    if (stmt.target.kind === 'ArrayExpression') {
      if (!Array.isArray(value)) {
        return NA;
      }
      for (let i = 0; i < stmt.target.elements.length; i++) {
        const elem = stmt.target.elements[i];
        if (elem && elem.kind === 'Identifier') {
          const name = elem.name;
          let binding = resolveVariable(scope, name);
          if (!binding) {
            binding = declareVariable(scope, name, FLOAT_TYPE);
          }
          binding.series.push((value as PineValue[])[i] ?? NA);
        }
      }
      return value;
    }

    throw new Error(`Unsupported assignment target: ${stmt.target.kind}`);
  }

  private executeExpressionStatement(
    stmt: ExpressionStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return this.executeExpression(stmt.expression, scope, context);
  }

  private executeIfStatement(
    stmt: IfStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const condition = this.executeExpression(stmt.condition, scope, context);

    if (pineTruthy(condition)) {
      const blockScope = createRuntimeScope(scope);
      for (const s of stmt.thenBranch) {
        this.executeStatement(s, blockScope, context);
      }
      return NA;
    }

    if (stmt.elseBranch) {
      const blockScope = createRuntimeScope(scope);
      for (const s of stmt.elseBranch) {
        this.executeStatement(s, blockScope, context);
      }
    }

    return NA;
  }

  private executeForStatement(
    stmt: ForStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    // Handle "for ... in ..." syntax (array iteration)
    if (stmt.isForIn && stmt.iterable) {
      const iterableValue = this.executeExpression(stmt.iterable, scope, context);
      const loopScope = createRuntimeScope(scope);
      declareVariable(loopScope, stmt.variable, FLOAT_TYPE); // element type

      if (Array.isArray(iterableValue)) {
        for (const element of iterableValue) {
          setVariableValue(loopScope, stmt.variable, element);
          for (const s of stmt.body) {
            this.executeStatement(s, loopScope, context);
          }
        }
      }
      return NA;
    }

    // Traditional "for ... = ... to ..." syntax
    const start = this.executeExpression(stmt.start!, scope, context) as number;
    const end = this.executeExpression(stmt.end!, scope, context) as number;
    const step = stmt.step ? (this.executeExpression(stmt.step, scope, context) as number) : 1;

    const loopScope = createRuntimeScope(scope);
    declareVariable(loopScope, stmt.variable, INT_TYPE);

    for (let i = start; i <= end; i += step) {
      setVariableValue(loopScope, stmt.variable, i);
      for (const s of stmt.body) {
        this.executeStatement(s, loopScope, context);
      }
    }

    return NA;
  }

  private executeWhileStatement(
    stmt: WhileStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const loopScope = createRuntimeScope(scope);
    let iterations = 0;
    const maxIterations = 10000;

    while (pineTruthy(this.executeExpression(stmt.condition, loopScope, context))) {
      iterations++;
      if (iterations > maxIterations) {
        throw new Error('While loop exceeded maximum iterations');
      }

      for (const s of stmt.body) {
        this.executeStatement(s, loopScope, context);
      }
    }

    return NA;
  }

  private executeSwitchStatement(
    stmt: SwitchStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const exprValue = this.executeExpression(stmt.expression, scope, context);

    for (const caseNode of stmt.cases) {
      if (caseNode.value) {
        const caseValue = this.executeExpression(caseNode.value, scope, context);
        if (exprValue === caseValue || (typeof exprValue === 'number' && exprValue === caseValue)) {
          const caseScope = createRuntimeScope(scope);
          let lastResult: PineValue = NA;
          for (const s of caseNode.body) {
            lastResult = this.executeStatement(s, caseScope, context);
          }
          return lastResult;
        }
      }
    }

    if (stmt.defaultCase) {
      const defaultScope = createRuntimeScope(scope);
      let lastResult: PineValue = NA;
      for (const s of stmt.defaultCase) {
        lastResult = this.executeStatement(s, defaultScope, context);
      }
      return lastResult;
    }

    return NA;
  }

  private executeTypeDeclaration(
    stmt: TypeDeclarationNode,
    _scope: RuntimeScope,
    _context: ExecutionContext,
  ): PineValue {
    this.userTypeFields.set(
      stmt.name,
      stmt.fields.map((f) => f.name),
    );
    return NA;
  }

  private executeSwitchExpression(
    expr: SwitchExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const condValue = this.executeExpression(expr.expression, scope, context);

    for (const caseNode of expr.cases) {
      if (caseNode.value) {
        const caseValue = this.executeExpression(caseNode.value, scope, context);
        if (condValue === caseValue || (typeof condValue === 'number' && condValue === caseValue)) {
          return this.executeExpression(caseNode.result, scope, context);
        }
      } else {
        return this.executeExpression(caseNode.result, scope, context);
      }
    }

    return NA;
  }

  private executeReturnStatement(
    stmt: ReturnStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    if (stmt.value) {
      return this.executeExpression(stmt.value, scope, context);
    }
    return NA;
  }

  private executeExpression(
    expr: ExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    switch (expr.kind) {
      case 'NumberLiteral':
        return this.executeNumberLiteral(expr);
      case 'StringLiteral':
        return this.executeStringLiteral(expr);
      case 'BooleanLiteral':
        return this.executeBooleanLiteral(expr);
      case 'ColorLiteral':
        return this.executeColorLiteral(expr);
      case 'NaLiteral':
        return this.executeNaLiteral(expr);
      case 'Identifier':
        return this.executeIdentifier(expr, scope, context);
      case 'BinaryExpression':
        return this.executeBinaryExpression(expr, scope, context);
      case 'UnaryExpression':
        return this.executeUnaryExpression(expr, scope, context);
      case 'TernaryExpression':
        return this.executeTernaryExpression(expr, scope, context);
      case 'CallExpression':
        return this.executeCallExpression(expr, scope, context);
      case 'MemberExpression':
        return this.executeMemberExpression(expr, scope, context);
      case 'IndexExpression':
        return this.executeIndexExpression(expr, scope, context);
      case 'ArrayExpression':
        return this.executeArrayExpression(expr, scope, context);
      case 'MapExpression':
        return this.executeMapExpression(expr, scope, context);
      case 'FunctionExpression':
        return this.executeFunctionExpression(expr, scope, context);
      case 'ParenthesizedExpression':
        return this.executeParenthesizedExpression(expr, scope, context);
      case 'SwitchExpression':
        return this.executeSwitchExpression(expr, scope, context);
      default:
        throw new Error(`Unsupported expression kind: ${(expr as ExpressionNode).kind}`);
    }
  }

  private executeNumberLiteral(expr: NumberLiteralNode): PineValue {
    return expr.value;
  }

  private executeStringLiteral(expr: StringLiteralNode): PineValue {
    return expr.value;
  }

  private executeBooleanLiteral(expr: BooleanLiteralNode): PineValue {
    return expr.value;
  }

  private executeColorLiteral(expr: ColorLiteralNode): PineValue {
    return expr.value;
  }

  private executeNaLiteral(_expr: NaLiteralNode): PineValue {
    return NA;
  }

  private executeIdentifier(
    expr: IdentifierNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    if (expr.name === 'close') {
      return context.close.getRelative(0);
    }
    if (expr.name === 'open') {
      return context.open.getRelative(0);
    }
    if (expr.name === 'high') {
      return context.high.getRelative(0);
    }
    if (expr.name === 'low') {
      return context.low.getRelative(0);
    }
    if (expr.name === 'volume') {
      return context.volume.getRelative(0);
    }
    if (expr.name === 'bar_index') {
      return context.barIndex;
    }
    if (expr.name === 'last_bar_index') {
      return context.barCount - 1;
    }
    if (expr.name === 'bar_count') {
      return context.barCount;
    }
    if (expr.name === 'time') {
      return context.timestamp;
    }
    if (expr.name === 'hl2') {
      const high = context.high.getRelative(0);
      const low = context.low.getRelative(0);
      return (high + low) / 2;
    }
    if (expr.name === 'hlc3') {
      const high = context.high.getRelative(0);
      const low = context.low.getRelative(0);
      const close = context.close.getRelative(0);
      return (high + low + close) / 3;
    }
    if (expr.name === 'ohlc4') {
      const open = context.open.getRelative(0);
      const high = context.high.getRelative(0);
      const low = context.low.getRelative(0);
      const close = context.close.getRelative(0);
      return (open + high + low + close) / 4;
    }
    if (expr.name === 'na') {
      return NA;
    }

    // Check if variable exists in scope first
    const binding = resolveVariable(scope, expr.name);
    if (binding) {
      return getVariableValue(scope, expr.name, 0);
    }

    // Built-in position object (only available in strategies)
    if (expr.name === 'position') {
      return {
        size: 0,
        avg_price: 0,
      };
    }

    throw new Error(`Variable '${expr.name}' is not defined`);
  }

  private executeBinaryExpression(
    expr: BinaryExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const left = this.executeExpression(expr.left, scope, context);
    const right = this.executeExpression(expr.right, scope, context);

    // In Pine Script, and/or treat na as false (not propagating na).
    // These must be evaluated BEFORE the na-propagation check.
    if (expr.operator === 'and') {
      return pineTruthy(left) && pineTruthy(right);
    }
    if (expr.operator === 'or') {
      return pineTruthy(left) || pineTruthy(right);
    }

    if (isNa(left) || isNa(right)) {
      return NA;
    }

    switch (expr.operator) {
      case '+':
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left) + String(right);
        }
        return (left as number) + (right as number);
      case '-':
        return (left as number) - (right as number);
      case '*':
        return (left as number) * (right as number);
      case '/':
        if ((right as number) === 0) return NA;
        return (left as number) / (right as number);
      case '%':
        if ((right as number) === 0) return NA;
        return (left as number) % (right as number);
      case '**':
        return Math.pow(left as number, right as number);
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '<':
        return (left as number) < (right as number);
      case '>':
        return (left as number) > (right as number);
      case '<=':
        return (left as number) <= (right as number);
      case '>=':
        return (left as number) >= (right as number);
      default:
        throw new Error(`Unsupported binary operator: ${expr.operator}`);
    }
  }

  private executeUnaryExpression(
    expr: UnaryExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const operand = this.executeExpression(expr.operand, scope, context);

    if (isNa(operand)) {
      return NA;
    }

    switch (expr.operator) {
      case '-':
        return -(operand as number);
      case '+':
        return +(operand as number);
      case 'not':
        return !pineTruthy(operand);
      default:
        throw new Error(`Unsupported unary operator: ${expr.operator}`);
    }
  }

  private executeTernaryExpression(
    expr: TernaryExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const condition = this.executeExpression(expr.condition, scope, context);

    if (pineTruthy(condition)) {
      return this.executeExpression(expr.consequent, scope, context);
    }
    return this.executeExpression(expr.alternate, scope, context);
  }

  private executeCallExpression(
    expr: CallExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    if (expr.callee.kind === 'Identifier') {
      const funcName = expr.callee.name;
      const args = expr.arguments.map((arg) => this.executeExpression(arg, scope, context));
      const namedArgs: Record<string, PineValue> = {};
      for (const na of expr.namedArguments) {
        namedArgs[na.name] = this.executeExpression(na.value, scope, context);
      }

      if (funcName === 'plot' && !namedArgs.title) {
        const hasPositionalTitle =
          expr.arguments.length > 1 && expr.arguments[1]!.kind === 'StringLiteral';
        if (!hasPositionalTitle && expr.arguments.length > 0) {
          const firstArg = expr.arguments[0];
          if (firstArg.kind === 'Identifier') {
            namedArgs.title = firstArg.name;
          }
        }
      }

      if (this.builtins.has(funcName)) {
        const builtin = this.builtins.get(funcName);
        if (builtin) {
          // Set call site ID for TA functions that need stable keys across bars
          this.currentCallSiteId = expr.callId;
          // Only pass namedArgs when there are actual named arguments,
          // otherwise an empty {} object gets passed as a positional arg to builtins like nz()
          const builtinArgs = Object.keys(namedArgs).length > 0 ? [...args, namedArgs] : args;
          return builtin(...builtinArgs);
        }
      }

      const func = this.functions.get(funcName);
      if (func) {
        return this.executeFunctionCall(func, args, scope, context, `${funcName}@${expr.callId}`);
      }
    }

    if (expr.callee.kind === 'NaLiteral') {
      const args = expr.arguments.map((arg) => this.executeExpression(arg, scope, context));
      const namedArgs: Record<string, PineValue> = {};
      for (const na of expr.namedArguments) {
        namedArgs[na.name] = this.executeExpression(na.value, scope, context);
      }
      const builtin = this.builtins.get('na');
      if (builtin) {
        this.currentCallSiteId = expr.callId;
        const builtinArgs = Object.keys(namedArgs).length > 0 ? [...args, namedArgs] : args;
        return builtin(...builtinArgs);
      }
      return isNa(args[0] ?? NA);
    }

    if (expr.callee.kind === 'MemberExpression') {
      const objName = expr.callee.object.kind === 'Identifier' ? expr.callee.object.name : '';
      const methodName = expr.callee.property;
      const fullName = `${objName}.${methodName}`;
      const args = expr.arguments.map((arg) => this.executeExpression(arg, scope, context));
      const namedArgs: Record<string, PineValue> = {};
      for (const na of expr.namedArguments) {
        namedArgs[na.name] = this.executeExpression(na.value, scope, context);
      }

      const builtin = this.builtins.get(fullName);
      if (builtin) {
        this.currentCallSiteId = expr.callId;
        const builtinArgs = Object.keys(namedArgs).length > 0 ? [...args, namedArgs] : args;
        return builtin(...builtinArgs);
      }

      // Type constructor: TypeName.new(...)
      if (methodName === 'new' && this.userTypeFields.has(objName)) {
        const fields = this.userTypeFields.get(objName)!;
        const obj: Record<string, PineValue> = {};
        for (let i = 0; i < fields.length && i < args.length; i++) {
          obj[fields[i]!] = args[i]!;
        }
        return obj as unknown as PineValue;
      }

      // Generic array methods (lin.size(), lin.first(), lin.shift(), lin.unshift(), etc.)
      const obj = this.executeExpression(expr.callee.object, scope, context);
      if (Array.isArray(obj)) {
        switch (methodName) {
          case 'size':
            return obj.length;
          case 'first':
            return obj.length > 0 ? obj[0] : NA;
          case 'last':
            return obj.length > 0 ? obj[obj.length - 1] : NA;
          case 'shift':
            return obj.shift() ?? NA;
          case 'pop':
            return obj.pop() ?? NA;
          case 'push':
            obj.push(args[0] ?? NA);
            return obj.length;
          case 'unshift':
            obj.unshift(args[0] ?? NA);
            return obj.length;
          case 'insert': {
            const idx = (args[0] as number) ?? 0;
            obj.splice(idx, 0, args[1] ?? NA);
            return obj.length;
          }
          case 'remove': {
            const ri = (args[0] as number) ?? 0;
            return obj.splice(ri, 1)[0] ?? NA;
          }
          case 'contains':
            return obj.includes(args[0] ?? NA);
          case 'fill': {
            const fv = args[0] ?? NA;
            for (let fi = 0; fi < obj.length; fi++) obj[fi] = fv;
            return obj;
          }
          case 'set': {
            const si = (args[0] as number) ?? 0;
            obj[si] = args[1] ?? NA;
            return obj;
          }
          case 'get': {
            const gi = (args[0] as number) ?? 0;
            return obj[gi] ?? NA;
          }
          case 'sort':
            return obj.sort((a: PineValue, b: PineValue) => (a as number) - (b as number));
          case 'copy':
            return [...obj];
          default:
            return NA;
        }
      }

      // User-defined method call: receiver.method(args) -> method(receiver, args)
      // Check before line/label dispatch so user methods on numbers (e.g. close.two_pole_filter) work
      const methodFunc = this.functions.get(methodName);
      if (methodFunc) {
        return this.executeFunctionCall(
          methodFunc,
          [obj, ...args],
          scope,
          context,
          `${methodName}@${expr.callId}`,
        );
      }

      // Line/label methods on returned IDs (lin.shift().delete(), line.get_x2(id), etc.)
      if (typeof obj === 'number') {
        switch (methodName) {
          case 'delete':
            this.lines.delete(obj);
            return true;
          case 'get_x1': {
            const ln = this.lines.get(obj);
            return ln ? ln.x1 : NA;
          }
          case 'get_y1': {
            const ln = this.lines.get(obj);
            return ln ? ln.y1 : NA;
          }
          case 'get_x2': {
            const ln = this.lines.get(obj);
            return ln ? ln.x2 : NA;
          }
          case 'get_y2': {
            const ln = this.lines.get(obj);
            return ln ? ln.y2 : NA;
          }
          case 'get_color': {
            const ln = this.lines.get(obj);
            return ln ? ln.color : NA;
          }
          case 'get_style': {
            const ln = this.lines.get(obj);
            return ln ? ln.style : NA;
          }
          case 'get_width': {
            const ln = this.lines.get(obj);
            return ln ? ln.width : NA;
          }
          case 'set_color': {
            const ln = this.lines.get(obj);
            if (ln) ln.color = String(args[0] ?? '#2196f3');
            return true;
          }
          case 'set_style': {
            const ln = this.lines.get(obj);
            if (ln) ln.style = String(args[0] ?? 'solid');
            return true;
          }
          case 'set_width': {
            const ln = this.lines.get(obj);
            if (ln) ln.width = (args[0] as number) ?? 1;
            return true;
          }
          default:
            break;
        }
      }

      // Box methods on returned IDs
      if (typeof obj === 'number') {
        const bx = this.boxes.get(obj);
        if (bx) {
          switch (methodName) {
            case 'set_left':
              bx.left = (args[0] as number) ?? bx.left;
              return true;
            case 'set_top':
              bx.top = (args[0] as number) ?? bx.top;
              return true;
            case 'set_right':
              bx.right = (args[0] as number) ?? bx.right;
              return true;
            case 'set_bottom':
              bx.bottom = (args[0] as number) ?? bx.bottom;
              return true;
            case 'set_border_color':
              bx.border_color = String(args[0] ?? '#00000000');
              return true;
            case 'set_bgcolor':
              bx.bgcolor = String(args[0] ?? '#2196f380');
              return true;
            case 'get_left':
              return bx.left;
            case 'get_top':
              return bx.top;
            case 'get_right':
              return bx.right;
            case 'get_bottom':
              return bx.bottom;
            case 'delete':
              this.boxes.delete(obj);
              return true;
            default:
              return NA;
          }
        }
      }
    }

    const args = expr.arguments.map((arg) => this.executeExpression(arg, scope, context));
    return args.length > 0 ? args[args.length - 1] : NA;
  }

  private executeFunctionCall(
    func: FunctionExpressionNode,
    args: PineValue[],
    scope: RuntimeScope,
    context: ExecutionContext,
    scopeKey?: string,
  ): PineValue {
    // Reuse persistent function scope across bars so var variables inside
    // methods (e.g., var float f1 = na) retain their values between bars.
    // Use scopeKey (typically the call site's source position) so that
    // multiple calls to the same function get independent scopes.
    const key = scopeKey ?? func.name ?? `anon_${func.span.start.offset}`;
    let funcScope: RuntimeScope;
    if (this.functionPersistentScopes.has(key)) {
      funcScope = this.functionPersistentScopes.get(key)!;
      pushBarValues(funcScope);
    } else {
      funcScope = createRuntimeScope(scope);
      this.functionPersistentScopes.set(key, funcScope);
    }

    for (let i = 0; i < func.parameters.length; i++) {
      const param = func.parameters[i]!;
      let value: PineValue;
      if (i < args.length) {
        value = args[i]!;
      } else if (param.defaultValue) {
        value = this.executeExpression(param.defaultValue, scope, context);
      } else {
        value = NA;
      }
      if (!resolveVariable(funcScope, param.name)) {
        declareVariable(funcScope, param.name, FLOAT_TYPE);
      }
      setVariableValue(funcScope, param.name, value);
    }

    let result: PineValue = NA;
    for (const stmt of func.body) {
      result = this.executeStatement(stmt, funcScope, context);
    }

    return result;
  }

  private executeMemberExpression(
    expr: MemberExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    if (expr.object.kind === 'Identifier') {
      const objName = expr.object.name;

      if (objName === 'color') {
        const colorMap: Record<string, string> = {
          blue: '#2196F3',
          red: '#F44336',
          green: '#4CAF50',
          orange: '#FF9800',
          purple: '#9C27B0',
          yellow: '#FFEB3B',
          cyan: '#00BCD4',
          black: '#000000',
          white: '#FFFFFF',
          gray: '#9E9E9E',
          lime: '#8BC34A',
          teal: '#009688',
          maroon: '#800000',
          navy: '#000080',
          olive: '#808000',
          aqua: '#00FFFF',
          fuchsia: '#FF00FF',
          silver: '#C0C0C0',
        };
        return colorMap[expr.property] || '#' + expr.property;
      }
      if (objName === 'shape') {
        return expr.property;
      }
      if (objName === 'location') {
        return expr.property;
      }
      if (objName === 'size') {
        return expr.property;
      }
      if (objName === 'math') {
        const mathConstants: Record<string, number> = {
          pi: Math.PI,
          e: Math.E,
          phi: (1 + Math.sqrt(5)) / 2,
        };
        if (expr.property in mathConstants) {
          return mathConstants[expr.property]!;
        }
        return NA;
      }
      if (
        objName === 'text' ||
        objName === 'linewidth' ||
        objName === 'linecap' ||
        objName === 'linejoin' ||
        objName === 'textalign'
      ) {
        return expr.property;
      }
      if (objName === 'syminfo') {
        const syminfoProps: Record<string, PineValue> = {
          tickerid: 'SYMBOL',
          mintick: 0.01,
          pointvalue: 1,
          pricescale: 100,
          currency: 'USD',
        };
        return syminfoProps[expr.property] ?? expr.property;
      }
      if (objName === 'strategy') {
        const strategyConstants: Record<string, PineValue> = {
          long: 'long',
          short: 'short',
          percent_of_equity: 'percent_of_equity',
          fixed: 'fixed',
          currency: 'currency',
        };
        if (expr.property === 'commission') {
          return '__strategy.commission__';
        }
        if (expr.property in strategyConstants) {
          return strategyConstants[expr.property]!;
        }
        if (expr.property === 'position_size' && this.strategyEngine) {
          return this.strategyEngine.getPosition().quantity;
        }
        if (expr.property === 'position_avg_price' && this.strategyEngine) {
          return this.strategyEngine.getPosition().avgPrice;
        }
      }
      if (objName === '__strategy.commission__') {
        return expr.property;
      }
      if (objName === 'plot') {
        return expr.property;
      }
      if (objName === 'line' || objName === 'label') {
        return expr.property;
      }
      if (objName === 'barstate') {
        const barstateProps: Record<string, PineValue> = {
          isfirst: context.barIndex === 0,
          islast: context.barIndex === context.barCount - 1,
          isnew: true,
          isconfirmed: !this.isFormingCandle,
          ishistory: true,
        };
        return barstateProps[expr.property] ?? NA;
      }
      if (objName === 'barmerge') {
        return expr.property;
      }
      if (objName === 'xloc') {
        return expr.property;
      }
      if (objName === 'display') {
        return expr.property;
      }
      if (objName === 'alert') {
        return expr.property;
      }
      if (objName === 'math') {
        const mathProps: Record<string, PineValue> = {
          pi: Math.PI,
          e: Math.E,
          phi: 1.618033988749895,
        };
        return mathProps[expr.property] ?? NA;
      }

      const binding = resolveVariable(scope, objName);
      if (binding && expr.property === 'length') {
        return binding.series.length;
      }
    }

    const obj = this.executeExpression(expr.object, scope, context);

    if (isNa(obj)) {
      return NA;
    }

    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      const val = (obj as unknown as Record<string, PineValue>)[expr.property];
      return val !== undefined ? val : NA;
    }

    return NA;
  }

  private executeIndexExpression(
    expr: IndexExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const obj = this.executeExpression(expr.object, scope, context);
    const index = this.executeExpression(expr.index, scope, context);

    if (isNa(obj) || isNa(index)) {
      return NA;
    }

    if (expr.object.kind === 'Identifier') {
      const objName = expr.object.name;

      if (
        objName === 'close' ||
        objName === 'open' ||
        objName === 'high' ||
        objName === 'low' ||
        objName === 'volume'
      ) {
        const series = this.getOHLCSeries(objName, context);
        return series.getRelative(index as number);
      }

      if (objName === 'time') {
        const idx = this.barTimestamps.length - 1 - (index as number);
        if (idx >= 0 && idx < this.barTimestamps.length) {
          return this.barTimestamps[idx]!;
        }
        return NA;
      }
      if (objName === 'bar_index') {
        return (context.barIndex as number) - (index as number);
      }

      const binding = resolveVariable(scope, objName);
      if (binding) {
        return binding.series.getRelative(index as number);
      }
    }

    // Handle indexing on TA function calls like ta.atr(14)[1]
    if (expr.object.kind === 'CallExpression' && expr.object.callee.kind === 'MemberExpression') {
      const member = expr.object.callee;
      if (
        member.object.kind === 'Identifier' &&
        member.object.name === 'ta' &&
        member.property === 'atr'
      ) {
        const args = expr.object.arguments.map((arg) =>
          this.executeExpression(arg, scope, context),
        );
        const len = Math.trunc(typeof args[0] === 'number' ? args[0] : 14);
        if (len > 0) {
          const key = `atr_${len}_${this.currentCallSiteId}`;
          const state = this.atrState.get(key);
          if (state && state.values && state.values.length > (index as number)) {
            const idx = state.values.length - 1 - (index as number);
            if (idx >= 0) return state.values[idx]!;
          }
        }
        return NA;
      }
    }

    if (Array.isArray(obj)) {
      const arr = obj as PineValue[];
      const idx = index as number;
      if (idx < 0 || idx >= arr.length) {
        return NA;
      }
      return arr[idx];
    }

    return NA;
  }

  private getOHLCSeries(name: string, context: ExecutionContext): Series {
    switch (name) {
      case 'close':
        return context.close;
      case 'open':
        return context.open;
      case 'high':
        return context.high;
      case 'low':
        return context.low;
      case 'volume':
        return context.volume;
      default:
        throw new Error(`Unknown OHLCSeries: ${name}`);
    }
  }

  private executeArrayExpression(
    expr: ArrayExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return expr.elements.map((elem) => this.executeExpression(elem, scope, context));
  }

  private executeMapExpression(
    expr: MapExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const map = new Map<string, PineValue>();
    for (const entry of expr.entries) {
      const key = this.executeExpression(entry.key, scope, context);
      const value = this.executeExpression(entry.value, scope, context);
      if (typeof key === 'string') {
        map.set(key, value);
      }
    }
    return map;
  }

  private executeFunctionExpression(
    expr: FunctionExpressionNode,
    _scope: RuntimeScope,
    _context: ExecutionContext,
  ): PineValue {
    if (expr.name) {
      this.functions.set(expr.name, expr);
    }
    return NA;
  }

  private executeParenthesizedExpression(
    expr: ParenthesizedExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return this.executeExpression(expr.expression, scope, context);
  }
}
