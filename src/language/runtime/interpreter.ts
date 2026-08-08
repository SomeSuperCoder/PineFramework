/**
 * Pine Script execution — public API.
 *
 * This file provides the Interpreter class with all statement/expression
 * dispatch methods. The actual implementation logic lives in the extracted
 * modules statement-executor.ts and expression-executor.ts (S-007).
 *
 * Each dispatch method on the class delegates to the corresponding module
 * function. Routing through instance methods allows integration/debug tests
 * that monkey-patch private methods (e.g. executeTernaryExpression for
 * variable tracing) to work — the patches replace the instance method, and
 * all internal recursion goes through the instance via dispatch callbacks.
 */

import type {
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
} from '../parser/ast/nodes.js';
import {
  type ExecutionContext,
  type ExecutionResult,
  type EngineError,
  type StrategyMarkerEntry,
} from './execution-types.js';
import type { ExecutionEngine } from './execution-engine.js';
import type { RuntimeScope } from './scope.js';
import type { PineValue } from '../types/na.js';
import { NA } from '../types/na.js';
import { pushBarValues } from './scope.js';
import { guardFinite } from './float-guards.js';

/**
 * Sanitise an OHLC value before pushing to history.
 * Returns the value if it's a finite number, or 0 with a warning otherwise.
 * This ensures NaN/Infinity/non-number values don't silently corrupt history.
 */
function sanitiseOHLC(val: PineValue, field: string, barIndex: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  console.warn(
    `[Engine] Non-finite ${field} at bar ${barIndex}: ${typeof val === 'number' ? val : typeof val} — using 0`,
  );
  const guarded = guardFinite(typeof val === 'number' ? val : NaN);
  return typeof guarded === 'number' ? guarded : 0;
}

// ── Module implementation imports ─────────────────────────────────────────────
// The actual logic for each expression/statement kind.

import {
  executeNumberLiteral,
  executeStringLiteral,
  executeBooleanLiteral,
  executeColorLiteral,
  executeNaLiteral,
  executeIdentifier,
  executeBinaryExpression,
  executeUnaryExpression,
  executeTernaryExpression,
  executeSwitchExpression,
  executeCallExpression,
  executeMemberExpression,
  executeIndexExpression,
  executeArrayExpression,
  executeMapExpression,
  executeFunctionExpression,
  executeParenthesizedExpression,
  initExpressionExecutor,
} from './expression-executor.js';

import {
  executeVariableDeclaration,
  executeAssignment,
  executeExpressionStatement,
  executeIfStatement,
  executeForStatement,
  executeWhileStatement,
  executeSwitchStatement,
  executeTypeDeclaration,
  executeReturnStatement,
  BreakSignal,
  ContinueSignal,
} from './statement-executor.js';

export class Interpreter {
  private eng: ExecutionEngine;

  constructor(engine: ExecutionEngine) {
    this.eng = engine;

    // Register statement-executor callback so expression-executor can
    // call executeStatement for function bodies without circular import.
    initExpressionExecutor(
      (stmt: StatementNode, scope: RuntimeScope, context: ExecutionContext): PineValue =>
        this.executeStatement(stmt, scope, context),
    );
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  executeBar(context: ExecutionContext): ExecutionResult {
    const startTime = performance.now();
    this.eng.currentTimestamp = context.timestamp;
    this.eng.currentContext = context;

    try {
      this.eng.createSnapshot();
      this.eng.barTimestamps.push(context.timestamp);
      pushBarValues(this.eng.globalScope);

      // Accumulate OHLC history so series indexing (close[1], open[2], etc.) works.
      // Each bar context provides only the current bar's values; the engine's ohlcHistory
      // grows one entry per bar, giving executeIndexExpression the full history it needs.
      // Non-finite or non-numeric OHLC values are warned and coerced to 0.
      {
        const bi = context.barIndex;
        const o = context.open.getRelative(0);
        const h = context.high.getRelative(0);
        const l = context.low.getRelative(0);
        const c = context.close.getRelative(0);
        const v = context.volume.getRelative(0);
        this.eng.ohlcHistory.open.push(sanitiseOHLC(o, 'open', bi));
        this.eng.ohlcHistory.high.push(sanitiseOHLC(h, 'high', bi));
        this.eng.ohlcHistory.low.push(sanitiseOHLC(l, 'low', bi));
        this.eng.ohlcHistory.close.push(sanitiseOHLC(c, 'close', bi));
        this.eng.ohlcHistory.volume.push(sanitiseOHLC(v, 'volume', bi));
      }

      if (this.eng.strategyEngine) {
        const bi = context.barIndex;
        const openVal = context.open.getRelative(0);
        const highVal = context.high.getRelative(0);
        const lowVal = context.low.getRelative(0);
        const closeVal = context.close.getRelative(0);
        const volVal = context.volume.getRelative(0);
        this.eng.strategyEngine.updateBar(
          context.barIndex,
          context.timestamp,
          sanitiseOHLC(openVal, 'open', bi),
          sanitiseOHLC(highVal, 'high', bi),
          sanitiseOHLC(lowVal, 'low', bi),
          sanitiseOHLC(closeVal, 'close', bi),
          sanitiseOHLC(volVal, 'volume', bi),
        );
      }

      for (const stmt of this.eng.sourceProgram.body) {
        this.executeStatement(stmt, this.eng.globalScope, context);
      }

      // Track cumulative bar count for lookback computation
      this.eng.cumulativeBarCount++;

      // Track runtime lookback from TA state maps
      this.eng.runtimeMaxBarsBack = Math.max(
        this.eng.runtimeMaxBarsBack,
        this.eng.getMaxLookback(),
      );

      const executionTime = performance.now() - startTime;
      this.eng.updateMetrics(true, executionTime);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeLines = [...this.eng.lines.values()].map((l: any) => ({ ...l }));
      return {
        success: true,
        version: this.eng.sourceProgram.version,
        overlay: this.eng.compiledScript.overlay,
        outputs: this.eng.outputs,
        shapes: [...this.eng.shapes],
        fills: this.eng.fills,
        strategyMarkers: this.eng.getStrategyMarkers(),
        bgcolor: this.eng.bgcolorData,
        plotColors: this.eng.plotColors,
        fillColorData: this.eng.fillColorData,
        lines: activeLines,
        labels: [...this.eng.labels],
        boxes: [...this.eng.boxes.values()],
        tables: [...this.eng.tables.values()],
        barTimestamps: [...this.eng.barTimestamps],
        alertConditions: [...this.eng.alertConditionEntries],
        alertTriggers: [...this.eng.alertTriggers],
        barColorData: [...this.eng.barColorData],
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      this.eng.updateMetrics(false, executionTime);

      // Build a structured error payload for the result.
      // console.error is supplemental (server-side logging) — the error
      // MUST be present in the returned ExecutionResult.
      const engineError: EngineError = {
        message: error instanceof Error ? error.message : String(error),
        barIndex: context.barIndex,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        span: error instanceof Error && 'span' in error ? (error as any).span : undefined,
        stack: error instanceof Error ? error.stack : undefined,
      };
      console.error(`[ExecutionEngine] ${engineError.message}`, engineError);

      this.eng.rollbackToPreviousBar();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeLines = [...this.eng.lines.values()].map((l: any) => ({ ...l }));
      return {
        success: false,
        version: this.eng.sourceProgram.version,
        overlay: this.eng.compiledScript.overlay,
        error: engineError,
        outputs: this.eng.outputs,
        shapes: [...this.eng.shapes],
        fills: this.eng.fills,
        strategyMarkers: this.eng.getStrategyMarkers(),
        bgcolor: this.eng.bgcolorData,
        plotColors: this.eng.plotColors,
        fillColorData: this.eng.fillColorData,
        lines: activeLines,
        labels: [...this.eng.labels],
        boxes: [...this.eng.boxes.values()],
        tables: [...this.eng.tables.values()],
        barTimestamps: [...this.eng.barTimestamps],
        alertConditions: [...this.eng.alertConditionEntries],
        alertTriggers: [...this.eng.alertTriggers],
        barColorData: [...this.eng.barColorData],
      };
    }
  }

  executeBars(bars: ExecutionContext[]): ExecutionResult {
    const allMarkers: StrategyMarkerEntry[] = [];
    let lastResult: ExecutionResult = {
      success: true,
      version: this.eng.sourceProgram.version,
      overlay: this.eng.compiledScript.overlay,
      outputs: this.eng.outputs,
      shapes: [...this.eng.shapes],
      fills: this.eng.fills,
      strategyMarkers: allMarkers,
      bgcolor: this.eng.bgcolorData,
      plotColors: this.eng.plotColors,
      fillColorData: this.eng.fillColorData,
      hiddenPlotKeys: [...this.eng.hiddenPlotKeys],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines: [...this.eng.lines.values()].map((l: any) => ({ ...l })),
      labels: [...this.eng.labels],
      boxes: [...this.eng.boxes.values()],
      tables: [...this.eng.tables.values()],
      barTimestamps: [...this.eng.barTimestamps],
      alertConditions: this.eng.alertConditionEntries,
      alertTriggers: [...this.eng.alertTriggers],
      barColorData: [...this.eng.barColorData],
      maxLookback: this.eng.getMaxLookback(),
    };

    for (const bar of bars) {
      lastResult = this.executeBar(bar);
      if (!lastResult.success) {
        this.sanitizeOutputs();
        return {
          ...lastResult,
          strategyMarkers: allMarkers,
          maxLookback: this.eng.getMaxLookback(),
        };
      }
      allMarkers.push(...lastResult.strategyMarkers);
      // Accumulate runtime lookback from TA functions (pivots, SMA, EMA, etc.)
      this.eng.runtimeMaxBarsBack = Math.max(
        this.eng.runtimeMaxBarsBack,
        this.eng.getMaxLookback(),
      );
    }

    // Final pass: convert any remaining NaN/Infinity across all outputs to NA
    this.sanitizeOutputs();

    // Lookback filtering: null out outputs and remove drawings from bars
    // where the script's lookback period is not satisfied.
    this.applyLookbackFilter();

    // Rebuild result from filtered engine state (executeBar copies arrays,
    // so lastResult reflects pre-filter state)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeLines = [...this.eng.lines.values()].map((l: any) => ({ ...l }));
    return {
      success: true,
      version: this.eng.sourceProgram.version,
      overlay: this.eng.compiledScript.overlay,
      outputs: this.eng.outputs,
      shapes: [...this.eng.shapes],
      fills: this.eng.fills,
      strategyMarkers: allMarkers,
      bgcolor: [...this.eng.bgcolorData],
      plotColors: this.eng.plotColors,
      fillColorData: this.eng.fillColorData,
      hiddenPlotKeys: [...this.eng.hiddenPlotKeys],
      lines: activeLines,
      labels: [...this.eng.labels],
      boxes: [...this.eng.boxes.values()],
      tables: [...this.eng.tables.values()],
      barTimestamps: [...this.eng.barTimestamps],
      alertConditions: this.eng.alertConditionEntries,
      alertTriggers: [...this.eng.alertTriggers],
      barColorData: [...this.eng.barColorData],
      maxLookback: this.eng.getMaxLookback(),
    };
  }

  /**
   * Filter outputs and drawing objects produced during warmup bars where
   * the script's lookback period was not satisfied. This fixes the "labels
   * stacking on the oldest candle" bug.
   *
   * CONSUMER-ROLE CONTRACT:
   * - This filter consumes ONLY the DECLARED `max_bars_back` from the script's
   *   indicator()/strategy() declaration. Runtime-computed lookback
   *   (getEffectiveMaxBarsBack) is deliberately NOT consulted — it can include
   *   inflated values from internal state requirements (e.g., the pivot
   *   1000-bar minimum) that don't correspond to actual visual warmup needs.
   * - The runtime lookback value serves a DIFFERENT consumer: provisioning and
   *   realtime-history gating (isLookbackSatisfied()). It must never feed this
   *   visual warmup filter.
   *
   * When max_bars_back is declared:
   * - Output plot values are nulled for warmup bars
   * - Shapes, labels, lines, bar colors, and bgcolor are removed
   *
   * When max_bars_back is NOT declared, no filtering is applied. This
   * is safe because scripts without explicit max_bars_back produce
   * outputs from bar 0 (they have no declared warmup period).
   */
  private applyLookbackFilter(): void {
    // Per the contract documented above: ONLY the DECLARED `max_bars_back`
    // drives the warmup filter. Runtime-computed lookback (getEffectiveMaxBarsBack)
    // is deliberately NOT consulted — it can include inflated values from
    // internal requirements (e.g. the pivot 1000-bar minimum) that must not
    // null out real outputs. Realtime history gating still uses the runtime
    // value via isLookbackSatisfied(); this filter is purely visual warmup.
    const effective = this.eng.compiledScript.maxBarsBack || 0;
    if (effective <= 0) return;

    const timestamps = this.eng.barTimestamps;
    if (timestamps.length === 0) return;

    const warmupCount = Math.min(effective, timestamps.length);
    if (warmupCount === 0) return;

    const warmupTimestamps = new Set(timestamps.slice(0, warmupCount));

    // Null output plot values for warmup bars
    for (const [, series] of this.eng.outputs) {
      for (let i = 0; i < warmupCount && i < series.values.length; i++) {
        series.values[i] = null;
      }
    }
    for (const [, colors] of this.eng.plotColors) {
      for (let i = 0; i < warmupCount && i < colors.length; i++) {
        colors[i] = null;
      }
    }
    for (const [, colors] of this.eng.fillColorData) {
      for (let i = 0; i < warmupCount && i < colors.length; i++) {
        colors[i] = null;
      }
    }

    // Filter shapes (the primary source of stacked labels on the oldest candle)
    this.eng.shapes = this.eng.shapes.filter((s) => !warmupTimestamps.has(s.time));
    // Filter labels
    this.eng.labels = this.eng.labels.filter((l) => !warmupTimestamps.has(l.time));
    // Filter lines (x1 is timestamp for bar_time based lines)
    for (const [id, line] of this.eng.lines) {
      if (warmupTimestamps.has(line.x1)) {
        this.eng.lines.delete(id);
      }
    }
    // Filter bar colors
    this.eng.barColorData = this.eng.barColorData.filter((c) => !warmupTimestamps.has(c.time));
    // Filter bgcolor
    this.eng.bgcolorData = this.eng.bgcolorData.filter((c) => !warmupTimestamps.has(c.time));
  }

  executeRealtimeBar(context: ExecutionContext): ExecutionResult {
    if (this.eng.snapshots.length === 0) this.eng.createSnapshot();
    return this.executeBar(context);
  }

  /**
   * Sanitize output values: convert any remaining NaN/Infinity to NA.
   * This is called once after all bars have been executed (in executeBars),
   * NOT per-bar, so intermediate NaN during warmup isn't prematurely overwritten.
   */
  private sanitizeOutputs(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(v: any): any {
      if (v === null || v === undefined) return v;
      if (typeof v === 'number') {
        if (Number.isNaN(v) || !Number.isFinite(v)) return NA;
        return v;
      }
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          const w = walk(v[i]);
          if (w !== v[i]) v[i] = w;
        }
        return v;
      }
      return v;
    }
    const outputs = this.eng.outputs;
    for (const key of outputs.keys()) {
      const val = outputs.get(key);
      if (val !== null && val !== undefined) {
        outputs.set(key, walk(val));
      }
    }
  }

  // ==========================================================================
  // STATEMENT DISPATCH
  // ==========================================================================

  executeStatement(stmt: StatementNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    switch (stmt.kind) {
      case 'VariableDeclaration':
        return this.executeVariableDeclaration(stmt as VariableDeclarationNode, scope, context);
      case 'Assignment':
        return this.executeAssignment(stmt as AssignmentNode, scope, context);
      case 'ExpressionStatement':
        return this.executeExpressionStatement(stmt as ExpressionStatementNode, scope, context);
      case 'IfStatement':
        return this.executeIfStatement(stmt as IfStatementNode, scope, context);
      case 'ForStatement':
        return this.executeForStatement(stmt as ForStatementNode, scope, context);
      case 'WhileStatement':
        return this.executeWhileStatement(stmt as WhileStatementNode, scope, context);
      case 'SwitchStatement':
        return this.executeSwitchStatement(stmt as SwitchStatementNode, scope, context);
      case 'TypeDeclaration':
        return this.executeTypeDeclaration(stmt as TypeDeclarationNode, scope, context);
      case 'ReturnStatement':
        return this.executeReturnStatement(stmt as ReturnStatementNode, scope, context);
      case 'BreakStatement':
        throw new BreakSignal();
      case 'ContinueStatement':
        throw new ContinueSignal();
      default:
        throw new Error(`Unsupported statement kind: ${(stmt as StatementNode).kind}`);
    }
  }

  // ── Individual statement implementations ──────────────────────────────────

  executeVariableDeclaration(
    decl: VariableDeclarationNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return executeVariableDeclaration(
      this.eng,
      decl,
      scope,
      context,
      this.executeExpression.bind(this),
    );
  }

  executeAssignment(
    stmt: AssignmentNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return executeAssignment(this.eng, stmt, scope, context, this.executeExpression.bind(this));
  }

  executeExpressionStatement(
    stmt: ExpressionStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return executeExpressionStatement(
      this.eng,
      stmt,
      scope,
      context,
      this.executeExpression.bind(this),
    );
  }

  executeIfStatement(
    stmt: IfStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return executeIfStatement(
      this.eng,
      stmt,
      scope,
      context,
      this.executeExpression.bind(this),
      this.executeStatement.bind(this),
    );
  }

  executeForStatement(
    stmt: ForStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return executeForStatement(
      this.eng,
      stmt,
      scope,
      context,
      this.executeExpression.bind(this),
      this.executeStatement.bind(this),
    );
  }

  executeWhileStatement(
    stmt: WhileStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return executeWhileStatement(
      this.eng,
      stmt,
      scope,
      context,
      this.executeExpression.bind(this),
      this.executeStatement.bind(this),
    );
  }

  executeSwitchStatement(
    stmt: SwitchStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return executeSwitchStatement(
      this.eng,
      stmt,
      scope,
      context,
      this.executeExpression.bind(this),
      this.executeStatement.bind(this),
    );
  }

  executeTypeDeclaration(
    stmt: TypeDeclarationNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return executeTypeDeclaration(this.eng, stmt, scope, context);
  }

  executeReturnStatement(
    stmt: ReturnStatementNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return executeReturnStatement(
      this.eng,
      stmt,
      scope,
      context,
      this.executeExpression.bind(this),
    );
  }

  // ==========================================================================
  // EXPRESSION DISPATCH
  // ==========================================================================

  executeExpression(
    expr: ExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const d = this.executeExpression.bind(this); // dispatch callback for module functions

    switch (expr.kind) {
      case 'NumberLiteral':
        return executeNumberLiteral(expr);
      case 'StringLiteral':
        return executeStringLiteral(expr);
      case 'BooleanLiteral':
        return executeBooleanLiteral(expr);
      case 'ColorLiteral':
        return executeColorLiteral(expr);
      case 'NaLiteral':
        return executeNaLiteral(expr);
      case 'Identifier':
        return executeIdentifier(this.eng, expr, scope, context);
      case 'BinaryExpression':
        return executeBinaryExpression(this.eng, expr, scope, context, d);
      case 'UnaryExpression':
        return executeUnaryExpression(this.eng, expr, scope, context, d);
      case 'TernaryExpression':
        return this.executeTernaryExpression(expr, scope, context);
      case 'CallExpression':
        return executeCallExpression(this.eng, expr, scope, context, d);
      case 'MemberExpression':
        return executeMemberExpression(this.eng, expr, scope, context, d);
      case 'IndexExpression':
        return executeIndexExpression(this.eng, expr, scope, context, d);
      case 'ArrayExpression':
        return executeArrayExpression(this.eng, expr, scope, context, d);
      case 'MapExpression':
        return executeMapExpression(this.eng, expr, scope, context, d);
      case 'FunctionExpression':
        return executeFunctionExpression(this.eng, expr, scope, context);
      case 'ParenthesizedExpression':
        return executeParenthesizedExpression(this.eng, expr, scope, context, d);
      case 'SwitchExpression':
        return executeSwitchExpression(this.eng, expr, scope, context, d);
      default:
        throw new Error(`Unsupported expression kind: ${(expr as ExpressionNode).kind}`);
    }
  }

  // ── Individual expression implementations ─────────────────────────────────
  // These are kept as instance methods so tests can monkey-patch them.
  // They delegate to the module functions.

  executeTernaryExpression(
    expr: ExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    return executeTernaryExpression(
      this.eng,
      expr,
      scope,
      context,
      this.executeExpression.bind(this),
    );
  }
}
