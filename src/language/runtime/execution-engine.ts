import { Decimal } from 'decimal.js';
import type { ProgramNode, FunctionExpressionNode, StatementNode } from '../parser/ast/nodes.js';
import type { CompileResult, CompiledScript } from '../compiler/ir.js';
import { type PineValue } from '../types/na.js';
import { StrategyEngine, type StrategyMarker } from '../../strategy/strategy-engine.js';
import { parseStrategyDeclaration, getStrategyConfig } from '../script-declarations.js';
import {
  NO_WARNING_SINK,
  type BacktestWarning,
  type WarningSink,
} from '../../warning-collector.js';
import { type RuntimeScope, createRuntimeScope, declareVariable } from './scope.js';
import { type Series } from './series.js';
import { RingBuffer } from './ring-buffer.js';
import { DecimalRingBuffer } from './decimal-ring-buffer.js';
import { Interpreter } from './interpreter.js';
import { StateManager } from './state-manager.js';
import { FormingCandleProcessor } from './forming-candle.js';
import {
  registerTaBuiltins,
  registerMathBuiltins,
  registerStrBuiltins,
  registerTimeBuiltins,
  registerTimeframeBuiltins,
  registerColorBuiltins,
  registerPlotBuiltins,
  registerStrategyBuiltins,
  registerInputBuiltins,
  registerTableBuiltins,
  registerDrawingBuiltins,
  registerAlertBuiltins,
  registerArrayBuiltins,
  registerMatrixBuiltins,
  registerUtilityBuiltins,
} from './builtins/index.js';
import type {
  ExecutionContext,
  ExecutionResult,
  FormingCandleResult,
  ExecutionSnapshot,
  CandleColorEntry,
  StrategyMarkerEntry,
  ExecutionMetrics,
  ShapeEntry,
  LineEntry,
  LabelEntry,
  BoxEntry,
  TableEntry,
  AlertConditionEntry,
  AlertTriggerEntry,
  SarStateValue,
  HLineEntry,
} from './execution-types.js';

export {
  type ExecutionContext,
  type ExecutionResult,
  type FormingCandleResult,
  type CandleColorEntry,
  type StrategyMarkerEntry,
  type ExecutionMetrics,
  type ShapeEntry,
  type LineEntry,
  type LabelEntry,
  type BoxEntry,
  type AlertConditionEntry,
  type AlertTriggerEntry,
};

/**
 * Every default getStrategyConfig applies when a strategy() declaration omits
 * the corresponding script field. Hard-coded entries (no scriptKey) have NO
 * script field at all — the engine always applies them. Used to emit
 * 'baseline-applied' diagnostics at the merge seam (initializeStrategy) so a
 * run's effective config is fully explainable.
 * SOURCE OF TRUTH: getStrategyConfig in src/language/script-declarations.ts.
 */
interface BaselineEntry {
  /** Script-declaration key (snake_case). Undefined = no script field exists. */
  scriptKey?: keyof import('../script-declarations.js').StrategyConfig;
  /** Engine StrategyConfig key the baseline feeds. */
  engineKey: keyof import('../../strategy/strategy-engine.js').StrategyConfig;
  /** Human-readable baseline value that was applied. */
  baseline: string;
}

const STRATEGY_CONFIG_BASELINES: BaselineEntry[] = [
  { scriptKey: 'initial_capital', engineKey: 'initialCapital', baseline: '10000' },
  { scriptKey: 'commission_value', engineKey: 'commission', baseline: '0' },
  { scriptKey: 'slippage', engineKey: 'slippage', baseline: '0' },
  { scriptKey: 'commission_type', engineKey: 'commissionType', baseline: "'percent'" },
  { engineKey: 'slippageType', baseline: "'ticks' (hard-coded)" },
  { scriptKey: 'default_qty_value', engineKey: 'defaultQty', baseline: '20' },
  { scriptKey: 'default_qty_type', engineKey: 'defaultQtyType', baseline: "'percent_of_equity'" },
  { scriptKey: 'pyramiding', engineKey: 'pyramiding', baseline: '0' },
  { engineKey: 'calcOnOrderFills', baseline: 'true (hard-coded)' },
  { scriptKey: 'calc_on_every_tick', engineKey: 'calcOnEveryTick', baseline: 'false' },
  { scriptKey: 'process_orders_on_close', engineKey: 'processOrdersOnClose', baseline: 'false' },
  { engineKey: 'maxBarsBack', baseline: '0 (hard-coded)' },
  { scriptKey: 'margin_long', engineKey: 'marginLong', baseline: '0' },
  { scriptKey: 'margin_short', engineKey: 'marginShort', baseline: '0' },
];

/**
 * Constructor runtime options — engine-level run state supplied by the caller
 * (backtest runner / live executor) rather than derived from the script.
 */
export interface ExecutionEngineRuntimeOptions {
  /**
   * Chart timeframe for the run, as a Pine timeframe string ("1", "5", "60",
   * "D", "W", "M"). Consumed by the `timeframe.*` builtins. Optional: when
   * absent, initializeStrategy falls back to the strategy() declaration arg
   * `timeframe`, and when neither exists every `timeframe.*` member resolves
   * to NA (non-breaking no-tf behavior).
   */
  timeframe?: string;
}

export class ExecutionEngine {
  /** @internal */ compiledScript: CompiledScript;
  /** @internal */ sourceProgram: ProgramNode;
  /** @internal */ globalScope: RuntimeScope;
  /** @internal */ functions: Map<string, FunctionExpressionNode>;
  /** @internal */ functionPersistentScopes: Map<string, RuntimeScope>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  /** @internal */ builtins: Map<string, (...args: any[]) => PineValue>;
  /** @internal */ outputs: Map<string, Series>;
  /** @internal */ shapes: ShapeEntry[];
  /** @internal */ barColorData: CandleColorEntry[] = [];
  /** @internal */ bgcolorData: Array<{ time: number; color: string }> = [];
  /** @internal */ alertConditionEntries: AlertConditionEntry[] = [];
  /** @internal */ alertTriggers: AlertTriggerEntry[] = [];
  /** @internal */ snapshots: ExecutionSnapshot[];
  /** @internal */ metrics: ExecutionMetrics;
  /** @internal */ executionTimes: number[];
  /** @internal */ maxSnapshots: number;
  /** @internal */ maxAlertEntries: number = 1000;
  /** @internal */ maxPlotColorsEntries: number = 5000;
  /** @internal */ currentTimestamp: number = 0;
  /** @internal */ currentContext: ExecutionContext | null = null;
  /** @internal */ barTimestamps: number[] = [];
  /** @internal */ ohlcHistory: {
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
  } = { open: [], high: [], low: [], close: [], volume: [] };
  /** @internal */ isFormingCandle: boolean = false;
  /**
   * Chart timeframe for the run (Pine timeframe string), consumed by the
   * `timeframe.*` builtins. Set from constructor runtime options, with a
   * fallback to the strategy() declaration arg in initializeStrategy.
   * @internal
   */
  timeframe: string | undefined;

  // Delegated components
  /** @internal */ interpreter: Interpreter;
  /** @internal */ stateManager: StateManager;
  /** @internal */ formingCandleProcessor: FormingCandleProcessor;

  constructor(
    compileResult: CompileResult,
    strategyConfigOverride?: Partial<import('../../strategy/strategy-engine.js').StrategyConfig>,
    runtimeOptions?: ExecutionEngineRuntimeOptions,
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

    // Runner-provided chart timeframe; a script-declared fallback is applied
    // inside initializeStrategy (below) when this is absent.
    this.timeframe = runtimeOptions?.timeframe;

    this.metrics = {
      totalBars: 0,
      successfulBars: 0,
      failedBars: 0,
      averageExecutionTimeMs: 0,
      lastExecutionTimeMs: 0,
    };

    // Create delegated components
    this.interpreter = new Interpreter(this);
    this.stateManager = new StateManager(this);
    this.formingCandleProcessor = new FormingCandleProcessor(this);

    this.registerBuiltins();
    this.hoistFunctions();
    this.initializeGlobals();

    if (this.sourceProgram.scriptKind === 'strategy') {
      this.initializeStrategy(strategyConfigOverride);
    }
  }

  /**
   * Walk the AST and pre-register all named function expressions so they
   * are available regardless of conditional-branch execution order.
   * Pine Script hoists all function definitions to the top of the script.
   */
  private hoistFunctions(): void {
    const walk = (stmts: StatementNode[]): void => {
      for (const stmt of stmts) {
        switch (stmt.kind) {
          case 'ExpressionStatement':
            if (stmt.expression.kind === 'FunctionExpression' && stmt.expression.name) {
              this.functions.set(stmt.expression.name, stmt.expression);
            }
            break;
          case 'IfStatement':
            walk(stmt.thenBranch);
            if (stmt.elseBranch) walk(stmt.elseBranch);
            break;
          case 'ForStatement':
            walk(stmt.body);
            break;
          case 'WhileStatement':
            walk(stmt.body);
            break;
          case 'SwitchStatement':
            for (const c of stmt.cases) walk(c.body);
            if (stmt.defaultCase) walk(stmt.defaultCase);
            break;
          case 'TypeDeclaration':
            // Methods inside type declarations may reference functions
            break;
        }
      }
    };
    walk(this.sourceProgram.body);
  }

  /** @internal */
  // M5a: ta.sma stores DecimalRingBuffer (exact Decimal accumulation), older
  // float-based builtins store RingBuffer — the map holds both. Consumers must
  // narrow by instanceof (see forming-candle.ts snapshot/restore).
  smaBuffers: Map<string, RingBuffer | DecimalRingBuffer> = new Map();
  /** @internal */ emaState: Map<
    string,
    { prev: number; count: number; sum: number; initialized: boolean }
  > = new Map();
  // M5c: hma windows hold Decimal — ta.hma accumulates its WMA weighted sums
  // exactly at DP=20 with no Number round-trip (see ta.hma in ta-overlap.ts).
  // forming-candle.ts snapshot/restore copies references only; Decimals are
  // immutable, so sharing the snapshot's objects on restore is safe.
  /** @internal */ hmaBuffers: Map<string, { half: Decimal[]; full: Decimal[]; diff: Decimal[] }> =
    new Map();
  /** @internal */ sarState: Map<string, SarStateValue> = new Map();
  /** @internal */ fills: Array<{ from: string; to: string; color: string }> = [];
  /** hline() records — constant horizontal lines, deduped by title (additive). */
  /** @internal */ hlines: HLineEntry[] = [];
  /** @internal */ lines: Map<number, LineEntry> = new Map();
  /** @internal */ lineIdCounter: number = 0;
  /** @internal */ linefills: Map<
    number,
    { line1Id: number; line2Id: number; color: string; fillgaps: boolean }
  > = new Map();
  /** @internal */ linefillIdCounter: number = 0;
  /** @internal */ labels: LabelEntry[] = [];
  /** @internal */ boxes: Map<number, BoxEntry> = new Map();
  /** @internal */ boxIdCounter: number = 0;
  /** @internal */ tables: Map<number, TableEntry> = new Map();
  /** @internal */ tableIdCounter: number = 0;
  /** @internal */ plotOverlayKeys: Set<string> = new Set();
  /** @internal */ userTypeFields: Map<
    string,
    { name: string; defaultExpr: import('../parser/ast/nodes.js').ExpressionNode | null }[]
  > = new Map();
  /** @internal */ plotColors: Map<string, (string | null)[]> = new Map();
  /** @internal */ fillColorData: Map<string, (string | null)[]> = new Map();
  /** @internal */ hiddenPlotKeys: Set<string> = new Set();
  /** @internal */ inputs: Map<string, { type: string; default: PineValue }> = new Map();
  // M6: momentum TA state holds Decimal — ta.rsi gain/loss averages accumulate
  // exactly at DP=20 and ta.crossover/crossunder/change diffs are exact Decimal
  // minus (no Number round-trip per bar; see ta-momentum.ts). forming-candle.ts
  // snapshot/restore copies map entries only; Decimals are immutable and the
  // builtins reassign state fields with fresh Decimals (never mutate in place),
  // so a snapshot's Decimals stay valid.
  /** @internal */ crossPrevValues: Map<string, { src: Decimal; cmp: Decimal }> = new Map();
  /** @internal */ changePrevValues: Map<string, Decimal> = new Map();
  // M7a: ATR state holds Decimal — ta.atr accumulates the exact seed-then-Wilder
  // RMA of the true range at DP=20 (see ta-volatility.ts). forming-candle.ts
  // snapshot/restore copies map entries only; Decimals are immutable and the
  // builtin reassigns state.prev with fresh Decimals (never mutates in place),
  // so a snapshot's Decimals stay valid.
  /** @internal */ atrState: Map<string, { prev: Decimal; count: number; values: PineValue[] }> =
    new Map();
  /** Wilder's RMA state, keyed `rma_<len>_<callSiteId>` (ta.rma). Same seed-then-smooth
   *  shape as atrState — RMA is the core of ATR, so the state layouts mirror each other. */
  /** @internal */ rmaState: Map<string, { prev: number; count: number }> = new Map();
  // M7b: Supertrend state holds Decimal — the internal ATR RMA and the previous
  // final bands accumulate/compare exactly at DP=20 (see ta-volatility.ts).
  // forming-candle.ts snapshot/restore copies map entries only; Decimals are
  // immutable and the builtin reassigns state fields with fresh Decimals (never
  // mutates in place), so a snapshot's Decimals stay valid.
  /** ta.supertrend state, keyed `st_<atrPeriod>_<callSiteId>`. Holds the internal
   *  ATR RMA plus the previous final bands so the classic band-following rule
   *  (min/max against prior band) can be evaluated per bar. */
  /** @internal */ supertrendState: Map<
    string,
    { atrCount: number; atrPrev: Decimal; prevUpper: Decimal | null; prevLower: Decimal | null; prevDirection: number }
  > = new Map();
  // M8: highest/lowest buffers hold Decimal for exact comparison (no IEEE 754 drift).
  /** @internal */ highestBuffers: Map<string, Decimal[]> = new Map();
  /** @internal */ lowestBuffers: Map<string, Decimal[]> = new Map();
  // M8: stdev buffers hold Decimal for exact population-stdev accumulation
  // (ta.stdev — same rolling-window pattern as highest/lowest, keyed by call site).
  /** @internal */ stdevBuffers: Map<string, Decimal[]> = new Map();
  /** @internal */ currentCallSiteId = 0;
  /** @internal */ rsiState: Map<
    string,
    { prevAvgGain: Decimal; prevAvgLoss: Decimal; count: number; prevSource: Decimal }
  > = new Map();
  /** @internal */ pivotLookback: number = 0;
  /** @internal */ valuewhenLookback: number = 0;
  // M8: valuewhen history stores Decimal for exact conditional source storage.
  /** @internal */ valuewhenHistory?: Map<string, Decimal[]>;
  /** @internal */ strategyEngine: StrategyEngine | null = null;
  // Per-run diagnostic sink (design D4). initializeStrategy runs inside the
  // constructor, so warnings it emits (baseline defaults, commission conflicts)
  // are buffered until the sink attaches after construction.
  /** @internal */ onWarning: WarningSink = NO_WARNING_SINK;
  /** @internal */ pendingWarnings: BacktestWarning[] = [];
  /** @internal */ cumulativeBarCount: number = 0;
  /** @internal */ runtimeMaxBarsBack: number = 0;
  /** @internal */ runtimeSeriesLookback: number = 0;

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  /** Extract an integer length from a state-map key segment (e.g. "sma_14" -> 14). */
  private parseMapLength(parts: string[]): number {
    if (parts.length < 2) return 0;
    const len = parseInt(parts[1], 10);
    return Number.isFinite(len) && len > 0 ? len : 0;
  }

  getMaxLookback(): number {
    let max = 0;
    for (const key of this.smaBuffers.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    for (const key of this.emaState.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    for (const key of this.rsiState.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    for (const key of this.atrState.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    for (const key of this.rmaState.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    for (const key of this.supertrendState.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    for (const key of this.hmaBuffers.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    for (const key of this.sarState.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    for (const key of this.highestBuffers.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    for (const key of this.lowestBuffers.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    for (const key of this.stdevBuffers.keys()) {
      max = Math.max(max, this.parseMapLength(key.split('_')));
    }
    // ta.pivothigh/ta.pivotlow need leftBars + rightBars of OHLC history
    if (this.pivotLookback > 0) {
      max = Math.max(max, this.pivotLookback);
    }
    // ta.valuewhen needs enough history to find the Nth occurrence
    if (this.valuewhenLookback > 0) {
      max = Math.max(max, this.valuewhenLookback);
    }
    // Runtime series indexing (close[1], myVar[70], etc.)
    if (this.runtimeSeriesLookback > 0) {
      max = Math.max(max, this.runtimeSeriesLookback);
    }
    return max;
  }

  /**
   * Get the effective max bars back — the maximum of:
   * 1. The declared `max_bars_back` from the script's `indicator()`/`strategy()` declaration
   * 2. The runtime-computed lookback from TA function state maps
   *
   * The runtime lookback is populated during execution, so it may be 0
   * before the first `executeBars()` call and grow after each bar.
   */
  getEffectiveMaxBarsBack(): number {
    const declared = this.compiledScript.maxBarsBack || 0;
    return Math.max(declared, this.runtimeMaxBarsBack);
  }

  /** Returns true if there is enough accumulated history for the current script. */
  isLookbackSatisfied(): boolean {
    const maxBack = this.getEffectiveMaxBarsBack();
    if (maxBack === 0) return true; // No lookback requirement
    // cumulativeBarCount is the count of bars pushed so far,
    // which equals the number of bars already accumulated in OHLC history.
    return this.cumulativeBarCount >= maxBack;
  }

  /** Delegate to interpreter */
  executeBar(context: ExecutionContext): ExecutionResult {
    return this.interpreter.executeBar(context);
  }

  /** Delegate to interpreter */
  executeBars(bars: ExecutionContext[]): ExecutionResult {
    return this.interpreter.executeBars(bars);
  }

  /** Delegate to interpreter */
  executeRealtimeBar(context: ExecutionContext): ExecutionResult {
    return this.interpreter.executeRealtimeBar(context);
  }

  /** Delegate to forming-candle processor */
  computeFormingCandle(context: ExecutionContext): FormingCandleResult {
    return this.formingCandleProcessor.computeFormingCandle(context);
  }

  /** Set forming candle mode (used by tests) */
  setFormingCandle(value: boolean): void {
    this.isFormingCandle = value;
  }

  /** Delegate to state-manager */
  createSnapshot(): void {
    this.stateManager.createSnapshot();
  }

  /** Delegate to state-manager */
  rollbackToSnapshot(index: number = -1): boolean {
    return this.stateManager.rollbackToSnapshot(index);
  }

  /** Delegate to state-manager */
  rollbackToPreviousBar(): boolean {
    return this.stateManager.rollbackToPreviousBar();
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

  /**
   * Attach a per-run diagnostic sink (design D4 — WarningCollector at the
   * composition root). Must be called AFTER construction: initializeStrategy
   * runs inside the constructor, so warnings it emits (baseline defaults,
   * commission-method conflicts) are buffered and replayed here. The sink is
   * deliberately NOT a constructor param — the engine stays constructible with
   * zero infrastructure.
   */
  setWarningSink(sink: WarningSink): void {
    this.onWarning = sink;
    if (sink === NO_WARNING_SINK) return;
    for (const w of this.pendingWarnings) sink(w);
    this.pendingWarnings.length = 0;
    // Forward the sink so strategy-level diagnostics (commission conflicts,
    // long-only suppressions) reach the same collector.
    this.strategyEngine?.setWarningSink(sink);
  }

  /** @internal Emit a typed diagnostic, buffering until a sink attaches. */
  private emitWarning(warning: BacktestWarning): void {
    if (this.onWarning !== NO_WARNING_SINK) {
      this.onWarning(warning);
      return;
    }
    this.pendingWarnings.push(warning);
  }

  /** @internal */
  updateMetrics(success: boolean, executionTimeMs: number): void {
    this.metrics.totalBars++;
    if (success) {
      this.metrics.successfulBars++;
    } else {
      this.metrics.failedBars++;
    }
    this.metrics.lastExecutionTimeMs = executionTimeMs;

    // Running average — O(1) instead of O(N) reduce.
    const windowSize = Math.min(this.executionTimes.length, 1000);
    if (windowSize === 0) {
      this.metrics.averageExecutionTimeMs = executionTimeMs;
    } else {
      this.metrics.averageExecutionTimeMs +=
        (executionTimeMs - this.metrics.averageExecutionTimeMs) / (windowSize + 1);
    }

    this.executionTimes.push(executionTimeMs);
    if (this.executionTimes.length > 1000) {
      this.executionTimes.shift();
    }
  }

  /** @internal */
  getStrategyMarkers(): StrategyMarkerEntry[] {
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

  // ========================================================================
  // BUILTIN REGISTRATION — delegates to extracted modules
  // ========================================================================

  private registerBuiltins(): void {
    registerTaBuiltins(this);
    registerMathBuiltins(this);
    registerStrBuiltins(this);
    registerTimeBuiltins(this);
    registerTimeframeBuiltins(this);
    registerColorBuiltins(this);
    registerPlotBuiltins(this);
    registerInputBuiltins(this);
    registerTableBuiltins(this);
    registerDrawingBuiltins(this);
    registerArrayBuiltins(this);
    registerMatrixBuiltins(this);
    registerAlertBuiltins(this);
    registerUtilityBuiltins(this);
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

  /** @internal */
  trimAlertArrays(): void {
    if (this.alertConditionEntries.length > this.maxAlertEntries) {
      this.alertConditionEntries = this.alertConditionEntries.slice(-this.maxAlertEntries);
    }
    if (this.alertTriggers.length > this.maxAlertEntries) {
      this.alertTriggers = this.alertTriggers.slice(-this.maxAlertEntries);
    }
  }

  /** @internal */
  trimPlotColorsArrays(): void {
    for (const [, colors] of this.plotColors) {
      if (colors.length > this.maxPlotColorsEntries) {
        colors.splice(0, colors.length - this.maxPlotColorsEntries);
      }
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

    // Timeframe fallback: constructor runtime options (runner-provided chart
    // resolution) win; a strategy-declared timeframe (strategy(timeframe="5"))
    // is the script-level fallback. Both absent → timeframe.* members return NA.
    if (this.timeframe === undefined) {
      this.timeframe = config.timeframe;
    }
    let strategyConfig = getStrategyConfig(config);
    // Baseline diagnostics (design D4): every getStrategyConfig default applied
    // to a script-undeclared setting is a hidden decision — surface each as a
    // typed warning so the effective config is fully explainable. A setting
    // pinned by the caller's override is NOT a baseline (the caller decided).
    if (strategyConfig && config.type === 'strategy') {
      for (const entry of STRATEGY_CONFIG_BASELINES) {
        const declared = entry.scriptKey !== undefined && config[entry.scriptKey] !== undefined;
        const pinned = override?.[entry.engineKey] !== undefined;
        if (!declared && !pinned) {
          this.emitWarning({
            type: 'baseline-applied',
            message: `${entry.engineKey} not declared in strategy(); baseline ${entry.baseline} applied`,
            context: { setting: entry.engineKey, baseline: entry.baseline },
          });
        }
      }
    }
    if (override && strategyConfig) {
      strategyConfig = { ...strategyConfig, ...override };
    }
    if (strategyConfig) {
      this.strategyEngine = new StrategyEngine(strategyConfig);
      // Forward the run's sink so strategy-level diagnostics (commission
      // conflicts, long-only suppressions) reach the same collector.
      this.strategyEngine.setWarningSink(this.onWarning);
    }
    this.registerStrategyBuiltins();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private evaluateArgValue(expr: any): unknown {
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
    registerStrategyBuiltins(this);
  }
}
