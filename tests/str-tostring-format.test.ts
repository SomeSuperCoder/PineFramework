/**
 * STR.TOSTRING FORMAT — formatNumber() + str.tostring builtin with format arg.
 *
 * Locks the str.tostring(value, format) fix: str.tostring now accepts an
 * optional format argument. When present, it delegates to formatNumber()
 * (number-format.ts) which implements PineScript format specifiers:
 *   "#"  = optional digit (suppress trailing zeros)
 *   "0"  = required digit (pad with zeros)
 *   "."  = decimal point
 *   "+"/"-" = explicit sign prefix
 *
 * Two test layers:
 *   1. UNIT: direct formatNumber() calls — pure function, no engine overhead.
 *   2. INTEGRATION: str.tostring via PineScript engine — end-to-end through
 *      the builtin registration, parser, compiler, and execution engine.
 *
 * Scope: 14 cases from the mictask spec covering all format specifier patterns,
 * edge cases (NaN, Infinity, zero, small values), and the cleanNumber fallback.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../src/language/parser/parser.js';
import { compile } from '../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../src/language/runtime/execution-engine.js';
import { formatNumber, cleanNumber } from '../src/language/utils/number-format.js';
import { NA } from '../src/language/types/na.js';

// ── Layer 1: UNIT tests — formatNumber() directly ──

describe('formatNumber() — PineScript format specifiers (unit)', () => {
  it('"#.##" — up to 2 decimals, trailing zeros suppressed', () => {
    expect(formatNumber(35.51401869, '#.##')).toBe('35.51');
  });

  it('"#.##" — 1 decimal, trailing zero suppressed', () => {
    expect(formatNumber(35.5, '#.##')).toBe('35.5');
  });

  it('"#.#" — up to 1 decimal', () => {
    expect(formatNumber(37.2, '#.#')).toBe('37.2');
  });

  it('"#" — integer, no decimal point', () => {
    expect(formatNumber(37.9, '#')).toBe('38');
  });

  it('"0.00" — exactly 2 decimals, trailing zero kept', () => {
    expect(formatNumber(35.5, '0.00')).toBe('35.50');
  });

  it('"+#.#" — signed positive', () => {
    expect(formatNumber(37.2, '+#.#')).toBe('+37.2');
  });

  it('"+#.#" — signed negative', () => {
    expect(formatNumber(-5.1, '+#.#')).toBe('-5.1');
  });

  it('"#.##" — integer input, no decimal needed', () => {
    expect(formatNumber(42, '#.##')).toBe('42');
  });

  it('"#.##" — NaN passthrough', () => {
    expect(formatNumber(NaN, '#.##')).toBe('NaN');
  });

  it('"#.##" — Infinity passthrough', () => {
    expect(formatNumber(Infinity, '#.##')).toBe('Infinity');
  });

  it('"#.##" — zero', () => {
    expect(formatNumber(0, '#.##')).toBe('0');
  });

  it('"#.##" — very small rounds to 0', () => {
    expect(formatNumber(0.001, '#.##')).toBe('0');
  });

  it('"#.##" — thousands separator NOT added', () => {
    expect(formatNumber(1234.5, '#.##')).toBe('1234.5');
  });

  it('cleanNumber fallback — no format arg', () => {
    expect(cleanNumber(35.51401869)).toBe('35.51401869');
  });
});

// ── Layer 2: INTEGRATION tests — str.tostring via PineScript engine ──

const { ast } = parse(
  '//@version=6\nindicator("str.tostring format", overlay=true)\nplot(close, "c")',
);
const engine = new ExecutionEngine(compile(ast));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const strTostring = engine.builtins.get('str.tostring') as (...args: any[]) => any;

describe('str.tostring(value, format) — builtin integration', () => {
  it('"#.##" → "35.51" (2 decimals, trailing zeros suppressed)', () => {
    expect(strTostring(35.51401869, '#.##')).toBe('35.51');
  });

  it('"0.00" → "35.50" (exactly 2 decimals, trailing zero kept)', () => {
    expect(strTostring(35.5, '0.00')).toBe('35.50');
  });

  it('"#" → "38" (integer rounding)', () => {
    expect(strTostring(37.9, '#')).toBe('38');
  });

  it('"+#.#" → "+37.2" (signed positive)', () => {
    expect(strTostring(37.2, '+#.#')).toBe('+37.2');
  });

  it('"+#.#" → "-5.1" (signed negative)', () => {
    expect(strTostring(-5.1, '+#.#')).toBe('-5.1');
  });

  it('no format → cleanNumber fallback', () => {
    expect(strTostring(35.51401869)).toBe('35.51401869');
  });

  it('NaN → "NaN" (bypasses format)', () => {
    expect(strTostring(NaN, '#.##')).toBe('NaN');
  });

  it('Infinity → "Infinity" (bypasses format)', () => {
    expect(strTostring(Infinity, '#.##')).toBe('Infinity');
  });

  it('NA value → NA', () => {
    // str.tostring(na) returns NA (the PineValue sentinel), not the string "na"
    expect(strTostring(NA, '#.##')).toBe(NA);
  });

  it('non-number value → String(value)', () => {
    expect(strTostring('hello', '#.##')).toBe('hello');
  });
});
