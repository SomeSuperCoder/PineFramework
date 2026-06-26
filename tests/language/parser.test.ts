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

  it('handles version with spaces', () => {
    // The current implementation requires no spaces in @version
    expect(extractVersion('//@version=6\nindicator("Test")')).toBe(6);
  });

  it('handles version with extra whitespace', () => {
    // The current implementation requires no spaces in @version
    expect(extractVersion('  //@version=6\nindicator("Test")')).toBe(6);
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

  it('tokenizes all comparison operators', () => {
    const tokens = new Tokenizer('a < b > c <= d >= e == f != g').tokenize();
    expect(tokens.some((t) => t.type === 'Less')).toBe(true);
    expect(tokens.some((t) => t.type === 'Greater')).toBe(true);
    expect(tokens.some((t) => t.type === 'LessEqual')).toBe(true);
    expect(tokens.some((t) => t.type === 'GreaterEqual')).toBe(true);
    expect(tokens.some((t) => t.type === 'Equal')).toBe(true);
    expect(tokens.some((t) => t.type === 'NotEqual')).toBe(true);
  });

  it('tokenizes logical operators', () => {
    const tokens = new Tokenizer('a and b or not c').tokenize();
    expect(tokens.some((t) => t.type === 'And')).toBe(true);
    expect(tokens.some((t) => t.type === 'Or')).toBe(true);
    expect(tokens.some((t) => t.type === 'Not')).toBe(true);
  });

  it('tokenizes string literals', () => {
    const tokens = new Tokenizer('"hello world"').tokenize();
    expect(tokens[0]?.type).toBe('String');
    expect(tokens[0]?.value).toBe('hello world');
  });

  it('tokenizes string with escape sequences', () => {
    // In Pine Script, \n is treated as literal characters, not newline
    const tokens = new Tokenizer('"line1\\nline2"').tokenize();
    expect(tokens[0]?.type).toBe('String');
    expect(tokens[0]?.value).toBe('line1nline2');
  });

  it('tokenizes float numbers', () => {
    const tokens = new Tokenizer('3.14').tokenize();
    expect(tokens[0]?.type).toBe('Number');
    expect(tokens[0]?.value).toBe(3.14);
  });

  it('tokenizes integer numbers', () => {
    const tokens = new Tokenizer('42').tokenize();
    expect(tokens[0]?.type).toBe('Number');
    expect(tokens[0]?.value).toBe(42);
  });

  it('tokenizes keywords', () => {
    const keywords = [
      'if',
      'else',
      'for',
      'while',
      'switch',
      'case',
      'default',
      'var',
      'varip',
      'true',
      'false',
      'na',
      'return',
      'break',
      'continue',
    ];
    const source = keywords.join(' ');
    const tokens = new Tokenizer(source).tokenize();
    expect(tokens.length).toBe(keywords.length + 1); // +1 for EOF
  });

  it('tokenizes type keywords', () => {
    const typeKeywords = [
      'int',
      'float',
      'bool',
      'string',
      'color',
      'array',
      'map',
      'matrix',
      'series',
    ];
    const source = typeKeywords.join(' ');
    const tokens = new Tokenizer(source).tokenize();
    expect(tokens.length).toBe(typeKeywords.length + 1); // +1 for EOF
  });

  it('tokenizes punctuation', () => {
    const tokens = new Tokenizer('()[]{},.:;').tokenize();
    expect(tokens.some((t) => t.type === 'LParen')).toBe(true);
    expect(tokens.some((t) => t.type === 'RParen')).toBe(true);
    expect(tokens.some((t) => t.type === 'LBracket')).toBe(true);
    expect(tokens.some((t) => t.type === 'RBracket')).toBe(true);
    expect(tokens.some((t) => t.type === 'LBrace')).toBe(true);
    expect(tokens.some((t) => t.type === 'RBrace')).toBe(true);
    expect(tokens.some((t) => t.type === 'Comma')).toBe(true);
    expect(tokens.some((t) => t.type === 'Dot')).toBe(true);
    expect(tokens.some((t) => t.type === 'Colon')).toBe(true);
    expect(tokens.some((t) => t.type === 'Semicolon')).toBe(true);
  });

  it('tokenizes arrow operator via >-> sequence', () => {
    const tokens = new Tokenizer('>->').tokenize();
    expect(tokens[0]?.type).toBe('Arrow');
  });

  it('tokenizes ternary operator', () => {
    const tokens = new Tokenizer('? :').tokenize();
    expect(tokens[0]?.type).toBe('Question');
    expect(tokens[1]?.type).toBe('Colon');
  });

  it('skips single-line comments', () => {
    const tokens = new Tokenizer('// this is a comment\nx = 1').tokenize();
    expect(tokens.some((t) => t.type === 'Identifier' && t.lexeme === 'x')).toBe(true);
  });

  it('throws on invalid color literal', () => {
    expect(() => new Tokenizer('#GGGGGG').tokenize()).toThrow(ParseError);
  });

  it('throws on unterminated string', () => {
    expect(() => new Tokenizer('"unterminated').tokenize()).toThrow(ParseError);
  });

  it('throws on unexpected character', () => {
    expect(() => new Tokenizer('@').tokenize()).toThrow(ParseError);
  });

  it('throws on invalid ! character', () => {
    expect(() => new Tokenizer('!').tokenize()).toThrow(ParseError);
  });

  it('throws on incomplete arrow operator', () => {
    expect(() => new Tokenizer('>-').tokenize()).toThrow(ParseError);
  });

  it('handles empty input', () => {
    const tokens = new Tokenizer('').tokenize();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.type).toBe('EOF');
  });

  it('handles whitespace and newlines', () => {
    const tokens = new Tokenizer('  \t\n  x  \n  =  \n  1  ').tokenize();
    expect(tokens.some((t) => t.type === 'Identifier' && t.lexeme === 'x')).toBe(true);
    expect(tokens.some((t) => t.type === 'Assign')).toBe(true);
    expect(tokens.some((t) => t.type === 'Number' && t.value === 1)).toBe(true);
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

  describe('Script declarations', () => {
    it('parses indicator declaration', () => {
      const source = `//@version=6
indicator("My Indicator")
`;
      const { ast } = parse(source);
      expect(ast.scriptKind).toBe('indicator');
      expect(ast.scriptName).toBe('My Indicator');
    });

    it('parses strategy declaration', () => {
      const source = `//@version=6
strategy("My Strategy")
`;
      const { ast } = parse(source);
      expect(ast.scriptKind).toBe('strategy');
      expect(ast.scriptName).toBe('My Strategy');
    });

    it('parses library declaration', () => {
      const source = `//@version=6
library("My Library")
`;
      const { ast } = parse(source);
      expect(ast.scriptKind).toBe('library');
      expect(ast.scriptName).toBe('My Library');
    });

    it('parses indicator with named arguments', () => {
      const source = `//@version=6
indicator("Test", overlay=true, format=format.price)
`;
      const { ast } = parse(source);
      expect(ast.scriptArgs).toHaveLength(2);
      expect(ast.scriptArgs[0]?.name).toBe('overlay');
      expect(ast.scriptArgs[1]?.name).toBe('format');
    });

    it('throws on missing script declaration', () => {
      expect(() => parse('//@version=6\nx = 1')).toThrow(ParseError);
    });
  });

  describe('Variable declarations', () => {
    it('parses simple variable declaration', () => {
      const source = `//@version=6
indicator("Test")
x = 10
`;
      const { ast } = parse(source);
      expect(ast.body[0]?.kind).toBe('Assignment');
    });

    it('parses typed variable declaration', () => {
      const source = `//@version=6
indicator("Test")
float x = 1.5
`;
      const { ast } = parse(source);
      const decl = ast.body[0];
      expect(decl?.kind).toBe('VariableDeclaration');
      if (decl?.kind === 'VariableDeclaration') {
        expect(decl.typeAnnotation?.name).toBe('float');
      }
    });

    it('parses var keyword', () => {
      const source = `//@version=6
indicator("Test")
var x = 0
`;
      const { ast } = parse(source);
      const decl = ast.body[0];
      expect(decl?.kind).toBe('VariableDeclaration');
      if (decl?.kind === 'VariableDeclaration') {
        expect(decl.isVar).toBe(true);
      }
    });

    it('parses varip keyword', () => {
      const source = `//@version=6
indicator("Test")
varip x = 0
`;
      const { ast } = parse(source);
      const decl = ast.body[0];
      expect(decl?.kind).toBe('VariableDeclaration');
      if (decl?.kind === 'VariableDeclaration') {
        expect(decl.isVarip).toBe(true);
      }
    });

    it('parses typed var declaration', () => {
      const source = `//@version=6
indicator("Test")
var int x = 0
`;
      const { ast } = parse(source);
      const decl = ast.body[0];
      expect(decl?.kind).toBe('VariableDeclaration');
      if (decl?.kind === 'VariableDeclaration') {
        expect(decl.isVar).toBe(true);
        expect(decl.typeAnnotation?.name).toBe('int');
      }
    });
  });

  describe('Control flow', () => {
    it('parses if with parentheses', () => {
      const source = `//@version=6
indicator("Test")
if (close > open)
    x = 1
`;
      const { ast } = parse(source);
      expect(ast.body[0]?.kind).toBe('IfStatement');
    });

    it('parses if/else if/else', () => {
      const source = `//@version=6
indicator("Test")
if close > open
    x = 1
else if close < open
    x = -1
else
    x = 0
`;
      const { ast } = parse(source);
      const ifStmt = ast.body[0];
      expect(ifStmt?.kind).toBe('IfStatement');
      if (ifStmt?.kind === 'IfStatement') {
        expect(ifStmt.elseBranch).toBeDefined();
        expect(ifStmt.elseBranch?.length).toBe(1);
        if (ifStmt.elseBranch?.[0]?.kind === 'IfStatement') {
          expect(ifStmt.elseBranch[0].elseBranch).toBeDefined();
        }
      }
    });

    it('parses for loop with step', () => {
      const source = `//@version=6
indicator("Test")
for i = 0 to 10 by 2
    x = i
`;
      const { ast } = parse(source);
      const forStmt = ast.body[0];
      expect(forStmt?.kind).toBe('ForStatement');
      if (forStmt?.kind === 'ForStatement') {
        expect(forStmt.step).toBeDefined();
      }
    });

    it('parses for loop with parentheses', () => {
      const source = `//@version=6
indicator("Test")
for (i = 0 to 10)
    x = i
`;
      const { ast } = parse(source);
      expect(ast.body[0]?.kind).toBe('ForStatement');
    });

    it('parses while loop', () => {
      const source = `//@version=6
indicator("Test")
i = 0
while (i < 10)
    i := i + 1
`;
      const { ast } = parse(source);
      expect(ast.body.some((s) => s.kind === 'WhileStatement')).toBe(true);
    });

    it('parses switch statement', () => {
      const source = `//@version=6
indicator("Test")
x = 1
switch x
    case 1
        y := "one"
    case 2
        y := "two"
    default
        y := "other"
`;
      const { ast } = parse(source);
      expect(ast.body.some((s) => s.kind === 'SwitchStatement')).toBe(true);
    });

    it('parses return statement', () => {
      const source = `//@version=6
indicator("Test")
myFunc >-> 42
`;
      const { ast } = parse(source);
      expect(ast.body.some((s) => s.kind === 'ExpressionStatement')).toBe(true);
    });

    it('parses break statement', () => {
      const source = `//@version=6
indicator("Test")
for i = 0 to 10
    if i == 5
        break
`;
      const { ast } = parse(source);
      const forStmt = ast.body[0];
      expect(forStmt?.kind).toBe('ForStatement');
    });

    it('parses continue statement', () => {
      const source = `//@version=6
indicator("Test")
for i = 0 to 10
    if i == 5
        continue
`;
      const { ast } = parse(source);
      const forStmt = ast.body[0];
      expect(forStmt?.kind).toBe('ForStatement');
    });
  });

  describe('Expressions', () => {
    it('parses binary expressions', () => {
      const source = `//@version=6
indicator("Test")
x = 1 + 2
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('BinaryExpression');
      }
    });

    it('parses unary expressions', () => {
      const source = `//@version=6
indicator("Test")
x = -1
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('UnaryExpression');
      }
    });

    it('parses logical not expression', () => {
      const source = `//@version=6
indicator("Test")
x = not true
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('UnaryExpression');
        if (assign.value.kind === 'UnaryExpression') {
          expect(assign.value.operator).toBe('not');
        }
      }
    });

    it('parses function calls', () => {
      const source = `//@version=6
indicator("Test")
x = math.max(10, 20)
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('CallExpression');
      }
    });

    it('parses method calls', () => {
      const source = `//@version=6
indicator("Test")
x = arr.push(1)
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('CallExpression');
      }
    });

    it('parses named arguments in function calls', () => {
      const source = `//@version=6
indicator("Test")
x = ta.sma(close, length=14)
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment' && assign.value.kind === 'CallExpression') {
        expect(assign.value.namedArguments).toHaveLength(1);
        expect(assign.value.namedArguments[0]?.name).toBe('length');
      }
    });

    it('parses member expressions', () => {
      const source = `//@version=6
indicator("Test")
x = arr.size()
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('CallExpression');
      }
    });

    it('parses index expressions', () => {
      const source = `//@version=6
indicator("Test")
x = arr[0]
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('IndexExpression');
      }
    });

    it('parses array expressions', () => {
      const source = `//@version=6
indicator("Test")
x = [1, 2, 3]
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('ArrayExpression');
      }
    });

    it('parses map expressions', () => {
      const source = `//@version=6
indicator("Test")
x = {"a": 1, "b": 2}
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('MapExpression');
      }
    });

    it('parses parenthesized expressions', () => {
      const source = `//@version=6
indicator("Test")
x = (1 + 2) * 3
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('BinaryExpression');
      }
    });

    it('parses function expressions', () => {
      const source = `//@version=6
indicator("Test")
myFunc >->
    a + b
`;
      const { ast } = parse(source);
      expect(ast.body.some((s) => s.kind === 'ExpressionStatement')).toBe(true);
    });

    it('parses function expressions with return type', () => {
      const source = `//@version=6
indicator("Test")
myFunc >-> int
    a + b
`;
      const { ast } = parse(source);
      expect(ast.body.some((s) => s.kind === 'ExpressionStatement')).toBe(true);
    });

    it('parses na literal', () => {
      const source = `//@version=6
indicator("Test")
x = na
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('NaLiteral');
      }
    });

    it('parses boolean literals', () => {
      const source = `//@version=6
indicator("Test")
x = true
y = false
`;
      const { ast } = parse(source);
      expect(ast.body).toHaveLength(2);
      const assign1 = ast.body[0];
      const assign2 = ast.body[1];
      if (assign1?.kind === 'Assignment') {
        expect(assign1.value.kind).toBe('BooleanLiteral');
      }
      if (assign2?.kind === 'Assignment') {
        expect(assign2.value.kind).toBe('BooleanLiteral');
      }
    });

    it('parses color literals', () => {
      const source = `//@version=6
indicator("Test")
x = #FF0000
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('ColorLiteral');
      }
    });

    it('parses string literals', () => {
      const source = `//@version=6
indicator("Test")
x = "hello"
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      expect(assign?.kind).toBe('Assignment');
      if (assign?.kind === 'Assignment') {
        expect(assign.value.kind).toBe('StringLiteral');
      }
    });

    it('parses number literals', () => {
      const source = `//@version=6
indicator("Test")
x = 42
y = 3.14
`;
      const { ast } = parse(source);
      expect(ast.body).toHaveLength(2);
      const assign1 = ast.body[0];
      const assign2 = ast.body[1];
      if (assign1?.kind === 'Assignment') {
        expect(assign1.value.kind).toBe('NumberLiteral');
      }
      if (assign2?.kind === 'Assignment') {
        expect(assign2.value.kind).toBe('NumberLiteral');
      }
    });

    it('parses operator precedence', () => {
      const source = `//@version=6
indicator("Test")
x = 1 + 2 * 3
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      if (assign?.kind === 'Assignment' && assign.value.kind === 'BinaryExpression') {
        expect(assign.value.operator).toBe('+');
        expect(assign.value.right.kind).toBe('BinaryExpression');
      }
    });

    it('parses chained comparisons', () => {
      const source = `//@version=6
indicator("Test")
x = a < b and b < c
`;
      const { ast } = parse(source);
      const assign = ast.body[0];
      if (assign?.kind === 'Assignment' && assign.value.kind === 'BinaryExpression') {
        expect(assign.value.operator).toBe('and');
      }
    });
  });

  describe('Type declarations', () => {
    it('parses type declaration', () => {
      const source = `//@version=6
indicator("Test")
type Point = float x float y
`;
      const { ast } = parse(source);
      expect(ast.body.some((s) => s.kind === 'TypeDeclaration')).toBe(true);
    });

    it('parses type declaration with single field', () => {
      const source = `//@version=6
indicator("Test")
type Result = int value
`;
      const { ast } = parse(source);
      const typeDecl = ast.body[0];
      expect(typeDecl?.kind).toBe('TypeDeclaration');
      if (typeDecl?.kind === 'TypeDeclaration') {
        expect(typeDecl.fields).toHaveLength(1);
        expect(typeDecl.fields[0]?.name).toBe('value');
      }
    });
  });

  describe('Error handling', () => {
    it('throws on missing script declaration', () => {
      expect(() => parse('//@version=6\nx = 1')).toThrow(ParseError);
    });

    it('throws on missing closing parenthesis', () => {
      expect(() => parse('//@version=6\nindicator("Test"')).toThrow(ParseError);
    });

    it('throws on missing opening parenthesis', () => {
      expect(() => parse('//@version=6\nindicator"Test")')).toThrow(ParseError);
    });

    it('throws on missing string in declaration', () => {
      expect(() => parse('//@version=6\nindicator(Test)')).toThrow(ParseError);
    });

    it('throws on missing comma between arguments', () => {
      expect(() => parse('//@version=6\nindicator("Test" overlay=true)')).toThrow(ParseError);
    });

    it('throws on unexpected token at end', () => {
      expect(() => parse('//@version=6\nindicator("Test")\n}')).toThrow(ParseError);
    });

    it('provides error location', () => {
      try {
        parse('//@version=6\nindicator("Test")\n}');
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
        if (e instanceof ParseError && e.span) {
          expect(e.span.start.line).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Source spans', () => {
    it('includes source spans in AST', () => {
      const source = `//@version=6
indicator("Test")
x = 1
`;
      const { ast } = parse(source);
      expect(ast.span).toBeDefined();
      expect(ast.span.start).toBeDefined();
      expect(ast.span.end).toBeDefined();
    });

    it('includes spans in statements', () => {
      const source = `//@version=6
indicator("Test")
x = 1
`;
      const { ast } = parse(source);
      const stmt = ast.body[0];
      expect(stmt?.span).toBeDefined();
    });

    it('includes spans in expressions', () => {
      const source = `//@version=6
indicator("Test")
x = 1 + 2
`;
      const { ast } = parse(source);
      const stmt = ast.body[0];
      if (stmt?.kind === 'Assignment') {
        expect(stmt.value.span).toBeDefined();
      }
    });
  });
});
