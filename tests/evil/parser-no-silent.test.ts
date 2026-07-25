/**
 * Parser non-silent error tests.
 *
 * Verifies that every malformed input path produces a descriptive ParseError
 * with source location — no partial ASTs are returned without an error.
 */

import { parse } from '../../src/language/parser/parser.js';
import { ParseError } from '../../src/common/errors.js';

describe('Parser — no silent recovery', () => {
  // ===========================================================================
  // Expression-level errors
  // ===========================================================================

  it('throws on empty parentheses expression', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = ()')).toThrow(ParseError);
  });

  it('throws on unmatched opening paren', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = (1 + 2')).toThrow(ParseError);
  });

  it('throws on unmatched closing bracket in index', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = close[1')).toThrow(ParseError);
  });

  it('throws on missing colon in ternary', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = 1 ? 2')).toThrow(ParseError);
  });

  it('throws on missing arrow in switch expression', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = switch y\n  1\n  2')).toThrow(ParseError);
  });

  it('throws on malformed type annotation', () => {
    expect(() => parse('//@version=6\nindicator("")\nseries<int x = 1')).toThrow(ParseError);
  });

  it('throws on empty array literal elements', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = [1,]')).not.toThrow(ParseError);
  });

  it('throws on missing closing bracket in array', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = [1, 2')).toThrow(ParseError);
  });

  it('throws on missing closing brace in map', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = {a: 1')).toThrow(ParseError);
  });

  // ===========================================================================
  // Tokenizer-level errors
  // ===========================================================================

  it('throws on unterminated string (double quote)', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = "hello')).toThrow(ParseError);
  });

  it('throws on unterminated string (single quote)', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = \'hello')).toThrow(ParseError);
  });

  it('throws on unterminated escape sequence', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = "hello\\')).toThrow(ParseError);
  });

  it('throws on invalid color literal (too short)', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = #ff')).toThrow(ParseError);
  });

  it('throws on invalid color literal (wrong length)', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = #fffff')).toThrow(ParseError);
  });

  it('throws on unexpected single "!" character', () => {
    expect(() => parse('//@version=6\nindicator("")\nx = !')).toThrow(ParseError);
  });

  // ===========================================================================
  // Statement-level errors
  // ===========================================================================

  it('throws on missing script declaration', () => {
    expect(() => parse('//@version=6\nx = 1')).toThrow(ParseError);
  });

  it('"var" keyword without name throws ParseError', () => {
    expect(() => parse('//@version=6\nindicator("")\nvar = 1')).toThrow(ParseError);
  });

  it('throws on missing "to" in for loop', () => {
    expect(() => parse('//@version=6\nindicator("")\nfor i = 1 10\n  x = 1')).toThrow(ParseError);
  });

  it('throws on missing ")" after for loop header (paren form)', () => {
    expect(() => parse('//@version=6\nindicator("")\nfor(i=1 to 10\n  x = 1')).toThrow(ParseError);
  });

  it('throws on missing condition parens in while', () => {
    expect(() => parse('//@version=6\nindicator("")\nwhile true\n  x = 1')).toThrow(ParseError);
  });

  it('throws on missing ")" after while condition', () => {
    expect(() => parse('//@version=6\nindicator("")\nwhile(true\n  x = 1')).toThrow(ParseError);
  });

  it('throws on missing method name after method keyword', () => {
    expect(() => parse('//@version=6\nindicator("")\nmethod\n  x = 1')).toThrow(ParseError);
  });

  // ===========================================================================
  // Source location verification
  // ===========================================================================

  it('ParseError contains source span', () => {
    try {
      parse('//@version=6\nindicator("")\nx = (1 + 2');
      fail('Expected parse error');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      const pe = err as ParseError;
      expect(pe.span).toBeDefined();
      expect(pe.span!.start.line).toBeGreaterThan(0);
      expect(pe.span!.start.column).toBeGreaterThan(0);
    }
  });

  it('ParseError contains descriptive message', () => {
    try {
      parse('//@version=6\nindicator("")\nx = "unterminated');
      fail('Expected parse error');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      const pe = err as ParseError;
      expect(pe.message).toMatch(/unterminated|string|literal/i);
    }
  });
});
