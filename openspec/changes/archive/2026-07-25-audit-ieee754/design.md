# Design Recommendations: IEEE 754 Numerical Hardening

## Problem Statement

The pine-framework performs extensive floating-point arithmetic for Pine Script execution, technical indicator calculation, and backtesting. IEEE 754 double-precision arithmetic inherently produces rounding errors, NaN, Infinity, and subnormal numbers. The framework currently has no systematic guard against these issues, treating all `number` type values as valid.

## Design Principles

1. **Fail visibly, not silently** — IEEE 754 NaN is not Pine Script na. Convert NaN to NA explicitly.
2. **Guard at entry, guard at exit** — Every arithmetic operation must pre-check inputs and post-check results.
3. **Numerical stability over textbook formulas** — Use numerically stable algorithms (two-pass, Kahan summation) where data magnitude varies.
4. **Epsilon awareness** — All float comparisons in indicator logic should use relative/absolute epsilon.
5. **Pin compatibility** — Match TradingView's IEEE 754 behavior precisely; document intentional divergences.

## Architectural Changes

### 1. Arithmetic Guard Layer

Add a utility module `src/language/runtime/float-guards.ts`:

```typescript
import { NA, type PineValue } from '../types/na.js';

/** Convert IEEE 754 NaN/Infinity to Pine Script NA. Finite numbers pass through. */
export function guardFinite(val: number): PineValue {
  return Number.isFinite(val) ? val : NA;
}

/** Check if a value is both a number AND finite (not NaN, not Infinity). */
export function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

/** Safe arithmetic with NaN/Infinity trapping */
export function safeAdd(a: number, b: number): PineValue { return guardFinite(a + b); }
export function safeSub(a: number, b: number): PineValue { return guardFinite(a - b); }
export function safeMul(a: number, b: number): PineValue { return guardFinite(a * b); }
export function safeDiv(a: number, b: number): PineValue { return b === 0 || !Number.isFinite(b) ? NA : guardFinite(a / b); }
export function safeMod(a: number, b: number): PineValue { return b === 0 || !Number.isFinite(b) ? NA : guardFinite(a % b); }
export function safePow(a: number, b: number): PineValue { return guardFinite(Math.pow(a, b)); }
```

### 2. Expression Executor Changes

Replace direct arithmetic in `executeBinaryExpression` with guard-wrapped operations:

```
- return (left as number) + (right as number);
+ return safeAdd(left as number, right as number);
```

### 3. Math Builtins Hardening

Add domain checks for all math functions:

| Function | Domain | Guard Action |
|----------|--------|-------------|
| `math.log` | x > 0 | return NA if x ≤ 0 |
| `math.log10` | x > 0 | return NA if x ≤ 0 |
| `math.sqrt` | x ≥ 0 | return NA if x < 0 |
| `math.asin` | -1 ≤ x ≤ 1 | clamp to [-1, 1], then guard |
| `math.acos` | -1 ≤ x ≤ 1 | clamp to [-1, 1], then guard |
| `math.round` | any | use stable rounding algorithm |
| `math.pow` | depends | guard result with guardFinite |

### 4. RingBuffer Recalculation

Add periodic running-sum recalibration to RingBuffer:

- Track count of incremental updates
- Every N*capacity pushes (N=10), recalculate sum from scratch
- This bounds the accumulated error to O(capacity * ε * magnitude) instead of O(N * ε * magnitude)

### 5. Numerically Stable Statistics

Replace one-pass formulas in `moving-averages.ts` with two-pass versions:

**correlation(current → proposed):**
```
// Current (cancellation-prone): 
numerator = length * sumXY - sumX * sumY
denominator = sqrt((length * sumX2 - sumX^2) * (length * sumY2 - sumY^2))

// Proposed (two-pass, stable):
meanX = sumX / length, meanY = sumY / length
centeredSumXY = Σ(x_i - meanX)(y_i - meanY)
centeredSumX2 = Σ(x_i - meanX)²
centeredSumY2 = Σ(y_i - meanY)²
r = centeredSumXY / sqrt(centeredSumX2 * centeredSumY2)
```

**linreg(current → proposed):**
Same two-pass approach: compute centered deviations from the mean.

### 6. Output Sanitization

Add NaN→NA conversion as a post-processing step in `executeBar()` and `executeBars()`:

```typescript
// After all Pine Script statements execute, sanitize outputs
for (const [name, series] of this.eng.outputs) {
  for (let i = 0; i < series.values.length; i++) {
    const v = series.values[i];
    if (typeof v === 'number' && !Number.isFinite(v)) {
      series.values[i] = NA as any;
    }
  }
}
```

### 7. Test Infrastructure

Create IEEE 754 test utilities:

```typescript
export const FLOAT_EPSILON = 1e-10;
export function expectCloseTo(actual: number, expected: number, epsilon = FLOAT_EPSILON): void {
  if (isNaN(expected)) expect(actual).toBeNaN();
  else if (expected === Infinity) expect(actual).toBe(Infinity);
  else expect(Math.abs(actual - expected)).toBeLessThan(epsilon);
}
```

## Migration Path

1. **Phase 1** (High Priority): Add `float-guards.ts` and wrap all arithmetic in expression-executor (C-001). Fix math builtins domain errors (H-001). Fix `isValidNumber` (H-003).

2. **Phase 2** (High Priority): Replace `math.round` algorithm (C-002). Add RingBuffer recalibration (C-004).

3. **Phase 3** (Medium Priority): Fix correlation/linreg numerical stability (C-003, H-005).

4. **Phase 4** (Medium Priority): Add epsilon comparisons to RSI, crossover, stoch, MFI (H-006, M-003, M-004).

5. **Phase 5** (Low Priority): Strategy avgPrice drift, Sharpe guard, general NaN path hardening (M-001, M-006, etc.).

6. **Phase 6** (Suggestion): Kahan summation, comprehensive tests, documentation.

## Backward Compatibility

- Converting IEEE 754 NaN to Pine NA changes observable behavior: scripts that currently produce NaN will produce NA instead. This is correct behavior and matches TradingView.
- Fixing `math.round` changes rounding behavior for 1.005-like cases. This is a bug fix.
- Epsilon comparisons may change border-case behavior in indicators. Document as "improved numerical stability."
- RingBuffer recalibration may change SMA values in the 15th decimal place — negligible impact.

## Performance Impact

- `guardFinite` adds one `Number.isFinite` call per arithmetic operation (~10ns in V8). For 10,000 bars × 1000 operations = 10M calls, this adds ~100ms per execution — negligible.
- RingBuffer recalibration adds O(capacity) work every 10×capacity pushes. For SMA(200) with 10000 bars, this adds ~200 extra divisions — negligible.
- Two-pass correlation/linreg doubles the inner loop cost. For typical lookbacks (<100), this is still <1μs per window.
