# IEEE 754 Compatibility

The Pine Framework arithmetic runtime is built on JavaScript's `Number` type
(IEEE 754 double-precision binary64). This document describes how we handle the
well-known edge cases introduced by this representation, and what patterns
ensure correctness across all platforms.

## Table of Contents

1. [Guarded Arithmetic (`safeAdd` / `safeSub` / `safeMul` / `safeDiv`)](#guarded-arithmetic)
2. [NaN / Infinity → NA Propagation](#nan--infinity--na-propagation)
3. [Global NaN Sanitization](#global-nan-sanitization)
4. [Stable Rounding (`math.round`)](#stable-rounding-mathround)
5. [Kahan-Compensated Summation](#kahan-compensated-summation)
6. [Compound Assignment and NA](#compound-assignment-and-na)
7. [Guidelines for Contributors](#guidelines-for-contributors)

---

## Guarded Arithmetic

All arithmetic in Pine expressions (`+`, `-`, `*`, `/`) goes through guarded
wrappers in [`src/language/runtime/float-guards.ts`](../src/language/runtime/float-guards.ts):

| Function      | Guards                                 |
|---------------|----------------------------------------|
| `safeAdd(a,b)` | NaN, ±Infinity, overflow              |
| `safeSub(a,b)` | NaN, ±Infinity                        |
| `safeMul(a,b)` | NaN, ±Infinity, overflow              |
| `safeDiv(a,b)` | NaN, ±Infinity, division by zero, 0/0 |

Every guard returns **`NaN`** on failure, which the runtime's NaN-to-NA
propagation then converts to the Pine `na` sentinel.

### Why not throw?

Pine's semantics demand that `na` propagates silently through expressions
(`na + 1 → na`). Throwing would break this contract. Throwing would also
interrupt backtests on the first bad value rather than treating it as `na` and
continuing (TradingView-compatible behaviour).

### Overflow

JavaScript `Number` can represent values up to ~1.79e308. `safeAdd` and
`safeMul` check `Number.isFinite(result)` and return `NaN` for overflow, so
`1e200 * 1e200 → na`.

---

## NaN / Infinity → NA Propagation

The `guardFinite` helper is the last line of defence:

```typescript
function guardFinite(value: number): number {
  return Number.isFinite(value) ? value : NaN;
  // NaN is later converted to the Pine NA sentinel
}
```

It is used wherever a built-in function could produce a non-finite result
(division, logarithm, inverse trig, etc.).

`isFiniteNumber` is a convenience predicate used by built-in functions that
accept numeric arrays (e.g. `math.sum`, `math.max`, `math.min`) to skip
non-finite entries.

---

## Global NaN Sanitization

After **all bars** have been executed (in `Interpreter.executeBars`), a final
`sanitizeOutputs()` pass walks every output and replaces any remaining
`NaN`/`Infinity` value with the Pine `na` sentinel.

This is deliberately **not** done per-bar:
- During warmup, intermediate `NaN` values are normal (e.g. an SMA with a
  lookback of 14 needs 13 leading `na` values before producing a number).
- Sanitizing after every bar would corrupt those legitimate warmup `NaN`s.
- Doing it once at the end catches only leftover `NaN`/`Infinity` that escaped
  the per-operation guards (e.g. from a user-defined function that returns
  `NaN` directly).

See `Interpreter.sanitizeOutputs()` in `interpreter.ts`.

---

## Stable Rounding (`math.round`)

The `stableRound` function compensates for the classic IEEE 754 binary
representation error in `math.round(value, precision)`.

**Example:** `math.round(1.005, 2)`

| Step                    | Value                      |
|-------------------------|----------------------------|
| `1.005 * 100`           | `100.49999999999999`       |
| `+ 1e-12` (epsilon)     | `100.50000000099999`       |
| `Math.round(...) / 100` | `1.01`                     |

Without the epsilon, `1.005 * 100 → 100.49999999999999 → Math.round(...) → 100
→ 1.00` (wrong).

The epsilon `1e-12` is:
- Large enough to push the ~10^-14 binary error past the halfway point
- Small enough to never affect genuine values (the maximum bias is 10^-12 in
  the shifted domain, which is ~10^-14 in the original domain at precision 2
  — far below any practical threshold)

---

## Kahan-Compensated Summation

For calculations that accumulate many floating-point values (e.g. running
variance, covariance), the standard summation `sum += x` suffers from O(N)
error accumulation. The `kahanAdd` / `kahanZero` / `kahanValue` primitives in
`float-guards.ts` provide compensated summation with O(1) error.

```typescript
import { kahanZero, kahanAdd, kahanValue } from '.../float-guards.js';

let acc = kahanZero();
for (const x of values) kahanAdd(acc, x);
return kahanValue(acc);
```

**When to use Kahan:**
- Accumulating many values where cancellation is possible
- Computing dot products, weighted sums, or running statistics
- Any sum where the magnitude of intermediate terms varies widely

**When NOT to use Kahan:**
- Simple binary expressions (`a + b`) — `safeAdd` is sufficient
- Accumulating the same-magnitude values (e.g. summing `0.1` 100000×) — Kahan
  provides no benefit because all errors have the same sign
- Performance-critical paths where the extra operations matter (unlikely in
  practice — Kahan is ~4× slower than naive, but still sub-microsecond)

---

## Compound Assignment and NA

Compound assignment operators (`+=`, `-=`, `*=`, `/=`) propagate NA:

```pine
x = 10.0
x += na  // x is now na (not 10.0)
```

This matches TradingView's behaviour: once an operand is `na`, the result is
`na`. The `:=` operator (UDT field mutation) is **not** affected — it always
assigns the RHS value regardless of whether the current field value is `na`.

See `executeAssignment` in `statement-executor.ts`.

---

## Guidelines for Contributors

### 1. Always use `safeAdd`/`safeSub`/`safeMul`/`safeDiv`
Never use raw `+`, `-`, `*`, `/` for Pine runtime arithmetic. These guards
are imported in the expression executor and applied automatically for Pine
expressions, but any new built-in function that does arithmetic must call them
explicitly.

### 2. Use `guardFinite` for function results
If a built-in function returns a number that could be `NaN` or `Infinity`
(e.g. `Math.sqrt(-1)`, `Math.log(0)`, `Math.asin(1.0000001)`), wrap it with
`guardFinite`.

### 3. Filter NaN before Kahan summation
`kahanAdd` does not guard against NaN — a NaN input corrupts the accumulator
for all future additions. The caller must filter NaN first (e.g. via `safeAdd`
or `guardFinite`).

### 4. Add tests
Every guard or rounding change should have corresponding tests in
`tests/language/ieee754-arithmetic.test.ts`. At minimum:
- Each safe function with NaN/Infinity/zero/overflow inputs
- Kahan summation with cancellation scenarios
- `stableRound` with known binary-artifact values (1.005, 2.005, -1.005)
- Compound assignment NA propagation

### 5. Run the full suite
```bash
npm test
```

Changes to runtime arithmetic affect every indicator and strategy. The
supertrend integration test (`tests/integration/supertrend-diagnostic.test.ts`)
is a good canary for regressions — run it first during development.
