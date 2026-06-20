import { parse, Tokenizer, extractVersion } from '../../src/language/parser/index.js';
import { ParseError } from '../../src/common/errors.js';

const SIMPLE_INDICATOR = `//@version=6
indicator("Simple MA", overlay=true)
length = input.int(14, "Length")
src = close
plot(ta.sma(src, length))
`;

describe('extractVersion', () => {
  it('extracts version from source', () => {
    expect(extractVersion('//@version=6\nindicator("Test")')).toBe(6);
  });

  it('returns null when version is missing', () => {
    expect(extractVersion('indicator("Test")')).toBeNull();
  });
});

describe('Tokenizer', () => {
  it('tokenizes identifiers and operators', () => {
    const tokens = new Tokenizer('a = b + 1').tokenize();
    const types = tokens.map((t) => t.type);
    expect(types).toContain('Identifier');
    expect(types).toContain('Assign');
    expect(types).toContain('Plus');
    expect(types).toContain('Number');
    expect(types).toContain('EOF');
  });

  it('tokenizes color literals', () => {
    const tokens = new Tokenizer('#FF0000').tokenize();
    expect(tokens[0]?.type).toBe('Color');
    expect(tokens[0]?.value).toBe('#FF0000');
  });

  it('tokenizes := reassignment operator', () => {
    const tokens = new Tokenizer('x := 1').tokenize();
    expect(tokens.some((t) => t.type === 'ColonAssign')).toBe(true);
  });
});

describe('Parser', () => {
  it('parses a simple indicator script', () => {
    const { ast } = parse(SIMPLE_INDICATOR);

    expect(ast.version).toBe(6);
    expect(ast.scriptKind).toBe('indicator');
    expect(ast.scriptName).toBe('Simple MA');
    expect(ast.body.length).toBeGreaterThan(0);
  });

  it('parses variable declarations and assignments', () => {
    const source = `//@version=6
indicator("Test")
x = 1
y := x + 2
`;
    const { ast } = parse(source);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0]?.kind).toBe('Assignment');
    expect(ast.body[1]?.kind).toBe('Assignment');
  });

  it('parses if/else statements', () => {
    const source = `//@version=6
indicator("Test")
if close > open
    x = 1
else
    x = 0
`;
    const { ast } = parse(source);
    const ifStmt = ast.body[0];
    expect(ifStmt?.kind).toBe('IfStatement');
  });

  it('parses ternary expressions', () => {
    const source = `//@version=6
indicator("Test")
x = close > open ? 1 : 0
`;
    const { ast } = parse(source);
    const decl = ast.body[0];
    expect(decl?.kind).toBe('Assignment');
    if (decl?.kind === 'Assignment') {
      expect(decl.value.kind).toBe('TernaryExpression');
    }
  });

  it('parses for loops', () => {
    const source = `//@version=6
indicator("Test")
sum = 0
for i = 0 to 10
    sum := sum + i
`;
    const { ast } = parse(source);
    expect(ast.body.some((s) => s.kind === 'ForStatement')).toBe(true);
  });

  it('throws on missing version', () => {
    expect(() => parse('indicator("Test")')).toThrow(ParseError);
  });

  it('throws on unsupported version', () => {
    expect(() => parse('//@version=5\nindicator("Test")')).toThrow(ParseError);
  });
});
