/**
 * Compiler non-silent error tests.
 *
 * Verifies that the compiler rejects unrecognised expression kinds,
 * validates assignment targets, const reassignment, and control-flow
 * context with CompileError (not silent ANY_TYPE or unchecked IR emission).
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { CompileError } from '../../src/common/errors.js';

function parseAndCompile(source: string): ReturnType<typeof compile> {
  const { ast } = parse(source);
  return compile(ast);
}

describe('Compiler — no silent failures', () => {
  // ===========================================================================
  // Exhaustive expression type inference
  // ===========================================================================

  it('valid script compiles without error', () => {
    expect(() => parseAndCompile('//@version=6\nindicator("")\nplot(close)')).not.toThrow();
  });

  // ===========================================================================
  // Control flow context validation
  // ===========================================================================

  it('throws CompileError for return outside function', () => {
    expect(() => parseAndCompile('//@version=6\nindicator("")\nreturn 1')).toThrow(CompileError);
  });

  it('throws CompileError for break outside loop', () => {
    expect(() => parseAndCompile('//@version=6\nindicator("")\nif true\n  break')).toThrow(
      CompileError,
    );
  });

  it('throws CompileError for continue outside loop', () => {
    expect(() => parseAndCompile('//@version=6\nindicator("")\nif true\n  continue')).toThrow(
      CompileError,
    );
  });

  it('allows return inside function', () => {
    expect(() => parseAndCompile('//@version=6\nindicator("")\nf(x) =>\n  return x')).not.toThrow();
  });

  it('allows break inside for loop', () => {
    expect(() =>
      parseAndCompile('//@version=6\nindicator("")\nfor i = 1 to 10\n  if i > 5\n    break'),
    ).not.toThrow();
  });

  it('allows break inside while loop', () => {
    expect(() =>
      parseAndCompile('//@version=6\nindicator("")\nwhile(true)\n  break'),
    ).not.toThrow();
  });

  // ===========================================================================
  // Const variable reassignment
  // ===========================================================================

  it('throws CompileError for const reassignment', () => {
    expect(() => parseAndCompile('//@version=6\nindicator("")\nconst x = 5\nx := 10')).toThrow(
      CompileError,
    );
  });

  it('allows non-const variable reassignment', () => {
    expect(() => parseAndCompile('//@version=6\nindicator("")\nx = 5\nx := 10')).not.toThrow();
  });

  // ===========================================================================
  // Assignment target validation
  // ===========================================================================

  it('rejects assignment to literal', () => {
    expect(() => parseAndCompile('//@version=6\nindicator("")\n5 = 10')).toThrow(CompileError);
  });

  it('accepts assignment to identifier', () => {
    expect(() => parseAndCompile('//@version=6\nindicator("")\nx = 10')).not.toThrow();
  });

  it('accepts compound assignment', () => {
    expect(() => parseAndCompile('//@version=6\nindicator("")\nx = 10\nx += 5')).not.toThrow();
  });

  // ===========================================================================
  // CompileError has source span
  // ===========================================================================

  it('CompileError contains source span', () => {
    try {
      parseAndCompile('//@version=6\nindicator("")\nconst x = 5\nx := 10');
      fail('Expected CompileError');
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      const ce = err as CompileError;
      expect(ce.span).toBeDefined();
      expect(ce.span!.start.line).toBeGreaterThan(0);
    }
  });
});
