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
  type StrategyMarkerEntry,
} from './execution-types.js';
import type { ExecutionEngine } from './execution-engine.js';
import type { RuntimeScope } from './scope.js';
import type { PineValue } from '../types/na.js';
import { pushBarValues } from './scope.js';

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

      if (this.eng.strategyEngine) {
        const openVal = context.open.getRelative(0);
        const highVal = context.high.getRelative(0);
        const lowVal = context.low.getRelative(0);
        const closeVal = context.close.getRelative(0);
        const volVal = context.volume.getRelative(0);
        this.eng.strategyEngine.updateBar(
          context.barIndex, context.timestamp,
          typeof openVal === 'number' ? openVal : 0,
          typeof highVal === 'number' ? highVal : 0,
          typeof lowVal === 'number' ? lowVal : 0,
          typeof closeVal === 'number' ? closeVal : 0,
          typeof volVal === 'number' ? volVal : 0,
        );
      }

      for (const stmt of this.eng.sourceProgram.body) {
        this.executeStatement(stmt, this.eng.globalScope, context);
      }

      const executionTime = performance.now() - startTime;
      this.eng.updateMetrics(true, executionTime);

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
        barTimestamps: [...this.eng.barTimestamps],
        alertConditions: [...this.eng.alertConditionEntries],
        alertTriggers: [...this.eng.alertTriggers],
        barColorData: [...this.eng.barColorData],
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      this.eng.updateMetrics(false, executionTime);
      console.error(
        `[ExecutionEngine] Error at bar ${context.barIndex}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.eng.rollbackToPreviousBar();

      const activeLines = [...this.eng.lines.values()].map((l: any) => ({ ...l }));
      return {
        success: false,
        version: this.eng.sourceProgram.version,
        overlay: this.eng.compiledScript.overlay,
        error: error instanceof Error ? error.message : String(error),
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
      lines: [...this.eng.lines.values()].map((l: any) => ({ ...l })),
      labels: [...this.eng.labels],
      barTimestamps: [...this.eng.barTimestamps],
      alertConditions: this.eng.alertConditionEntries,
      alertTriggers: [...this.eng.alertTriggers],
      barColorData: [...this.eng.barColorData],
      maxLookback: this.eng.getMaxLookback(),
    };

    for (const bar of bars) {
      lastResult = this.executeBar(bar);
      if (!lastResult.success) {
        return { ...lastResult, strategyMarkers: allMarkers, maxLookback: this.eng.getMaxLookback() };
      }
      allMarkers.push(...lastResult.strategyMarkers);
    }

    return { ...lastResult, strategyMarkers: allMarkers, maxLookback: this.eng.getMaxLookback() };
  }

  executeRealtimeBar(context: ExecutionContext): ExecutionResult {
    if (this.eng.snapshots.length === 0) this.eng.createSnapshot();
    return this.executeBar(context);
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
      case 'ContinueStatement':
        return undefined as unknown as PineValue;
      default:
        throw new Error(`Unsupported statement kind: ${(stmt as StatementNode).kind}`);
    }
  }

  // ── Individual statement implementations ──────────────────────────────────

  executeVariableDeclaration(decl: VariableDeclarationNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    return executeVariableDeclaration(this.eng, decl, scope, context, this.executeExpression.bind(this));
  }

  executeAssignment(stmt: AssignmentNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    return executeAssignment(this.eng, stmt, scope, context, this.executeExpression.bind(this));
  }

  executeExpressionStatement(stmt: ExpressionStatementNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    return executeExpressionStatement(this.eng, stmt, scope, context, this.executeExpression.bind(this));
  }

  executeIfStatement(stmt: IfStatementNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    return executeIfStatement(this.eng, stmt, scope, context, this.executeExpression.bind(this), this.executeStatement.bind(this));
  }

  executeForStatement(stmt: ForStatementNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    return executeForStatement(this.eng, stmt, scope, context, this.executeExpression.bind(this), this.executeStatement.bind(this));
  }

  executeWhileStatement(stmt: WhileStatementNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    return executeWhileStatement(this.eng, stmt, scope, context, this.executeExpression.bind(this), this.executeStatement.bind(this));
  }

  executeSwitchStatement(stmt: SwitchStatementNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    return executeSwitchStatement(this.eng, stmt, scope, context, this.executeExpression.bind(this), this.executeStatement.bind(this));
  }

  executeTypeDeclaration(stmt: TypeDeclarationNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    return executeTypeDeclaration(this.eng, stmt, scope, context);
  }

  executeReturnStatement(stmt: ReturnStatementNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    return executeReturnStatement(this.eng, stmt, scope, context, this.executeExpression.bind(this));
  }

  // ==========================================================================
  // EXPRESSION DISPATCH
  // ==========================================================================

  executeExpression(expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
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

  executeTernaryExpression(expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext): PineValue {
    return executeTernaryExpression(this.eng, expr, scope, context, this.executeExpression.bind(this));
  }
}
