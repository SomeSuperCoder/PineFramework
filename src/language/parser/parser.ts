import { ParseError } from '../../common/errors.js';
import { spanBetween, type SourceSpan } from '../../common/source-location.js';
import type {
  ArgumentNode,
  ArrayExpressionNode,
  AssignmentNode,
  BinaryExpressionNode,
  BooleanLiteralNode,
  BreakStatementNode,
  CallExpressionNode,
  ColorLiteralNode,
  ContinueStatementNode,
  ExpressionNode,
  ForStatementNode,
  FunctionExpressionNode,
  IdentifierNode,
  IfStatementNode,
  IndexExpressionNode,
  MapEntryNode,
  MapExpressionNode,
  MemberExpressionNode,
  NaLiteralNode,
  NumberLiteralNode,
  ParameterNode,
  ParenthesizedExpressionNode,
  ProgramNode,
  ReturnStatementNode,
  ScriptKind,
  StatementNode,
  StringLiteralNode,
  SwitchCaseNode,
  SwitchExpressionCaseNode,
  SwitchExpressionNode,
  SwitchStatementNode,
  TernaryExpressionNode,
  TypeAnnotationNode,
  TypeDeclarationNode,
  TypeFieldNode,
  UnaryExpressionNode,
  VariableDeclarationNode,
  WhileStatementNode,
} from './ast/nodes.js';
import { extractVersion, Token, Tokenizer, TokenType } from './tokenizer.js';

export interface ParseResult {
  ast: ProgramNode;
  tokens: Token[];
}

export class Parser {
  private tokens: Token[] = [];
  private current = 0;

  parse(source: string): ParseResult {
    const version = extractVersion(source);
    if (version === null) {
      throw new ParseError('Missing //@version=N declaration');
    }
    if (version !== 6) {
      throw new ParseError(`Unsupported Pine Script version: ${version}. Only v6 is supported.`);
    }

    this.tokens = new Tokenizer(source).tokenize();
    this.current = 0;

    const ast = this.parseProgram(version);
    return { ast, tokens: this.tokens };
  }

  private parseProgram(version: number): ProgramNode {
    const start = this.peek().span.start;
    const { scriptKind, scriptName, scriptArgs } = this.parseScriptDeclaration();
    const body = this.parseBlockUntil(TokenType.EOF);

    return {
      kind: 'Program',
      span: spanBetween(start, this.previous().span.end),
      version,
      scriptKind,
      scriptName,
      scriptArgs,
      body,
    };
  }

  private parseScriptDeclaration(): {
    scriptKind: ScriptKind;
    scriptName: string;
    scriptArgs: ArgumentNode[];
  } {
    let scriptKind: ScriptKind;

    if (this.match(TokenType.Indicator)) {
      scriptKind = 'indicator';
    } else if (this.match(TokenType.Strategy)) {
      scriptKind = 'strategy';
    } else if (this.match(TokenType.Library)) {
      scriptKind = 'library';
    } else {
      throw this.error('Expected indicator(), strategy(), or library() declaration');
    }

    this.consume(TokenType.LParen, 'Expected "(" after script declaration');

    const titleToken = this.consume(TokenType.String, 'Expected script title string');
    const scriptName = titleToken.value as string;

    const scriptArgs: ArgumentNode[] = [];
    while (!this.check(TokenType.RParen) && !this.isAtEnd()) {
      this.consume(TokenType.Comma, 'Expected "," before script argument');
      scriptArgs.push(this.parseScriptArgument());
    }

    this.consume(TokenType.RParen, 'Expected ")" after script declaration');

    return { scriptKind, scriptName, scriptArgs };
  }

  private parseScriptArgument(): ArgumentNode {
    const start = this.peek().span.start;

    if (this.check(TokenType.Identifier) && this.checkNext(TokenType.Assign)) {
      return this.parseNamedArgument();
    }

    const value = this.parseExpression();
    return {
      kind: 'Argument',
      span: spanBetween(start, value.span.end),
      name: '',
      value,
    };
  }

  private parseBlockUntil(...terminators: TokenType[]): StatementNode[] {
    const statements: StatementNode[] = [];

    while (!this.isAtEnd() && !terminators.some((t) => this.check(t))) {
      statements.push(this.parseStatement());
    }

    return statements;
  }

  private parseStatement(): StatementNode {
    if (this.match(TokenType.Var)) {
      if (this.checkTypeKeyword() || this.looksLikeUserType()) {
        return this.parseTypedVariableDeclaration(true, false);
      }
      return this.parseVariableDeclaration(true, false);
    }
    if (this.match(TokenType.Varip)) {
      if (this.checkTypeKeyword() || this.looksLikeUserType()) {
        return this.parseTypedVariableDeclaration(true, true);
      }
      return this.parseVariableDeclaration(true, true);
    }
    if (this.match(TokenType.If)) {
      return this.parseIfStatement();
    }
    if (this.match(TokenType.For)) {
      return this.parseForStatement();
    }
    if (this.match(TokenType.While)) {
      return this.parseWhileStatement();
    }
    if (this.match(TokenType.Switch)) {
      return this.parseSwitchStatement();
    }
    if (this.match(TokenType.Method)) {
      const nameToken = this.consume(TokenType.Identifier, 'Expected method name');
      return {
        kind: 'ExpressionStatement',
        span: nameToken.span,
        expression: this.parseFunctionExpression(nameToken.lexeme, nameToken.span.start),
      } as any;
    }
    if (this.match(TokenType.Type)) {
      return this.parseTypeDeclaration();
    }
    if (this.match(TokenType.Return)) {
      return this.parseReturnStatement();
    }
    if (this.match(TokenType.Break)) {
      return this.parseBreakStatement();
    }
    if (this.match(TokenType.Continue)) {
      return this.parseContinueStatement();
    }
    if ((this.checkTypeKeyword() && (this.checkNext(TokenType.Identifier) || this.checkNextTypeKeyword())) || this.looksLikeUserType()) {
      return this.parseTypedVariableDeclaration(false, false);
    }

    return this.parseExpressionOrAssignmentStatement();
  }

  private parseTypedVariableDeclaration(isVar: boolean, isVarip: boolean): VariableDeclarationNode {
    const start = this.peek().span.start;
    const typeAnnotation = this.parseTypeAnnotation();
    const nameToken = this.consume(TokenType.Identifier, 'Expected variable name');
    let initializer: ExpressionNode | undefined;

    if (this.match(TokenType.Assign)) {
      initializer = this.parseExpression();
    }

    return {
      kind: 'VariableDeclaration',
      span: spanBetween(start, this.previous().span.end),
      name: nameToken.lexeme,
      typeAnnotation,
      initializer,
      isVar,
      isVarip,
    };
  }

  private parseVariableDeclaration(isVar: boolean, isVarip: boolean): VariableDeclarationNode {
    const start = this.previous().span.start;
    const nameToken = this.consume(TokenType.Identifier, 'Expected variable name');
    let typeAnnotation: TypeAnnotationNode | undefined;

    if (this.match(TokenType.Assign)) {
      const initializer = this.parseExpression();
      return {
        kind: 'VariableDeclaration',
        span: spanBetween(start, this.previous().span.end),
        name: nameToken.lexeme,
        typeAnnotation,
        initializer,
        isVar,
        isVarip,
      };
    }

    typeAnnotation = this.parseTypeAnnotation();
    let initializer: ExpressionNode | undefined;

    if (this.match(TokenType.Assign)) {
      initializer = this.parseExpression();
    }

    return {
      kind: 'VariableDeclaration',
      span: spanBetween(start, this.previous().span.end),
      name: nameToken.lexeme,
      typeAnnotation,
      initializer,
      isVar,
      isVarip,
    };
  }

  private parseTypeDeclaration(): TypeDeclarationNode {
    const start = this.previous().span.start;
    const nameToken = this.consume(TokenType.Identifier, 'Expected type name');
    this.match(TokenType.Assign); // = is optional

    const fields: TypeFieldNode[] = [];

    while (!this.isAtEnd() && !this.isTopLevelStatement()) {
      const fieldStart = this.peek().span.start;
      if (!this.checkTypeKeyword() && !this.looksLikeUserType()) break;
      const typeAnnotation = this.parseTypeAnnotation();
      const fieldName = this.consume(TokenType.Identifier, 'Expected field name');
      fields.push({
        kind: 'TypeField',
        span: spanBetween(fieldStart, this.previous().span.end),
        name: fieldName.lexeme,
        typeAnnotation,
      });
    }

    return {
      kind: 'TypeDeclaration',
      span: spanBetween(
        start,
        fields.length > 0 ? fields[fields.length - 1]!.span.end : nameToken.span.end,
      ),
      name: nameToken.lexeme,
      fields,
    };
  }

  private isTopLevelStatement(): boolean {
    const type = this.peek().type;
    return (
      type === TokenType.Indicator ||
      type === TokenType.Strategy ||
      type === TokenType.Library ||
      type === TokenType.Var ||
      type === TokenType.Varip ||
      type === TokenType.If ||
      type === TokenType.For ||
      type === TokenType.While ||
      type === TokenType.Switch ||
      type === TokenType.Type ||
      type === TokenType.EOF
    );
  }

  private parseIfStatement(): IfStatementNode {
    const start = this.previous().span.start;
    const condition = this.parseExpression();
    const thenBranch = this.parseIndentedBlock();
    let elseBranch: StatementNode[] | undefined;

    if (this.match(TokenType.Else)) {
      if (this.check(TokenType.If)) {
        elseBranch = [this.parseStatement()];
      } else {
        elseBranch = this.parseIndentedBlock();
      }
    }

    const end = elseBranch?.length
      ? elseBranch[elseBranch.length - 1]!.span.end
      : (thenBranch[thenBranch.length - 1]?.span.end ?? condition.span.end);

    return {
      kind: 'IfStatement',
      span: spanBetween(start, end),
      condition,
      thenBranch,
      elseBranch,
    };
  }

  private parseForStatement(): ForStatementNode {
    const start = this.previous().span.start;

    if (this.match(TokenType.LParen)) {
      return this.parseForStatementWithParens(start);
    }

    const variable = this.consume(TokenType.Identifier, 'Expected loop variable').lexeme;
    this.consume(TokenType.Assign, 'Expected "=" after loop variable');
    const loopStart = this.parseExpression();
    this.consume(TokenType.To, 'Expected "to" in for loop');
    const end = this.parseExpression();
    let step: ExpressionNode | undefined;

    if (this.match(TokenType.By)) {
      step = this.parseExpression();
    }

    const body = this.parseIndentedBlock();

    return {
      kind: 'ForStatement',
      span: spanBetween(start, body[body.length - 1]?.span.end ?? end.span.end),
      variable,
      start: loopStart,
      end,
      step,
      body,
    };
  }

  private parseForStatementWithParens(start: SourceSpan['start']): ForStatementNode {
    const variable = this.consume(TokenType.Identifier, 'Expected loop variable').lexeme;
    this.consume(TokenType.Assign, 'Expected "=" after loop variable');
    const loopStart = this.parseExpression();
    this.consume(TokenType.To, 'Expected "to" in for loop');
    const end = this.parseExpression();
    let step: ExpressionNode | undefined;

    if (this.match(TokenType.By)) {
      step = this.parseExpression();
    }

    this.consume(TokenType.RParen, 'Expected ")" after for loop header');
    const body = this.parseIndentedBlock();

    return {
      kind: 'ForStatement',
      span: spanBetween(start, body[body.length - 1]?.span.end ?? end.span.end),
      variable,
      start: loopStart,
      end,
      step,
      body,
    };
  }

  private parseWhileStatement(): WhileStatementNode {
    const start = this.previous().span.start;
    this.consume(TokenType.LParen, 'Expected "(" after "while"');
    const condition = this.parseExpression();
    this.consume(TokenType.RParen, 'Expected ")" after while condition');
    const body = this.parseIndentedBlock();

    return {
      kind: 'WhileStatement',
      span: spanBetween(start, body[body.length - 1]?.span.end ?? condition.span.end),
      condition,
      body,
    };
  }

  private parseSwitchStatement(): SwitchStatementNode {
    const start = this.previous().span.start;
    const expression = this.parseExpression();
    const cases: SwitchCaseNode[] = [];
    let defaultCase: StatementNode[] | undefined;

    let nextCol = this.peek().span.start.column;

    if (nextCol <= start.column) {
      // Check for arrow syntax: skip newlines, look for => coming before case/default
      while (this.peek().type === TokenType.Newline) {
        this.advance();
      }
      nextCol = this.peek().span.start.column;
    }

    // Detect arrow syntax: the first case is a value expression followed by =>
    if (!this.check(TokenType.Case) && !this.check(TokenType.Default)) {
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
        const caseCol = this.peek().span.start.column;
        if (caseCol <= baseColumn) {
          break;
        }

        const caseStart = this.peek().span.start;

        if (this.match(TokenType.Arrow)) {
          const body = this.parseIndentedBlock();
          defaultCase = body;
          break;
        }

        const value = this.parseExpression();
        this.consume(TokenType.Arrow, 'Expected "=>" after case value in switch statement');
        const body = this.parseIndentedBlock();
        cases.push({
          kind: 'SwitchCase',
          span: spanBetween(caseStart, body[body.length - 1]?.span.end ?? value.span.end),
          value,
          body,
        });
      }

      const end = defaultCase?.length
        ? defaultCase[defaultCase.length - 1]!.span.end
        : (cases[cases.length - 1]?.span.end ?? expression.span.end);

      return {
        kind: 'SwitchStatement',
        span: spanBetween(start, end),
        expression,
        cases,
        defaultCase,
      };
    }

    while (!this.isAtEnd()) {
      if (this.match(TokenType.Case)) {
        const caseStart = this.previous().span.start;
        const value = this.parseExpression();
        const body = this.parseIndentedBlock();
        cases.push({
          kind: 'SwitchCase',
          span: spanBetween(caseStart, body[body.length - 1]?.span.end ?? value.span.end),
          value,
          body,
        });
      } else if (this.match(TokenType.Default)) {
        defaultCase = this.parseIndentedBlock();
        break;
      } else {
        break;
      }
    }

    const end = defaultCase?.length
      ? defaultCase[defaultCase.length - 1]!.span.end
      : (cases[cases.length - 1]?.span.end ?? expression.span.end);

    return {
      kind: 'SwitchStatement',
      span: spanBetween(start, end),
      expression,
      cases,
      defaultCase,
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

  private parseReturnStatement(): ReturnStatementNode {
    const start = this.previous().span.start;
    let value: ExpressionNode | undefined;

    if (!this.isAtEnd() && !this.isStatementStart()) {
      value = this.parseExpression();
    }

    return {
      kind: 'ReturnStatement',
      span: spanBetween(start, value?.span.end ?? start),
      value,
    };
  }

  private parseBreakStatement(): BreakStatementNode {
    return {
      kind: 'BreakStatement',
      span: this.previous().span,
    };
  }

  private parseContinueStatement(): ContinueStatementNode {
    return {
      kind: 'ContinueStatement',
      span: this.previous().span,
    };
  }

  private parseExpressionOrAssignmentStatement(): StatementNode {
    const expr = this.parseExpression();

    if (this.match(TokenType.ColonAssign, TokenType.Assign, TokenType.PlusAssign, TokenType.MinusAssign, TokenType.StarAssign, TokenType.SlashAssign)) {
      const op = this.previous().type;
      const operatorMap: Record<string, string> = {
        [TokenType.ColonAssign]: ':=',
        [TokenType.Assign]: '=',
        [TokenType.PlusAssign]: '+=',
        [TokenType.MinusAssign]: '-=',
        [TokenType.StarAssign]: '*=',
        [TokenType.SlashAssign]: '/=',
      };
      const operator = operatorMap[op]!;
      const value = this.parseExpression();
      return {
        kind: 'Assignment',
        span: spanBetween(expr.span.start, value.span.end),
        target: expr,
        operator,
        value,
      } as AssignmentNode;
    }

    return {
      kind: 'ExpressionStatement',
      span: expr.span,
      expression: expr,
    };
  }

  private parseIndentedBlock(): StatementNode[] {
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
    }

    return statements;
  }

  private isBlockContinuation(): boolean {
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

  private isStatementStart(): boolean {
    const type = this.peek().type;
    return (
      type === TokenType.Var ||
      type === TokenType.Varip ||
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

  private parseExpression(): ExpressionNode {
    return this.parseTernary();
  }

  private parseTernary(): ExpressionNode {
    const start = this.peek().span.start;
    let expr = this.parseOr();

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
    let expr = this.parseAnd();

    while (this.match(TokenType.Or)) {
      const operator = this.previous().lexeme;
      const right = this.parseAnd();
      expr = this.makeBinary(expr, operator, right);
    }

    return expr;
  }

  private parseAnd(): ExpressionNode {
    let expr = this.parseEquality();

    while (this.match(TokenType.And)) {
      const operator = this.previous().lexeme;
      const right = this.parseEquality();
      expr = this.makeBinary(expr, operator, right);
    }

    return expr;
  }

  private parseEquality(): ExpressionNode {
    let expr = this.parseComparison();

    while (this.match(TokenType.Equal, TokenType.NotEqual)) {
      const operator = this.previous().lexeme;
      const right = this.parseComparison();
      expr = this.makeBinary(expr, operator, right);
    }

    return expr;
  }

  private parseComparison(): ExpressionNode {
    let expr = this.parseTerm();

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
    let expr = this.parseFactor();

    while (this.match(TokenType.Plus, TokenType.Minus)) {
      const operator = this.previous().lexeme;
      const right = this.parseFactor();
      expr = this.makeBinary(expr, operator, right);
    }

    return expr;
  }

  private parseFactor(): ExpressionNode {
    let expr = this.parseUnary();

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
    let expr = this.parsePrimary();

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
      } else if (this.match(TokenType.LParen)) {
        expr = this.finishCall(expr);
      } else {
        break;
      }
    }

    return expr;
  }

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

  private finishCall(callee: ExpressionNode): CallExpressionNode {
    const args: ExpressionNode[] = [];
    const namedArguments: ArgumentNode[] = [];

    while (!this.check(TokenType.RParen) && !this.isAtEnd()) {
      if ((this.check(TokenType.Identifier) || this.check(TokenType.ColorType) || this.check(TokenType.StringType)) && this.checkNext(TokenType.Assign)) {
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
    if (this.match(TokenType.Identifier) || this.match(TokenType.ColorType) || this.match(TokenType.StringType) || this.match(TokenType.Strategy) || this.match(TokenType.Indicator) || this.match(TokenType.Library) || this.match(TokenType.Array) || this.match(TokenType.Map) || this.match(TokenType.Matrix)) {
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

  private parseTypeAnnotation(): TypeAnnotationNode {
    const start = this.peek().span.start;
    let isSeries = false;

    if (this.match(TokenType.Series)) {
      isSeries = true;
    }

    const typeToken = this.consumeTypeKeyword();
    let isArray = false;
    let isMap = false;
    const typeArguments: TypeAnnotationNode[] = [];

    if (this.match(TokenType.LBracket)) {
      if (typeToken.type === TokenType.Array || typeToken.type === TokenType.Map) {
        const arg = this.parseTypeAnnotation();
        typeArguments.push(arg);
        this.consume(TokenType.RBracket, 'Expected "]" after type argument');
      } else {
        isArray = true;
        this.consume(TokenType.RBracket, 'Expected "]" after array type');
      }
    }

    if (typeToken.type === TokenType.Array) {
      isArray = true;
    }
    if (typeToken.type === TokenType.Map) {
      isMap = true;
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

  private consumeTypeKeyword(): Token {
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

  private checkTypeKeyword(): boolean {
    return (
      this.check(TokenType.Series) ||
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

  private checkNextTypeKeyword(): boolean {
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

  private looksLikeUserType(): boolean {
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

  private parseMemberName(): string {
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
    ];

    for (const type of keywordTypes) {
      if (this.match(type)) {
        return this.previous().lexeme;
      }
    }

    throw this.error('Expected property name after "."');
  }

  private makeBinary(
    left: ExpressionNode,
    operator: string,
    right: ExpressionNode,
  ): BinaryExpressionNode {
    return {
      kind: 'BinaryExpression',
      span: spanBetween(left.span.start, right.span.end),
      operator,
      left,
      right,
    };
  }

  private makeBoolean(value: boolean): BooleanLiteralNode {
    const token = this.previous();
    return {
      kind: 'BooleanLiteral',
      span: token.span,
      value,
    };
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) {
      return false;
    }
    return this.peek().type === type;
  }

  private checkNext(type: TokenType): boolean {
    if (this.current + 1 >= this.tokens.length) {
      return false;
    }
    return this.tokens[this.current + 1]!.type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current]!;
  }

  private previous(): Token {
    return this.tokens[this.current - 1]!;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw this.error(message);
  }

  private error(message: string): ParseError {
    return new ParseError(message, this.peek().span);
  }
}

export function parse(source: string): ParseResult {
  return new Parser().parse(source);
}
