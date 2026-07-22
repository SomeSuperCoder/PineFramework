import { spanBetween, type SourceSpan } from '../../common/source-location.js';
import type {
  ArgumentNode,
  AssignmentNode,
  BreakStatementNode,
  ContinueStatementNode,
  ExpressionNode,
  ForStatementNode,
  IfStatementNode,
  ProgramNode,
  ReturnStatementNode,
  ScriptKind,
  StatementNode,
  SwitchCaseNode,
  SwitchStatementNode,
  TypeAnnotationNode,
  TypeDeclarationNode,
  TypeFieldNode,
  VariableDeclarationNode,
  WhileStatementNode,
} from './ast/nodes.js';
import { TokenType } from './tokenizer.js';
import { ExpressionParser } from './expression-parser.js';

/**
 * Statement-parsing layer. Extends ExpressionParser with all statement-level
 * parsing methods plus top-level program orchestration.
 * This is the penultimate layer before the thin Parser facade.
 */
export class StatementParser extends ExpressionParser {
  // ==========================================================================
  // Top-level program
  // ==========================================================================

  parseProgram(version: number): ProgramNode {
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

    const scriptArgs: ArgumentNode[] = [];
    let scriptName = '';

    // First argument can be a plain string title or a named argument (title="...")
    if (this.check(TokenType.String)) {
      const titleToken = this.advance();
      scriptName = titleToken.value as string;
    } else if (this.check(TokenType.Identifier) && this.checkNext(TokenType.Assign)) {
      // Named argument like title="My Script" — parse it normally
      scriptArgs.push(this.parseScriptArgument());
      // Look for the title argument
      const titleArg = scriptArgs.find((a) => a.name === 'title');
      if (titleArg && titleArg.value.kind === 'StringLiteral') {
        scriptName = (titleArg.value as any).value;
      }
    }

    while (!this.check(TokenType.RParen) && !this.isAtEnd()) {
      this.consume(TokenType.Comma, 'Expected "," before script argument');
      scriptArgs.push(this.parseScriptArgument());
    }

    // If we got a title from a named arg, don't double-add it
    // Also check remaining args for a "title" named arg
    if (!scriptName) {
      const titleArg = scriptArgs.find((a) => a.name === 'title');
      if (titleArg && titleArg.value.kind === 'StringLiteral') {
        scriptName = (titleArg.value as any).value;
      }
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

  // ==========================================================================
  // Statement dispatch
  // ==========================================================================

  protected parseStatement(): StatementNode {
    if (this.match(TokenType.Var)) {
      if (this.checkTypeKeyword() || this.looksLikeUserTypeDecl()) {
        return this.parseTypedVariableDeclaration(true, false);
      }
      return this.parseVariableDeclaration(true, false);
    }
    if (this.match(TokenType.Varip)) {
      if (this.checkTypeKeyword() || this.looksLikeUserTypeDecl()) {
        return this.parseTypedVariableDeclaration(true, true);
      }
      return this.parseVariableDeclaration(true, true);
    }
    if (this.match(TokenType.Const)) {
      if (this.checkTypeKeyword() || this.looksLikeUserTypeDecl()) {
        return this.parseTypedVariableDeclaration(false, false, true);
      }
      return this.parseVariableDeclaration(false, false, true);
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
    if (
      (this.checkTypeKeyword() &&
        (this.checkNext(TokenType.Identifier) || this.checkNextTypeKeyword())) ||
      this.looksLikeUserType()
    ) {
      return this.parseTypedVariableDeclaration(false, false);
    }

    return this.parseExpressionOrAssignmentStatement();
  }

  // ==========================================================================
  // Variable declarations
  // ==========================================================================

  private parseTypedVariableDeclaration(
    isVar: boolean,
    isVarip: boolean,
    isConst: boolean = false,
  ): VariableDeclarationNode {
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
      isConst,
    };
  }

  private parseVariableDeclaration(
    isVar: boolean,
    isVarip: boolean,
    isConst: boolean = false,
  ): VariableDeclarationNode {
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
        isConst,
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
      isConst,
    };
  }

  private parseTypeDeclaration(): TypeDeclarationNode {
    const start = this.previous().span.start;
    const nameToken = this.consume(TokenType.Identifier, 'Expected type name');
    this.userTypes.add(nameToken.lexeme);
    this.match(TokenType.Assign); // = is optional

    const fields: TypeFieldNode[] = [];

    while (!this.isAtEnd() && !this.isTopLevelStatement()) {
      const fieldStart = this.peek().span.start;
      if (!this.checkTypeKeyword() && !this.looksLikeUserType()) break;
      const typeAnnotation = this.parseTypeAnnotation();
      const fieldName = this.consume(TokenType.Identifier, 'Expected field name');

      // Handle optional default value
      let defaultValue: ExpressionNode | undefined;
      if (this.match(TokenType.Assign)) {
        defaultValue = this.parseExpression();
      }

      fields.push({
        kind: 'TypeField',
        span: spanBetween(fieldStart, this.previous().span.end),
        name: fieldName.lexeme,
        typeAnnotation,
        defaultValue,
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

  // ==========================================================================
  // Control flow statements
  // ==========================================================================

  private parseIfStatement(baseColumn?: number): IfStatementNode {
    const start = this.previous().span.start;
    const condition = this.parseExpression();
    const thenBranch = this.parseIndentedBlock();
    let elseBranch: StatementNode[] | undefined;

    // In Pine Script, 'else' belongs to the 'if' at the same indentation level.
    // Only consume 'else' if its column is at or deeper than the if-statement's
    // base column. For standalone 'if', baseColumn = the 'if' keyword's column.
    // For 'else if', baseColumn = the 'else' keyword's column (passed down).
    const effectiveBase = baseColumn ?? start.column;
    const elseToken = this.peek();
    if (elseToken.type === TokenType.Else && elseToken.span.start.column >= effectiveBase) {
      this.advance();
      if (this.check(TokenType.If)) {
        // For 'else if', consume the 'if' keyword and pass the else's column
        // as the base for the inner if-statement
        this.advance();
        elseBranch = [this.parseIfStatement(elseToken.span.start.column)];
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

    // Check for "for ... in ..." syntax (array iteration)
    if (this.match(TokenType.In)) {
      const iterable = this.parseExpression();
      const body = this.parseIndentedBlock();

      return {
        kind: 'ForStatement',
        span: spanBetween(start, body[body.length - 1]?.span.end ?? iterable.span.end),
        variable,
        iterable,
        body,
        isForIn: true,
      };
    }

    // Traditional "for ... = ... to ..." syntax
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
      isForIn: false,
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

  // ==========================================================================
  // Return / Break / Continue
  // ==========================================================================

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

  // ==========================================================================
  // Expression / Assignment statements
  // ==========================================================================

  private parseExpressionOrAssignmentStatement(): StatementNode {
    const expr = this.parseExpression();

    if (
      this.match(
        TokenType.ColonAssign,
        TokenType.Assign,
        TokenType.PlusAssign,
        TokenType.MinusAssign,
        TokenType.StarAssign,
        TokenType.SlashAssign,
      )
    ) {
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
}
