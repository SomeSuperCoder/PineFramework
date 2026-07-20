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
import { NA, isNa, pineTruthy, type PineValue } from '../types/na.js';
import { FLOAT_TYPE, INT_TYPE } from '../types/pine-types.js';
import {
  type RuntimeScope,
  createRuntimeScope,
  declareVariable,
  resolveVariable,
  setVariableValue,
  getVariableValue,
  pushBarValues,
} from './scope.js';
import { type Series } from './series.js';
import type {
  ExecutionContext,
  ExecutionResult,
  StrategyMarkerEntry,
} from './execution-types.js';
import type { ExecutionEngine } from './execution-engine.js';

export class Interpreter {
  private eng: any;

  constructor(engine: ExecutionEngine) {
    this.eng = engine as any;
  }

  executeBar(context: ExecutionContext): ExecutionResult {
    const startTime = performance.now();
    this.eng.currentTimestamp = context.timestamp;
    this.eng.currentContext = context;
    this.eng.barTimestamps.push(context.timestamp);

    try {
      this.eng.createSnapshot();
      pushBarValues(this.eng.globalScope);

      if (this.eng.strategyEngine) {
        const openVal = context.open.getRelative(0);
        const highVal = context.high.getRelative(0);
        const lowVal = context.low.getRelative(0);
        const closeVal = context.close.getRelative(0);
        const volVal = context.volume.getRelative(0);
        this.eng.strategyEngine.updateBar(
          context.barIndex,
          context.timestamp,
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
        return {
          ...lastResult,
          strategyMarkers: allMarkers,
          maxLookback: this.eng.getMaxLookback(),
        };
      }
      allMarkers.push(...lastResult.strategyMarkers);
    }

    return {
      ...lastResult,
      strategyMarkers: allMarkers,
      maxLookback: this.eng.getMaxLookback(),
    };
  }

  executeRealtimeBar(context: ExecutionContext): ExecutionResult {
    if (this.eng.snapshots.length === 0) {
      this.eng.createSnapshot();
    }
    return this.executeBar(context);
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
      // Evaluate the object to get the UDT instance
      const obj = this.executeExpression(stmt.target.object, scope, context);
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        const fieldName = stmt.target.property;
        const record = obj as unknown as Record<string, PineValue>;

        let result: PineValue = value;
        if (stmt.operator !== '=') {
          const current = record[fieldName] !== undefined ? record[fieldName] : NA;
          switch (stmt.operator) {
            case '+=':
              result =
                (typeof current === 'number' ? current : 0) +
                (typeof value === 'number' ? value : 0);
              break;
            case '-=':
              result =
                (typeof current === 'number' ? current : 0) -
                (typeof value === 'number' ? value : 0);
              break;
            case '*=':
              result =
                (typeof current === 'number' ? current : 0) *
                (typeof value === 'number' ? value : 0);
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
        // Store result back into the UDT instance field
        record[fieldName] = result;
      }
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

    // Guard against infinite loops: step <= 0 or floating-point accumulation issues
    const safeStep = step <= 0 ? 1 : step;
    const maxIterations = 1000000;

    const loopScope = createRuntimeScope(scope);
    declareVariable(loopScope, stmt.variable, INT_TYPE);

    // Use integer counter to avoid floating-point accumulation errors
    const startInt = Math.floor(start);
    const endInt = Math.floor(end);
    const stepInt = Math.max(1, Math.floor(safeStep));
    const expectedIterations = Math.max(0, Math.floor((endInt - startInt) / stepInt) + 1);
    const iterations = Math.min(expectedIterations, maxIterations);

    for (let iter = 0, i = startInt; iter < iterations; iter++, i += stepInt) {
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
    this.eng.userTypeFields.set(
      stmt.name,
      stmt.fields.map((f) => ({
        name: f.name,
        defaultExpr: f.defaultValue ?? null,
      })),
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
      const high = context.high.getRelative(0) as number;
      const low = context.low.getRelative(0) as number;
      return (high + low) / 2;
    }
    if (expr.name === 'hlc3') {
      const high = context.high.getRelative(0) as number;
      const low = context.low.getRelative(0) as number;
      const close = context.close.getRelative(0) as number;
      return (high + low + close) / 3;
    }
    if (expr.name === 'ohlc4') {
      const open = context.open.getRelative(0) as number;
      const high = context.high.getRelative(0) as number;
      const low = context.low.getRelative(0) as number;
      const close = context.close.getRelative(0) as number;
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
      } as any;
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

      if (this.eng.builtins.has(funcName)) {
        const builtin = this.eng.builtins.get(funcName);
        if (builtin) {
          // Set call site ID for TA functions that need stable keys across bars
          this.eng.currentCallSiteId = expr.callId;
          // Only pass namedArgs when there are actual named arguments,
          // otherwise an empty {} object gets passed as a positional arg to builtins like nz()
          const builtinArgs = Object.keys(namedArgs).length > 0 ? [...args, namedArgs] : args;
          return builtin(...builtinArgs);
        }
      }

      const func = this.eng.functions.get(funcName);
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
      const builtin = this.eng.builtins.get('na');
      if (!builtin) {
        throw new Error('Builtin function "na" not registered');
      }
      this.eng.currentCallSiteId = expr.callId;
      const builtinArgs = Object.keys(namedArgs).length > 0 ? [...args, namedArgs] : args;
      return builtin(...builtinArgs);
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

      const builtin = this.eng.builtins.get(fullName);
      if (builtin) {
        this.eng.currentCallSiteId = expr.callId;
        const builtinArgs = Object.keys(namedArgs).length > 0 ? [...args, namedArgs] : args;
        return builtin(...builtinArgs);
      }

      // Type constructor: TypeName.new(...) — applies field defaults from type declaration
      if (methodName === 'new' && this.eng.userTypeFields.has(objName)) {
        const fields = this.eng.userTypeFields.get(objName)!;
        const obj: Record<string, PineValue> = {};
        for (let i = 0; i < fields.length; i++) {
          if (i < args.length) {
            obj[fields[i]!.name] = args[i]!;
          } else if (fields[i]!.defaultExpr) {
            const defaultVal = this.executeExpression(fields[i]!.defaultExpr, scope, context);
            obj[fields[i]!.name] = defaultVal;
          }
          // If no default and no arg, field is left undefined → will return NA on access
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
          case 'min': {
            let minVal: number | null = null;
            for (const item of obj) {
              if (typeof item === 'number' && !isNaN(item)) {
                if (minVal === null || item < minVal) minVal = item;
              }
            }
            return minVal !== null ? minVal : NA;
          }
          case 'max': {
            let maxVal: number | null = null;
            for (const item of obj) {
              if (typeof item === 'number' && !isNaN(item)) {
                if (maxVal === null || item > maxVal) maxVal = item;
              }
            }
            return maxVal !== null ? maxVal : NA;
          }
          case 'avg': {
            let sum = 0;
            let count = 0;
            for (const item of obj) {
              if (typeof item === 'number' && !isNaN(item)) {
                sum += item;
                count++;
              }
            }
            return count > 0 ? sum / count : NA;
          }
          case 'stdev': {
            const nums = obj.filter((v): v is number => typeof v === 'number' && !isNaN(v));
            if (nums.length < 2) return NA;
            const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
            const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (nums.length - 1);
            return Math.sqrt(variance);
          }
          case 'indexof':
            for (let idx = 0; idx < obj.length; idx++) {
              if (obj[idx] === args[0]) return idx;
            }
            return -1;
          case 'clear':
            obj.length = 0;
            return NA;
          case 'percentile_linear_interpolation': {
            const pct = (args[0] as number) ?? 50;
            const nums = obj
              .filter((v): v is number => typeof v === 'number' && !isNaN(v))
              .sort((a, b) => a - b);
            if (nums.length === 0) return NA;
            if (nums.length === 1) return nums[0];
            const rank = (pct / 100) * (nums.length - 1);
            const lower = Math.floor(rank);
            const upper = Math.ceil(rank);
            if (lower === upper) return nums[lower];
            const frac = rank - lower;
            return nums[lower] + frac * (nums[upper] - nums[lower]);
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
      const methodFunc = this.eng.functions.get(methodName);
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
            this.eng.lines.delete(obj);
            return true;
          case 'get_x1': {
            const ln = this.eng.lines.get(obj);
            return ln ? ln.x1 : NA;
          }
          case 'get_y1': {
            const ln = this.eng.lines.get(obj);
            return ln ? ln.y1 : NA;
          }
          case 'get_x2': {
            const ln = this.eng.lines.get(obj);
            return ln ? ln.x2 : NA;
          }
          case 'get_y2': {
            const ln = this.eng.lines.get(obj);
            return ln ? ln.y2 : NA;
          }
          case 'get_color': {
            const ln = this.eng.lines.get(obj);
            return ln ? ln.color : NA;
          }
          case 'get_style': {
            const ln = this.eng.lines.get(obj);
            return ln ? ln.style : NA;
          }
          case 'get_width': {
            const ln = this.eng.lines.get(obj);
            return ln ? ln.width : NA;
          }
          case 'set_color': {
            const ln = this.eng.lines.get(obj);
            if (ln) ln.color = String(args[0] ?? '#2196f3');
            return true;
          }
          case 'set_style': {
            const ln = this.eng.lines.get(obj);
            if (ln) ln.style = String(args[0] ?? 'solid');
            return true;
          }
          case 'set_width': {
            const ln = this.eng.lines.get(obj);
            if (ln) ln.width = (args[0] as number) ?? 1;
            return true;
          }
          default:
            break;
        }
      }

      // Box methods on returned IDs
      if (typeof obj === 'number') {
        const bx = this.eng.boxes.get(obj);
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
              this.eng.boxes.delete(obj);
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
    if (this.eng.functionPersistentScopes.has(key)) {
      funcScope = this.eng.functionPersistentScopes.get(key)!;
      pushBarValues(funcScope);
    } else {
      funcScope = createRuntimeScope(scope);
      this.eng.functionPersistentScopes.set(key, funcScope);
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
        if (expr.property === 'position_size' && this.eng.strategyEngine) {
          return this.eng.strategyEngine.getPosition().quantity;
        }
        if (expr.property === 'position_avg_price' && this.eng.strategyEngine) {
          return this.eng.strategyEngine.getPosition().avgPrice;
        }
      }
      if (objName === '__strategy.commission__') {
        return expr.property;
      }
      if (objName === 'line' || objName === 'label') {
        return expr.property;
      }
      if (objName === 'plot') {
        return expr.property;
      }
      if (objName === 'barstate') {
        const barstateProps: Record<string, PineValue> = {
          isfirst: context.barIndex === 0,
          islast: context.barIndex === context.barCount - 1,
          isnew: true,
          isconfirmed: !this.eng.isFormingCandle,
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
        const idx = this.eng.barTimestamps.length - 1 - (index as number);
        if (idx >= 0 && idx < this.eng.barTimestamps.length) {
          return this.eng.barTimestamps[idx]!;
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
          const key = `atr_${len}_${this.eng.currentCallSiteId}`;
          const state = this.eng.atrState.get(key);
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
      this.eng.functions.set(expr.name, expr);
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
