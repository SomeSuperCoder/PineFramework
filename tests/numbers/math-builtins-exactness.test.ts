/**
 * M4 MATH-BUILTINS EXACTNESS — decimal core delegation (contract §2.2/§4).
 *
 * Locks the M4 migration: all 21 `math.*` builtins in math-builtins.ts are
 * boundary adapters (toDecimal → numericOps → decimalToPineValue, convert once
 * at the boundary). Directly invokes the registered builtins through a real
 * ExecutionEngine (same construction pattern as execution-engine.test.ts /
 * ieee754-arithmetic.test.ts — parse → compile → new ExecutionEngine), then
 * calls `engine.builtins.get('math.x')` directly — no script plumbing, no bar
 * execution. This exercises the ACTUAL M4 adapter code, not a re-implementation.
 *
 * Known intentional upgrades asserted here:
 *   • sin/cos(Inf) → NA        (was NaN leak R2)
 *   • sqrt(Inf) → NA           (was Infinity leak R4)
 *   • avg exact                (was float drift)
 *   • round exact half-up      (was stableRound IEEE epsilon hack, now deleted)
 *
 * FLAGGED DISCREPANCY (for QA audit M4-5): the M4 spawn spec expected
 * `math.asin(2) → NA`. The shipped builtin CLAMPS to [-1, 1] (documented in
 * math-builtins.ts) → asin(2) = asin(1) = π/2, acos(2) = acos(1) = 0. Legacy
 * was `Math.asin(2)` unguarded → NaN leak (R2 violation). This suite asserts
 * the SHIPPED, code-documented contract; the spec-vs-code mismatch is flagged,
 * not silently re-baselined.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { NA, type PineValue } from '../../src/language/types/na.js';
import { configureDecimal } from '../../src/language/runtime/numbers/decimal-config.js';

// Contract §9/§10 — DP=20, ROUND_HALF_UP active for every assertion.
configureDecimal();

// ---------------------------------------------------------------------------
// Engine + builtin access — the ONLY plumbing in this suite
// ---------------------------------------------------------------------------

const { ast } = parse('//@version=6\nindicator("M4 Exactness", overlay=true)\nplot(close, "c")');
const engine = new ExecutionEngine(compile(ast));

type BuiltinFn = (...args: unknown[]) => PineValue;

function math(name: string): BuiltinFn {
  const fn = engine.builtins.get(`math.${name}`);
  if (!fn) throw new Error(`math.${name} not registered`);
  return fn as BuiltinFn;
}

// Documented trig ceiling (decimal.js DP=20 accuracy, decimal-config note).
const TRIG_TOL_DIGITS = 15;

describe('M4 math builtins — exactness (decimal core delegation)', () => {
  describe('sum — exact decimal accumulation', () => {
    it('sum(0.1, 0.2, 0.3) === 0.6 exactly (was 0.6000000000000001 float)', () => {
      expect(math('sum')(0.1, 0.2, 0.3)).toBe(0.6);
    });

    it('sum(0.1) === 0.1 exactly', () => {
      expect(math('sum')(0.1)).toBe(0.1);
    });

    it('all-NA → NA', () => {
      expect(math('sum')(NA, NA)).toBe(NA);
    });
  });

  describe('avg — exact mean', () => {
    it('avg(0.1, 0.2) === 0.15 exactly (was 0.15000000000000002 float)', () => {
      expect(math('avg')(0.1, 0.2)).toBe(0.15);
    });

    it('avg(0.1, 0.2, 0.3) === 0.2 exactly', () => {
      expect(math('avg')(0.1, 0.2, 0.3)).toBe(0.2);
    });

    it('all-NA → NA', () => {
      expect(math('avg')(NA, NA)).toBe(NA);
    });
  });

  describe('round — exact half-up (stableRound epsilon hack deleted)', () => {
    it('round(1.005, 2) === 1.01', () => {
      expect(math('round')(1.005, 2)).toBe(1.01);
    });

    it('round(-1.005, 2) === -1.01', () => {
      expect(math('round')(-1.005, 2)).toBe(-1.01);
    });

    it('round(2.5) === 3 (half-up per config, no precision arg)', () => {
      expect(math('round')(2.5)).toBe(3);
    });

    it('round(1.234, 1) === 1.2', () => {
      expect(math('round')(1.234, 1)).toBe(1.2);
    });

    it('round(0.005, 2) === 0.01 (half-up, not 0.00)', () => {
      expect(math('round')(0.005, 2)).toBe(0.01);
    });

    it('round(1.5) === 2 (half-up default)', () => {
      expect(math('round')(1.5)).toBe(2);
    });
  });

  describe('sqrt — exact perfect squares, domain NA', () => {
    it('sqrt(0.25) === 0.5 exactly', () => {
      expect(math('sqrt')(0.25)).toBe(0.5);
    });

    it('sqrt(4) === 2 exactly', () => {
      expect(math('sqrt')(4)).toBe(2);
    });

    it('sqrt(-1) → NA', () => {
      expect(math('sqrt')(-1)).toBe(NA);
    });
  });

  describe('max/min — exact selection', () => {
    it('max(0.1, 0.2, 0.3) === 0.3 exactly', () => {
      expect(math('max')(0.1, 0.2, 0.3)).toBe(0.3);
    });

    it('min(0.3, 0.2, 0.1) === 0.1 exactly', () => {
      expect(math('min')(0.3, 0.2, 0.1)).toBe(0.1);
    });

    it('all-NA → NA for both', () => {
      expect(math('max')(NA, NA)).toBe(NA);
      expect(math('min')(NA, NA)).toBe(NA);
    });
  });

  describe('pow — exact exponentiation', () => {
    it('pow(2, 10) === 1024 exactly', () => {
      expect(math('pow')(2, 10)).toBe(1024);
    });

    it('pow(0.5, 2) === 0.25 exactly', () => {
      expect(math('pow')(0.5, 2)).toBe(0.25);
    });
  });

  describe('abs/floor/ceil/sign — exact + NA propagation', () => {
    it('abs(-0.5) === 0.5; abs(0) === 0', () => {
      expect(math('abs')(-0.5)).toBe(0.5);
      expect(math('abs')(0)).toBe(0);
    });

    it('floor(2.7) === 2; floor(-2.1) === -3 (toward -∞)', () => {
      expect(math('floor')(2.7)).toBe(2);
      expect(math('floor')(-2.1)).toBe(-3);
    });

    it('ceil(2.3) === 3; ceil(-2.7) === -2', () => {
      expect(math('ceil')(2.3)).toBe(3);
      expect(math('ceil')(-2.7)).toBe(-2);
    });

    it('sign(-5) === -1; sign(0) === 0; sign(5) === 1 (primitive, no exit-convert)', () => {
      expect(math('sign')(-5)).toBe(-1);
      expect(math('sign')(0)).toBe(0);
      expect(math('sign')(5)).toBe(1);
    });

    it('NA propagation: abs/floor/ceil/sign(NA) → NA', () => {
      expect(math('abs')(NA)).toBe(NA);
      expect(math('floor')(NA)).toBe(NA);
      expect(math('ceil')(NA)).toBe(NA);
      expect(math('sign')(NA)).toBe(NA);
    });
  });

  describe('log/log10/exp — domain guards + boundary overflow', () => {
    it('log(1) === 0', () => {
      expect(math('log')(1)).toBe(0);
    });

    it('log(0) → NA; log(-1) → NA (non-positive domain)', () => {
      expect(math('log')(0)).toBe(NA);
      expect(math('log')(-1)).toBe(NA);
    });

    it('log10(100) === 2', () => {
      expect(math('log10')(100)).toBe(2);
    });

    it('exp(0) === 1', () => {
      expect(math('exp')(0)).toBe(1);
    });

    it('exp(1000) → NA (decimal-finite overflow collapses at boundary, R4)', () => {
      expect(math('exp')(1000)).toBe(NA);
    });
  });

  describe('trig — exactness with documented 1e-15 ceiling', () => {
    it('sin(0) === 0; cos(0) === 1', () => {
      expect(math('sin')(0)).toBe(0);
      expect(math('cos')(0)).toBe(1);
    });

    it('sin(π/2) ≈ 1 within 1e-15', () => {
      expect(math('sin')(Math.PI / 2)).toBeCloseTo(1, TRIG_TOL_DIGITS);
    });

    it('asin(1) ≈ π/2 within 1e-15', () => {
      expect(math('asin')(1)).toBeCloseTo(Math.PI / 2, TRIG_TOL_DIGITS);
    });

    it('atan2(1, 1) ≈ π/4 within 1e-15', () => {
      expect(math('atan2')(1, 1)).toBeCloseTo(Math.PI / 4, TRIG_TOL_DIGITS);
    });

    it('atan2(0, 0) === 0', () => {
      expect(math('atan2')(0, 0)).toBe(0);
    });

    it('FLAGGED (QA M4-5): asin(2) === asin(1) ≈ π/2 — shipped clamp, NOT NA (spec drift)', () => {
      // M4 spawn spec expected asin(2) → NA. Shipped code clamps to [-1,1]
      // (documented intentional, math-builtins.ts). Legacy was Math.asin(2)
      // unguarded → NaN leak (R2). Assert shipped contract; QA audits.
      expect(math('asin')(2)).toBeCloseTo(Math.PI / 2, TRIG_TOL_DIGITS);
    });

    it('FLAGGED (QA M4-5): acos(2) === acos(1) === 0 — shipped clamp, NOT NA (spec drift)', () => {
      expect(math('acos')(2)).toBeCloseTo(0, TRIG_TOL_DIGITS);
    });
  });

  describe('R4 — no Infinity can reach PineValue space', () => {
    it('sin/cos/tan(Infinity) → NA (was NaN leak R2)', () => {
      expect(math('sin')(Infinity)).toBe(NA);
      expect(math('cos')(Infinity)).toBe(NA);
      expect(math('tan')(Infinity)).toBe(NA);
    });

    it('exp(Infinity) → NA', () => {
      expect(math('exp')(Infinity)).toBe(NA);
    });

    it('sqrt(Infinity) → NA (was Infinity leak R4)', () => {
      expect(math('sqrt')(Infinity)).toBe(NA);
    });
  });

  describe('R3 — NA args → NA, never throw (all 21 builtins)', () => {
    it('max/min — NA args FILTERED (documented legacy convention), all-NA → NA', () => {
      expect(() => math('max')(NA, 1)).not.toThrow();
      expect(math('max')(NA, 1)).toBe(1); // NA filtered; survivor wins
      expect(math('min')(NA, 1)).toBe(1);
      expect(math('max')(NA)).toBe(NA); // all-NA → NA
      expect(math('min')(NA)).toBe(NA);
    });

    it('abs/round/floor/ceil/sqrt/sign', () => {
      expect(() => math('abs')(NA)).not.toThrow();
      expect(math('abs')(NA)).toBe(NA);
      expect(math('round')(NA)).toBe(NA);
      expect(math('floor')(NA)).toBe(NA);
      expect(math('ceil')(NA)).toBe(NA);
      expect(math('sqrt')(NA)).toBe(NA);
      expect(math('sign')(NA)).toBe(NA);
    });

    it('pow — NA on either operand', () => {
      expect(() => math('pow')(NA, 2)).not.toThrow();
      expect(math('pow')(NA, 2)).toBe(NA);
      expect(math('pow')(2, NA)).toBe(NA);
    });

    it('log/log10/exp/sin/cos/tan/asin/acos/atan', () => {
      expect(() => math('log')(NA)).not.toThrow();
      expect(math('log')(NA)).toBe(NA);
      expect(math('log10')(NA)).toBe(NA);
      expect(math('exp')(NA)).toBe(NA);
      expect(math('sin')(NA)).toBe(NA);
      expect(math('cos')(NA)).toBe(NA);
      expect(math('tan')(NA)).toBe(NA);
      expect(math('asin')(NA)).toBe(NA);
      expect(math('acos')(NA)).toBe(NA);
      expect(math('atan')(NA)).toBe(NA);
    });

    it('atan2 — NA on either operand', () => {
      expect(() => math('atan2')(NA, 1)).not.toThrow();
      expect(math('atan2')(NA, 1)).toBe(NA);
      expect(math('atan2')(1, NA)).toBe(NA);
    });

    it('sum/avg — NA filtered, all-NA → NA', () => {
      expect(() => math('sum')(NA)).not.toThrow();
      expect(math('sum')(NA)).toBe(NA);
      expect(math('avg')(NA)).toBe(NA);
      expect(math('sum')(NA, 1, NA)).toBe(1);
      expect(math('avg')(NA, 1, NA)).toBe(1);
    });
  });
});