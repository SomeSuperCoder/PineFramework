/**
 * IEEE 754 arithmetic edge-case tests — covers NaN/Infinity guards,
 * compensated (Kahan) summation, and stable rounding.
 *
 * These tests verify that the Pine runtime handles the IEEE 754 binary
 * representation artifacts that plague naive JavaScript arithmetic.
 */
import {
  safeAdd,
  safeSub,
  safeMul,
  safeDiv,
  guardFinite,
  isFiniteNumber,
  isNearlyEqual,
  isNearZero,
  kahanAdd,
  kahanZero,
  kahanValue,
} from '../../src/language/runtime/float-guards.js';
import { NA, isNa } from '../../src/language/types/na.js';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

// =============================================================================
// Helper: execute a one-liner and return the last output value
// =============================================================================

function singleBarOutput(source: string, name = 'plot'): unknown {
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);
  const bar = {
    barIndex: 0,
    barCount: 1,
    timestamp: Date.now(),
    open: createSeries('open', [100]),
    high: createSeries('high', [105]),
    low: createSeries('low', [95]),
    close: createSeries('close', [102]),
    volume: createSeries('volume', [1000000]),
  };
  engine.executeBar(bar);
  return engine.getOutput(name)?.last();
}

// =============================================================================
// safeAdd / safeSub / safeMul / safeDiv  —  NaN & Infinity guards
// =============================================================================

describe('safeAdd', () => {
  it('preserves normal addition', () => {
    expect(safeAdd(3, 4)).toBe(7);
    expect(safeAdd(-1, 1)).toBe(0);
    expect(safeAdd(0.1, 0.2)).toBeCloseTo(0.3, 15);
  });

  it('returns NA when either operand is NaN', () => {
    expect(isNa(safeAdd(NaN, 5))).toBe(true);
    expect(isNa(safeAdd(5, NaN))).toBe(true);
    expect(isNa(safeAdd(NaN, NaN))).toBe(true);
  });

  it('returns NA when either operand is ±Infinity', () => {
    expect(isNa(safeAdd(Infinity, 5))).toBe(true);
    expect(isNa(safeAdd(5, -Infinity))).toBe(true);
    expect(isNa(safeAdd(Infinity, -Infinity))).toBe(true);
  });

  it('returns NA on result overflow', () => {
    expect(isNa(safeAdd(Number.MAX_VALUE, Number.MAX_VALUE))).toBe(true);
  });
});

describe('safeSub', () => {
  it('preserves normal subtraction', () => {
    expect(safeSub(10, 4)).toBe(6);
    expect(safeSub(0.3, 0.1)).toBeCloseTo(0.2, 15);
  });

  it('returns NA when either operand is NaN', () => {
    expect(isNa(safeSub(NaN, 5))).toBe(true);
    expect(isNa(safeSub(5, NaN))).toBe(true);
  });

  it('returns NA when either operand is ±Infinity', () => {
    expect(isNa(safeSub(Infinity, 5))).toBe(true);
    expect(isNa(safeSub(5, Infinity))).toBe(true);
    expect(isNa(safeSub(Infinity, Infinity))).toBe(true);
  });
});

describe('safeMul', () => {
  it('preserves normal multiplication', () => {
    expect(safeMul(3, 4)).toBe(12);
    expect(safeMul(0.1, 0.2)).toBeCloseTo(0.02, 15);
  });

  it('returns NA on NaN', () => {
    expect(isNa(safeMul(NaN, 1))).toBe(true);
    expect(isNa(safeMul(1, NaN))).toBe(true);
  });

  it('returns NA on Infinity', () => {
    expect(isNa(safeMul(Infinity, 2))).toBe(true);
    expect(isNa(safeMul(0, Infinity))).toBe(true);
  });

  it('returns NA on overflow', () => {
    expect(isNa(safeMul(1e200, 1e200))).toBe(true);
  });
});

describe('safeDiv', () => {
  it('preserves normal division', () => {
    expect(safeDiv(10, 4)).toBe(2.5);
    expect(safeDiv(1, 3)).toBeCloseTo(0.3333333333333333, 15);
  });

  it('returns NA on division by zero', () => {
    expect(isNa(safeDiv(5, 0))).toBe(true);
    expect(isNa(safeDiv(0, 0))).toBe(true);
  });

  it('returns NA on NaN', () => {
    expect(isNa(safeDiv(NaN, 1))).toBe(true);
  });

  it('returns NA on Infinity', () => {
    expect(isNa(safeDiv(Infinity, 2))).toBe(true);
  });

  it('returns NA on division of zero by zero', () => {
    expect(isNa(safeDiv(0, 0))).toBe(true);
  });
});

// =============================================================================
// guardFinite / isFiniteNumber
// =============================================================================

describe('guardFinite', () => {
  it('passes through finite numbers', () => {
    expect(guardFinite(42)).toBe(42);
    expect(guardFinite(-3.14)).toBe(-3.14);
    expect(guardFinite(0)).toBe(0);
  });

  it('replaces NaN with NA', () => {
    expect(guardFinite(NaN)).toBe(NA);
  });

  it('replaces Infinity with NA', () => {
    expect(guardFinite(Infinity)).toBe(NA);
    expect(guardFinite(-Infinity)).toBe(NA);
  });
});

describe('isFiniteNumber', () => {
  it('identifies finite numbers', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(1e-300)).toBe(true);
    expect(isFiniteNumber(-1e100)).toBe(true);
  });

  it('rejects non-finite values', () => {
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber(-Infinity)).toBe(false);
  });
});

// =============================================================================
// isNearlyEqual / isNearZero  —  tolerant comparison
// =============================================================================

describe('isNearlyEqual', () => {
  it('detects nearly equal values', () => {
    expect(isNearlyEqual(0.1 + 0.2, 0.3)).toBe(true);
    expect(isNearlyEqual(1.0, 1.0 + 1e-12)).toBe(true);
  });

  it('rejects significantly different values', () => {
    expect(isNearlyEqual(1.0, 2.0)).toBe(false);
    expect(isNearlyEqual(0.0, 0.1)).toBe(false);
  });
});

describe('isNearZero', () => {
  it('detects values very close to zero', () => {
    expect(isNearZero(0)).toBe(true);
    expect(isNearZero(1e-12)).toBe(true);
    expect(isNearZero(-1e-12)).toBe(true);
  });

  it('rejects non-zero values', () => {
    expect(isNearZero(0.001)).toBe(false);
    expect(isNearZero(-1)).toBe(false);
  });
});

// =============================================================================
// Kahan-compensated summation
// =============================================================================

describe('Kahan summation', () => {
  it('preserves small value added to moderate large one (catastrophic cancellation)', () => {
    // Here 1e12 is small enough that 1.0 changes the binary representation
    // (ULP around 1e12 is ~1e-4, so 1.0 is representable).
    // Naive: sum loses the 1.0; Kahan preserves it.
    const acc = kahanZero();
    kahanAdd(acc, 1e12);
    kahanAdd(acc, 1.0);
    kahanAdd(acc, -1e12);
    expect(kahanValue(acc)).toBe(1.0);
  });

  it('handles mixed signs without catastrophic cancellation', () => {
    const acc = kahanZero();
    kahanAdd(acc, 1e20);
    kahanAdd(acc, -1e20);
    kahanAdd(acc, 1.0);
    expect(kahanValue(acc)).toBe(1.0);
  });

  it('starts at zero', () => {
    const acc = kahanZero();
    expect(kahanValue(acc)).toBe(0);
  });

  it('accumulates correctly with small values after large ones', () => {
    const acc = kahanZero();
    kahanAdd(acc, 1e12);
    kahanAdd(acc, 1.0);           // lost with naive, preserved with Kahan
    kahanAdd(acc, -1e12);
    expect(kahanValue(acc)).toBe(1.0);
  });

  it('is reusable across multiple function calls', () => {
    const acc = kahanZero();
    for (let i = 0; i < 10; i++) kahanAdd(acc, i);
    expect(kahanValue(acc)).toBe(45);
  });

  it('handles empty sum (no adds)', () => {
    expect(kahanValue(kahanZero())).toBe(0);
  });

  it('handles zero input', () => {
    const acc = kahanZero();
    kahanAdd(acc, 0);
    expect(kahanValue(acc)).toBe(0);
  });

  it('handles NaN values — does not propagate but corrupts the accumulator', () => {
    const acc = kahanZero();
    kahanAdd(acc, NaN);
    // NaN in IEEE 754 Kahan will produce NaN and corrupt further adds
    // This is acceptable: the caller must filter NaN through safeAdd first.
    kahanAdd(acc, 5);
    expect(Number.isNaN(kahanValue(acc))).toBe(true);
  });
});

// =============================================================================
// stableRound  —  import from math-builtins (indirectly)
// =============================================================================

describe('stable rounding (IEEE 754 binary artifact defense)', () => {
  it('rounds 1.005 to 2 decimal places', () => {
    // 1.005 * 100 = 100.49999999999999 in IEEE 754 binary
    // Stable round should produce 1.01 (not 1.00)
    const result = singleBarOutput('//@version=5\nindicator("t")\nplot(math.round(1.005, 2))');
    expect(result).toBe(1.01);
  });

  it('rounds 2.005 to 2 decimal places', () => {
    const result = singleBarOutput('//@version=5\nindicator("t")\nplot(math.round(2.005, 2))');
    expect(result).toBe(2.01);
  });

  it('rounds 0.005 to 2 decimal places', () => {
    const result = singleBarOutput('//@version=5\nindicator("t")\nplot(math.round(0.005, 2))');
    expect(result).toBe(0.01);
  });

  it('rounds to integer with no precision argument', () => {
    const result = singleBarOutput('//@version=5\nindicator("t")\nplot(math.round(1.9))');
    expect(result).toBe(2);
  });

  it('rounds negative value correctly', () => {
    const result = singleBarOutput('//@version=5\nindicator("t")\nplot(math.round(-1.005, 2))');
    expect(result).toBe(-1.01);
  });

  it('rounds with precision 0', () => {
    const result = singleBarOutput('//@version=5\nindicator("t")\nplot(math.round(1.5, 0))');
    expect(result).toBe(2);
  });

  it('returns NA (null) for NA input', () => {
    // plot() stores NA values as null in the output series
    const result = singleBarOutput('//@version=5\nindicator("t")\nplot(math.round(na))');
    expect(result).toBeNull();
  });
});
