import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import { CompileError } from '../../src/common/errors.js';

describe('Compiler', () => {
  it('compiles a simple indicator to IR', () => {
    const source = `//@version=6
indicator("Test")
length = 14
src = close
`;
    const { ast } = parse(source);
    const { ir } = compile(ast);

    expect(ir.version).toBe(6);
    expect(ir.scriptKind).toBe('indicator');
    expect(ir.scriptName).toBe('Test');
    expect(ir.globals.length).toBe(2);
    expect(ir.globals[0]?.name).toBe('length');
    expect(ir.globals[1]?.name).toBe('src');
  });

  it('validates type assignments', () => {
    const source = `//@version=6
indicator("Test")
x = 1
x := true
`;
    const { ast } = parse(source);
    expect(() => compile(ast)).toThrow(CompileError);
  });

  it('compiles typed variable declarations', () => {
    const source = `//@version=6
indicator("Test")
float x = 1.5
`;
    const { ast } = parse(source);
    const { ir } = compile(ast);

    expect(ir.globals[0]?.type.name).toBe('float');
  });
});
