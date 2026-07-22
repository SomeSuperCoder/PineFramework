/**
 * Evil tests: Compiler
 *
 * Adversarial inputs designed to trigger type-checking edge cases
 * in the Pine Script compiler. Verifies the compiler rejects type
 * mismatches with descriptive CompileErrors.
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { CompileError } from '../../src/common/errors.js';

/** Helper: parse source and call compile, expecting CompileError. */
function expectCompileError(source: string, msgPattern?: RegExp): void {
  const { ast } = parse(source);
  if (msgPattern) {
    expect(() => compile(ast)).toThrow(msgPattern);
  } else {
    expect(() => compile(ast)).toThrow(CompileError);
  }
}

describe('Evil compiler — type mismatch via reassignment', () => {
  it('throws CompileError assigning bool to int variable', () => {
    expectCompileError(
      `//@version=6
indicator("Test")
int x = 1
x := true
`,
    );
  });

  it('throws CompileError assigning string to float variable', () => {
    expectCompileError(
      `//@version=6
indicator("Test")
float x = 1.0
x := "hello"
`,
    );
  });

  it('throws CompileError assigning float to string variable', () => {
    expectCompileError(
      `//@version=6
indicator("Test")
string x = "hi"
x := 42.5
`,
    );
  });

  it('throws CompileError assigning int to bool variable', () => {
    expectCompileError(
      `//@version=6
indicator("Test")
bool x = true
x := 1
`,
    );
  });
});

describe('Evil compiler — type mismatch in variable declaration', () => {
  it('throws CompileError when float initializer assigned to int variable', () => {
    expectCompileError(
      `//@version=6
indicator("Test")
int x = 3.14
`,
    );
  });

  it('throws CompileError when bool initializer assigned to float variable', () => {
    expectCompileError(
      `//@version=6
indicator("Test")
float x = true
`,
    );
  });

  it('throws CompileError when string initializer assigned to bool variable', () => {
    expectCompileError(
      `//@version=6
indicator("Test")
bool x = "true"
`,
    );
  });
});

describe('Evil compiler — const declaration edge cases', () => {
  it('accepts const declarations without crashing', () => {
    // const declarations are valid Pine Script — verify they don't crash the compiler
    const source = `//@version=6
indicator("Test")
const x = 42
const y = x + 1
`;
    const { ast } = parse(source);
    expect(() => compile(ast)).not.toThrow();
  });
});
