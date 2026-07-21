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

import type {
  ExpressionNode,
  StatementNode,
} from '../parser/ast/nodes.js';
import { NA, isNa, pineTruthy, type PineValue } from '../types/na.js';
import { FLOAT_TYPE } from '../types/pine-types.js';
import {
  guardFinite,
  safeAdd,
  safeSub,
  safeMul,
  safeDiv,
  safeMod,
  safePow,
  safeUnaryMinus,
  safeUnaryPlus,
  isFiniteNumber,
} from './float-guards.js';
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

export function executeNumberLiteral(expr: any): PineValue {
  return expr.value;
}

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
    return safeAdd(high as number, low as number) as number / 2;
  }
  if (expr.name === 'hlc3') {
    const high = context.high.getRelative(0);
    const low = context.low.getRelative(0);
    const close = context.close.getRelative(0);
    if (isNa(high) || isNa(low) || isNa(close)) return NA;
    return ((high as number) + (low as number) + (close as number)) / 3;
  }
  if (expr.name === 'ohlc4') {
    const open = context.open.getRelative(0);
    const high = context.high.getRelative(0);
    const low = context.low.getRelative(0);
    const close = context.close.getRelative(0);
    if (isNa(open) || isNa(high) || isNa(low) || isNa(close)) return NA;
    return ((open as number) + (high as number) + (low as number) + (close as number)) / 4;
  }
  if (expr.name === 'na') return NA;

  const binding = resolveVariable(scope, expr.name);
  if (binding) return getVariableValue(scope, expr.name, 0);

  if (expr.name === 'position') {
    return { size: 0, avg_price: 0 } as any;
  }

  throw new Error(`Variable '${expr.name}' is not defined`);
}

export function executeBinaryExpression(
  _eng: ExecutionEngine,
  expr: any,
  scope: RuntimeScope,
  context: ExecutionContext,
  dispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  const left = dispatch(expr.left, scope, context);
  const right = dispatch(expr.right, scope, context);

  if (expr.operator === 'and') return pineTruthy(left) && pineTruthy(right);
  if (expr.operator === 'or') return pineTruthy(left) || pineTruthy(right);

  // PineScript NA semantics for comparisons:
  // - == with na on either side → na (unknown), unless BOTH are na → na too (indeterminate)
  // - != with na on exactly ONE side → true (one is known, the other is na → definitely not equal)
  // - != with na on BOTH sides → na (indeterminate)
  // - <, >, <=, >= with na on either side → na
  // - +, -, *, /, %, ** with na on either side → na
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
    case '+':
      if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
      return safeAdd(left as number, right as number);
    case '-': return safeSub(left as number, right as number);
    case '*': return safeMul(left as number, right as number);
    case '/': return safeDiv(left as number, right as number);
    case '%': return safeMod(left as number, right as number);
    case '**': return safePow(left as number, right as number);
    case '==': return left === right;
    case '!=': return left !== right;
    case '<': return (left as number) < (right as number);
    case '>': return (left as number) > (right as number);
    case '<=': return (left as number) <= (right as number);
    case '>=': return (left as number) >= (right as number);
    default: throw new Error(`Unsupported binary operator: ${expr.operator}`);
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
    case '-': return safeUnaryMinus(operand as number);
    case '+': return safeUnaryPlus(operand as number);
    case 'not': return !pineTruthy(operand);
    default: throw new Error(`Unsupported unary operator: ${expr.operator}`);
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
      return executeFunctionCall(eng, func, args, expr.arguments, scope, context, `${funcName}@${expr.callId}`);
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
      const obj: Record<string, PineValue> = {};
      for (let i = 0; i < fields.length; i++) {
        if (i < args.length) {
          obj[fields[i]!.name] = args[i]!;
        } else if (fields[i]!.defaultExpr) {
          const defaultVal = dispatch(fields[i]!.defaultExpr!, scope, context);
          obj[fields[i]!.name] = defaultVal;
        }
      }
      return obj as unknown as PineValue;
    }

    // Evaluate the object — used for both table and array method dispatch
    const obj = dispatch(expr.callee.object, scope, context);

    // Table method dispatch: tb.cell(...) → table.cell(tb_id, ...)
    if (typeof obj === 'number' && eng.tables && eng.tables.has(obj)) {
      const tableMethod = eng.builtins.get(`table.${methodName}`);
      if (tableMethod) {
        eng.currentCallSiteId = expr.callId;
        const builtinArgs = Object.keys(namedArgs).length > 0 ? [obj, ...args, namedArgs] : [obj, ...args];
        return tableMethod(...builtinArgs);
      }
    }

    // Generic array methods
    if (Array.isArray(obj)) {
      switch (methodName) {
        case 'size': return obj.length;
        case 'first': return obj.length > 0 ? obj[0] : NA;
        case 'last': return obj.length > 0 ? obj[obj.length - 1] : NA;
        case 'shift': return obj.shift() ?? NA;
        case 'pop': return obj.pop() ?? NA;
        case 'push': obj.push(args[0] ?? NA); return obj.length;
        case 'unshift': obj.unshift(args[0] ?? NA); return obj.length;
        case 'insert': { const idx = (args[0] as number) ?? 0; obj.splice(idx, 0, args[1] ?? NA); return obj.length; }
        case 'remove': { const ri = (args[0] as number) ?? 0; return obj.splice(ri, 1)[0] ?? NA; }
        case 'contains': return obj.includes(args[0] ?? NA);
        case 'fill': { const fv = args[0] ?? NA; for (let fi = 0; fi < obj.length; fi++) obj[fi] = fv; return obj; }
        case 'set': { const si = (args[0] as number) ?? 0; obj[si] = args[1] ?? NA; return obj; }
        case 'get': { const gi = (args[0] as number) ?? 0; return obj[gi] ?? NA; }
        case 'min': {
          let minVal: number | null = null;
          for (const item of obj) if (typeof item === 'number' && !isNaN(item)) { if (minVal === null || item < minVal) minVal = item; }
          return minVal !== null ? minVal : NA;
        }
        case 'max': {
          let maxVal: number | null = null;
          for (const item of obj) if (typeof item === 'number' && !isNaN(item)) { if (maxVal === null || item > maxVal) maxVal = item; }
          return maxVal !== null ? maxVal : NA;
        }
        case 'avg': {
          let sum = 0; let count = 0;
          for (const item of obj) if (typeof item === 'number' && !isNaN(item)) { sum += item; count++; }
          return count > 0 ? sum / count : NA;
        }
        case 'stdev': {
          const nums = obj.filter((v: any): v is number => typeof v === 'number' && !isNaN(v));
          if (nums.length < 2) return NA;
          const mean = nums.reduce((a: number, b: number) => a + b, 0) / nums.length;
          const variance = nums.reduce((sum: number, v: number) => sum + (v - mean) ** 2, 0) / (nums.length - 1);
          return Math.sqrt(variance);
        }
        case 'indexof': for (let idx = 0; idx < obj.length; idx++) if (obj[idx] === args[0]) return idx; return -1;
        case 'clear': obj.length = 0; return NA;
        case 'percentile_linear_interpolation': {
          const pct = (args[0] as number) ?? 50;
          if (typeof pct !== 'number' || isNaN(pct)) return NA;
          const nums = obj.filter((v: any): v is number => typeof v === 'number' && !isNaN(v) && Number.isFinite(v)).sort((a: number, b: number) => a - b);
          if (nums.length === 0) return NA;
          if (nums.length === 1) return nums[0];
          const rank = (pct / 100) * (nums.length - 1);
          const lower = Math.floor(rank); const upper = Math.ceil(rank);
          if (lower === upper) return nums[lower];
          return nums[lower] + (rank - lower) * (nums[upper] - nums[lower]);
        }
        case 'sort': return obj.sort((a: PineValue, b: PineValue) => (a as number) - (b as number));
        case 'copy': return [...obj];
        default: return NA;
      }
    }

    // User-defined method call
    const methodFunc = eng.functions.get(methodName);
    if (methodFunc) {
      const methodArgExprs = [expr.callee.object, ...expr.arguments];
      return executeFunctionCall(eng, methodFunc, [obj, ...args], methodArgExprs, scope, context, `${methodName}@${expr.callId}`);
    }

    // Line methods on returned IDs
    if (typeof obj === 'number') {
      switch (methodName) {
        case 'delete': eng.lines.delete(obj); return true;
        case 'get_x1': { const ln = eng.lines.get(obj); return ln ? ln.x1 : NA; }
        case 'get_y1': { const ln = eng.lines.get(obj); return ln ? ln.y1 : NA; }
        case 'get_x2': { const ln = eng.lines.get(obj); return ln ? ln.x2 : NA; }
        case 'get_y2': { const ln = eng.lines.get(obj); return ln ? ln.y2 : NA; }
        case 'get_color': { const ln = eng.lines.get(obj); return ln ? ln.color : NA; }
        case 'get_style': { const ln = eng.lines.get(obj); return ln ? ln.style : NA; }
        case 'get_width': { const ln = eng.lines.get(obj); return ln ? ln.width : NA; }
        case 'set_color': { const ln = eng.lines.get(obj); if (ln) ln.color = String(args[0] ?? '#2196f3'); return true; }
        case 'set_style': { const ln = eng.lines.get(obj); if (ln) ln.style = String(args[0] ?? 'solid'); return true; }
        case 'set_width': { const ln = eng.lines.get(obj); if (ln) ln.width = (args[0] as number) ?? 1; return true; }
        default: break;
      }
    }

    // Box methods on returned IDs
    if (typeof obj === 'number') {
      const bx = eng.boxes.get(obj);
      if (bx) {
        switch (methodName) {
          case 'set_left': bx.left = (args[0] as number) ?? bx.left; return true;
          case 'set_top': bx.top = (args[0] as number) ?? bx.top; return true;
          case 'set_right': bx.right = (args[0] as number) ?? bx.right; return true;
          case 'set_bottom': bx.bottom = (args[0] as number) ?? bx.bottom; return true;
          case 'set_border_color': bx.border_color = String(args[0] ?? '#00000000'); return true;
          case 'set_bgcolor': bx.bgcolor = String(args[0] ?? '#2196f380'); return true;
          case 'get_left': return bx.left;
          case 'get_top': return bx.top;
          case 'get_right': return bx.right;
          case 'get_bottom': return bx.bottom;
          case 'delete': eng.boxes.delete(obj); return true;
          default: return NA;
        }
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
          const builtInNames = new Set(['close', 'open', 'high', 'low', 'volume', 'time', 'hl2', 'hlc3', 'ohlc4', 'bar_index']);
          if (!builtInNames.has(argName)) {
            const paramBinding = resolveVariable(funcScope, param.name);
            if (paramBinding) {
              // Replace the parameter's series with the original variable's
              // series.  Both now share the same backing array, so any
              // history-reference resolves against the original variable's
              // full timeseries.
              paramBinding.series = argBinding.series;
              continue;  // skip the normal declare+setVariableValue path
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
    throw new Error('expression-executor: executeStatement not initialized (call initExpressionExecutor first)');
  }
  let result: PineValue = NA;
  for (const stmt of func.body) {
    result = _executeStmt(stmt, funcScope, context);
  }
  return result;
}

/** Lightweight expression dispatch for parameter defaults (no monkey-patch support needed). */
const _defaultDispatch: (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext) => PineValue =
  (expr: ExpressionNode, scope: RuntimeScope, context: ExecutionContext): PineValue => {
    switch (expr.kind) {
      case 'NumberLiteral': return executeNumberLiteral(expr);
      case 'StringLiteral': return executeStringLiteral(expr);
      case 'BooleanLiteral': return executeBooleanLiteral(expr);
      case 'ColorLiteral': return executeColorLiteral(expr);
      case 'NaLiteral': return executeNaLiteral(expr);
      case 'Identifier': return executeIdentifier(null as any, expr, scope, context);
      case 'BinaryExpression': return executeBinaryExpression(null as any, expr, scope, context, _defaultDispatch);
      case 'UnaryExpression': return executeUnaryExpression(null as any, expr, scope, context, _defaultDispatch);
      case 'TernaryExpression': return executeTernaryExpression(null as any, expr, scope, context, _defaultDispatch);
      case 'CallExpression': return executeCallExpression(null as any, expr, scope, context, _defaultDispatch);
      case 'MemberExpression': return executeMemberExpression(null as any, expr, scope, context, _defaultDispatch);
      case 'ParenthesizedExpression': return executeParenthesizedExpression(null as any, expr, scope, context, _defaultDispatch);
      default: return NA;
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
        blue: '#2196F3', red: '#F44336', green: '#4CAF50', orange: '#FF9800',
        purple: '#9C27B0', yellow: '#FFEB3B', cyan: '#00BCD4', black: '#000000',
        white: '#FFFFFF', gray: '#9E9E9E', lime: '#8BC34A', teal: '#009688',
        maroon: '#800000', navy: '#000080', olive: '#808000', aqua: '#00FFFF',
        fuchsia: '#FF00FF', silver: '#C0C0C0',
      };
      return colorMap[expr.property] || '#' + expr.property;
    }
    if (objName === 'shape' || objName === 'location' || objName === 'size' ||
        objName === 'text' || objName === 'linewidth' || objName === 'linecap' ||
        objName === 'linejoin' || objName === 'textalign' ||
        objName === 'line' || objName === 'label' || objName === 'plot' ||
        objName === 'barmerge' || objName === 'xloc' || objName === 'yloc' ||
        objName === 'format' || objName === 'display' ||
        objName === 'extend' ||
        objName === 'alert' || objName === '__strategy.commission__') {
      return expr.property;
    }
    if (objName === 'math') {
      const mathConstants: Record<string, number> = { pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2 };
      if (expr.property in mathConstants) return mathConstants[expr.property]!;
      const mathProps: Record<string, PineValue> = { pi: Math.PI, e: Math.E, phi: 1.618033988749895 };
      return mathProps[expr.property] ?? NA;
    }
    if (objName === 'syminfo') {
      const syminfoProps: Record<string, PineValue> = { tickerid: 'SYMBOL', mintick: 0.01, pointvalue: 1, pricescale: 100, currency: 'USD' };
      return syminfoProps[expr.property] ?? expr.property;
    }
    if (objName === 'strategy') {
      const strategyConstants: Record<string, PineValue> = {
        long: 'long', short: 'short', percent_of_equity: 'percent_of_equity', fixed: 'fixed', currency: 'currency',
      };
      if (expr.property === 'commission') return '__strategy.commission__';
      if (expr.property in strategyConstants) return strategyConstants[expr.property]!;
      if (expr.property === 'position_size' && eng.strategyEngine) return eng.strategyEngine.getPosition().quantity;
      if (expr.property === 'position_avg_price' && eng.strategyEngine) return eng.strategyEngine.getPosition().avgPrice;
    }
    if (objName === 'barstate') {
      const barstateProps: Record<string, PineValue> = {
        isfirst: context.barIndex === 0, islast: context.barIndex === context.barCount - 1,
        isnew: true, isconfirmed: !eng.isFormingCandle, ishistory: true,
      };
      return barstateProps[expr.property] ?? NA;
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
  const obj = dispatch(expr.object, scope, context);
  const index = dispatch(expr.index, scope, context);

  if (isNa(obj) || isNa(index)) return NA;

  if (expr.object.kind === 'Identifier') {
    const objName = expr.object.name;
    if (objName === 'close' || objName === 'open' || objName === 'high' || objName === 'low' || objName === 'volume') {
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

  // Handle indexing on TA function calls like ta.atr(14)[1]
  if (expr.object.kind === 'CallExpression' && expr.object.callee.kind === 'MemberExpression') {
    const member = expr.object.callee;
    if (member.object.kind === 'Identifier' && member.object.name === 'ta' && member.property === 'atr') {
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
    case 'close': return eng.ohlcHistory.close;
    case 'open': return eng.ohlcHistory.open;
    case 'high': return eng.ohlcHistory.high;
    case 'low': return eng.ohlcHistory.low;
    case 'volume': return eng.ohlcHistory.volume;
    default: throw new Error(`Unknown OHLCSeries: ${name}`);
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
