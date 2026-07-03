import type { SourceSpan } from '../../common/source-location.js';
import type { ProgramNode, StatementNode, ExpressionNode } from '../parser/ast/nodes.js';
import type { PineType } from '../types/pine-types.js';

export enum IROpCode {
  Literal = 'Literal',
  LoadVar = 'LoadVar',
  StoreVar = 'StoreVar',
  BinaryOp = 'BinaryOp',
  UnaryOp = 'UnaryOp',
  Call = 'Call',
  Index = 'Index',
  Member = 'Member',
  JumpIfFalse = 'JumpIfFalse',
  Jump = 'Jump',
  Label = 'Label',
  Return = 'Return',
  Plot = 'Plot',
}

export interface IRInstruction {
  opcode: IROpCode;
  span: SourceSpan;
  operands: IRValue[];
}

export type IRValue = string | number | boolean | null | PineType | IRInstruction[];

export interface IRFunction {
  name: string;
  parameters: string[];
  returnType?: PineType;
  body: IRInstruction[];
  span: SourceSpan;
}

export interface IRGlobal {
  name: string;
  type: PineType;
  isVar: boolean;
  isVarip: boolean;
  isConst: boolean;
  initializer?: IRInstruction[];
}

export interface CompiledScript {
  version: number;
  scriptKind: 'indicator' | 'strategy' | 'library';
  scriptName: string;
  overlay: boolean;
  globals: IRGlobal[];
  functions: IRFunction[];
  main: IRInstruction[];
  types: Map<string, PineType>;
  span: SourceSpan;
}

export interface CompileResult {
  ir: CompiledScript;
  source: ProgramNode;
}

export interface ScopeFrame {
  variables: Map<string, PineType>;
  parent?: ScopeFrame;
}

export function createScope(parent?: ScopeFrame): ScopeFrame {
  return { variables: new Map(), parent };
}

export function declareVariable(scope: ScopeFrame, name: string, type: PineType): void {
  scope.variables.set(name, type);
}

export function resolveVariable(scope: ScopeFrame, name: string): PineType | undefined {
  let current: ScopeFrame | undefined = scope;
  while (current) {
    const found = current.variables.get(name);
    if (found) {
      return found;
    }
    current = current.parent;
  }
  return undefined;
}

export type IRBuilder = {
  instructions: IRInstruction[];
  emit: (opcode: IROpCode, span: SourceSpan, ...operands: IRValue[]) => void;
};

export function createIRBuilder(): IRBuilder {
  const instructions: IRInstruction[] = [];
  return {
    instructions,
    emit(opcode, span, ...operands) {
      instructions.push({ opcode, span, operands });
    },
  };
}

export function compileExpression(
  _expr: ExpressionNode,
  _builder: IRBuilder,
  _scope: ScopeFrame,
): PineType {
  throw new Error('Not implemented');
}

export function compileStatement(
  _stmt: StatementNode,
  _builder: IRBuilder,
  _scope: ScopeFrame,
): void {
  throw new Error('Not implemented');
}
