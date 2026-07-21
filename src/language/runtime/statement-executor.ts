/**
 * Statement execution — extracted from interpreter.ts (S-007).
 *
 * Each function takes an `executeExpr` callback that routes through the
 * Interpreter instance's dispatcher, enabling monkey-patching by tests.
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
import { NA, pineTruthy, type PineValue } from '../types/na.js';
import { FLOAT_TYPE, INT_TYPE } from '../types/pine-types.js';
import { safeAdd, safeSub, safeMul, safeDiv } from './float-guards.js';
import {
  type RuntimeScope,
  createRuntimeScope,
  declareVariable,
  resolveVariable,
  setVariableValue,
} from './scope.js';
import type { ExecutionContext } from './execution-types.js';
import type { ExecutionEngine } from './execution-engine.js';

export type ExecuteExpressionFn = (
  expr: ExpressionNode,
  scope: RuntimeScope,
  context: ExecutionContext,
) => PineValue;

// ============================================================================
// INDIVIDUAL STATEMENT IMPLEMENTATIONS
// ============================================================================

export function executeVariableDeclaration(
  _eng: ExecutionEngine,
  decl: VariableDeclarationNode,
  scope: RuntimeScope,
  context: ExecutionContext,
  executeExpr: ExecuteExpressionFn,
): PineValue {
  const existing = resolveVariable(scope, decl.name);

  if (existing && (decl.isVar || decl.isVarip)) {
    if (existing.series.length > 0) return existing.series.last();
    let value: PineValue = NA;
    if (decl.initializer) value = executeExpr(decl.initializer, scope, context);
    existing.series.push(value);
    return value;
  }

  let value: PineValue = NA;
  if (decl.initializer) value = executeExpr(decl.initializer, scope, context);

  if (existing) {
    existing.series.push(value);
  } else {
    const binding = declareVariable(scope, decl.name, FLOAT_TYPE, decl.isVar, decl.isVarip, decl.isConst);
    binding.series.push(value);
  }
  return value;
}

export function executeAssignment(
  _eng: ExecutionEngine,
  stmt: AssignmentNode,
  scope: RuntimeScope,
  context: ExecutionContext,
  executeExpr: ExecuteExpressionFn,
): PineValue {
  const value = executeExpr(stmt.value, scope, context);

  if (stmt.target.kind === 'Identifier') {
    const name = stmt.target.name;
    let binding = resolveVariable(scope, name);
    if (!binding && stmt.operator === '=') binding = declareVariable(scope, name, FLOAT_TYPE);
    if (!binding) throw new Error(`Variable '${name}' is not defined`);

    let result: PineValue = value;
    if (stmt.operator !== '=') {
      const current = binding.series.getRelative(0);
      switch (stmt.operator) {
        case '+=': result = safeAdd(typeof current === 'number' ? current : 0, typeof value === 'number' ? value : 0); break;
        case '-=': result = safeSub(typeof current === 'number' ? current : 0, typeof value === 'number' ? value : 0); break;
        case '*=': result = safeMul(typeof current === 'number' ? current : 0, typeof value === 'number' ? value : 0); break;
        case '/=': result = safeDiv(typeof current === 'number' ? current : 0, typeof value === 'number' ? value : 0); break;
        case ':=': result = value; break;
      }
    }
    if (stmt.operator !== '=' && binding.series.length > 0) {
      binding.series.values[binding.series.values.length - 1] = result;
    } else {
      binding.series.push(result);
    }
    return result;
  }

  if (stmt.target.kind === 'MemberExpression') {
    const obj = executeExpr(stmt.target.object, scope, context);
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      const fieldName = stmt.target.property;
      const record = obj as unknown as Record<string, PineValue>;
      let result: PineValue = value;
      if (stmt.operator !== '=') {
        const current = record[fieldName] !== undefined ? record[fieldName] : NA;
        switch (stmt.operator) {
          case '+=': result = safeAdd(typeof current === 'number' ? current : 0, typeof value === 'number' ? value : 0); break;
          case '-=': result = safeSub(typeof current === 'number' ? current : 0, typeof value === 'number' ? value : 0); break;
          case '*=': result = safeMul(typeof current === 'number' ? current : 0, typeof value === 'number' ? value : 0); break;
          case '/=': result = safeDiv(typeof current === 'number' ? current : 0, typeof value === 'number' ? value : 0); break;
          case ':=': result = value; break;
        }
      }
      record[fieldName] = result;
    }
    return value;
  }

  if (stmt.target.kind === 'ArrayExpression') {
    if (!Array.isArray(value)) return NA;
    for (let i = 0; i < stmt.target.elements.length; i++) {
      const elem = stmt.target.elements[i];
      if (elem && elem.kind === 'Identifier') {
        const name = elem.name;
        let binding = resolveVariable(scope, name);
        if (!binding) binding = declareVariable(scope, name, FLOAT_TYPE);
        binding.series.push((value as PineValue[])[i] ?? NA);
      }
    }
    return value;
  }

  throw new Error(`Unsupported assignment target: ${stmt.target.kind}`);
}

export function executeExpressionStatement(
  _eng: ExecutionEngine,
  stmt: ExpressionStatementNode,
  scope: RuntimeScope,
  context: ExecutionContext,
  executeExpr: ExecuteExpressionFn,
): PineValue {
  return executeExpr(stmt.expression, scope, context);
}

export function executeIfStatement(
  _eng: ExecutionEngine,
  stmt: IfStatementNode,
  scope: RuntimeScope,
  context: ExecutionContext,
  executeExpr: ExecuteExpressionFn,
  executeStmt: (stmt: StatementNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  const condition = executeExpr(stmt.condition, scope, context);
  if (pineTruthy(condition)) {
    const blockScope = createRuntimeScope(scope);
    for (const s of stmt.thenBranch) executeStmt(s, blockScope, context);
    return NA;
  }
  if (stmt.elseBranch) {
    const blockScope = createRuntimeScope(scope);
    for (const s of stmt.elseBranch) executeStmt(s, blockScope, context);
  }
  return NA;
}

export function executeForStatement(
  _eng: ExecutionEngine,
  stmt: ForStatementNode,
  scope: RuntimeScope,
  context: ExecutionContext,
  executeExpr: ExecuteExpressionFn,
  executeStmt: (stmt: StatementNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  if (stmt.isForIn && stmt.iterable) {
    const iterableValue = executeExpr(stmt.iterable, scope, context);
    const loopScope = createRuntimeScope(scope);
    declareVariable(loopScope, stmt.variable, FLOAT_TYPE);
    if (Array.isArray(iterableValue)) {
      for (const element of iterableValue) {
        setVariableValue(loopScope, stmt.variable, element);
        for (const s of stmt.body) executeStmt(s, loopScope, context);
      }
    }
    return NA;
  }

  const start = executeExpr(stmt.start!, scope, context) as number;
  const end = executeExpr(stmt.end!, scope, context) as number;
  const step = stmt.step ? (executeExpr(stmt.step, scope, context) as number) : 1;
  const safeStep = step <= 0 ? 1 : step;
  const maxIterations = 1000000;
  const loopScope = createRuntimeScope(scope);
  declareVariable(loopScope, stmt.variable, INT_TYPE);
  const startInt = Math.floor(start);
  const endInt = Math.floor(end);
  const stepInt = Math.max(1, Math.floor(safeStep));
  const expectedIterations = Math.max(0, Math.floor((endInt - startInt) / stepInt) + 1);
  const iterations = Math.min(expectedIterations, maxIterations);

  for (let iter = 0, i = startInt; iter < iterations; iter++, i += stepInt) {
    setVariableValue(loopScope, stmt.variable, i);
    for (const s of stmt.body) executeStmt(s, loopScope, context);
  }
  return NA;
}

export function executeWhileStatement(
  _eng: ExecutionEngine,
  stmt: WhileStatementNode,
  scope: RuntimeScope,
  context: ExecutionContext,
  executeExpr: ExecuteExpressionFn,
  executeStmt: (stmt: StatementNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  const loopScope = createRuntimeScope(scope);
  let iterations = 0;
  const maxIterations = 10000;
  while (pineTruthy(executeExpr(stmt.condition, loopScope, context))) {
    iterations++;
    if (iterations > maxIterations) throw new Error('While loop exceeded maximum iterations');
    for (const s of stmt.body) executeStmt(s, loopScope, context);
  }
  return NA;
}

export function executeSwitchStatement(
  _eng: ExecutionEngine,
  stmt: SwitchStatementNode,
  scope: RuntimeScope,
  context: ExecutionContext,
  executeExpr: ExecuteExpressionFn,
  executeStmt: (stmt: StatementNode, scope: RuntimeScope, context: ExecutionContext) => PineValue,
): PineValue {
  const exprValue = executeExpr(stmt.expression, scope, context);
  for (const caseNode of stmt.cases) {
    if (caseNode.value) {
      const caseValue = executeExpr(caseNode.value, scope, context);
      if (exprValue === caseValue || (typeof exprValue === 'number' && exprValue === caseValue)) {
        const caseScope = createRuntimeScope(scope);
        let lastResult: PineValue = NA;
        for (const s of caseNode.body) lastResult = executeStmt(s, caseScope, context);
        return lastResult;
      }
    }
  }
  if (stmt.defaultCase) {
    const defaultScope = createRuntimeScope(scope);
    let lastResult: PineValue = NA;
    for (const s of stmt.defaultCase) lastResult = executeStmt(s, defaultScope, context);
    return lastResult;
  }
  return NA;
}

export function executeTypeDeclaration(
  eng: ExecutionEngine,
  stmt: TypeDeclarationNode,
  _scope: RuntimeScope,
  _context: ExecutionContext,
): PineValue {
  eng.userTypeFields.set(
    stmt.name,
    stmt.fields.map((f) => ({ name: f.name, defaultExpr: f.defaultValue ?? null })),
  );
  return NA;
}

export function executeReturnStatement(
  _eng: ExecutionEngine,
  stmt: ReturnStatementNode,
  scope: RuntimeScope,
  context: ExecutionContext,
  executeExpr: ExecuteExpressionFn,
): PineValue {
  if (stmt.value) return executeExpr(stmt.value, scope, context);
  return NA;
}
