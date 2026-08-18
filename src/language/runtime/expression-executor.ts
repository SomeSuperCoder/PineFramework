/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Expression execution — extracted from interpreter.ts (S-007).
 *
 * Individual functions for each expression kind. The Interpreter class
 * provides the dispatcher that routes ExpressionKind → implementation.
 *
 * To break the circular dependency (expressions call statements inside
 * function bodies), the Interpreter registers an executeStatement callback
 * at construction time via initExpressionExecutor().
 */

import type { ExpressionNode, StatementNode } from '../parser/ast/nodes.js';
import { NA, isNa, pineTruthy, type PineValue } from '../types/na.js';
import { FLOAT_TYPE } from '../types/pine-types.js';
import { guardFinite, safeAdd, ensureFinite } from './float-guards.js';
import { numericOps, toDecimal, decimalToPineValue } from './numbers/index.js';
import type { Decimal } from 'decimal.js';
import {
  type RuntimeScope,
  createRuntimeScope,
  declareVariable,
  resolveVariable,
  setVariableValue,
  getVariableValue,
  pushBarValues,
} from './scope.js';
import type { ExecutionContext } from './execution-types.js';
import type { ExecutionEngine } from './execution-engine.js';
import { executeArrayMethod } from './array-methods.js';
import { isPineMatrix } from './builtins/matrix-builtins.js';
import { executeLineMethod, executeBoxMethod } from './drawing-methods.js';
import { executeTypeConstructor } from './type-constructors.js';

// ── Circular-dependency bridge ────────────────────────────────────────────────
// expression-executor needs executeStatement (for function bodies).
// statement-executor needs executeExpression (for conditions/init).
// The Interpreter breaks the cycle by registering executeStatement here.

export type ExecuteStatementFn = (
  stmt: StatementNode,
  scope: RuntimeScope,
  context: ExecutionContext,
) => PineValue;

let _executeStmt: ExecuteStatementFn | null = null;

export function initExpressionExecutor(executeStmt: ExecuteStatementFn): void {
  _executeStmt = executeStmt;
}

// ============================================================================
// INDIVIDUAL EXPRESSION IMPLEMENTATIONS
// ============================================================================
// Each function receives (eng, ...params). They are collected in the
// DISPATCH_TABLE below and called from the Interpreter class's dispatcher.
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function executeNumberLiteral(expr: any): PineValue {
  return expr.value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function executeStringLiteral(expr: any): PineValue {
  return expr.value;
}

export function executeBooleanLiteral(expr: any): PineValue {
  return expr.value;
}

export function executeColorLiteral(expr: any): PineValue {
  return expr.value;
}

export function executeNaLiteral(_expr: any): PineValue {
  return NA;
}

export function executeIdentifier(
  _eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
): PineValue {
  if (expr.name === 'close') return context.close.getRelative(0);
  if (expr.name === 'open') return context.open.getRelative(0);
  if (expr.name === 'high') return context.high.getRelative(0);
  if (expr.name === 'low') return context.low.getRelative(0);
  if (expr.name === 'volume') return context.volume.getRelative(0);
  if (expr.name === 'bar_index') return context.barIndex;
  if (expr.name === 'last_bar_index') return context.barCount - 1;
  if (expr.name === 'bar_count') return context.barCount;
  if (expr.name === 'time') return context.timestamp;
  if (expr.name === 'hl2') {
    const high = context.high.getRelative(0);
    const low = context.low.getRelative(0);
    if (isNa(high) || isNa(low)) return NA;
    const sum = safeAdd(high as number, low as number);
    if (isNa(sum)) return NA;
    return guardFinite((sum as number) / 2);
  }
  if (expr.name === 'hlc3') {
    const high = context.high.getRelative(0);
    const low = context.low.getRelative(0);
    const close = context.close.getRelative(0);
    if (isNa(high) || isNa(low) || isNa(close)) return NA;
    const sum = safeAdd(safeAdd(high as number, low as number) as number, close as number);
    if (isNa(sum)) return NA;
    return guardFinite((sum as number) / 3);
  }
  if (expr.name === 'ohlc4') {
    const open = context.open.getRelative(0);
    const high = context.high.getRelative(0);
    const low = context.low.getRelative(0);
    const close = context.close.getRelative(0);
    if (isNa(open) || isNa(high) || isNa(low) || isNa(close)) return NA;
    const sum = safeAdd(
      safeAdd(safeAdd(open as number, high as number) as number, low as number) as number,
      close as number,
    );
    if (isNa(sum)) return NA;
    return guardFinite((sum as number) / 4);
  }
  if (expr.name === 'na') return NA;

  const binding = resolveVariable(scope, expr.name);
  if (binding) return getVariableValue(scope, expr.name, 0);

  if (expr.name === 'position') {
    return { size: 0, avg_price: 0 } as any;
  }

  throw new Error(`Variable '${expr.name}' is not defined`);
}

// ─────────────────────────────────────────────────────────────────────────────
// FUSED DECIMAL ARITHMETIC (M3b — decimal expression fusion)
//
// WHY: chained arithmetic like `close*2 - close` must return `close` EXACTLY.
// The old engine evaluated each operator via safe*(a, b), which round-trips
// through JS number at every operator seam: Decimal(close)×2 → number, then
// number − Decimal(close) → number. The old float engine was bit-identical
// because IEEE 754 ×2 is exact and the subtraction was Sterbenz-exact; the
// per-op decimal round-trip lost that exactness (close×2 − close ≠ close at
// double precision for a 20-digit decimal-rounded intermediate).
//
// The fix: evaluate the WHOLE arithmetic subtree in Decimal space and convert
// via decimalToPineValue ONCE at the root — never per-op. Decimal(close)×2
// then −Decimal(close) is exact at DP=20 (both are exactly representable), so
// the composed expression returns close exactly. Comparisons (==, !=, <, >,
// <=, >=) deliberately stay nearest-double (trap_cmp must remain true); only
// arithmetic ops (+ - * / % ** and unary - +) take the fused path.
//
// INVARIANT: no Decimal escapes the PineValue surface. The helper below
// returns Decimal internally; evalFusedArithmetic converts to PineValue once.
// No Decimal is stored in scope, passed to calls, or written to series.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate an entire arithmetic subtree in Decimal space.
 *
 * Returns Decimal | null:
 *   - Decimal — the exact subtree result (may be Decimal NaN/±Inf for
 *     div/mod-by-zero or overflow; collapsed to Pine NA at the boundary by
 *     decimalToPineValue, R4/R5).
 *   - null    — NA / non-numeric (string, bool, …) → Pine NA, never a throw.
 *
 * ParenthesizedExpression is unwrapped FIRST (the AST emits paren nodes;
 * `(a*b)-c` must recurse into the inner node, not fall back to lossy
 * dispatch). Binary arithmetic recurses both sides then applies numericOps;
 * unary -/+ recurse the operand then negate/identity. Anything else is a
 * LEAF: dispatch it and bridge via toDecimal if it is a finite number.
 */
function evalDecimalArithmetic(
  expr: ExpressionNode,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): Decimal | null {
  if (expr.kind === 'ParenthesizedExpression') {
    return evalDecimalArithmetic(expr.expression, scope, context, dispatch);
  }

  if (expr.kind === 'BinaryExpression') {
    const left = evalDecimalArithmetic(expr.left, scope, context, dispatch);
    if (left === null) return null;
    const right = evalDecimalArithmetic(expr.right, scope, context, dispatch);
    if (right === null) return null;
    switch (expr.operator) {
      case '+':
        return numericOps.add(left, right);
      case '-':
        return numericOps.sub(left, right);
      case '*':
        return numericOps.mul(left, right);
      // R5: div/mod-by-zero → Decimal NaN inside numericOps → NA at boundary.
      case '/':
        return numericOps.div(left, right);
      case '%':
        return numericOps.mod(left, right);
      case '**':
        return numericOps.pow(left, right);
      default:
        // Non-arithmetic binary ops never reach here (caller guards
        // and/or/comparisons); defensive null → NA.
        return null;
    }
  }

  if (expr.kind === 'UnaryExpression') {
    if (expr.operator !== '-' && expr.operator !== '+') return null; // `not` is boolean, not arithmetic
    const operand = evalDecimalArithmetic(expr.operand, scope, context, dispatch);
    if (operand === null) return null;
    return expr.operator === '-' ? numericOps.neg(operand) : operand; // unary + → identity
  }

  // Leaf (identifier, literal, call, ternary, index/member, anything else):
  // dispatch once, bridge to Decimal. NA → null; number → Decimal; any other
  // type (string, bool, …) → null (non-numeric → Pine NA, never a throw).
  const v = dispatch(expr, scope, context);
  if (isNa(v)) return null;
  if (typeof v === 'number') return toDecimal(v);
  return null;
}

/**
 * Root conversion — the ONLY place a fused Decimal becomes a PineValue.
 * null (NA / non-numeric) → NA; Decimal → decimalToPineValue (finite → number,
 * NaN/±Inf → NA, -0 → +0). Called once per arithmetic expression, never per-op.
 */
function evalFusedArithmetic(
  expr: ExpressionNode,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  const d = evalDecimalArithmetic(expr, scope, context, dispatch);
  return d === null ? NA : decimalToPineValue(d);
}

export function executeBinaryExpression(
  _eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  // and/or — short-circuit on pineTruthy of dispatched values (unchanged behavior).
  if (expr.operator === 'and' || expr.operator === 'or') {
    const left = dispatch(expr.left, scope, context);
    const right = dispatch(expr.right, scope, context);
    if (expr.operator === 'and') return pineTruthy(left) && pineTruthy(right);
    return pineTruthy(left) || pineTruthy(right);
  }

  // Pure arithmetic — fused path evaluates the subtree in Decimal ONCE (no
  // eager dispatch; NA/non-numeric → null → NA internally). Removes the 2×
  // hot-path cost and the latent double-evaluation risk for any side-effecting
  // operand. F1 fix (code review).
  if (
    expr.operator === '-' ||
    expr.operator === '*' ||
    expr.operator === '/' ||
    expr.operator === '%' ||
    expr.operator === '**'
  ) {
    return evalFusedArithmetic(expr, scope, context, dispatch);
  }

  // '+' — eager dispatch REQUIRED for the string-concat check; then fused
  // (numeric/NA operands take the fused path exactly like the other arithmetic
  // ops). NA wins over string concat — old NA-switch priority restored:
  // NA + "str" → NA, never String(Symbol.for('pine.na')) garbage.
  if (expr.operator === '+') {
    const left = dispatch(expr.left, scope, context);
    const right = dispatch(expr.right, scope, context);
    // NA wins over string concat — old NA-switch priority (NA + "str" → NA,
    // never String(Symbol.for('pine.na')) garbage).
    if (isNa(left) || isNa(right)) return NA;
    if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
    return evalFusedArithmetic(expr, scope, context, dispatch);
  }

  // Comparisons — eager dispatch of both sides (nearest-double collapse
  // semantics preserved; trap_cmp depends on it).
  const left = dispatch(expr.left, scope, context);
  const right = dispatch(expr.right, scope, context);

  // PineScript NA semantics for comparisons:
  // - == with na on either side → na (unknown), unless BOTH are na → na too (indeterminate)
  // - != with na on exactly ONE side → true (one is known, the other is na → definitely not equal)
  // - != with na on BOTH sides → na (indeterminate)
  // - <, >, <=, >= with na on either side → na
  if (isNa(left) || isNa(right)) {
    switch (expr.operator) {
      case '==':
        // na == value → na, na == na → na
        return NA;
      case '!=':
        // na != na → na (indeterminate)
        if (isNa(left) && isNa(right)) return NA;
        // na != 5 → true (known different from unknown)
        return true;
      default:
        return NA;
    }
  }

  switch (expr.operator) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '<': {
      // Guard against NaN comparisons (NaN < x → false, IEEE 754)
      if (typeof left !== 'number' || typeof right !== 'number') return NA;
      if (!Number.isFinite(left) || !Number.isFinite(right)) return NA;
      return left < right;
    }
    case '>': {
      if (typeof left !== 'number' || typeof right !== 'number') return NA;
      if (!Number.isFinite(left) || !Number.isFinite(right)) return NA;
      return left > right;
    }
    case '<=': {
      if (typeof left !== 'number' || typeof right !== 'number') return NA;
      if (!Number.isFinite(left) || !Number.isFinite(right)) return NA;
      return left <= right;
    }
    case '>=': {
      if (typeof left !== 'number' || typeof right !== 'number') return NA;
      if (!Number.isFinite(left) || !Number.isFinite(right)) return NA;
      return left >= right;
    }
    default:
      throw new Error(`Unsupported binary operator: ${expr.operator}`);
  }
}

export function executeUnaryExpression(
  _eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  const operand = dispatch(expr.operand, scope, context);
  if (isNa(operand)) return NA;
  switch (expr.operator) {
    case '-':
    case '+':
      return evalFusedArithmetic(expr, scope, context, dispatch);
    case 'not':
      return !pineTruthy(operand);
    default:
      throw new Error(`Unsupported unary operator: ${expr.operator}`);
  }
}

export function executeTernaryExpression(
  _eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  const condition = dispatch(expr.condition, scope, context);
  if (pineTruthy(condition)) {
    return dispatch(expr.consequent, scope, context);
  }
  return dispatch(expr.alternate, scope, context);
}

export function executeSwitchExpression(
  _eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  const condValue = dispatch(expr.expression, scope, context);
  for (const caseNode of expr.cases) {
    if (caseNode.value) {
      const caseValue = dispatch(caseNode.value, scope, context);
      if (condValue === caseValue || (typeof condValue === 'number' && condValue === caseValue)) {
        return dispatch(caseNode.result, scope, context);
      }
    } else {
      return dispatch(caseNode.result, scope, context);
    }
  }
  return NA;
}

export function executeCallExpression(
  eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  if (expr.callee.kind === 'Identifier') {
    const funcName = expr.callee.name;
    const args = expr.arguments.map((arg: any) => dispatch(arg, scope, context));
    const namedArgs: Record<string, PineValue> = {};
    for (const na of expr.namedArguments) {
      namedArgs[na.name] = dispatch(na.value, scope, context);
    }

    if (eng.builtins.has(funcName)) {
      const builtin = eng.builtins.get(funcName);
      if (builtin) {
        eng.currentCallSiteId = expr.callId;
        const builtinArgs = Object.keys(namedArgs).length > 0 ? [...args, namedArgs] : args;
        return builtin(...builtinArgs);
      }
    }

    const func = eng.functions.get(funcName);
    if (func) {
      return executeFunctionCall(
        eng,
        func,
        args,
        expr.arguments,
        scope,
        context,
        `${funcName}@${expr.callId}`,
      );
    }
  }

  if (expr.callee.kind === 'NaLiteral') {
    const args = expr.arguments.map((arg: any) => dispatch(arg, scope, context));
    const namedArgs: Record<string, PineValue> = {};
    for (const na of expr.namedArguments) {
      namedArgs[na.name] = dispatch(na.value, scope, context);
    }
    const builtin = eng.builtins.get('na');
    if (!builtin) throw new Error('Builtin function "na" not registered');
    eng.currentCallSiteId = expr.callId;
    const builtinArgs = Object.keys(namedArgs).length > 0 ? [...args, namedArgs] : args;
    return builtin(...builtinArgs);
  }

  if (expr.callee.kind === 'MemberExpression') {
    const objName = expr.callee.object.kind === 'Identifier' ? expr.callee.object.name : '';
    const methodName = expr.callee.property;
    const fullName = `${objName}.${methodName}`;
    const args = expr.arguments.map((arg: any) => dispatch(arg, scope, context));
    const namedArgs: Record<string, PineValue> = {};
    for (const na of expr.namedArguments) {
      namedArgs[na.name] = dispatch(na.value, scope, context);
    }

    const builtin = eng.builtins.get(fullName);
    if (builtin) {
      eng.currentCallSiteId = expr.callId;
      const builtinArgs = Object.keys(namedArgs).length > 0 ? [...args, namedArgs] : args;
      return builtin(...builtinArgs);
    }

    // Type constructor: TypeName.new(...)
    if (methodName === 'new' && eng.userTypeFields.has(objName)) {
      const fields = eng.userTypeFields.get(objName)!;
      return executeTypeConstructor(fields, args, dispatch, scope, context);
    }

    // Evaluate the object — used for both table and array method dispatch
    const obj = dispatch(expr.callee.object, scope, context);

    // Table method dispatch: tb.cell(...) → table.cell(tb_id, ...)
    if (typeof obj === 'number' && eng.tables && eng.tables.has(obj)) {
      const tableMethod = eng.builtins.get(`table.${methodName}`);
      if (tableMethod) {
        eng.currentCallSiteId = expr.callId;
        const builtinArgs =
          Object.keys(namedArgs).length > 0 ? [obj, ...args, namedArgs] : [obj, ...args];
        return tableMethod(...builtinArgs);
      }
    }

    // Matrix method dispatch: mx.set(r, c, v) → matrix.set(mx, r, c, v).
    // Must precede the generic array branch: matrices are marker objects, not
    // arrays, and matrix set/get arity (row, col, value) differs from the
    // 1-D array set/get (index, value).
    if (isPineMatrix(obj)) {
      const matrixMethod = eng.builtins.get(`matrix.${methodName}`);
      if (matrixMethod) {
        eng.currentCallSiteId = expr.callId;
        const builtinArgs =
          Object.keys(namedArgs).length > 0 ? [obj, ...args, namedArgs] : [obj, ...args];
        return matrixMethod(...builtinArgs);
      }
    }

    // Generic array methods
    if (Array.isArray(obj)) {
      const result = executeArrayMethod(obj, methodName, args);
      if (result !== undefined) return result;
    }

    // User-defined method call
    const methodFunc = eng.functions.get(methodName);
    if (methodFunc) {
      const methodArgExprs = [expr.callee.object, ...expr.arguments];
      return executeFunctionCall(
        eng,
        methodFunc,
        [obj, ...args],
        methodArgExprs,
        scope,
        context,
        `${methodName}@${expr.callId}`,
      );
    }

    // Drawing object methods on returned IDs
    if (typeof obj === 'number') {
      if (methodName === 'delete') {
        // Generic delete — works on both lines and boxes
        if (eng.lines.has(obj)) {
          eng.lines.delete(obj);
          return true;
        }
        if (eng.boxes.has(obj)) {
          eng.boxes.delete(obj);
          return true;
        }
        return true;
      }
      const line = eng.lines.get(obj);
      if (line) {
        const result = executeLineMethod(line, methodName, args);
        if (result !== undefined) return result;
      }
      const bx = eng.boxes.get(obj);
      if (bx) {
        const result = executeBoxMethod(bx, methodName, args);
        if (result !== undefined) return result;
      }
    }
  }

  const args = expr.arguments.map((arg: any) => dispatch(arg, scope, context));
  return args.length > 0 ? args[args.length - 1] : NA;
}

function executeFunctionCall(
  eng: ExecutionEngine,
  func: any,
  args: PineValue[],
  argExprs: any[],
  scope: RuntimeScope,
  context: ExecutionContext,
  scopeKey?: string,
): PineValue {
  const key = scopeKey ?? func.name ?? `anon_${func.span.start.offset}`;

  let funcScope: RuntimeScope;
  if (eng.functionPersistentScopes.has(key)) {
    funcScope = eng.functionPersistentScopes.get(key)!;
    pushBarValues(funcScope);
  } else {
    funcScope = createRuntimeScope(scope);
    eng.functionPersistentScopes.set(key, funcScope);
  }

  for (let i = 0; i < func.parameters.length; i++) {
    const param = func.parameters[i]!;
    let value: PineValue;
    if (i < args.length) {
      value = args[i]!;

      // Pine Script function parameters preserve series history when a series
      // variable is passed as an argument.  e.g.:
      //   myFunc(price) => price > price[1]
      //   myFunc(close)    →  inside myFunc, price[i] accesses close[i]
      //
      // When the argument is a plain Identifier, alias the parameter's series
      // to the original variable's series so history-referencing ([i]) works.
      if (argExprs[i]?.kind === 'Identifier') {
        const argName = argExprs[i].name;
        const argBinding = resolveVariable(scope, argName);
        if (argBinding) {
          // Built-in series (close, high, etc.) use a different history lookup
          // path in executeIndexExpression — skip aliasing for those.
          const builtInNames = new Set([
            'close',
            'open',
            'high',
            'low',
            'volume',
            'time',
            'hl2',
            'hlc3',
            'ohlc4',
            'bar_index',
          ]);
          if (!builtInNames.has(argName)) {
            const paramBinding = resolveVariable(funcScope, param.name);
            if (paramBinding) {
              // Replace the parameter's series with the original variable's
              // series.  Both now share the same backing array, so any
              // history-reference resolves against the original variable's
              // full timeseries.
              paramBinding.series = argBinding.series;
              continue; // skip the normal declare+setVariableValue path
            }
          }
        }
      }
    } else if (param.defaultValue) {
      value = _defaultDispatch(param.defaultValue, scope, context);
    } else {
      value = NA;
    }
    if (!resolveVariable(funcScope, param.name)) {
      declareVariable(funcScope, param.name, FLOAT_TYPE);
    }
    setVariableValue(funcScope, param.name, value);
  }

  if (!_executeStmt) {
    throw new Error(
      'expression-executor: executeStatement not initialized (call initExpressionExecutor first)',
    );
  }
  let result: PineValue = NA;
  for (const stmt of func.body) {
    result = _executeStmt(stmt, funcScope, context);
  }
  return result;
}

/** Lightweight expression dispatch for parameter defaults (no monkey-patch support needed). */
const _defaultDispatch: (
  expr: ExpressionNode,
  scope: RuntimeScope,
  context: ExecutionContext,
) => PineValue = (
  expr: ExpressionNode,
  scope: RuntimeScope,
  context: ExecutionContext,
): PineValue => {
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
      return executeIdentifier(null as any, expr, scope, context);
    case 'BinaryExpression':
      return executeBinaryExpression(null as any, expr, scope, context, _defaultDispatch);
    case 'UnaryExpression':
      return executeUnaryExpression(null as any, expr, scope, context, _defaultDispatch);
    case 'TernaryExpression':
      return executeTernaryExpression(null as any, expr, scope, context, _defaultDispatch);
    case 'CallExpression':
      return executeCallExpression(null as any, expr, scope, context, _defaultDispatch);
    case 'MemberExpression':
      return executeMemberExpression(null as any, expr, scope, context, _defaultDispatch);
    case 'ParenthesizedExpression':
      return executeParenthesizedExpression(null as any, expr, scope, context, _defaultDispatch);
    default:
      return NA;
  }
};

export function executeMemberExpression(
  eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
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
    if (
      objName === 'shape' ||
      objName === 'location' ||
      objName === 'size' ||
      objName === 'text' ||
      objName === 'font' ||
      objName === 'linewidth' ||
      objName === 'linecap' ||
      objName === 'linejoin' ||
      objName === 'textalign' ||
      objName === 'line' ||
      objName === 'hline' ||
      objName === 'label' ||
      objName === 'plot' ||
      objName === 'barmerge' ||
      objName === 'xloc' ||
      objName === 'yloc' ||
      objName === 'format' ||
      objName === 'display' ||
      objName === 'extend' ||
      objName === 'alert' ||
      objName === '__strategy.commission__'
    ) {
      return expr.property;
    }
    if (objName === 'math') {
      const mathConstants: Record<string, number> = {
        pi: Math.PI,
        e: Math.E,
        phi: (1 + Math.sqrt(5)) / 2,
      };
      if (expr.property in mathConstants) return mathConstants[expr.property]!;
      const mathProps: Record<string, PineValue> = {
        pi: Math.PI,
        e: Math.E,
        phi: 1.618033988749895,
      };
      return mathProps[expr.property] ?? NA;
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
      if (expr.property === 'commission') return '__strategy.commission__';
      if (expr.property in strategyConstants) return strategyConstants[expr.property]!;
      if (expr.property === 'position_size' && eng.strategyEngine)
        return eng.strategyEngine.getPosition().quantity;
      if (expr.property === 'position_avg_price' && eng.strategyEngine)
        return eng.strategyEngine.getPosition().avgPrice;
    }
    if (objName === 'barstate') {
      const barstateProps: Record<string, PineValue> = {
        isfirst: context.barIndex === 0,
        islast: context.barIndex === context.barCount - 1,
        isnew: true,
        isconfirmed: !eng.isFormingCandle,
        ishistory: true,
      };
      return barstateProps[expr.property] ?? NA;
    }
    if (objName === 'chart') {
      // TradingView chart theme colors — scripts use these to paint UI
      // elements (axis labels, text) to match the chart's light/dark theme.
      // The runtime has no real chart theming, so expose TradingView's
      // dark-theme defaults; any valid color string satisfies consumers
      // that only forward the value to label/plot textcolor.
      const chartProps: Record<string, PineValue> = {
        fg_color: '#363A45',
        bg_color: '#131722',
      };
      return chartProps[expr.property] ?? NA;
    }

    const binding = resolveVariable(scope, objName);
    if (binding && expr.property === 'length') return binding.series.length;
  }

  const obj = dispatch(expr.object, scope, context);
  if (isNa(obj)) return NA;
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    const val = (obj as unknown as Record<string, PineValue>)[expr.property];
    return val !== undefined ? val : NA;
  }
  return NA;
}

export function executeIndexExpression(
  eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  // Dispatch the index first — it's needed in all code paths and has no
  // side-effect from a "current value is NA" ambiguity.
  const index = dispatch(expr.index, scope, context);
  if (isNa(index)) return NA;
  // Guard: index must be a finite number (non-finite or non-numeric indices
  // indicate a programming error and should be surfaced, not silently ignored).
  ensureFinite(index, 'series index expression', context.barIndex);

  // Track runtime lookback: EVERY positive-integer series index (close[1],
  // myVar[70], hlFlag[x], etc.) is a probe of history the script CAN touch —
  // loop counter or not. A `for i=1..{close[i]}` demand read and a
  // `for x=1..{hlFlag[x]}` backward search are indistinguishable at the read
  // site, and both require that many historical bars for provisioning and
  // realtime gating (chunk-border-lookback requires runtimeSeriesLookback>=70
  // for loop-indexed close reads). So count them all — no loop-counter exception.
  const idx = index as number;
  if (Number.isInteger(idx) && idx > 0) {
    eng.runtimeSeriesLookback = Math.max(eng.runtimeSeriesLookback, idx);
  }

  // Handle Identifier objects BEFORE generic obj dispatch, because
  // dispatch(expr.object) returns the CURRENT value — if that value is
  // NA (e.g. after "float sup = na" at bar N, sup.getRelative(0) = na),
  // the naive isNa(obj) check would bail early before we ever get to
  // the binding history lookup that sup[1] needs.
  if (expr.object.kind === 'Identifier') {
    const objName = expr.object.name;
    if (
      objName === 'close' ||
      objName === 'open' ||
      objName === 'high' ||
      objName === 'low' ||
      objName === 'volume'
    ) {
      // Use the engine's accumulated OHLC history so close[1], open[2], etc. resolve
      // correctly even when bar contexts only carry a single value (O(n) memory).
      const history = getOHLCHistory(objName, eng);
      const idx = index as number;
      const target = history.length - 1 - idx;
      if (target >= 0 && target < history.length) return history[target] as PineValue;
      return NA;
    }
    if (objName === 'time') {
      const idx = eng.barTimestamps.length - 1 - (index as number);
      if (idx >= 0 && idx < eng.barTimestamps.length) return eng.barTimestamps[idx]!;
      return NA;
    }
    if (objName === 'bar_index') return (context.barIndex as number) - (index as number);
    const binding = resolveVariable(scope, objName);
    if (binding) return binding.series.getRelative(index as number);
  }

  // For non-identifier objects, dispatch the object and check NA
  const obj = dispatch(expr.object, scope, context);
  if (isNa(obj)) return NA;

  // Handle indexing on TA function calls like ta.atr(14)[1]
  if (expr.object.kind === 'CallExpression' && expr.object.callee.kind === 'MemberExpression') {
    const member = expr.object.callee;
    if (
      member.object.kind === 'Identifier' &&
      member.object.name === 'ta' &&
      member.property === 'atr'
    ) {
      const args = expr.object.arguments.map((arg: any) => dispatch(arg, scope, context));
      const len = Math.trunc(typeof args[0] === 'number' ? args[0] : 14);
      if (len > 0) {
        const key = `atr_${len}_${eng.currentCallSiteId}`;
        const state = eng.atrState.get(key);
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
    if (idx < 0 || idx >= arr.length) return NA;
    return arr[idx];
  }

  return NA;
}

function getOHLCHistory(name: string, eng: ExecutionEngine): number[] {
  switch (name) {
    case 'close':
      return eng.ohlcHistory.close;
    case 'open':
      return eng.ohlcHistory.open;
    case 'high':
      return eng.ohlcHistory.high;
    case 'low':
      return eng.ohlcHistory.low;
    case 'volume':
      return eng.ohlcHistory.volume;
    default:
      throw new Error(`Unknown OHLCSeries: ${name}`);
  }
}

export function executeArrayExpression(
  _eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  return expr.elements.map((elem: any) => dispatch(elem, scope, context));
}

export function executeMapExpression(
  _eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  const map = new Map<string, PineValue>();
  for (const entry of expr.entries) {
    const key = dispatch(entry.key, scope, context);
    const value = dispatch(entry.value, scope, context);
    if (typeof key === 'string') map.set(key, value);
  }
  return map;
}

export function executeFunctionExpression(
  eng: ExecutionEngine,
  expr: any,
  _scope: RuntimeScope,
  _context: ExecutionContext,
): PineValue {
  if (expr.name) eng.functions.set(expr.name, expr);
  return NA;
}

export function executeParenthesizedExpression(
  _eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  return dispatch(expr.expression, scope, context);
}
