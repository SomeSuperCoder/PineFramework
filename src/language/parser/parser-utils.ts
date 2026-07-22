import { ParseError } from '../../common/errors.js';
import { spanBetween, type SourceSpan } from '../../common/source-location.js';
import type {
  ExpressionNode,
  StatementNode,
  TypeAnnotationNode,
  TypeFieldNode,
} from './ast/nodes.js';
import { Token, TokenType } from './tokenizer.js';

/**
 * Base class providing shared parser state and utility methods.
 * Extended by ExpressionParser → StatementParser → Parser.
 */
export class ParserBase {
  protected tokens: Token[] = [];
  protected current = 0;
  protected callIdCounter = 0;
  protected userTypes: Set<string> = new Set();

  // ==========================================================================
  // Token stream utilities
  // ==========================================================================

  protected match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  protected check(type: TokenType): boolean {
    if (this.isAtEnd()) {
      return false;
    }
    return this.peek().type === type;
  }

  protected checkNext(type: TokenType): boolean {
    if (this.current + 1 >= this.tokens.length) {
      return false;
    }
    return this.tokens[this.current + 1]!.type === type;
  }

  protected advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.previous();
  }

  protected isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  protected peek(): Token {
    return this.tokens[this.current]!;
  }

  protected previous(): Token {
    return this.tokens[this.current - 1]!;
  }

  protected consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw this.error(message);
  }

  protected error(message: string): ParseError {
    return new ParseError(message, this.peek().span);
  }

  // ==========================================================================
  // Type-related helpers
  // ==========================================================================

  protected checkTypeKeyword(): boolean {
    return (
      this.check(TokenType.Series) ||
      this.check(TokenType.Simple) ||
      this.check(TokenType.Int) ||
      this.check(TokenType.Float) ||
      this.check(TokenType.Bool) ||
      this.check(TokenType.StringType) ||
      this.check(TokenType.ColorType) ||
      this.check(TokenType.Array) ||
      this.check(TokenType.Map) ||
      this.check(TokenType.Matrix)
    );
  }

  protected checkNextTypeKeyword(): boolean {
    if (this.current + 1 >= this.tokens.length) return false;
    const type = this.tokens[this.current + 1]!.type;
    return [
      TokenType.Series,
      TokenType.Int,
      TokenType.Float,
      TokenType.Bool,
      TokenType.StringType,
      TokenType.ColorType,
      TokenType.Array,
      TokenType.Map,
      TokenType.Matrix,
    ].includes(type);
  }

  protected looksLikeUserType(): boolean {
    if (!this.check(TokenType.Identifier)) return false;
    const saved = this.current;
    const firstLexeme = this.peek().lexeme;
    this.advance();
    const isArrayType = this.check(TokenType.LBracket) && this.checkNext(TokenType.RBracket);
    const isSingleType = this.check(TokenType.Identifier);
    this.current = saved;
    // User types in Pine Script follow PascalCase (e.g. MyType)
    // Lowercase identifiers like "f2" are not valid type names
    if (isSingleType && !/^[A-Z]/.test(firstLexeme)) {
      return false;
    }
    return isArrayType || isSingleType;
  }

  protected looksLikeUserTypeDecl(): boolean {
    if (!this.check(TokenType.Identifier)) return false;
    const saved = this.current;
    this.advance();
    const isArrayType = this.check(TokenType.LBracket) && this.checkNext(TokenType.RBracket);
    const isSingleType = this.check(TokenType.Identifier);
    this.current = saved;
    return isArrayType || isSingleType;
  }

  protected consumeTypeKeyword(): Token {
    const typeTokens = [
      TokenType.Int,
      TokenType.Float,
      TokenType.Bool,
      TokenType.StringType,
      TokenType.ColorType,
      TokenType.Array,
      TokenType.Map,
      TokenType.Matrix,
      TokenType.Identifier,
    ];

    for (const type of typeTokens) {
      if (this.match(type)) {
        return this.previous();
      }
    }

    throw this.error('Expected type name');
  }

  // ==========================================================================
  // Node factories
  // ==========================================================================

  protected makeBinary(
    left: ExpressionNode,
    operator: string,
    right: ExpressionNode,
  ) {
    return {
      kind: 'BinaryExpression' as const,
      span: spanBetween(left.span.start, right.span.end),
      operator,
      left,
      right,
    };
  }

  protected makeBoolean(value: boolean) {
    const token = this.previous();
    return {
      kind: 'BooleanLiteral' as const,
      span: token.span,
      value,
    };
  }

  // ==========================================================================
  // Type annotation parsing (needed by both expression & statement methods)
  // ==========================================================================

  protected parseTypeAnnotation(): TypeAnnotationNode {
    const start = this.peek().span.start;
    let isSeries = false;

    if (this.match(TokenType.Series)) {
      isSeries = true;
    } else if (this.match(TokenType.Simple)) {
      // simple qualifier: same value on all bars (not series)
    }

    const typeToken = this.consumeTypeKeyword();
    let isArray = false;
    const isMap = false;
    const typeArguments: TypeAnnotationNode[] = [];

    // Handle generic type arguments with either [] or <>
    const isGenericStart = this.check(TokenType.LBracket) || this.check(TokenType.Less);
    if (isGenericStart) {
      const isBracket = this.check(TokenType.LBracket);
      if (isBracket)
        this.advance(); // consume [
      else this.advance(); // consume <

      if (typeToken.type === TokenType.Array || typeToken.type === TokenType.Map) {
        // Parse comma-separated type arguments
        while (!this.isAtEnd() && !this.check(isBracket ? TokenType.RBracket : TokenType.Greater)) {
          const arg = this.parseTypeAnnotation();
          typeArguments.push(arg);
          if (!this.match(TokenType.Comma)) break;
        }
        this.consume(
          isBracket ? TokenType.RBracket : TokenType.Greater,
          `Expected "${isBracket ? ']' : '>'}" after type argument`,
        );
      } else {
        // Simple array type like int[]
        isArray = true;
        this.consume(
          isBracket ? TokenType.RBracket : TokenType.Greater,
          `Expected "${isBracket ? ']' : '>'}" after array type`,
        );
      }
    }

    return {
      kind: 'TypeAnnotation',
      span: spanBetween(start, this.previous().span.end),
      name: typeToken.lexeme,
      typeArguments: typeArguments.length > 0 ? typeArguments : undefined,
      isSeries,
      isArray,
      isMap,
    };
  }

  // ==========================================================================
  // Block / statement-boundary helpers (needed by expression methods too)
  // ==========================================================================

  protected isBlockContinuation(): boolean {
    if (this.isAtEnd()) {
      return false;
    }
    const type = this.peek().type;
    return (
      type !== TokenType.Else &&
      type !== TokenType.Case &&
      type !== TokenType.Default &&
      type !== TokenType.EOF
    );
  }

  protected isStatementStart(): boolean {
    const type = this.peek().type;
    return (
      type === TokenType.Var ||
      type === TokenType.Varip ||
      type === TokenType.Const ||
      type === TokenType.If ||
      type === TokenType.For ||
      type === TokenType.While ||
      type === TokenType.Switch ||
      type === TokenType.Type ||
      type === TokenType.Return ||
      type === TokenType.Break ||
      type === TokenType.Continue ||
      type === TokenType.Method ||
      type === TokenType.Identifier
    );
  }

  protected isTopLevelStatement(): boolean {
    const type = this.peek().type;
    return (
      type === TokenType.Indicator ||
      type === TokenType.Strategy ||
      type === TokenType.Library ||
      type === TokenType.Var ||
      type === TokenType.Varip ||
      type === TokenType.Const ||
      type === TokenType.If ||
      type === TokenType.For ||
      type === TokenType.While ||
      type === TokenType.Switch ||
      type === TokenType.Type ||
      type === TokenType.EOF
    );
  }

  protected parseIndentedBlock(): StatementNode[] {
    const statements: StatementNode[] = [];

    if (this.isAtEnd() || !this.isBlockContinuation()) {
      return statements;
    }

    const blockColumn = this.peek().span.start.column;

    while (!this.isAtEnd() && this.isBlockContinuation()) {
      if (statements.length > 0 && this.peek().span.start.column < blockColumn) {
        break;
      }
      statements.push(this.parseStatement());
      // Pine Script allows comma-separated statements on the same line
      // e.g., "loc1=0.0, loc2=0.0, loc3=0.0, loc4=0.0, xx=0"
      // Consume the comma and continue parsing the next statement
      if (this.check(TokenType.Comma)) {
        this.advance();
      }
    }

    return statements;
  }

  /**
   * Placeholder — overridden by StatementParser.
   * Expression-only paths (e.g. finishFunctionExpr) need parseIndentedBlock
   * but also parseStatement (via parseIndentedBlock → this.parseStatement()).
   * StatementParser provides the real implementation.
   */
  protected parseStatement(): StatementNode {
    throw new Error('parseStatement not available — use StatementParser');
  }
}
