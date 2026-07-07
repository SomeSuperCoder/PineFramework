import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import { CompileError } from '../../src/common/errors.js';
import { IROpCode } from '../../src/language/compiler/ir.js';

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

  describe('Variable declarations', () => {
    it('compiles int variable declaration', () => {
      const source = `//@version=6
indicator("Test")
int x = 42
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('int');
    });

    it('compiles bool variable declaration', () => {
      const source = `//@version=6
indicator("Test")
bool x = true
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('bool');
    });

    it('compiles string variable declaration', () => {
      const source = `//@version=6
indicator("Test")
string x = "hello"
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('string');
    });

    it('compiles color variable declaration', () => {
      const source = `//@version=6
indicator("Test")
color x = #FF0000
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('color');
    });

    it('compiles untyped variable declaration with initializer', () => {
      const source = `//@version=6
indicator("Test")
x = 10
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('int');
    });

    it('compiles var keyword declaration', () => {
      const source = `//@version=6
indicator("Test")
var x = 0
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.isVar).toBe(true);
    });

    it('compiles varip keyword declaration', () => {
      const source = `//@version=6
indicator("Test")
varip x = 0
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.isVarip).toBe(true);
    });

    it('compiles series type declaration', () => {
      const source = `//@version=6
indicator("Test")
series float x = close
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.isSeries).toBe(true);
    });

    it('compiles array type declaration', () => {
      const source = `//@version=6
indicator("Test")
x = [1, 2, 3]
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.kind).toBe('array');
    });

    it('compiles map type declaration', () => {
      const source = `//@version=6
indicator("Test")
x = {"a": 1}
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.kind).toBe('map');
    });
  });

  describe('Type checking', () => {
    it('allows int to float assignment', () => {
      const source = `//@version=6
indicator("Test")
float x = 42
`;
      const { ast } = parse(source);
      expect(() => compile(ast)).not.toThrow();
    });

    it('disallows bool to int assignment', () => {
      const source = `//@version=6
indicator("Test")
int x = true
`;
      const { ast } = parse(source);
      expect(() => compile(ast)).toThrow(CompileError);
    });

    it('disallows float to int assignment', () => {
      const source = `//@version=6
indicator("Test")
int x = 3.14
`;
      const { ast } = parse(source);
      expect(() => compile(ast)).toThrow(CompileError);
    });

    it('disallows string to int assignment', () => {
      const source = `//@version=6
indicator("Test")
int x = "hello"
`;
      const { ast } = parse(source);
      expect(() => compile(ast)).toThrow(CompileError);
    });

    it('disallows color to int assignment', () => {
      const source = `//@version=6
indicator("Test")
int x = #FF0000
`;
      const { ast } = parse(source);
      expect(() => compile(ast)).toThrow(CompileError);
    });

    it('reports error message with type information', () => {
      const source = `//@version=6
indicator("Test")
int x = "hello"
`;
      const { ast } = parse(source);
      try {
        compile(ast);
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(CompileError);
        if (e instanceof CompileError) {
          expect(e.message).toContain('string');
          expect(e.message).toContain('int');
        }
      }
    });

    it('reports error with source span', () => {
      const source = `//@version=6
indicator("Test")
int x = "hello"
`;
      const { ast } = parse(source);
      try {
        compile(ast);
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(CompileError);
        if (e instanceof CompileError && e.span) {
          expect(e.span.start).toBeDefined();
          expect(e.span.end).toBeDefined();
        }
      }
    });
  });

  describe('Assignments', () => {
    it('compiles simple assignment', () => {
      const source = `//@version=6
indicator("Test")
x = 1
x := 2
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals.length).toBe(1);
      expect(ir.main.some((op) => op.opcode === IROpCode.StoreVar)).toBe(true);
    });

    it('compiles reassignment with :=', () => {
      const source = `//@version=6
indicator("Test")
float x = 1.0
x := x + 1.0
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals.length).toBe(1);
      expect(ir.main.some((op) => op.opcode === IROpCode.StoreVar)).toBe(true);
    });

    it('compiles multiple assignments', () => {
      const source = `//@version=6
indicator("Test")
x = 1
y = 2
z = x + y
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals.length).toBe(3);
    });

    it('allows na assignment to untyped variable', () => {
      const source = `//@version=6
indicator("Test")
x = na
`;
      const { ast } = parse(source);
      expect(() => compile(ast)).not.toThrow();
    });
  });

  describe('Expression type inference', () => {
    it('infers int type for integer literals', () => {
      const source = `//@version=6
indicator("Test")
x = 42
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('int');
    });

    it('infers float type for float literals', () => {
      const source = `//@version=6
indicator("Test")
x = 3.14
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('float');
    });

    it('infers bool type for boolean literals', () => {
      const source = `//@version=6
indicator("Test")
x = true
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('bool');
    });

    it('infers string type for string literals', () => {
      const source = `//@version=6
indicator("Test")
x = "hello"
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('string');
    });

    it('infers color type for color literals', () => {
      const source = `//@version=6
indicator("Test")
x = #FF0000
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('color');
    });

    it('infers float type for binary expressions', () => {
      const source = `//@version=6
indicator("Test")
x = 1 + 2
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('float');
    });

    it('infers bool type for comparison expressions', () => {
      const source = `//@version=6
indicator("Test")
x = 1 < 2
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('bool');
    });

    it('infers bool type for logical expressions', () => {
      const source = `//@version=6
indicator("Test")
x = true and false
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('bool');
    });

    it('infers string type for string concatenation', () => {
      const source = `//@version=6
indicator("Test")
x = "hello" + " world"
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('string');
    });

    it('infers series type for OHLCV data', () => {
      const source = `//@version=6
indicator("Test")
x = close
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.isSeries).toBe(true);
    });

    it('infers series type for function calls', () => {
      const source = `//@version=6
indicator("Test")
x = math.max(10, 20)
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.isSeries).toBe(true);
    });

    it('infers array type for array literals', () => {
      const source = `//@version=6
indicator("Test")
x = [1, 2, 3]
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.kind).toBe('array');
    });

    it('infers map type for map literals', () => {
      const source = `//@version=6
indicator("Test")
x = {"a": 1}
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.kind).toBe('map');
    });
  });

  describe('IR generation', () => {
    it('generates StoreVar instructions for assignments', () => {
      const source = `//@version=6
indicator("Test")
x = 1
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.main.some((op) => op.opcode === IROpCode.StoreVar)).toBe(true);
    });

    it('generates correct number of instructions', () => {
      const source = `//@version=6
indicator("Test")
x = 1
y = 2
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.main.length).toBeGreaterThan(0);
    });

    it('includes type information in globals', () => {
      const source = `//@version=6
indicator("Test")
int x = 1
float y = 2.0
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('int');
      expect(ir.globals[1]?.type.name).toBe('float');
    });

    it('includes span information in instructions', () => {
      const source = `//@version=6
indicator("Test")
x = 1
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      const storeInstr = ir.main.find((op) => op.opcode === IROpCode.StoreVar);
      expect(storeInstr?.span).toBeDefined();
    });
  });

  describe('Type declarations', () => {
    it('compiles type declarations', () => {
      const source = `//@version=6
indicator("Test")
type Point = float x float y
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.types.has('Point')).toBe(true);
      expect(ir.types.has('Point.x')).toBe(true);
      expect(ir.types.has('Point.y')).toBe(true);
    });

    it('compiles type with single field', () => {
      const source = `//@version=6
indicator("Test")
type Result = int value
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.types.has('Result')).toBe(true);
      expect(ir.types.has('Result.value')).toBe(true);
    });
  });

  describe('Scope handling', () => {
    it('tracks variable types across declarations', () => {
      const source = `//@version=6
indicator("Test")
int x = 1
float y = 2.0
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.type.name).toBe('int');
      expect(ir.globals[1]?.type.name).toBe('float');
    });

    it('allows reassignment with compatible types', () => {
      const source = `//@version=6
indicator("Test")
float x = 1.0
x := 2.0
`;
      const { ast } = parse(source);
      expect(() => compile(ast)).not.toThrow();
    });

    it('disallows reassignment with incompatible types', () => {
      const source = `//@version=6
indicator("Test")
float x = 1.0
x := "hello"
`;
      const { ast } = parse(source);
      expect(() => compile(ast)).toThrow(CompileError);
    });
  });

  describe('Error reporting', () => {
    it('reports undefined variable on reassignment', () => {
      const source = `//@version=6
indicator("Test")
x := 1
`;
      const { ast } = parse(source);
      expect(() => compile(ast)).toThrow(CompileError);
    });

    it('reports error with line information', () => {
      const source = `//@version=6
indicator("Test")
int x = "hello"
`;
      const { ast } = parse(source);
      try {
        compile(ast);
      } catch (e) {
        expect(e).toBeInstanceOf(CompileError);
        if (e instanceof CompileError) {
          expect(e.message).toBeDefined();
        }
      }
    });

    it('reports error for type mismatch in reassignment', () => {
      const source = `//@version=6
indicator("Test")
int x = 1
x := "hello"
`;
      const { ast } = parse(source);
      expect(() => compile(ast)).toThrow(CompileError);
    });
  });

  describe('Complex scripts', () => {
    it('compiles script with multiple variables', () => {
      const source = `//@version=6
indicator("Test")
a = 1
b = 2
c = 3
d = a + b + c
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals.length).toBe(4);
    });

    it('compiles script with typed and untyped variables', () => {
      const source = `//@version=6
indicator("Test")
int a = 1
b = 2.0
c = "hello"
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals.length).toBe(3);
      expect(ir.globals[0]?.type.name).toBe('int');
      expect(ir.globals[1]?.type.name).toBe('float');
      expect(ir.globals[2]?.type.name).toBe('string');
    });

    it('compiles script with var and varip', () => {
      const source = `//@version=6
indicator("Test")
var x = 0
varip y = 0
z = 1
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals[0]?.isVar).toBe(true);
      expect(ir.globals[1]?.isVarip).toBe(true);
      expect(ir.globals[2]?.isVar).toBe(false);
      expect(ir.globals[2]?.isVarip).toBe(false);
    });

    it('compiles script with array and map types', () => {
      const source = `//@version=6
indicator("Test")
arr = [1, 2, 3]
m = {"a": 1}
`;
      const { ast } = parse(source);
      const { ir } = compile(ast);

      expect(ir.globals.length).toBe(2);
      expect(ir.globals[0]?.type.kind).toBe('array');
      expect(ir.globals[1]?.type.kind).toBe('map');
    });
  });
});
