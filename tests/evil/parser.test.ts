/**
 * Evil tests: Parser
 *
 * Adversarial inputs designed to break or confuse the Pine Script parser.
 * Verifies the parser rejects malformed input with descriptive ParseErrors
 * rather than crashing or producing undefined ASTs.
 */

import { parse } from '../../src/language/parser/parser.js';
import { ParseError } from '../../src/common/errors.js';

describe('Evil parser — empty / missing declaration', () => {
  it('throws ParseError for empty script', () => {
    expect(() => parse('')).toThrow(ParseError);
  });

  it('throws ParseError for missing //@version declaration', () => {
    expect(() => parse('indicator("Test")\nx = 1')).toThrow(ParseError);
  });

  it('throws ParseError with clear message', () => {
    expect(() => parse('')).toThrow(/version/i);
  });
});

describe('Evil parser — unsupported versions', () => {
  it('throws ParseError for v4', () => {
    expect(() => parse('//@version=4\nindicator("Test")\n')).toThrow(ParseError);
  });

  it('throws ParseError for v7', () => {
    expect(() => parse('//@version=7\nindicator("Test")\n')).toThrow(ParseError);
  });

  it('error message mentions supported version range', () => {
    expect(() => parse('//@version=4\n')).toThrow(/v5|v6|only/);
  });
});

describe('Evil parser — size limits', () => {
  it('throws ParseError for script exceeding 1MB', () => {
    // Need enough chars to exceed 1MB. 'x = 1\n' is 6 bytes. 200k lines = ~1.2MB
    const largeScript = '//@version=6\nindicator("Test")\n' + 'x = 1\n'.repeat(200000);
    expect(() => parse(largeScript)).toThrow(ParseError);
  });

  it('error message mentions size limit', () => {
    const largeScript = '//@version=6\nindicator("Test")\n' + 'x = 1\n'.repeat(200000);
    expect(() => parse(largeScript)).toThrow(/size|MB|maximum/);
  });
});

describe('Evil parser — deeply nested expressions', () => {
  it('handles 100+ levels of parenthesized expressions without RangeError', () => {
    // Build a deeply nested expression: ((((...1...))))
    let expr = '1';
    for (let i = 0; i < 100; i++) {
      expr = `(${expr})`;
    }
    const source = `//@version=6\nindicator("Test")\nx = ${expr}\n`;
    // Should parse safely (no RangeError). May succeed or throw ParseError,
    // but must not crash with an uncaught RangeError.
    expect(() => parse(source)).not.toThrow(RangeError);
  });

  it('handles 100+ levels of binary expressions without RangeError', () => {
    // Build deeply nested: 1+1+1+...+1
    let expr = '1';
    for (let i = 0; i < 100; i++) {
      expr = `${expr} + 1`;
    }
    const source = `//@version=6\nindicator("Test")\nx = ${expr}\n`;
    expect(() => parse(source)).not.toThrow(RangeError);
  });
});

describe('Evil parser — special characters', () => {
  it('rejects zero-width characters in identifiers', () => {
    // Using zero-width space in identifier
    const source = '//@version=6\nindicator("Test")\n\u200Bx = 1\n';
    expect(() => parse(source)).toThrow(ParseError);
  });

  it('rejects control characters in source', () => {
    const source = '//@version=6\nindicator("Test")\n\x00x = 1\n';
    expect(() => parse(source)).toThrow(ParseError);
  });
});

describe('Evil parser — bracket/paren mismatches', () => {
  it('throws ParseError for unmatched opening paren', () => {
    const source = '//@version=6\nindicator("Test")\nx = (1 + 2\n';
    expect(() => parse(source)).toThrow(ParseError);
  });

  it('throws ParseError for unmatched closing paren', () => {
    const source = '//@version=6\nindicator("Test")\nx = 1 + 2)\n';
    expect(() => parse(source)).toThrow(ParseError);
  });

  it('throws ParseError for unmatched opening bracket', () => {
    const source = '//@version=6\nindicator("Test")\na = array.new<int>(\n';
    expect(() => parse(source)).toThrow(ParseError);
  });
});

describe('Evil parser — unterminated string literals', () => {
  it('throws ParseError for unterminated single-quoted string', () => {
    const source = "//@version=6\nindicator(\"Test\")\nx = 'hello\n";
    expect(() => parse(source)).toThrow(ParseError);
  });

  it('throws ParseError for unterminated double-quoted string', () => {
    const source = '//@version=6\nindicator("Test")\nx = "hello\n';
    expect(() => parse(source)).toThrow(ParseError);
  });
});

describe('Evil parser — division by zero constant', () => {
  it('produces valid AST for 1/0 (runtime handles the division)', () => {
    const source = '//@version=6\nindicator("Test")\nx = 1 / 0\n';
    expect(() => {
      const { ast } = parse(source);
      expect(ast).toBeDefined();
      expect(ast.body.length).toBeGreaterThan(0);
    }).not.toThrow();
  });
});
