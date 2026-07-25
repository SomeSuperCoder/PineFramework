# Specification: IEEE 754 Floating-Point Arithmetic Behavior

## Status: Draft (from audit findings)

## Scope

Defines the numerical behavior of all floating-point operations in the Pine Script execution engine, technical indicators, and backtesting framework.

## Definitions

- **NA (Pine NA):** `Symbol.for('pine.na')` — the Pine Script `na` sentinel value.
- **JS NaN:** IEEE 754 quiet NaN — JavaScript `NaN` value, `typeof NaN === 'number'`.
- **JS Infinity:** IEEE 754 ±Infinity — `Number.POSITIVE_INFINITY` / `Number.NEGATIVE_INFINITY`.
- **Subnormal:** IEEE 754 denormalized numbers in range [2⁻¹⁰²², 2⁻¹⁰²⁶].

## Rules

### R1: Arithmetic Result Guards

ALL arithmetic operations MUST convert IEEE 754 NaN and ±Infinity to Pine NA.

```typescript
function guardFinite(val: number): PineValue {
  return Number.isFinite(val) ? val : NA;
}
```

**Rationale:** IEEE 754 NaN silently corrupts all downstream calculations. `NaN + 5 = NaN`, `NaN > 5 = false` (does not throw), `NaN === NaN = false`. This invisibility makes debugging impossible. Converting to Pine NA ensures detection because:
- `isNa(NA)` returns true
- `NA + 5 → NA` (guarded by `propagateNa` in binary ops)
- `isNa(NaN)` returns false (must convert first)

### R2: Operation-Specific Guards

| Operation | Pre-guard | Post-guard | Result on invalid |
|-----------|-----------|------------|-------------------|
| `+` | None | `guardFinite` | NA |
| `-` | None | `guardFinite` | NA |
| `*` | None | `guardFinite` | NA |
| `/` | `divisor === 0` → NA, `!isFinite(divisor)` → NA | `guardFinite` | NA |
| `%` | `divisor === 0` → NA, `!isFinite(divisor)` → NA | `guardFinite` | NA |
| `**` | None | `guardFinite` | NA |
| Unary `-` | None | `guardFinite` | NA |
| Unary `+` | None | `guardFinite` | NA |

### R3: Math Builtins Domain

| Function | Domain | Invalid Input | Must Return |
|----------|--------|---------------|-------------|
| `math.log(x)` | x > 0 | x ≤ 0 | NA |
| `math.log10(x)` | x > 0 | x ≤ 0 | NA |
| `math.sqrt(x)` | x ≥ 0 | x < 0 | NA |
| `math.asin(x)` | -1 ≤ x ≤ 1 | \|x\| > 1 | NA |
| `math.acos(x)` | -1 ≤ x ≤ 1 | \|x\| > 1 | NA |
| `math.exp(x)` | all real | none | finite check |
| `math.pow(x, y)` | x > 0 for non-integer y | domain error | NA |

### R4: Epsilon-Aware Comparisons

All float comparisons in indicator logic (not user-level Pine Script `==`/`!=` operators) MUST use epsilon-comparison for near-equality:

```typescript
const EPSILON = 1e-10;

function isNearZero(val: number): boolean {
  return Math.abs(val) < EPSILON;
}

function isEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}
```

### R5: RingBuffer Running Sum

The RingBuffer running sum MUST be recalibrated periodically to prevent unbounded error accumulation:

- Recalculate sum from buffer contents every `10 × capacity` pushes.
- Recalculate at minimum once per top-level execution pass.
- Expose `recalcSum()` as public method for forced recalibration.

### R6: Numerically Stable Statistics

All statistical correlation and regression calculations MUST use the two-pass (centered) algorithm:

**Forbidden:**
```
numerator = n * Σxy - Σx * Σy
```

**Required:**
```
meanX = Σx / n
meanY = Σy / n
centeredXY = Σ(x_i - meanX)(y_i - meanY)
```

### R7: Output Sanitization

After each bar executes, all output Series values MUST be checked for IEEE 754 NaN/Infinity and converted to NA:

```typescript
for (const series of outputs.values()) {
  for (let i = 0; i < series.values.length; i++) {
    if (typeof series.values[i] === 'number' && !Number.isFinite(series.values[i] as number)) {
      series.values[i] = NA as any;
    }
  }
}
```

### R8: `isValidNumber` Contract

`isValidNumber` MUST reject any number that is not finite:

```typescript
export function isValidNumber(value: PineValue): value is number {
  return typeof value === 'number' && !isNa(value) && Number.isFinite(value);
}
```

### R9: `math.round` Behavior

`math.round(value, precision)` MUST produce TradingView-compatible half-up rounding:

```typescript
function mathRound(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  // Shift borderline cases (e.g., 1.005) that are below the exact halfway point
  // due to IEEE 754 binary representation
  const shifted = value * factor;
  const epsilon = Number.EPSILON * Math.sign(value) * 0.5;
  return Math.round(shifted + epsilon) / factor;
}
```

## Edge Cases

### EC1: -0 (Negative Zero)
IEEE 754 has a distinct negative zero. Pine Script treats -0 as 0. The engine MUST ensure `Object.is(result, -0) → false` by applying `x + 0` or `x || 0` conversion when -0 is produced.

### EC2: Subnormal Numbers
Subnormal (denormalized) numbers below 2⁻¹⁰²² may appear. They MUST be handled identically to normal numbers per IEEE 754.

### EC3: Denormalized Comparison
`-0 === 0` is `true` in JavaScript (IEEE 754). This is correct behavior and should not be changed.

### EC4: Mixed NA and NaN
If a computation produces both Pine NA and IEEE 754 NaN (e.g., adding a Pine NA value to a NaN), the result MUST be Pine NA. The NA check in `executeBinaryExpression` handles this: `if (isNa(left) || isNa(right)) return NA` runs before the arithmetic, so NA propagates before NaN.

## Test Requirements

All arithmetic operations MUST be tested with:
1. Normal finite values
2. Zero (+0 and -0)
3. Positive and negative Infinity
4. NaN
5. Subnormal numbers (e.g., `5e-324`)
6. Very large numbers (>1e15)
7. Very small numbers (<1e-15)
8. Values at IEEE 754 precision boundaries
9. Series with mixed finite and non-finite values
10. All math builtins with invalid domain arguments
