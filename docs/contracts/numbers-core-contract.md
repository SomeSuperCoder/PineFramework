# Contract — Decimal-Safe Numeric Core (`src/language/runtime/numbers/`)

**Status:** SPEC — implementation spec for backend-engineer
**Author:** team/backend/api-designer
**Date:** 2026-08-16
**Complexity:** T4 · HEAVY
**Dependency:** `decimal.js@10.6.0` (exact pin — see §8)
**Consumes:** existing `float-guards.ts` call sites (zero-touch migration)

---

## 0. The Seam Architecture (dual-representation)

```
PineValue (number | NA) ──@pinevalue-boundary──▶ toDecimal ──▶ Decimal ──▶ NumericOps ──▶ Decimal
      ▲                                                                                     │
      └────────────────────────── decimalToPineValue (NA collapse) ◀────────────────────────┘
Decimal ──@renderer-boundary──▶ toCanvasFloat() ──▶ number ──▶ canvas pixels (plain number only)
Decimal ──decimalToString()──▶ string ──▶ display (NEVER through Number)
```

- **Layer 1 — NumericOps (`decimal-ops.ts`):** pure `Decimal → Decimal`. Total — never throws on
  NaN/Infinity; represents them as Decimal NaN/±Infinity. Used by the TA layers, `src/analysis/*`,
  and the re-implemented `safe*` boundary.
- **Layer 2 — boundaries (`decimal-convert.ts`, `decimal-guard.ts`):** the only places NA mapping,
  -0 normalization, and Number round-trips occur.
- **Migration rule:** existing `safe*` functions in `float-guards.ts` KEEP their exact public names
  and signatures; only their bodies delegate to the core. **No import path changes anywhere.**
- **Conversion budget rule:** convert ONCE per series/bar at the boundary, never per operation.
  A TA layer that computes `sma` holds `Decimal[]` internally and converts once per bar via
  `decimalToPineValue`. Per-op `toNumber()` round-trips are a defect.

---

## 1. Module Layout

```
src/language/runtime/numbers/
├── index.ts             ← barrel: exports numericOps, NumericOps, DecimalInput, and
│                           toDecimal, toNumber, decimalToPineValue, pineValueToDecimal,
│                           decimalToString, toCanvasFloat, guardFiniteDecimal,
│                           ensureFiniteDecimal, DECIMAL_* constants
├── decimal-config.ts    ← DP=20, rounding half-up, PI/E/EPSILON, configureDecimal(), clone rule
├── decimal-ops.ts       ← NumericOps interface + numericOps singleton (the only numeric engine)
├── decimal-convert.ts   ← toDecimal / toNumber / decimalToPineValue / pineValueToDecimal /
│                           decimalToString / toCanvasFloat (+ @pinevalue-boundary / @renderer-boundary)
└── decimal-guard.ts     ← guardFiniteDecimal, ensureFiniteDecimal, NUMERIC_ERROR_CODES, messages
```

`float-guards.ts` is NOT moved: its public API is re-implemented over the core (see §2.2). Kahan
(`KahanAccumulator`, `kahanAdd`, `kahanZero`, `kahanValue`) is REMOVED from `float-guards.ts` after
the CodeGraph caller check confirms no callers outside the file; the 100k-bar accumulation spike
(§7, T3) proves decimal accumulation supersedes compensated summation.

---

## 2. NumericOps — Exact TypeScript Signatures

### 2.1 The internal engine (`decimal-ops.ts`)

```typescript
import Decimal from 'decimal.js';

export interface NumericOps {
  // ── binary arithmetic (exact decimal semantics, configured precision/rounding) ──
  add(a: Decimal, b: Decimal): Decimal;      // d.plus
  sub(a: Decimal, b: Decimal): Decimal;      // d.minus
  mul(a: Decimal, b: Decimal): Decimal;      // d.times
  div(a: Decimal, b: Decimal): Decimal;      // d.div — div-by-zero → NaN (Pine na semantics, §3 R5)
  mod(a: Decimal, b: Decimal): Decimal;      // d.mod — mod-by-zero → NaN
  pow(a: Decimal, b: Decimal): Decimal;      // d.pow — exponent may be Decimal

  // ── unary ──
  abs(a: Decimal): Decimal;                  // d.abs
  sqrt(a: Decimal): Decimal;                 // d.sqrt — sqrt(negative) → NaN
  floor(a: Decimal): Decimal;                // d.floor
  ceil(a: Decimal): Decimal;                 // d.ceil
  round(a: Decimal, dp?: number): Decimal;   // d.toDecimalPlaces(dp ?? 0) — half-up per config
  trunc(a: Decimal): Decimal;                // d.trunc
  neg(a: Decimal): Decimal;                  // d.negated

  // ── aggregation (replaces Kahan) ──
  min(...values: Decimal[]): Decimal;        // Decimal.min(...values)
  max(...values: Decimal[]): Decimal;        // Decimal.max(...values)
  sum(values: Iterable<Decimal>): Decimal;   // Decimal.sum(...spread) — exact accumulation

  // ── predicates / comparison — ALWAYS return plain JS primitives, never Decimal ──
  sign(a: Decimal): -1 | 0 | 1;              // d.sign() — includes signed zero sign
  compare(a: Decimal, b: Decimal): -1 | 0 | 1; // d.cmp — exact decimal comparison
  equals(a: Decimal, b: Decimal): boolean;   // d.eq — exact decimal equality
  isZero(a: Decimal): boolean;               // d.isZero
  isNearZero(a: Decimal, epsilon?: Decimal): boolean; // d.abs().lte(epsilon ?? DECIMAL_EPSILON)
  isNaN(a: Decimal): boolean;                // d.isNaN — the internal invalid marker
  isFinite(a: Decimal): boolean;             // d.isFinite
  isNegative(a: Decimal): boolean;           // d.isNeg — true for -0 as well
}

export const numericOps: NumericOps;
```

- **Decimal variants of `safe*`:** `numericOps.add` IS the decimal variant of `safeAdd`. No
  `d-prefixed` duplicate surface is defined; a consumer wanting Decimal math imports `numericOps`.
  (Exception allowed: a file-local alias `const { add: dAdd } = numericOps` is fine.)

### 2.2 The drop-in boundary (`float-guards.ts` — bodies only change)

Exact signatures preserved — **call sites in `expression-executor.ts`, `statement-executor.ts`,
`ta-momentum.ts`, `math-builtins.ts` stay untouched**:

```typescript
// float-guards.ts — same exports, new bodies (delegate through the core)
export function safeAdd(a: number, b: number): PineValue;   // was a+b+guardFinite
export function safeSub(a: number, b: number): PineValue;
export function safeMul(a: number, b: number): PineValue;
export function safeDiv(a: number, b: number): PineValue;   // b===0 → NA (preserved)
export function safeMod(a: number, b: number): PineValue;   // b===0 → NA (preserved)
export function safePow(a: number, b: number): PineValue;
export function safeUnaryMinus(a: number): PineValue;
export function safeUnaryPlus(a: number): PineValue;
export function guardFinite(val: number): PineValue;        // finite → number, else NA
export function isFiniteNumber(val: unknown): val is number;
export function isNearZero(val: number, epsilon?: number): boolean;
export function isNearlyEqual(a: number, b: number, epsilon?: number): boolean;
```

Internal shape of each: `toDecimal(a) → toDecimal(b) → numericOps.<op> → decimalToPineValue`.
The observable PineValue contract (`number | NA`) is byte-identical to today.

`ensureFinite` (throws `RuntimeError`) is deprecated in favor of `ensureFiniteDecimal`
(§5) for new code; existing callers keep working unchanged.

---

## 3. NA / NaN / Infinity Policy (the landmine)

| # | Rule |
|---|------|
| **R1** | **A Decimal can never BE Pine NA.** `NA` is `Symbol.for('pine.na')`; a Decimal is an object. The mapping exists ONLY in `decimal-convert.ts`. |
| **R2** | **Internal invalid marker = Decimal NaN.** Decimal.js propagates NaN natively (`NaN op x → NaN`). All ops inherit this — no special-casing inside `NumericOps`. |
| **R3** | **The core is TOTAL — it never throws for NaN/Infinity/div-by-zero.** They produce Decimal NaN/±Infinity and collapse to NA at the boundary. Throws are reserved for type violations (non-numeric input, §4) and `ensureFiniteDecimal` invariant failures. |
| **R4** | **Boundary collapse:** `decimalToPineValue` maps BOTH NaN and ±Infinity → `NA` (matches today's `guardFinite`). No Infinity can ever reach a PineValue. |
| **R5** | **Division/mod by zero → Decimal NaN, NOT Infinity** (`numericOps.div(a, 0)` → NaN). Pine treats `x/0` as `na`; NaN→NA at the boundary; avoids Infinity leaking into non-boundary paths. Matches today's `safeDiv`/`safeMod` (`b===0 → NA`). |
| **R6** | ±Infinity MAY exist transiently inside the core (e.g. `pow` overflow). All ops propagate it; only the boundaries may convert it — and both (`decimalToPineValue`, `toCanvasFloat`) collapse/guard it. |

Input mapping (in `toDecimal`, §4): `NA → NaN`; `null → NaN`; `number NaN → NaN`; `±Infinity → ±Infinity` (transient, R6).

---

## 4. decimal-convert.ts — Conversion Contract

```typescript
import Decimal from 'decimal.js';
import type { PineValue } from '../types/na.js';

export type DecimalInput = number | string | Decimal;

// @pinevalue-boundary — the ONLY way PineValues enter the core
export function pineValueToDecimal(v: PineValue, context?: string, barIndex?: number): Decimal;
// number | Decimal | string → Decimal (string preferred for >15 sig figs, see pitfall below)
export function toDecimal(input: DecimalInput | PineValue, context?: string, barIndex?: number): Decimal;

// @pinevalue-boundary — the ONLY way Decimals exit to PineValue space
export function decimalToPineValue(d: Decimal): PineValue; // finite → number; NaN/±Inf → NA; -0 → 0

// @renderer-boundary — the ONLY number conversion on the display path
export function toCanvasFloat(d: Decimal): number;         // d.toNumber(), -0 normalized to 0

// display-only — NEVER via Number
export function decimalToString(d: Decimal, dp?: number): string; // dp? d.toFixed(dp) : d.toString()

export function isNaDecimal(d: Decimal): boolean;          // d.isNaN() — internal invalid marker
```

### Input rules (documented pitfall)

| Input | Result | Note |
|-------|--------|------|
| `string` | exact `Decimal(string)` | **Preferred** for literals >15 significant digits or decimal literals (bar data often arrives as strings) |
| `number` | shortest round-trip (`new Decimal(0.1)` → `'0.1'`) | ⚠️ `new Decimal(1.0000000000000001)` → `'1'` (15+ sig-fig loss) |
| `number` that is a float-COMPUTED result | corrupted (`new Decimal(0.1+0.2)` → `'0.30000000000000004'`) | **BANNED:** numbers entering the core MUST be raw values (literals, bar prices, inputs). Float-computed results must be re-derived inside the core. |
| `PineValue` NA | `NaN` Decimal | internal invalid marker (R1/R2) |
| `PineValue` null | `NaN` Decimal | |
| `number` NaN | `NaN` Decimal | |
| `number` ±Infinity | ±Infinity Decimal | transient only (R6) |
| `PineValue` boolean/string/array/Map | **THROW** `RuntimeError` | numeric core is numeric-only — the only input throw path |

### Output rules

- `decimalToPineValue`: finite → `number`; NaN/±Infinity → `NA`; -0 → `+0`.
- `toNumber`: raw `d.toNumber()` (can yield NaN/Infinity/-0) — used ONLY by the two boundary
  functions, never for display.
- `decimalToString`: `dp` provided → `d.toFixed(dp)` (half-up per config); no `dp` → `d.toString()`
  (shortest exact representation — `"0.3"`, never `"0.30000000000000004"`).

---

## 5. decimal-guard.ts — Guard Contract

```typescript
import Decimal from 'decimal.js';
import { RuntimeError } from '../../../common/errors.js';

export const NUMERIC_ERROR_CODES = {
  NON_NUMERIC_INPUT: 'NUMERIC_NON_NUMERIC_INPUT',  // type violation at a numeric boundary
  NON_FINITE_VALUE: 'NUMERIC_NON_FINITE_VALUE',    // ensureFiniteDecimal invariant failure
} as const;

export function guardFiniteDecimal(d: Decimal): Decimal;
// NaN/±Infinity → NaN Decimal (internal NA marker); finite passes through unchanged.

export function ensureFiniteDecimal(d: unknown, context: string, barIndex?: number): asserts d is Decimal;
// Throws RuntimeError if d is not a Decimal or is NaN/±Infinity.
```

### Error message contract (stable, per error-patterns)

| Code | Message shape |
|------|---------------|
| `NUMERIC_NON_NUMERIC_INPUT` | `Expected numeric value for ${context}, got ${typeof v}` (+ barIndex) |
| `NUMERIC_NON_FINITE_VALUE` | `Non-finite decimal for ${context}: ${d.toString()}` (+ barIndex) |

Messages are human-readable and may change; codes are stable and machine-readable. `RuntimeError`
keeps its existing `(message, barIndex)` constructor. Never expose decimal.js internals in messages.

---

## 6. -0, Comparison, Truthiness — the R1 Landmine

### -0 policy
- decimal.js has signed zero (`d.isNeg() && d.isZero()`), and `Decimal.cmp(-0, 0) === 0`.
- **Normalize `-0 → +0` at BOTH boundaries** (`decimalToPineValue`, `toCanvasFloat`).
- Inside the core, leave sign untouched (native decimal.js behavior); never special-case.

### Comparison rules
- Value comparison ALWAYS via `numericOps.compare` / `numericOps.equals` (`Decimal.cmp` / `Decimal.eq`).
- **`===` on Decimal is REFERENCE equality — BANNED.** Two Decimals with the same value are
  different objects; `a === b` is always false for distinct instances. Use `numericOps.equals`.

### Truthiness ban (frontend-lead R1)
- **`||`, `??`, `!d` on Decimal are BANNED.** Decimal instances are ALWAYS truthy:
  `d || fallback` never takes `fallback` (even for `Decimal(0)`); `!d` is always `false`.
- Replacements:
  - `d || fallback` → `d.isZero() ? fallback : d`
  - `d ?? fallback` → `numericOps.isNaN(d) ? fallback : d`
  - `!d` → `d.isZero()`
- Enforcement: eslint `no-restricted-syntax`/custom rule banning `!`/`||`/`??` on identifiers
  typed `Decimal`; at minimum, a reviewer checklist item + the `@ban-number-roundtrip` grep marker.

---

## 7. Decimal→Number→String Ban Marker

**Rule:** visible values must NEVER round-trip through Number before display.

- String production for display comes ONLY from `decimalToString()` (§4) — internally
  `Decimal.prototype.toFixed`/`toString`. 
- **BANNED patterns** (carry `@ban-number-roundtrip` marker when found in legacy code; new code
  must not introduce them):
  - `d.toNumber().toFixed(2)` / `.toPrecision(n)` / `.toString()`
  - `String(numberThatCameFromDecimal)`, `` `${decimal.toNumber()}` ``, `Number(d)`
- Where strings legitimately ENTER: `toDecimal(string)` input parsing (bar data, user literals).
- Where strings legitimately LEAVE: `decimalToString` only.
- Add eslint `no-restricted-syntax` entries for `.toNumber()` followed by string-producing calls,
  and for `Number(` applied to Decimal-typed expressions.

---

## 8. Renderer Seam Rule

- Visible values stay **Decimal until the final pixel conversion**: `toCanvasFloat(d): number` is
  the ONLY `@renderer-boundary` number conversion on the display path.
- **Nothing decimal in canvas pixel geometry.** x/y/width/height/coordinates/scale are plain
  `number` from the moment `toCanvasFloat` returns. Decimal NEVER appears in canvas draw calls,
  layout math, or scale computation.
- `@pinevalue-boundary` marks the PineValue conversions (series storage, operator results,
  builtin returns). Both markers are greppable and review-enforced.
- `toCanvasFloat` must also normalize `-0 → +0` (canvas is sign-of-zero indifferent).

---

## 9. Version Pinning

```json
// package.json — dependencies (runtime, NOT devDependencies)
"decimal.js": "10.6.0"
```

**Pin EXACT** (no `^`/`~`). Why:
- `10.6.0` is the latest stable (`latest` tag, ~71M weekly downloads, MIT, zero runtime deps).
- The 10.x API is the one this contract is written against (`Decimal.set`, `ROUND_HALF_UP`,
  `plus/minus/times/div/mod/pow`, `eq/cmp/isZero/isNaN/isFinite/isNeg`, `toFixed/toString/toNumber`).
- The upstream CHANGELOG shows a **breaking major brewing** (removed `toFormat`, `Decimal.ONE`,
  `Decimal.errors`; renamed `exponential` → `naturalExponential`, `Decimal.constructor` →
  `Decimal.clone`). A caret range would auto-upgrade into it and break the contract.
- decimal.js ships its own `decimal.d.ts` — no `@types/decimal.js` needed.
- **Config isolation rule:** the configured `Decimal` (DP=20, half-up) is the single global
  default. Any consumer needing a different precision MUST use `Decimal.clone()` — never mutate
  the global config after `configureDecimal()` runs.

### decimal-config.ts

```typescript
import Decimal from 'decimal.js';

export const DECIMAL_PRECISION = 20;                    // significant digits (decimal.js semantics)
export const DECIMAL_ROUNDING = Decimal.ROUND_HALF_UP;  // = 4
export const DECIMAL_EPSILON = new Decimal('1e-12');    // isNearZero default
export const PI = Decimal.acos(-1);                     // ⚠️ trig-derived: ~15 sig-fig accuracy (decimal.js limit)
export const E = Decimal.exp(1);                        // same trig/exp caveat

export function configureDecimal(): void {
  Decimal.set({ precision: DECIMAL_PRECISION, rounding: DECIMAL_ROUNDING });
}
```

**⚠️ decimal.js trig caveat (must be in the spec):** trigonometric functions (`sin/cos/tan/
asin/acos/atan/atan2`) are limited to ~15 significant digits in decimal.js. `PI` above is stored
at 20 digits but its derivation is ~15-digit accurate. Indicator math that needs trig (none in
the current supertrend spike) must document this limit. Price/indicator arithmetic (`+ - * / mod
pow sqrt`) is NOT affected.

---

## 10. Test-Table Spec — the 10 Exactness Tests the Spike Must Prove

All tests run against `numericOps` + `decimalToString` at `configureDecimal()` (DP=20, half-up).
`D(s)` = `new Decimal(s)`.

| # | Test | Setup | Expected (exact) |
|---|------|-------|------------------|
| T1 | 0.1+0.2 == 0.3 | `numericOps.add(D('0.1'), D('0.2'))` | `equals(D('0.3'))` is `true`; `decimalToString` → `"0.3"` |
| T2 | 0.3-0.1 == 0.2 | `numericOps.sub(D('0.3'), D('0.1'))` | `equals(D('0.2'))` is `true` |
| T3 | 100k-bar accumulation bound | `numericOps.sum(100_000 × D('0.1'))` (and sma/ema sum via Decimal accumulator) | exactly `D('10000')`; record float-equivalent drift (> 1e-9) for contrast |
| T4 | supertrend-3d under decimal | run the 3D supertrend indicator over the fixture series, all math in Decimal | every plotted value equals the expected decimal fixture — no drift at DP=20 |
| T5 | division exactness | `numericOps.div(D(1), D(3))` | `D('0.33333333333333333333')` (20 threes — precision = 20 significant digits) |
| T6 | multiplication exactness | `numericOps.mul(D('0.1'), D(3))` | `equals(D('0.3'))` is `true` |
| T7 | comparison | `numericOps.compare(D('0.3'), D('0.29999999999999999'))` | `1` (0.3 > 0.2999…) |
| T8 | NaN/Infinity mapping | `numericOps.div(D(1), D(0))` → NaN; `pow` overflow → Infinity; `decimalToPineValue` of both | `isNaN` true; `guardFiniteDecimal` → NaN; `decimalToPineValue` → `NA` for both |
| T9 | -0 handling | `D('-0')`: `isZero`, `numericOps.compare(D('-0'), D(0))`, `decimalToPineValue(D('-0'))`, `toCanvasFloat(D('-0'))` | `isZero` true; compare `0`; boundary → `0` (normalized +0) |
| T10 | toString display | `decimalToString(numericOps.add(D('0.1'), D('0.2')))` | `"0.3"` — NEVER `"0.30000000000000004"` |

**Beyond the 10 (contract invariants the spike must also assert):**
- `numericOps.equals` is true while `a === b` is false for equal-but-distinct Decimals (comparison contract).
- `d.isZero() ? fallback : d` behaves correctly for `Decimal(0)` (truthiness ban).
- `pineValueToDecimal(NA)` → NaN Decimal, `decimalToPineValue(NaN)` → `NA` (round-trip through the seam).
- `pineValueToDecimal('abc' as PineValue)` throws `NUMERIC_NON_NUMERIC_INPUT`.

---

## 11. Verification & Handoff

- **Blast radius:** `float-guards.ts` (bodies), `expression-executor.ts` (imports unchanged),
  `statement-executor.ts` (imports unchanged), `ta-momentum.ts`, `ta-overlap.ts`,
  `ta-volatility.ts`, `math-builtins.ts` — plus `src/analysis/*` (batch TA) when it adopts the core.
- **Removal gate:** Kahan removed ONLY after CodeGraph confirms zero external callers.
- **Verification tier:** T4 — backend-engineer implements → test-engineer runs the 10-table spike
  + affected suites → code-reviewer/QA verifies the boundary markers and ban enforcement.