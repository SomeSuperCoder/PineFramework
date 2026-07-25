import { CompileError } from '../../common/errors.js';
import type {
  ExpressionNode,
  ProgramNode,
  StatementNode,
  TypeAnnotationNode,
  VariableDeclarationNode,
} from '../parser/ast/nodes.js';
import {
  ANY_TYPE,
  BOOL_TYPE,
  FLOAT_TYPE,
  NA_TYPE,
  typeFromAnnotation,
  type PineType,
  seriesOf,
} from '../types/pine-types.js';
import { inferLiteralType, isAssignable } from '../types/coercion.js';
import {
  createIRBuilder,
  declareVariable,
  resolveVariable,
  createScope,
  type CompiledScript,
  type CompileResult,
  type ScopeFrame,
  IROpCode,
} from './ir.js';

/**
 * TA function lookback detection map.
 * Key: function name (without "ta." prefix)
 * Value: arg index that holds the period length, or -1 for special handling
 */
const TA_LOOKBACK_ARGS: Record<string, number> = {
  sma: 1,
  ema: 1,
  hma: 1,
  rsi: 1,
  atr: 0,
  highest: 1,
  lowest: 1,
  valuewhen: 2,
};

// Pivot functions sum both args
const PIVOT_FUNCTIONS = new Set(['pivothigh', 'pivotlow']);

// OHLCV identifiers that support history indexing
const OHLCV_IDENTIFIERS = new Set(['close', 'open', 'high', 'low', 'volume']);

/**
 * Extract a constant number from an expression node.
 * Returns the number if it's a NumberLiteral, otherwise undefined.
 */
function extractConstant(node: ExpressionNode): number | undefined {
  if (node.kind === 'NumberLiteral') return node.value;
  return undefined;
}

/**
 * Walk an expression node and return the maximum lookback period detected.
 */
function detectLookbackInExpression(expr: ExpressionNode): number {
  let maxLookback = 0;

  switch (expr.kind) {
    case 'CallExpression': {
      // Check if this is a ta.* function call
      if (expr.callee.kind === 'MemberExpression' &&
          expr.callee.object.kind === 'Identifier' &&
          expr.callee.object.name === 'ta') {
        const funcName = expr.callee.property;

        // Pivot functions: sum both args
        if (PIVOT_FUNCTIONS.has(funcName) && expr.arguments.length >= 2) {
          const left = extractConstant(expr.arguments[0]);
          const right = extractConstant(expr.arguments[1]);
          if (left !== undefined && right !== undefined) {
            maxLookback = Math.max(maxLookback, left + right);
          }
        }
        // Standard TA functions with known period arg position
        else if (funcName in TA_LOOKBACK_ARGS) {
          const argIdx = TA_LOOKBACK_ARGS[funcName];
          if (argIdx < expr.arguments.length) {
            const period = extractConstant(expr.arguments[argIdx]);
            if (period !== undefined) {
              maxLookback = Math.max(maxLookback, period);
            }
          }
        }
      }

      // Recurse into all arguments
      for (const arg of expr.arguments) {
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(arg));
      }
      break;
    }

    case 'IndexExpression': {
      // Check for constant offset indexing: close[N], variableName[N]
      if (expr.object.kind === 'Identifier' && expr.index.kind === 'NumberLiteral') {
        const objName = expr.object.name;
        const offset = expr.index.value;
        // Detect on OHLCV identifiers or user-defined variables
        if (OHLCV_IDENTIFIERS.has(objName) || offset > 0) {
          maxLookback = Math.max(maxLookback, offset);
        }
      }
      // Recurse into object and index
      maxLookback = Math.max(maxLookback, detectLookbackInExpression(expr.object));
      maxLookback = Math.max(maxLookback, detectLookbackInExpression(expr.index));
      break;
    }

    case 'BinaryExpression':
      maxLookback = Math.max(maxLookback, detectLookbackInExpression(expr.left));
      maxLookback = Math.max(maxLookback, detectLookbackInExpression(expr.right));
      break;

    case 'UnaryExpression':
      maxLookback = Math.max(maxLookback, detectLookbackInExpression(expr.operand));
      break;

    case 'TernaryExpression':
      maxLookback = Math.max(maxLookback, detectLookbackInExpression(expr.condition));
      maxLookback = Math.max(maxLookback, detectLookbackInExpression(expr.consequent));
      maxLookback = Math.max(maxLookback, detectLookbackInExpression(expr.alternate));
      break;

    case 'ArrayExpression':
      for (const elem of expr.elements) {
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(elem));
      }
      break;

    case 'FunctionExpression':
      maxLookback = Math.max(maxLookback, detectLookbackInStatements(expr.body));
      break;

    // ParenthesizedExpression, SwitchExpression, MapExpression — recurse into sub-expressions
    case 'ParenthesizedExpression':
      maxLookback = Math.max(maxLookback, detectLookbackInExpression(expr.expression));
      break;

    case 'MapExpression':
      for (const entry of expr.entries) {
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(entry.key));
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(entry.value));
      }
      break;

    case 'SwitchExpression':
      maxLookback = Math.max(maxLookback, detectLookbackInExpression(expr.expression));
      for (const cs of expr.cases) {
        if (cs.value) {
          maxLookback = Math.max(maxLookback, detectLookbackInExpression(cs.value));
        }
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(cs.result));
      }
      break;

    // Leaf nodes: Identifier, NumberLiteral, StringLiteral, etc. — no lookback
  }

  return maxLookback;
}

/**
 * Walk statement nodes and return the maximum lookback period detected.
 */
function detectLookbackInStatements(stmts: StatementNode[]): number {
  let maxLookback = 0;

  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'VariableDeclaration':
        if (stmt.initializer) {
          maxLookback = Math.max(maxLookback, detectLookbackInExpression(stmt.initializer));
        }
        break;
      case 'Assignment':
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(stmt.target));
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(stmt.value));
        break;
      case 'ExpressionStatement':
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(stmt.expression));
        break;
      case 'IfStatement':
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(stmt.condition));
        maxLookback = Math.max(maxLookback, detectLookbackInStatements(stmt.thenBranch));
        if (stmt.elseBranch) {
          maxLookback = Math.max(maxLookback, detectLookbackInStatements(stmt.elseBranch));
        }
        break;
      case 'ForStatement': {
        // Recurse into loop body for nested TA calls and [] indexing
        // NOTE: We do NOT treat the for-loop upper bound as lookback.
        // A `for x=1 to 1000` searches up to 1000 bars back, but that's
        // search depth, not warmup. The script can produce valid output
        // (labels, plots) well before bar 1000 — the loop just hasn't
        // found what it's looking for yet.
        maxLookback = Math.max(maxLookback, detectLookbackInStatements(stmt.body));
        break;
      }
      case 'WhileStatement':
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(stmt.condition));
        maxLookback = Math.max(maxLookback, detectLookbackInStatements(stmt.body));
        break;
      case 'SwitchStatement':
        maxLookback = Math.max(maxLookback, detectLookbackInExpression(stmt.expression));
        for (const cs of stmt.cases) {
          if (cs.value) {
            maxLookback = Math.max(maxLookback, detectLookbackInExpression(cs.value));
          }
          maxLookback = Math.max(maxLookback, detectLookbackInStatements(cs.body));
        }
        break;
      case 'ReturnStatement':
        if (stmt.value) {
          maxLookback = Math.max(maxLookback, detectLookbackInExpression(stmt.value));
        }
        break;
      case 'TypeDeclaration':
      case 'ImportStatement':
      case 'ExportStatement':
      case 'BreakStatement':
      case 'ContinueStatement':
        // No lookback in these statement types
        break;
    }
  }

  return maxLookback;
}

/**
 * Statically detect the minimum lookback period required by analyzing the AST.
 * Only detects constant (numeric literal) periods from TA function args and [] indexing.
 * Returns 0 if no lookback can be determined at compile time.
 */
function detectLookbackFromAST(program: ProgramNode): number {
  return detectLookbackInStatements(program.body);
}

export class Compiler {
  private scope: ScopeFrame = createScope();
  private globals: CompiledScript['globals'] = [];
  private functions: CompiledScript['functions'] = [];
  private types = new Map<string, PineType>();
  private builder = createIRBuilder();
  private callIdCounter = 0;

  compile(program: ProgramNode): CompileResult {
    this.scope = createScope();
    this.globals = [];
    this.functions = [];
    this.types = new Map();
    this.callIdCounter = 0;
    this.assignCallIds(program);

    for (const stmt of program.body) {
      this.compileStatement(stmt);
    }

    let overlay = program.scriptKind === 'strategy';
    let maxBarsBack = 0;
    for (const arg of program.scriptArgs) {
      if (arg.name === 'overlay') {
        if (arg.value.kind === 'BooleanLiteral') {
          overlay = arg.value.value;
        } else if (arg.value.kind === 'NumberLiteral') {
          overlay = arg.value.value !== 0;
        }
      } else if (arg.name === 'max_bars_back') {
        if (arg.value.kind === 'NumberLiteral') {
          maxBarsBack = arg.value.value;
        }
      }
    }

    // Auto-detect lookback from AST when not explicitly declared
    if (maxBarsBack === 0) {
      maxBarsBack = detectLookbackFromAST(program);
    }

    const ir: CompiledScript = {
      version: program.version,
      scriptKind: program.scriptKind,
      scriptName: program.scriptName,
      overlay,
      maxBarsBack,
      globals: this.globals,
      functions: this.functions,
      main: this.builder.instructions,
      types: this.types,
      span: program.span,
    };

    return { ir, source: program };
  }

  private assignCallIds(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'CallExpression') {
      node.callId = this.callIdCounter++;
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) this.assignCallIds(item);
      } else if (child && typeof child === 'object') {
        this.assignCallIds(child);
      }
    }
  }

  private compileStatement(stmt: StatementNode): void {
    switch (stmt.kind) {
      case 'VariableDeclaration':
        this.compileVariableDeclaration(stmt);
        break;
      case 'Assignment':
        this.compileAssignment(stmt);
        break;
      case 'ExpressionStatement':
        this.inferExpressionType(stmt.expression);
        this.builder.emit(IROpCode.Call, stmt.span, 'expr', stmt.expression.kind);
        break;
      case 'TypeDeclaration':
        this.compileTypeDeclaration(
          stmt.name,
          stmt.fields.map((f) => ({
            name: f.name,
            type: this.resolveTypeAnnotation(f.typeAnnotation),
          })),
        );
        break;
      case 'IfStatement':
      case 'ForStatement':
      case 'WhileStatement':
      case 'SwitchStatement':
      case 'ReturnStatement':
      case 'BreakStatement':
      case 'ContinueStatement':
        break;
      default:
        throw new CompileError(`Unsupported statement: ${stmt.kind}`, stmt.span);
    }
  }

  private compileVariableDeclaration(decl: VariableDeclarationNode): void {
    let varType: PineType;

    if (decl.typeAnnotation) {
      varType = this.resolveTypeAnnotation(decl.typeAnnotation);
    } else if (decl.initializer) {
      varType = this.inferExpressionType(decl.initializer);
    } else {
      varType = ANY_TYPE;
    }

    if (decl.initializer) {
      const initType = this.inferExpressionType(decl.initializer);
      if (!isAssignable(initType, varType)) {
        throw new CompileError(
          `Cannot assign ${initType.toString()} to ${varType.toString()}`,
          decl.span,
        );
      }
    }

    declareVariable(this.scope, decl.name, varType);
    this.globals.push({
      name: decl.name,
      type: varType,
      isVar: decl.isVar,
      isVarip: decl.isVarip,
      isConst: decl.isConst,
    });

    if (decl.initializer) {
      this.builder.emit(IROpCode.StoreVar, decl.span, decl.name);
    }
  }

  private compileAssignment(stmt: Extract<StatementNode, { kind: 'Assignment' }>): void {
    const valueType = this.inferExpressionType(stmt.value);

    if (stmt.target.kind === 'Identifier') {
      const name = stmt.target.name;
      let existing = resolveVariable(this.scope, name);

      if (!existing && stmt.operator === '=') {
        existing = valueType;
        declareVariable(this.scope, name, existing);
        this.globals.push({
          name,
          type: existing,
          isVar: false,
          isVarip: false,
          isConst: false,
        });
        this.builder.emit(IROpCode.StoreVar, stmt.span, name, stmt.operator);
        return;
      }

      if (!existing) {
        throw new CompileError(`Undefined variable: ${name}`, stmt.span);
      }
      if (!isAssignable(valueType, existing)) {
        throw new CompileError(
          `Cannot assign ${valueType.toString()} to ${existing.toString()}`,
          stmt.span,
        );
      }
      this.builder.emit(IROpCode.StoreVar, stmt.span, name, stmt.operator);
    } else {
      this.inferExpressionType(stmt.target);
      this.builder.emit(IROpCode.StoreVar, stmt.span, 'indexed', stmt.operator);
    }
  }

  private compileTypeDeclaration(
    name: string,
    fields: Array<{ name: string; type: PineType }>,
  ): void {
    const userType = typeFromAnnotation(name, {});
    this.types.set(name, userType);
    for (const field of fields) {
      this.types.set(`${name}.${field.name}`, field.type);
    }
  }

  private resolveTypeAnnotation(annotation: TypeAnnotationNode): PineType {
    const typeArgs = annotation.typeArguments?.map((arg) => this.resolveTypeAnnotation(arg));

    let resolved = typeFromAnnotation(annotation.name, {
      isSeries: annotation.isSeries,
      isArray: annotation.isArray,
      isMap: annotation.isMap,
      typeArguments: typeArgs,
    });

    if (annotation.isSeries && !resolved.isSeries) {
      resolved = seriesOf(resolved);
    }

    return resolved;
  }

  private inferExpressionType(expr: ExpressionNode): PineType {
    switch (expr.kind) {
      case 'NumberLiteral':
        return expr.isFloat ? FLOAT_TYPE : inferLiteralType(expr.value, expr.isFloat);
      case 'StringLiteral':
        return inferLiteralType(expr.value);
      case 'BooleanLiteral':
        return inferLiteralType(expr.value);
      case 'ColorLiteral':
        return inferLiteralType(expr.value);
      case 'NaLiteral':
        return NA_TYPE;
      case 'Identifier': {
        const varType = resolveVariable(this.scope, expr.name);
        if (!varType) {
          return seriesOf(FLOAT_TYPE);
        }
        return varType;
      }
      case 'BinaryExpression': {
        const leftType = this.inferExpressionType(expr.left);
        const rightType = this.inferExpressionType(expr.right);

        if (expr.operator === 'and' || expr.operator === 'or') {
          return inferLiteralType(true);
        }

        if (expr.operator === '==' || expr.operator === '!=') {
          return inferLiteralType(true);
        }

        if (expr.operator === '+' && (leftType.name === 'string' || rightType.name === 'string')) {
          return inferLiteralType('');
        }

        const isComparison =
          expr.operator === '>' ||
          expr.operator === '<' ||
          expr.operator === '>=' ||
          expr.operator === '<=';

        if (leftType.isSeries || rightType.isSeries) {
          return isComparison ? seriesOf(BOOL_TYPE) : seriesOf(FLOAT_TYPE);
        }

        return isComparison ? BOOL_TYPE : FLOAT_TYPE;
      }
      case 'UnaryExpression':
        return this.inferExpressionType(expr.operand);
      case 'TernaryExpression': {
        this.inferExpressionType(expr.condition);
        const consequentType = this.inferExpressionType(expr.consequent);
        const alternateType = this.inferExpressionType(expr.alternate);
        if (isAssignable(alternateType, consequentType)) {
          return consequentType;
        }
        return alternateType;
      }
      case 'CallExpression': {
        if (
          expr.callee.kind === 'MemberExpression' &&
          expr.callee.object.kind === 'Identifier' &&
          expr.callee.object.name === 'array'
        ) {
          const parts = expr.callee.property.split('_');
          if (parts[0] === 'new' && parts.length > 1) {
            const elementType = parts.slice(1).join('_');
            return typeFromAnnotation('array', {
              typeArguments: [typeFromAnnotation(elementType, {})],
            });
          }
        }
        return seriesOf(FLOAT_TYPE);
      }
      case 'MemberExpression':
        return seriesOf(FLOAT_TYPE);
      case 'IndexExpression':
        return seriesOf(FLOAT_TYPE);
      case 'ArrayExpression':
        return typeFromAnnotation('array', {
          typeArguments:
            expr.elements.length > 0 ? [this.inferExpressionType(expr.elements[0]!)] : [ANY_TYPE],
        });
      case 'MapExpression':
        return typeFromAnnotation('map', { typeArguments: [ANY_TYPE, ANY_TYPE] });
      case 'FunctionExpression':
        return ANY_TYPE;
      case 'ParenthesizedExpression':
        return this.inferExpressionType(expr.expression);
      case 'SwitchExpression': {
        this.inferExpressionType(expr.expression);
        if (expr.cases.length === 0) return ANY_TYPE;
        let resultType = this.inferExpressionType(expr.cases[0]!.result);
        for (let i = 1; i < expr.cases.length; i++) {
          const caseType = this.inferExpressionType(expr.cases[i]!.result);
          if (isAssignable(caseType, resultType)) {
            resultType = caseType;
          }
        }
        return resultType;
      }
      default:
        return ANY_TYPE;
    }
  }
}

export function compile(program: ProgramNode): CompileResult {
  return new Compiler().compile(program);
}
