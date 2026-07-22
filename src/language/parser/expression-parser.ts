import { spanBetween, type SourceSpan } from '../../common/source-location.js';
import type {
  ArgumentNode,
  ArrayExpressionNode,
  BinaryExpressionNode,
  CallExpressionNode,
  ColorLiteralNode,
  ExpressionNode,
  FunctionExpressionNode,
  IdentifierNode,
  IndexExpressionNode,
  MapEntryNode,
  MapExpressionNode,
  MemberExpressionNode,
  NaLiteralNode,
  NumberLiteralNode,
  ParameterNode,
  ParenthesizedExpressionNode,
  StringLiteralNode,
  SwitchExpressionCaseNode,
  SwitchExpressionNode,
  TernaryExpressionNode,
  TypeAnnotationNode,
  UnaryExpressionNode,
} from './ast/nodes.js';
import { TokenType } from './tokenizer.js';
import { ParserBase } from './parser-utils.js';

/**
 * Expression-parsing layer. Extends ParserBase with all expression-level
 * parsing methods. Depends on parseIndentedBlock and parseStatement from
 * a higher layer (StatementParser) — these resolve via prototype chain
 * at runtime when the full Parser class is constructed.
 */
export class ExpressionParser extends ParserBase {
  // ==========================================================================
  // Expression entry point & precedence chain
  // ==========================================================================

  protected parseExpression(): ExpressionNode {
    return this.parseTernary();
  }

  private parseTernary(): ExpressionNode {
    const start = this.peek().span.start;
    let expr: ExpressionNode = this.parseOr();

    if (this.match(TokenType.Question)) {
      const consequent = this.parseExpression();
      this.consume(TokenType.Colon, 'Expected ":" in ternary expression');
      const alternate = this.parseTernary();
      expr = {
        kind: 'TernaryExpression',
        span: spanBetween(start, alternate.span.end),
        condition: expr,
        consequent,
        alternate,
      } as TernaryExpressionNode;
    }

    return expr;
  }

  private parseOr(): ExpressionNode {
    let expr: ExpressionNode = this.parseAnd();

    while (this.match(TokenType.Or)) {
      const operator = this.previous().lexeme;
      const right = this.parseAnd();
      expr = this.makeBinary(expr, operator, right);
    }

    return expr;
  }

  private parseAnd(): ExpressionNode {
    let expr: ExpressionNode = this.parseEquality();

    while (this.match(TokenType.And)) {
      const operator = this.previous().lexeme;
      const right = this.parseEquality();
      expr = this.makeBinary(expr, operator, right);
    }

    return expr;
  }

  private parseEquality(): ExpressionNode {
    let expr: ExpressionNode = this.parseComparison();

    while (this.match(TokenType.Equal, TokenType.NotEqual)) {
      const operator = this.previous().lexeme;
      const right = this.parseComparison();
      expr = this.makeBinary(expr, operator, right);
    }

    return expr;
  }

  private parseComparison(): ExpressionNode {
    let expr: ExpressionNode = this.parseTerm();

    while (
      this.match(TokenType.Greater, TokenType.GreaterEqual, TokenType.Less, TokenType.LessEqual)
    ) {
      const operator = this.previous().lexeme;
      const right = this.parseTerm();
      expr = this.makeBinary(expr, operator, right);
    }

    return expr;
  }

  private parseTerm(): ExpressionNode {
    let expr: ExpressionNode = this.parseFactor();

    while (this.match(TokenType.Plus, TokenType.Minus)) {
      const operator = this.previous().lexeme;
      const right = this.parseFactor();
      expr = this.makeBinary(expr, operator, right);
    }

    return expr;
  }

  private parseFactor(): ExpressionNode {
    let expr: ExpressionNode = this.parseUnary();

    while (this.match(TokenType.Star, TokenType.Slash, TokenType.Percent)) {
      const operator = this.previous().lexeme;
      const right = this.parseUnary();
      expr = this.makeBinary(expr, operator, right);
    }

    return expr;
  }

  private parseUnary(): ExpressionNode {
    if (this.match(TokenType.Not, TokenType.Minus)) {
      const operator = this.previous().lexeme;
      const start = this.previous().span.start;
      const operand = this.parseUnary();
      return {
        kind: 'UnaryExpression',
        span: spanBetween(start, operand.span.end),
        operator,
        operand,
        prefix: true,
      } as UnaryExpressionNode;
    }

    return this.parsePostfix();
  }

  private parsePostfix(): ExpressionNode {
    let expr: ExpressionNode = this.parsePrimary();

    while (true) {
      if (this.isAtEnd()) break;
      if (this.peek().span.start.line > expr.span.end.line) break;
      if (this.match(TokenType.LBracket)) {
        const index = this.parseExpression();
        const bracketEnd = this.consume(TokenType.RBracket, 'Expected "]" after index').span.end;
        expr = {
          kind: 'IndexExpression',
          span: spanBetween(expr.span.start, bracketEnd),
          object: expr,
          index,
        } as IndexExpressionNode;
      } else if (this.match(TokenType.Dot)) {
        const property = this.parseMemberName();
        expr = {
          kind: 'MemberExpression',
          span: spanBetween(expr.span.start, this.previous().span.end),
          object: expr,
          property,
        } as MemberExpressionNode;

        // Handle type arguments after member expression ONLY for known type constructors
        // (e.g., array.new<float>, matrix.new<float>, MyType.new<float>)
        // NOT for property access like strategy.position_size < 100
        const obj = expr.object;
        const isTypeConstructor =
          obj.kind === 'Identifier' &&
          (obj.name === 'array' ||
            obj.name === 'matrix' ||
            obj.name === 'map' ||
            obj.name === 'Array' ||
            obj.name === 'Matrix' ||
            obj.name === 'Map' ||
            this.userTypes.has(obj.name));

        if (isTypeConstructor && this.match(TokenType.Less)) {
          const typeArgs: TypeAnnotationNode[] = [];
          while (!this.check(TokenType.Greater) && !this.isAtEnd()) {
            typeArgs.push(this.parseTypeAnnotation());
            if (!this.match(TokenType.Comma)) break;
          }
          this.consume(TokenType.Greater, 'Expected ">" after type arguments');
          (expr as MemberExpressionNode).typeArguments = typeArgs;
        }
      } else if (this.match(TokenType.LParen)) {
        expr = this.finishCall(expr);
      } else {
        break;
      }
    }

    return expr;
  }

  // ==========================================================================
  // Function expressions
  // ==========================================================================

  private parseFunctionParams(): ParameterNode[] {
    this.consume(TokenType.LParen, 'Expected "(" before parameters');
    const params: ParameterNode[] = [];
    while (!this.check(TokenType.RParen) && !this.isAtEnd()) {
      params.push(this.parseParameter());
      if (!this.check(TokenType.RParen)) {
        this.consume(TokenType.Comma, 'Expected "," between parameters');
      }
    }
    this.consume(TokenType.RParen, 'Expected ")" after parameters');
    return params;
  }

  private finishFunctionExpr(
    name: string | undefined,
    start: SourceSpan['start'],
    parameters: ParameterNode[],
  ): FunctionExpressionNode {
    this.consume(TokenType.Arrow, 'Expected "=>" in function expression');

    const body = this.parseIndentedBlock();

    return {
      kind: 'FunctionExpression',
      span: spanBetween(start, body[body.length - 1]?.span.end ?? start),
      name,
      parameters,
      body,
    };
  }

  // ==========================================================================
  // Call expressions
  // ==========================================================================

  private finishCall(callee: ExpressionNode): CallExpressionNode {
    const args: ExpressionNode[] = [];
    const namedArguments: ArgumentNode[] = [];

    while (!this.check(TokenType.RParen) && !this.isAtEnd()) {
      if (
        (this.check(TokenType.Identifier) ||
          this.check(TokenType.ColorType) ||
          this.check(TokenType.StringType)) &&
        this.checkNext(TokenType.Assign)
      ) {
        namedArguments.push(this.parseNamedArgument());
      } else {
        args.push(this.parseExpression());
      }

      if (!this.check(TokenType.RParen)) {
        this.consume(TokenType.Comma, 'Expected "," between arguments');
      }
    }

    const parenEnd = this.consume(TokenType.RParen, 'Expected ")" after arguments').span.end;

    return {
      kind: 'CallExpression',
      span: spanBetween(callee.span.start, parenEnd),
      callee,
      arguments: args,
      namedArguments,
      callId: this.callIdCounter++,
    };
  }

  private parseNamedArgument(): ArgumentNode {
    const start = this.peek().span.start;
    let name: string;
    if (this.match(TokenType.Identifier)) {
      name = this.previous().lexeme;
    } else if (this.match(TokenType.ColorType)) {
      name = this.previous().lexeme;
    } else if (this.match(TokenType.StringType)) {
      name = this.previous().lexeme;
    } else {
      throw this.error('Expected argument name');
    }
    this.consume(TokenType.Assign, 'Expected "=" after argument name');
    const value = this.parseExpression();

    return {
      kind: 'Argument',
      span: spanBetween(start, value.span.end),
      name,
      value,
    };
  }

  // ==========================================================================
  // Primary / atomic expressions
  // ==========================================================================

  private parsePrimary(): ExpressionNode {
    if (this.match(TokenType.True)) {
      return this.makeBoolean(true);
    }
    if (this.match(TokenType.False)) {
      return this.makeBoolean(false);
    }
    if (this.match(TokenType.Na)) {
      return {
        kind: 'NaLiteral',
        span: this.previous().span,
      } as NaLiteralNode;
    }
    if (this.match(TokenType.Number)) {
      const token = this.previous();
      return {
        kind: 'NumberLiteral',
        span: token.span,
        value: token.value as number,
        isFloat: token.lexeme.includes('.'),
      } as NumberLiteralNode;
    }
    if (this.match(TokenType.String)) {
      const token = this.previous();
      return {
        kind: 'StringLiteral',
        span: token.span,
        value: token.value as string,
      } as StringLiteralNode;
    }
    if (this.match(TokenType.Color)) {
      const token = this.previous();
      return {
        kind: 'ColorLiteral',
        span: token.span,
        value: token.value as string,
      } as ColorLiteralNode;
    }
    if (
      this.match(TokenType.Identifier) ||
      this.match(TokenType.ColorType) ||
      this.match(TokenType.StringType) ||
      this.match(TokenType.Strategy) ||
      this.match(TokenType.Indicator) ||
      this.match(TokenType.Library) ||
      this.match(TokenType.Array) ||
      this.match(TokenType.Map) ||
      this.match(TokenType.Matrix) ||
      this.match(TokenType.Int) ||
      this.match(TokenType.Float) ||
      this.match(TokenType.Bool) ||
      this.match(TokenType.Ta) ||
      this.match(TokenType.Math) ||
      this.match(TokenType.Str) ||
      this.match(TokenType.Time) ||
      this.match(TokenType.Input)
    ) {
      const token = this.previous();

      if (this.check(TokenType.Arrow) && this.peek().span.start.line === token.span.start.line) {
        return this.parseFunctionExpression(token.lexeme, token.span.start);
      }

      if (this.check(TokenType.LParen) && this.peek().span.start.line === token.span.start.line) {
        const saved = this.current;
        this.advance();
        let depth = 1;
        while (!this.isAtEnd() && depth > 0) {
          if (this.peek().type === TokenType.LParen) depth++;
          if (this.peek().type === TokenType.RParen) depth--;
          if (depth > 0) this.advance();
        }
        if (depth === 0) {
          this.advance();
          if (this.check(TokenType.Arrow)) {
            this.current = saved;
            const params = this.parseFunctionParams();
            return this.finishFunctionExpr(token.lexeme, token.span.start, params);
          }
        }
        this.current = saved;
      }

      return {
        kind: 'Identifier',
        span: token.span,
        name: token.lexeme,
      } as IdentifierNode;
    }
    if (this.match(TokenType.LParen)) {
      if (this.check(TokenType.RParen)) {
        throw this.error('Empty parentheses expression is not allowed');
      }
      const expr = this.parseExpression();
      this.consume(TokenType.RParen, 'Expected ")" after expression');
      return {
        kind: 'ParenthesizedExpression',
        span: spanBetween(expr.span.start, this.previous().span.end),
        expression: expr,
      } as ParenthesizedExpressionNode;
    }
    if (this.match(TokenType.LBracket)) {
      return this.parseArrayExpression();
    }
    if (this.match(TokenType.LBrace)) {
      return this.parseMapExpression();
    }
    if (this.match(TokenType.Switch)) {
      return this.parseSwitchExpression();
    }

    throw this.error(`Unexpected token: ${this.peek().lexeme || this.peek().type}`);
  }

  // ==========================================================================
  // Functions & parameters
  // ==========================================================================

  private parseFunctionExpression(
    name: string | undefined,
    start: SourceSpan['start'],
  ): FunctionExpressionNode {
    if (this.check(TokenType.LParen)) {
      return this.finishFunctionExpr(name, start, this.parseFunctionParams());
    }
    this.consume(TokenType.Arrow, 'Expected "=>" in function expression');
    const parameters: ParameterNode[] = [];

    if (this.match(TokenType.LParen)) {
      while (!this.check(TokenType.RParen) && !this.isAtEnd()) {
        parameters.push(this.parseParameter());
        if (!this.check(TokenType.RParen)) {
          this.consume(TokenType.Comma, 'Expected "," between parameters');
        }
      }
      this.consume(TokenType.RParen, 'Expected ")" after parameters');
    }

    const body = this.parseIndentedBlock();

    return {
      kind: 'FunctionExpression',
      span: spanBetween(start, body[body.length - 1]?.span.end ?? start),
      name,
      parameters,
      body,
    };
  }

  private parseParameter(): ParameterNode {
    const start = this.peek().span.start;
    let typeAnnotation: TypeAnnotationNode | undefined;
    let name: string;
    let defaultValue: ExpressionNode | undefined;

    // Pine v6 can have type before name: "float src" or name before type: "src float"
    if (this.checkTypeKeyword()) {
      typeAnnotation = this.parseTypeAnnotation();
      name = this.consume(TokenType.Identifier, 'Expected parameter name').lexeme;
    } else {
      name = this.consume(TokenType.Identifier, 'Expected parameter name').lexeme;
      if (this.checkTypeKeyword()) {
        typeAnnotation = this.parseTypeAnnotation();
      }
    }

    if (this.match(TokenType.Assign)) {
      defaultValue = this.parseExpression();
    }

    return {
      kind: 'Parameter',
      span: spanBetween(start, defaultValue?.span.end ?? this.previous().span.end),
      name,
      typeAnnotation,
      defaultValue,
    };
  }

  // ==========================================================================
  // Array / Map / Switch expression literals
  // ==========================================================================

  private parseArrayExpression(): ArrayExpressionNode {
    const start = this.previous().span.start;
    const elements: ExpressionNode[] = [];

    if (!this.check(TokenType.RBracket)) {
      do {
        elements.push(this.parseExpression());
      } while (this.match(TokenType.Comma) && !this.check(TokenType.RBracket));
    }

    const end = this.consume(TokenType.RBracket, 'Expected "]" after array elements').span.end;

    return {
      kind: 'ArrayExpression',
      span: spanBetween(start, end),
      elements,
    };
  }

  private parseMapExpression(): MapExpressionNode {
    const start = this.previous().span.start;
    const entries: MapEntryNode[] = [];

    if (!this.check(TokenType.RBrace)) {
      do {
        const entryStart = this.peek().span.start;
        const key = this.parseExpression();
        this.consume(TokenType.Colon, 'Expected ":" between map key and value');
        const value = this.parseExpression();
        entries.push({
          kind: 'MapEntry',
          span: spanBetween(entryStart, value.span.end),
          key,
          value,
        });
      } while (this.match(TokenType.Comma) && !this.check(TokenType.RBrace));
    }

    const end = this.consume(TokenType.RBrace, 'Expected "}" after map entries').span.end;

    return {
      kind: 'MapExpression',
      span: spanBetween(start, end),
      entries,
    };
  }

  private parseSwitchExpression(): SwitchExpressionNode {
    const start = this.previous().span.start;
    const expression = this.parseExpression();
    const cases: SwitchExpressionCaseNode[] = [];

    // Find the base column: the column of the first token on the switch keyword's line,
    // so indented cases (which are at a column between base and switch) are not skipped.
    const switchLine = start.line;
    let baseColumn = start.column;
    let i = this.current - 2;
    while (i >= 0 && this.tokens[i]!.span.start.line === switchLine) {
      if (this.tokens[i]!.span.start.column < baseColumn) {
        baseColumn = this.tokens[i]!.span.start.column;
      }
      i--;
    }

    while (!this.isAtEnd()) {
      const nextCol = this.peek().span.start.column;
      if (nextCol <= baseColumn) {
        break;
      }

      const caseStart = this.peek().span.start;

      if (this.match(TokenType.Arrow)) {
        const result = this.parseExpression();
        cases.push({
          kind: 'SwitchExpressionCase',
          span: spanBetween(caseStart, result.span.end),
          value: undefined,
          result,
        });
        continue;
      }

      const value = this.parseExpression();
      this.consume(TokenType.Arrow, 'Expected "=>" after case value in switch expression');
      const result = this.parseExpression();
      cases.push({
        kind: 'SwitchExpressionCase',
        span: spanBetween(caseStart, result.span.end),
        value,
        result,
      });
    }

    const end = cases[cases.length - 1]?.span.end ?? expression.span.end;

    return {
      kind: 'SwitchExpression',
      span: spanBetween(start, end),
      expression,
      cases,
    };
  }

  // ==========================================================================
  // Member name parsing (used by parsePostfix)
  // ==========================================================================

  protected parseMemberName(): string {
    if (this.match(TokenType.Identifier)) {
      return this.previous().lexeme;
    }

    const keywordTypes = [
      TokenType.Int,
      TokenType.Float,
      TokenType.Bool,
      TokenType.StringType,
      TokenType.ColorType,
      TokenType.True,
      TokenType.False,
      TokenType.Na,
      // Array methods and common properties
      TokenType.Array,
      TokenType.Map,
      TokenType.Matrix,
      // Built-in namespaces
      TokenType.Strategy,
      TokenType.Ta,
      TokenType.Math,
      TokenType.Str,
      TokenType.Time,
      TokenType.Input,
      TokenType.Color,
    ];

    for (const type of keywordTypes) {
      if (this.match(type)) {
        return this.previous().lexeme;
      }
    }

    throw this.error('Expected property name after "."');
  }
}
