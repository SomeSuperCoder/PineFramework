import { ParseError } from '../../common/errors.js';
import type { ProgramNode } from './ast/nodes.js';
import { extractVersion, Token, Tokenizer, TokenType } from './tokenizer.js';
import { StatementParser } from './statement-parser.js';

export interface ParseResult {
  ast: ProgramNode;
  tokens: Token[];
}

export class Parser extends StatementParser {
  parse(source: string): ParseResult {
    // Reject overly large scripts (DoS prevention for tokenizer/parser)
    if (source.length > 1024 * 1024) {
      throw new ParseError('Script exceeds maximum size of 1MB');
    }

    const version = extractVersion(source);
    if (version === null) {
      throw new ParseError('Missing //@version=N declaration');
    }
    if (version !== 5 && version !== 6) {
      throw new ParseError(
        `Unsupported Pine Script version: ${version}. Only v5 and v6 are supported.`,
      );
    }

    this.tokens = new Tokenizer(source).tokenize();
    this.current = 0;
    this.callIdCounter = 0;

    const ast = this.parseProgram(version);
    return { ast, tokens: this.tokens };
  }
}

export function parse(source: string): ParseResult {
  return new Parser().parse(source);
}
