import type {
  ProgramNode,
  ExpressionNode,
  FunctionExpressionNode,
  StatementNode,
} from '../parser/ast/nodes.js';
import type { CompileResult, CompiledScript } from '../compiler/ir.js';
import { type PineValue } from '../types/na.js';
import {
  StrategyEngine,
  type StrategyMarker,
} from '../../strategy/strategy-engine.js';
import { parseStrategyDeclaration, getStrategyConfig } from '../script-declarations.js';
import {
  type RuntimeScope,
  createRuntimeScope,
  declareVariable,
} from './scope.js';
import { type Series } from './series.js';
import { RingBuffer } from './ring-buffer.js';
import { Interpreter } from './interpreter.js';
import { StateManager } from './state-manager.js';
import { FormingCandleProcessor } from './forming-candle.js';
import {
  registerTaBuiltins,
  registerMathBuiltins,
  registerStrBuiltins,
  registerTimeBuiltins,
  registerColorBuiltins,
  registerPlotBuiltins,
  registerOtherBuiltins,
  registerStrategyBuiltins,
} from './builtins/index.js';
import type {
  ExecutionContext,
  ExecutionResult,
  FormingCandleResult,
  ExecutionSnapshot,
  StrategyMarkerEntry,
  ExecutionMetrics,
  ShapeEntry,
  LineEntry,
  LabelEntry,
  BoxEntry,
  AlertConditionEntry,
  AlertTriggerEntry,
} from './execution-types.js';

export {
  type ExecutionContext,
  type ExecutionResult,
  type FormingCandleResult,
  type StrategyMarkerEntry,
  type ExecutionMetrics,
  type ShapeEntry,
  type LineEntry,
  type LabelEntry,
  type BoxEntry,
  type AlertConditionEntry,
  type AlertTriggerEntry,
};

export class ExecutionEngine {
  /** @internal */ compiledScript: CompiledScript;
  /** @internal */ sourceProgram: ProgramNode;
  /** @internal */ globalScope: RuntimeScope;
  /** @internal */ functions: Map<string, FunctionExpressionNode>;
  /** @internal */ functionPersistentScopes: Map<string, RuntimeScope>;
  /** @internal */ builtins: Map<string, (...args: any[]) => PineValue>;
  /** @internal */ outputs: Map<string, Series>;
  /** @internal */ shapes: ShapeEntry[];
  /** @internal */ barColorData: Array<{ time: number; color: string }> = [];
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

  // Delegated components
  /** @internal */ interpreter: Interpreter;
  /** @internal */ stateManager: StateManager;
  /** @internal */ formingCandleProcessor: FormingCandleProcessor;

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

  /** @internal */ smaBuffers: Map<string, RingBuffer> = new Map();
  /** @internal */ emaState: Map<
    string,
    { prev: number; count: number; sum: number; initialized: boolean }
  > = new Map();
  /** @internal */ hmaBuffers: Map<string, { half: number[]; full: number[]; diff: number[] }> = new Map();
  /** @internal */ sarState: Map<
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
  /** @internal */ fills: Array<{ from: string; to: string; color: string }> = [];
  /** @internal */ lines: Map<number, LineEntry> = new Map();
  /** @internal */ lineIdCounter: number = 0;
  /** @internal */ labels: LabelEntry[] = [];
  /** @internal */ boxes: Map<number, BoxEntry> = new Map();
  /** @internal */ boxIdCounter: number = 0;
  /** @internal */ userTypeFields: Map<
    string,
    { name: string; defaultExpr: import('../parser/ast/nodes.js').ExpressionNode | null }[]
  > = new Map();
  /** @internal */ plotColors: Map<string, (string | null)[]> = new Map();
  /** @internal */ fillColorData: Map<string, (string | null)[]> = new Map();
  /** @internal */ inputs: Map<string, { type: string; default: PineValue }> = new Map();
  /** @internal */ crossPrevValues: Map<string, { src: number; cmp: number }> = new Map();
  /** @internal */ changePrevValues: Map<string, number> = new Map();
  /** @internal */ atrState: Map<string, { prev: number; count: number; values: PineValue[] }> = new Map();
  /** @internal */ highestBuffers: Map<string, number[]> = new Map();
  /** @internal */ lowestBuffers: Map<string, number[]> = new Map();
  /** @internal */ currentCallSiteId = 0;
  /** @internal */ rsiState: Map<
    string,
    { prevAvgGain: number; prevAvgLoss: number; count: number; prevSource: number }
  > = new Map();
  /** @internal */ strategyEngine: StrategyEngine | null = null;

  // ========================================================================
  // PUBLIC API
  // ========================================================================

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
    for (const key of this.atrState.keys()) {
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
        if (len > max) max = len;
      }
    }
    for (const key of this.sarState.keys()) {
      const parts = key.split('_');
      if (parts.length >= 2) {
        const len = parseInt(parts[1], 10);
        if (len > max) max = len;
      }
    }
    return max;
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

  /** @internal */
  updateMetrics(success: boolean, executionTimeMs: number): void {
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
    registerColorBuiltins(this);
    registerPlotBuiltins(this);
    registerOtherBuiltins(this);
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
        return (expr as any).value;
      case 'StringLiteral':
        return (expr as any).value;
      case 'BooleanLiteral':
        return (expr as any).value;
      case 'Identifier':
        return (expr as any).name;
      case 'MemberExpression': {
        const obj = this.evaluateArgValue((expr as any).object);
        if (typeof obj === 'string') {
          return `${obj}.${(expr as any).property}`;
        }
        return (expr as any).property;
      }
      default:
        return undefined;
    }
  }

  private registerStrategyBuiltins(): void {
    registerStrategyBuiltins(this);
  }
}
