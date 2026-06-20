import { ParseError } from '../../common/errors.js';
import {
  createLocation,
  spanBetween,
  type SourceLocation,
  type SourceSpan,
} from '../../common/source-location.js';

export enum TokenType {
  EOF = 'EOF',
  Identifier = 'Identifier',
  Number = 'Number',
  String = 'String',
  Color = 'Color',
  VersionComment = 'VersionComment',

  // Keywords
  Indicator = 'Indicator',
  Strategy = 'Strategy',
  Library = 'Library',
  Var = 'Var',
  Varip = 'Varip',
  If = 'If',
  Else = 'Else',
  For = 'For',
  While = 'While',
  Switch = 'Switch',
  Case = 'Case',
  Default = 'Default',
  True = 'True',
  False = 'False',
  Na = 'Na',
  And = 'And',
  Or = 'Or',
  Not = 'Not',
  Import = 'Import',
  Export = 'Export',
  Type = 'Type',
  Enum = 'Enum',
  Method = 'Method',
  Return = 'Return',
  Break = 'Break',
  Continue = 'Continue',
  To = 'To',
  By = 'By',

  // Type keywords
  Int = 'Int',
  Float = 'Float',
  Bool = 'Bool',
  StringType = 'StringType',
  ColorType = 'ColorType',
  Array = 'Array',
  Map = 'Map',
  Matrix = 'Matrix',
  Series = 'Series',

  // Operators
  Plus = 'Plus',
  Minus = 'Minus',
  Star = 'Star',
  Slash = 'Slash',
  Percent = 'Percent',
  Assign = 'Assign',
  ColonAssign = 'ColonAssign',
  Equal = 'Equal',
  NotEqual = 'NotEqual',
  Less = 'Less',
  Greater = 'Greater',
  LessEqual = 'LessEqual',
  GreaterEqual = 'GreaterEqual',
  Arrow = 'Arrow',
  Question = 'Question',
  Colon = 'Colon',

  // Punctuation
  LParen = 'LParen',
  RParen = 'RParen',
  LBracket = 'LBracket',
  RBracket = 'RBracket',
  LBrace = 'LBrace',
  RBrace = 'RBrace',
  Comma = 'Comma',
  Dot = 'Dot',
  Semicolon = 'Semicolon',
  Newline = 'Newline',
}

export interface Token {
  type: TokenType;
  lexeme: string;
  span: SourceSpan;
  value?: string | number | boolean;
}

const KEYWORDS: Record<string, TokenType> = {
  indicator: TokenType.Indicator,
  strategy: TokenType.Strategy,
  library: TokenType.Library,
  var: TokenType.Var,
  varip: TokenType.Varip,
  if: TokenType.If,
  else: TokenType.Else,
  for: TokenType.For,
  while: TokenType.While,
  switch: TokenType.Switch,
  case: TokenType.Case,
  default: TokenType.Default,
  true: TokenType.True,
  false: TokenType.False,
  na: TokenType.Na,
  and: TokenType.And,
  or: TokenType.Or,
  not: TokenType.Not,
  import: TokenType.Import,
  export: TokenType.Export,
  type: TokenType.Type,
  enum: TokenType.Enum,
  method: TokenType.Method,
  return: TokenType.Return,
  break: TokenType.Break,
  continue: TokenType.Continue,
  to: TokenType.To,
  by: TokenType.By,
  int: TokenType.Int,
  float: TokenType.Float,
  bool: TokenType.Bool,
  string: TokenType.StringType,
  color: TokenType.ColorType,
  array: TokenType.Array,
  map: TokenType.Map,
  matrix: TokenType.Matrix,
  series: TokenType.Series,
};

export class Tokenizer {
  private readonly source: string;
  private pos = 0;
  private line = 1;
  private column = 1;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespaceAndComments();

      if (this.isAtEnd()) {
        break;
      }

      const start = this.currentLocation();
      const token = this.scanToken(start);
      if (token.type !== TokenType.Newline) {
        tokens.push(token);
      }
    }

    const eofStart = this.currentLocation();
    tokens.push({
      type: TokenType.EOF,
      lexeme: '',
      span: spanBetween(eofStart, eofStart),
    });

    return tokens;
  }

  private scanToken(start: SourceLocation): Token {
    const char = this.advance();

    switch (char) {
      case '(':
        return this.makeToken(TokenType.LParen, '(', start);
      case ')':
        return this.makeToken(TokenType.RParen, ')', start);
      case '[':
        return this.makeToken(TokenType.LBracket, '[', start);
      case ']':
        return this.makeToken(TokenType.RBracket, ']', start);
      case '{':
        return this.makeToken(TokenType.LBrace, '{', start);
      case '}':
        return this.makeToken(TokenType.RBrace, '}', start);
      case ',':
        return this.makeToken(TokenType.Comma, ',', start);
      case '.':
        return this.makeToken(TokenType.Dot, '.', start);
      case ';':
        return this.makeToken(TokenType.Semicolon, ';', start);
      case '+':
        return this.makeToken(TokenType.Plus, '+', start);
      case '-':
        return this.makeToken(TokenType.Minus, '-', start);
      case '*':
        return this.makeToken(TokenType.Star, '*', start);
      case '/':
        return this.makeToken(TokenType.Slash, '/', start);
      case '%':
        return this.makeToken(TokenType.Percent, '%', start);
      case '?':
        return this.makeToken(TokenType.Question, '?', start);
      case ':':
        if (this.match('=')) {
          return this.makeToken(TokenType.ColonAssign, ':=', start);
        }
        return this.makeToken(TokenType.Colon, ':', start);
      case '=':
        if (this.match('=')) {
          return this.makeToken(TokenType.Equal, '==', start);
        }
        return this.makeToken(TokenType.Assign, '=', start);
      case '!':
        if (this.match('=')) {
          return this.makeToken(TokenType.NotEqual, '!=', start);
        }
        throw this.error('Unexpected character "!"', start);
      case '<':
        if (this.match('=')) {
          return this.makeToken(TokenType.LessEqual, '<=', start);
        }
        return this.makeToken(TokenType.Less, '<', start);
      case '>':
        if (this.match('=')) {
          return this.makeToken(TokenType.GreaterEqual, '>=', start);
        }
        if (this.match('-')) {
          if (this.match('>')) {
            return this.makeToken(TokenType.Arrow, '=>', start);
          }
          throw this.error('Expected "=>" after ">-', start);
        }
        return this.makeToken(TokenType.Greater, '>', start);
      case '"':
        return this.scanString('"', start);
      case "'":
        return this.scanString("'", start);
      case '#':
        return this.scanColor(start);
      case '\n':
        return this.makeToken(TokenType.Newline, '\n', start);
      default:
        if (this.isDigit(char)) {
          return this.scanNumber(start);
        }
        if (this.isAlpha(char) || char === '_') {
          return this.scanIdentifier(start);
        }
        throw this.error(`Unexpected character "${char}"`, start);
    }
  }

  private scanIdentifier(start: SourceLocation): Token {
    while (this.isAlphaNumeric(this.peek()) || this.peek() === '_') {
      this.advance();
    }

    const lexeme = this.source.slice(start.offset, this.pos);
    const type = KEYWORDS[lexeme] ?? TokenType.Identifier;

    return this.makeToken(type, lexeme, start);
  }

  private scanNumber(start: SourceLocation): Token {
    while (this.isDigit(this.peek())) {
      this.advance();
    }

    let isFloat = false;
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      isFloat = true;
      this.advance();
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    const lexeme = this.source.slice(start.offset, this.pos);
    return {
      type: TokenType.Number,
      lexeme,
      span: spanBetween(start, this.currentLocation()),
      value: isFloat ? parseFloat(lexeme) : parseInt(lexeme, 10),
    };
  }

  private scanString(quote: string, start: SourceLocation): Token {
    let value = '';

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\n') {
        throw this.error('Unterminated string literal', start);
      }
      if (this.peek() === '\\') {
        this.advance();
        if (this.isAtEnd()) {
          throw this.error('Unterminated escape sequence', start);
        }
        value += this.advance();
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw this.error('Unterminated string literal', start);
    }

    this.advance();
    return {
      type: TokenType.String,
      lexeme: this.source.slice(start.offset, this.pos),
      span: spanBetween(start, this.currentLocation()),
      value,
    };
  }

  private scanColor(start: SourceLocation): Token {
    while (this.isHexDigit(this.peek())) {
      this.advance();
    }

    const lexeme = this.source.slice(start.offset, this.pos);
    if (lexeme.length !== 4 && lexeme.length !== 7 && lexeme.length !== 9) {
      throw this.error(`Invalid color literal "${lexeme}"`, start);
    }

    return {
      type: TokenType.Color,
      lexeme,
      span: spanBetween(start, this.currentLocation()),
      value: lexeme,
    };
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();

      if (char === ' ' || char === '\t' || char === '\r') {
        this.advance();
        continue;
      }

      if (char === '/' && this.peekNext() === '/') {
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
        continue;
      }

      break;
    }
  }

  private makeToken(type: TokenType, lexeme: string, start: SourceLocation): Token {
    return {
      type,
      lexeme,
      span: spanBetween(start, this.currentLocation()),
    };
  }

  private advance(): string {
    const char = this.source[this.pos]!;
    this.pos++;
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private match(expected: string): boolean {
    if (this.isAtEnd() || this.source[this.pos] !== expected) {
      return false;
    }
    this.advance();
    return true;
  }

  private peek(): string {
    return this.isAtEnd() ? '\0' : this.source[this.pos]!;
  }

  private peekNext(): string {
    return this.pos + 1 >= this.source.length ? '\0' : this.source[this.pos + 1]!;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private currentLocation(): SourceLocation {
    return createLocation(this.line, this.column, this.pos);
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isHexDigit(char: string): boolean {
    return this.isDigit(char) || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F');
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }

  private error(message: string, start: SourceLocation): ParseError {
    return new ParseError(message, spanBetween(start, this.currentLocation()));
  }
}

export function extractVersion(source: string): number | null {
  const match = source.match(/^\s*\/\/\s*@version\s*=\s*(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}
