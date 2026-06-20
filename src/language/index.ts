export * from './parser/index.js';
export * from './types/index.js';

export {
  createScope,
  declareVariable,
  resolveVariable,
  createIRBuilder,
  compileExpression,
  compileStatement,
  type CompiledScript,
  type CompileResult,
  type IRGlobal,
  type IRFunction,
  type IRInstruction,
  type IRValue,
  type IROpCode,
  type IRBuilder,
  type ScopeFrame,
} from './compiler/index.js';

export { Compiler, compile } from './compiler/compiler.js';

export * from './runtime/index.js';
