export const VERSION = '0.1.0';

export * from './language/index.js';

export { parse } from './language/parser/index.js';
export { compile } from './language/compiler/index.js';

import { parse as parseSource } from './language/parser/index.js';
import { compile as compileSource } from './language/compiler/index.js';

export function parseAndCompile(source: string) {
  const { ast } = parseSource(source);
  return compileSource(ast);
}
