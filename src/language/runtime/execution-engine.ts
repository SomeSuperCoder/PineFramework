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
} from '../parser/ast/nodes.js';
import type { CompileResult, CompiledScript } from '../compiler/ir.js';
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

export interface ExecutionResult {
  success: boolean;
  error?: string;
  outputs: Map<string, Series>;
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
  barIndex: number;
}

export class ExecutionEngine {
  private compiledScript: CompiledScript;
  private sourceProgram: ProgramNode;
  private globalScope: RuntimeScope;
  private functions: Map<string, FunctionExpressionNode>;
  private builtins: Map<string, (...args: PineValue[]) => PineValue>;
  private outputs: Map<string, Series>;
  private snapshots: ExecutionSnapshot[];
  private metrics: ExecutionMetrics;
  private executionTimes: number[];
  private maxSnapshots: number;

  constructor(compileResult: CompileResult) {
    this.compiledScript = compileResult.ir;
    this.sourceProgram = compileResult.source;
    this.globalScope = createRuntimeScope();
    this.functions = new Map();
    this.builtins = new Map();
    this.outputs = new Map();
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
  }

  private registerBuiltins(): void {
    this.builtins.set('ta.sma', (source: PineValue, length: PineValue): PineValue => {
      if (isNa(source) || isNa(length)) return NA;
      const len = Math.trunc(length as number);
      if (len <= 0) return NA;
      return source as number;
    });

    this.builtins.set('ta.ema', (source: PineValue, length: PineValue): PineValue => {
      if (isNa(source) || isNa(length)) return NA;
      return source as number;
    });

    this.builtins.set('math.max', (...args: PineValue[]): PineValue => {
      const validArgs = args.filter((a) => !isNa(a)) as number[];
      return validArgs.length > 0 ? Math.max(...validArgs) : NA;
    });

    this.builtins.set('math.min', (...args: PineValue[]): PineValue => {
      const validArgs = args.filter((a) => !isNa(a)) as number[];
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
      for (let i = 0; i < args.length; i++) {
        const arg = isNa(args[i]) ? 'na' : String(args[i]);
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
        year: PineValue,
        month: PineValue,
        day: PineValue,
        hour: PineValue,
        minute: PineValue,
        second: PineValue,
      ): PineValue => {
        if (isNa(year) || isNa(month) || isNa(day)) return NA;
        const h = isNa(hour) ? 0 : (hour as number);
        const m = isNa(minute) ? 0 : (minute as number);
        const s = isNa(second) ? 0 : (second as number);
        return new Date(year as number, (month as number) - 1, day as number, h, m, s).getTime();
      },
    );

    this.builtins.set('plot', (value: PineValue, title?: PineValue): PineValue => {
      const seriesName = typeof title === 'string' ? title : 'plot';
      if (!this.outputs.has(seriesName)) {
        this.outputs.set(seriesName, createSeries(seriesName));
      }
      if (!isNa(value)) {
        this.outputs.get(seriesName)!.push(value);
      }
      return NA;
    });

    this.builtins.set('plotshape', (value: PineValue, title?: PineValue, _style?: PineValue, _location?: PineValue, _color?: PineValue, _offset?: PineValue, _text?: PineValue, _textcolor?: PineValue, _editable?: PineValue, _size?: PineValue, _display?: PineValue): PineValue => {
      const seriesName = typeof title === 'string' ? title : 'plotshape';
      if (!this.outputs.has(seriesName)) {
        this.outputs.set(seriesName, createSeries(seriesName));
      }
      const isTrue = value === true || value === 1;
      this.outputs.get(seriesName)!.push(isTrue ? 1 : 0);
      return NA;
    });
  }

  private initializeGlobals(): void {
    for (const global of this.compiledScript.globals) {
      declareVariable(this.globalScope, global.name, global.type, global.isVar, global.isVarip);
    }
  }

  createSnapshot(): void {
    const snapshot: ExecutionSnapshot = {
      scope: cloneRuntimeScope(this.globalScope),
      outputs: this.cloneOutputs(),
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

    try {
      this.createSnapshot();
      pushBarValues(this.globalScope);

      for (const stmt of this.sourceProgram.body) {
        this.executeStatement(stmt, this.globalScope, context);
      }

      const executionTime = performance.now() - startTime;
      this.updateMetrics(true, executionTime);

      return {
        success: true,
        outputs: this.outputs,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      this.updateMetrics(false, executionTime);
      this.rollbackToPreviousBar();

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        outputs: this.outputs,
      };
    }
  }

  executeBars(bars: ExecutionContext[]): ExecutionResult {
    let lastResult: ExecutionResult = { success: true, outputs: this.outputs };

    for (const bar of bars) {
      lastResult = this.executeBar(bar);
      if (!lastResult.success) {
        break;
      }
    }

    return lastResult;
  }

  executeRealtimeBar(context: ExecutionContext): ExecutionResult {
    if (this.snapshots.length === 0) {
      this.createSnapshot();
    }
    return this.executeBar(context);
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
      const binding = declareVariable(scope, decl.name, FLOAT_TYPE, decl.isVar, decl.isVarip);
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
      const binding = resolveVariable(scope, stmt.target.name);
      if (!binding) {
        throw new Error(`Variable '${stmt.target.name}' is not defined`);
      }
      binding.series.push(value);
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
    const start = this.executeExpression(stmt.start, scope, context) as number;
    const end = this.executeExpression(stmt.end, scope, context) as number;
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
          for (const s of caseNode.body) {
            this.executeStatement(s, caseScope, context);
          }
          return NA;
        }
      }
    }

    if (stmt.defaultCase) {
      const defaultScope = createRuntimeScope(scope);
      for (const s of stmt.defaultCase) {
        this.executeStatement(s, defaultScope, context);
      }
    }

    return NA;
  }

  private executeTypeDeclaration(
    _stmt: TypeDeclarationNode,
    _scope: RuntimeScope,
    _context: ExecutionContext,
  ): PineValue {
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
    if (expr.name === 'bar_count') {
      return context.barCount;
    }
    if (expr.name === 'time') {
      return context.timestamp;
    }
    if (expr.name === 'na') {
      return NA;
    }

    return getVariableValue(scope, expr.name, 0);
  }

  private executeBinaryExpression(
    expr: BinaryExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    const left = this.executeExpression(expr.left, scope, context);
    const right = this.executeExpression(expr.right, scope, context);

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
      case 'and':
        return pineTruthy(left) && pineTruthy(right);
      case 'or':
        return pineTruthy(left) || pineTruthy(right);
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

      if (this.builtins.has(funcName)) {
        const builtin = this.builtins.get(funcName);
        if (builtin) {
          return builtin(...args);
        }
      }

      const func = this.functions.get(funcName);
      if (func) {
        return this.executeFunctionCall(func, args, scope, context);
      }
    }

    if (expr.callee.kind === 'MemberExpression') {
      const objName = expr.callee.object.kind === 'Identifier' ? expr.callee.object.name : '';
      const methodName = expr.callee.property;
      const fullName = `${objName}.${methodName}`;
      const args = expr.arguments.map((arg) => this.executeExpression(arg, scope, context));

      const builtin = this.builtins.get(fullName);
      if (builtin) {
        return builtin(...args);
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
  ): PineValue {
    const funcScope = createRuntimeScope(scope);

    for (let i = 0; i < func.parameters.length; i++) {
      const param = func.parameters[i]!;
      const value = i < args.length ? args[i] : NA;
      declareVariable(funcScope, param.name, FLOAT_TYPE);
      setVariableValue(funcScope, param.name, value);
    }

    for (const stmt of func.body) {
      this.executeStatement(stmt, funcScope, context);
    }

    return NA;
  }

  private executeMemberExpression(
    expr: MemberExpressionNode,
    scope: RuntimeScope,
    context: ExecutionContext,
  ): PineValue {
    if (expr.object.kind === 'Identifier') {
      const objName = expr.object.name;

      if (objName === 'color' || objName === 'shape' || objName === 'location' || objName === 'text' || objName === 'linewidth' || objName === 'linecap' || objName === 'linejoin' || objName === 'textalign') {
        return expr.property;
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

      const binding = resolveVariable(scope, objName);
      if (binding) {
        return binding.series.getRelative(index as number);
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
