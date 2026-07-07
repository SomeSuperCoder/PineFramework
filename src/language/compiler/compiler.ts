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

export class Compiler {
  private scope: ScopeFrame = createScope();
  private globals: CompiledScript['globals'] = [];
  private functions: CompiledScript['functions'] = [];
  private types = new Map<string, PineType>();
  private builder = createIRBuilder();

  compile(program: ProgramNode): CompileResult {
    this.scope = createScope();
    this.globals = [];
    this.functions = [];
    this.types = new Map();
    this.builder = createIRBuilder();

    for (const stmt of program.body) {
      this.compileStatement(stmt);
    }

    let overlay = false;
    if (program.scriptKind === 'indicator') {
      for (const arg of program.scriptArgs) {
        if (arg.name === 'overlay' && arg.value.kind === 'BooleanLiteral') {
          overlay = arg.value.value;
        }
      }
    }

    const ir: CompiledScript = {
      version: program.version,
      scriptKind: program.scriptKind,
      scriptName: program.scriptName,
      overlay,
      globals: this.globals,
      functions: this.functions,
      main: this.builder.instructions,
      types: this.types,
      span: program.span,
    };

    return { ir, source: program };
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
