export const VERSION = '0.1.0';

export * from './language/index.js';

export { parse } from './language/parser/index.js';
export { compile } from './language/compiler/index.js';
export { ExecutionEngine } from './language/runtime/execution-engine.js';

import { parse as parseSource } from './language/parser/index.js';
import { compile as compileSource } from './language/compiler/index.js';
import { ExecutionEngine as ExecutionEngineImpl } from './language/runtime/execution-engine.js';

export function parseAndCompile(source: string) {
  const { ast } = parseSource(source);
  return compileSource(ast);
}

export function executeScript(
  source: string,
  bars: import('./language/runtime/execution-engine.js').ExecutionContext[],
) {
  const result = parseAndCompile(source);
  const engine = new ExecutionEngineImpl(result);
  return engine.executeBars(bars);
}
