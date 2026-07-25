# Audit Tasks: IEEE 754 Arithmetic Bugs

- **Date:** 2026-07-21
- **Project:** pine-framework
- **Overall Health Score:** 68/100
- **Security Score:** 92/100
- **Architecture Score:** 78/100
- **Code Quality Score:** 65/100
- **Performance Score:** 82/100
- **Test Coverage Confidence:** 35%
- **Maintainability Score:** 72/100
- **Scalability Score:** 88/100

## Task List

### Critical (Fix Immediately)

- [x] **C-001** | [IEEE 754:NaN Propagation] | `src/language/runtime/expression-executor.ts:134-149` | No guard for JavaScript NaN after arithmetic operations — NaN ≠ NA Symbol, so `isNa()` doesn't catch it

  **Issue:** All arithmetic operations in `executeBinaryExpression` check for the NA Symbol before execution (`if (isNa(left) || isNa(right)) return NA`), but do NOT check for JavaScript NaN after execution. IEEE 754 operations like `0/0`, `Infinity - Infinity`, `NaN * x`, and `Math.sqrt(-1)` produce NaN which is a `number` type (not the NA Symbol). The existing `isNa()` check only catches `Symbol.for('pine.na')`. NaN silently propagates: `NaN + 5 → NaN`, `NaN > 0 → false`, `NaN === NaN → false`. This corrupts all downstream calculations invisibly.

  ```typescript
  // Current code (expression-executor.ts:138-141)
  case '-': return (left as number) - (right as number);  // Infinity - Infinity = NaN, no guard
  case '*': return (left as number) * (right as number);  // NaN * x = NaN, no guard
  case '/': return (right as number) === 0 ? NA : (left as number) / (right as number);  // 0/0 caught, but Infinity/Infinity = NaN not caught
  ```

  **Impact:** All Pine Script arithmetic that produces IEEE 754 NaN will silently produce incorrect values. Indicators, strategies, and calculations will be wrong without any error indication. Traders making decisions based on incorrect values could suffer financial losses.

  **Probability:** High — any division by near-zero or subtraction of large nearly-equal numbers can trigger it.

  **Fix:** Add post-arithmetic NaN/Infinity guard. Create a helper that converts JavaScript NaN/Infinity to the NA Symbol:
  ```typescript
  function guardResult(val: number): PineValue {
    return Number.isFinite(val) ? val : NA;
  }
  ```
  Then wrap all arithmetic results: `case '-': return guardResult((left as number) - (right as number));`

  **Test:** Verify that `series(Infinity) - series(Infinity)` returns NA, `series(0) / series(0)` returns NA, `series(NaN) + 5` returns NA, etc.

^- [x] **C-002** | [IEEE 754:Binary Rounding] | `src/language/runtime/builtins/math-builtins.ts:22-27` | `math.round` produces wrong results due to IEEE 754 binary representation

  **Issue:** `math.round(value, precision)` uses `Math.round(value * 10^p) / 10^p`. This fails for common cases like `math.round(1.005, 2)` because `1.005 * 100 = 100.49999999999999` in IEEE 754 binary, so `Math.round(100.4999...) = 100`, then `100 / 100 = 1.00`. Pine Script expects `1.01`.

  ```typescript
  // Current code
  const factor = Math.pow(10, p);
  return Math.round((value as number) * factor) / factor;
  ```

  **Impact:** Rounding errors in displayed prices, indicator values, and strategy entry/exit prices. Traders using price-based entry conditions with `math.round` will see mismatches.

  **Probability:** High — affects any value ending in 5 that is not exactly representable in binary (most decimal fractions).

  **Fix:** Use a numerically stable rounding method:
  ```typescript
  // Use Number.EPSILON to shift borderline cases
  const factor = Math.pow(10, p);
  return Math.round((value as number) * factor + Number.EPSILON * Math.sign(value as number)) / factor;
  ```
  Or implement Pine Script compatible rounding using string-based precision or a dedicated decimal rounding library.

  **Test:** `math.round(1.005, 2) === 1.01`, `math.round(2.5, 0) === 3` (banker's half-up), `math.round(-1.005, 2) === -1.01`, `math.round(1.000000000000001, 2) === 1.00`.

- [x] **C-003** | [IEEE 754:CatastrophicCancellation] | `src/analysis/moving-averages.ts:225-226,263-264` | `correlation()` and `linreg()` use textbook formulas with catastrophic cancellation

  **Issue:** Both functions use the one-pass textbook formula:
  ```typescript
  // linreg
  const slope = (length * sumXY - sumX * sumY) / (length * sumX2 - sumX * sumX);
  // correlation
  const numerator = length * sumXY - sumX * sumY;
  const denominator = Math.sqrt((length * sumX2 - sumX * sumX) * (length * sumY2 - sumY * sumY));
  ```
  When values are large and correlated, `length * sumXY ≈ sumX * sumY`, so the subtraction cancels many significant digits. Same for the denominator terms. This is a well-known numerical stability issue; the two-pass algorithm (centering data first) is always preferred.

  **Impact:** For correlated price series (e.g., BTC and ETH), correlation values will have reduced precision or complete garbage for closely correlated windows.

  **Probability:** Medium — triggers whenever correlated assets are analyzed with significant magnitude.

  **Fix:** Use the two-pass formula: first compute means, then compute centered sums:
  ```typescript
  let meanX = sumX / length, meanY = sumY / length;
  let centeredSumXY = 0, centeredSumX2 = 0, centeredSumY2 = 0;
  for (let j = 0; j < length; j++) {
    const dx = source1[i - j] - meanX, dy = source2[i - j] - meanY;
    centeredSumXY += dx * dy;
    centeredSumX2 += dx * dx;
    centeredSumY2 += dy * dy;
  }
  const r = centeredSumXY / Math.sqrt(centeredSumX2 * centeredSumY2);
  ```

  **Test:** Produce a series where x and y are perfectly correlated (y = 100000 + x) and verify correlation = 1.0 to machine precision.

- [x] **C-004** | [IEEE 754:RingBufferDrift] | `src/language/runtime/ring-buffer.ts:20-35` | Incremental running sum in RingBuffer accumulates unbounded floating-point error

  **Issue:** The RingBuffer maintains a running sum that is updated incrementally on each push (`sum -= old; sum += new`). Each operation introduces ~0.5 ULP of rounding error. Over thousands of pushes, this accumulates. The SMA function `ta.sma(close, 200)` running on 10,000 bars performs 10,000 incremental updates to the running sum, accumulating potentially significant error.

  ```typescript
  push(value: number): void {
    if (this.size === this.capacity) {
      this.sum -= this.buffer[this.head];  // floating-point subtraction
      this.buffer[this.head] = value;
      this.sum += value;                    // floating-point addition
      // Head advances, but the error in sum compounds forever
    }
  }
  ```

  **Impact:** SMA values for large windows drift from their true values. On high-precision price data this can be several ticks away from the correct value. Indicators that depend on SMA (Bollinger Bands, MACD, etc.) inherit this error.

  **Probability:** Medium — only significant after thousands of bars with a large window.

  **Fix:** Periodically recalculate the sum from scratch (e.g., every N pushes or when the error exceeds a threshold). Add an optional recalibration:
  ```typescript
  push(value: number): void {
    // ... existing logic ...
    this._pushesSinceRecalc++;
    if (this._pushesSinceRecalc >= this.capacity * 10) {
      this.recalcSum();
    }
  }
  private recalcSum(): void {
    this.sum = 0;
    for (let i = 0; i < this.capacity; i++) {
      this.sum += this.buffer[(this.head + i) % this.capacity];
    }
    this._pushesSinceRecalc = 0;
  }
  ```

  **Test:** Create SMA(200) with 10000 bars of incrementing price data. Compare RingBuffer-based SMA against full-recalculation SMA. Difference should be < 1e-10.

### High

- [x] **H-001** | [IEEE 754:MathBuiltinsNaN] | `src/language/runtime/builtins/math-builtins.ts:49-96` | `math.log`, `math.sqrt`, `math.asin`, `math.acos` return JS NaN/Infinity instead of Pine NA

  **Issue:** `Math.log(0)` returns `-Infinity`, `Math.log(-1)` returns `NaN`, `Math.sqrt(-1)` returns `NaN`, `Math.asin(1.0000000000001)` returns `NaN`. In Pine Script, these should return `na`. None of these functions guard against domain errors.

  ```typescript
  // Current - no domain guard
  eng.builtins.set('math.log', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return Math.log(value as number);  // Math.log(0) = -Infinity, Math.log(-1) = NaN
  });
  ```

  **Impact:** Mathematical computations that produce domain errors silently corrupt downstream calculations instead of signaling NA.

  **Probability:** Medium — triggered by zero or negative inputs that can arise from price differences and returns.

  **Fix:** Add value clamping and NaN/Infinity guard:
  ```typescript
  eng.builtins.set('math.log', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    const v = value as number;
    if (v <= 0) return NA;
    const result = Math.log(v);
    return Number.isFinite(result) ? result : NA;
  });
  ```

  **Test:** `math.log(0) → NA`, `math.log(-5) → NA`, `math.sqrt(-1) → NA`, `math.asin(1.0000000001) → NA`, `math.acos(-1.0000000001) → NA`.

- [x] **H-002** | [IEEE 754:FloatEqualityComparison] | `src/language/runtime/expression-executor.ts:143-148` | `==` and `!=` operators use direct IEEE 754 equality, `<=` and `>=` are unsound for near-equal floats

  **Issue:** `case '==': return left === right;` — Direct `===` comparison on floats. In Pine Script, `1.0 == 1.0` is fine, but `0.1 + 0.2 == 0.3` returns `false` in JavaScript (and in Pine Script — this matches TradingView behavior since Pine Script also uses IEEE 754). However, the Pine Script engine doesn't document this limitation. Additionally, the relational operators `<`, `>`, `<=`, `>=` compare floats directly, which is correct IEEE 754 behavior but may surprise users when `NaN > 0` returns `false` (correct per IEEE 754 but NaN should have been NA'd earlier).

  Also in `executeSwitchExpression` (line 195), switch-case on floats uses `===` which fails for NaN.

  **Impact:** Users writing `if (close == 100.0)` may encounter false negatives due to floating-point representation. Switch statements on float values are unreliable.

  **Probability:** Low — but silent when it happens.

  **Fix:** At minimum, document that all float comparisons use IEEE 754 and NaN returns false for all comparisons. Add a note in Pine Script documentation. For switch expression, add epsilon comparison or require NA Symbol not NaN.

  **Test:** `0.1 + 0.2 == 0.3` returns false (expected IEEE 754), document this behavior. `NaN == NaN` returns false.

- [x] **H-003** | [IEEE 754:NumericTypeGuards] | `src/language/types/na.ts:24-26` | `isValidNumber` incorrectly accepts Infinity and -Infinity

  **Issue:** `isValidNumber` only checks `typeof value === 'number' && !isNa(value)`. It does NOT check `isFinite()`, so Infinity, -Infinity, and NaN all pass through. While NaN is checked by `isNa` (wait — `isNa` checks the NA Symbol, not JS NaN! Let me recheck...). Yes, `isNa` checks `value === NA` where `NA = Symbol.for('pine.na')`. So `isNaN(Infinity)` is false, `isNaN(NaN)` is true but `isValidNumber` only checks the NA Symbol wrapper, not the JS NaN value.

  ```typescript
  export function isValidNumber(value: PineValue): value is number {
    return typeof value === 'number' && !isNa(value);
    // Should also check: && Number.isFinite(value)
  }
  ```

  **Impact:** Any code using `isValidNumber` as a gate (e.g., `array.avg`, `array.stdev`, `array.min`, `array.max`) will include Infinity in calculations, producing corrupted results.

  **Probability:** Medium — Infinity can arise from division by zero or log(0).

  **Fix:** 
  ```typescript
  export function isValidNumber(value: PineValue): value is number {
    return typeof value === 'number' && !isNa(value) && Number.isFinite(value);
  }
  ```

  **Test:** `isValidNumber(Infinity)` returns false, `isValidNumber(-Infinity)` returns false, `isValidNumber(NaN)` returns false, `isValidNumber(5)` returns true.

- [x] **H-004** | [IEEE 754:EMADrift] | `src/language/runtime/builtins/ta-builtins.ts:31-50` | EMA formula accumulates floating-point error over thousands of bars

  **Issue:** The EMA state machine uses two sources of floating-point accumulation:
  1. Running sum `state.sum += source` for the initial SMA seed is an unbounded accumulator
  2. Recursive formula `state.prev = val * k + state.prev * (1-k)` where `k = 2/(len+1)` is a non-terminating binary fraction for most lengths

  ```typescript
  const k = 2 / (len + 1);  // e.g., for len=14, k = 2/15 = 0.133333... (repeating in binary)
  state.prev = (source as number) * k + state.prev * (1 - k);
  ```

  For length=14, `k = 0.13333333333333333333...` which is not exactly representable in binary. Each multiplication and addition introduces rounding. Over 10,000 bars, the cumulative error can be significant.

  **Impact:** EMA values for large lookbacks or long series drift from true values, potentially affecting crossover signals.

  **Probability:** Medium — affects all EMA-based indicators (MACD, etc.) on long time series.

  **Fix:** Use the numerically equivalent (but often better-conditioned) form `prev += k * (val - prev)`, and periodically recalculate the SMA seed. Also cap state.sum at a reasonable maximum:
  ```typescript
  state.prev += k * ((source as number) - state.prev);
  ```
  If state.sum exceeds 1e15, recalculate from scratch.

  **Test:** Compare EMA(200) on 100000 data points against TradingView's EMA output. Drift should be < 0.01%.

- [x] **H-005** | [IEEE 754:CorrelationCancellation] | `src/analysis/moving-averages.ts:264` | `correlation` denominator can overflow or produce NaN

  **Issue:** `(length * sumX2 - sumX * sumX) * (length * sumY2 - sumY * sumY)` can overflow for large values, or produce negative values due to floating-point rounding (impossible in exact arithmetic but possible in IEEE 754 when the two terms nearly cancel). `Math.sqrt` of a negative number returns NaN.

  ```typescript
  const denominator = Math.sqrt((length * sumX2 - sumX * sumX) * (length * sumY2 - sumY * sumY));
  ```

  **Impact:** Correlation returns NaN for certain windows where it should return a valid value.

  **Probability:** Low — requires extreme values with near-perfect correlation.

  **Fix:** Clamp the value before sqrt: `Math.sqrt(Math.max(0, ...))`. Or use the two-pass algorithm which avoids this issue entirely.

  **Test:** Correlation of two identical series with large values (e.g., 10^9 magnitude) should return 1.0.

- [x] **H-006** | [IEEE 754:RSIEpsilonCheck] | `src/language/runtime/builtins/ta-builtins.ts:82` | `state.prevAvgLoss === 0` comparison can miss near-zero loss values

  **Issue:** 
  ```typescript
  if (state.prevAvgLoss === 0) return state.prevAvgGain === 0 ? 50 : 100;
  ```
  Due to floating-point accumulation in the RMA calculation, `prevAvgLoss` might be `1e-300` instead of exactly `0` when all bars in the window are up. The strict `=== 0` check would be false, causing the code to proceed to `rs = gain / 1e-300` which produces a huge number (potentially Infinity), then `100 - 100/(1+Infinity) = 100`. The result is accidentally correct, but the computation involves Infinity.

  **Impact:** In extreme edge cases where `prevAvgLoss` is exactly 0 but `prevAvgGain` is also 0 (all values unchanged), the function returns 50. If `prevAvgLoss` is `1e-300` due to floating-point, it would compute a very large rs and return 100 instead of 50.

  **Probability:** Very low — requires extended periods of exactly identical price data.

  **Fix:** Use epsilon comparison:
  ```typescript
  if (Math.abs(state.prevAvgLoss) < 1e-15) {
    return Math.abs(state.prevAvgGain) < 1e-15 ? 50 : 100;
  }
  ```

  **Test:** RSI of all-identical prices should return 50.

### Medium

- [x] **M-001** | [IEEE 754:StrategyAvgPriceDrift] | `src/strategy/strategy-engine.ts:758-759` | Partial fill average price calculation accumulates error

  **Issue:** Each partial fill updates `avgPrice` as a weighted average. Over many partial fills, floating-point rounding in each multiplication and division accumulates, causing `avgPrice` to drift from the true average entry price.

  ```typescript
  this.position.avgPrice =
    (this.position.avgPrice * this.position.quantity + price * quantity) / totalQuantity;
  ```

  **Impact:** Position PnL calculations use `avgPrice`, so drift causes incorrect profit/loss reporting. MAE/MFE calculations also use `avgPrice`.

  **Probability:** Medium — scales with number of partial fills.

  **Fix:** Track total cost and total quantity separately; recompute avgPrice from scratch each time:
  ```typescript
  this._totalCost += price * quantity;
  this.position.avgPrice = this._totalCost / this.position.quantity;
  ```

  **Test:** 1000 sequential partial fills with varying prices — verify avgPrice matches totalCost/totalQuantity to within 1e-10.

- [x] **M-002** | [IEEE 754:HL2NAUnsoundCast] | `src/language/runtime/expression-executor.ts:89-106` | `hl2`, `hlc3`, `ohlc4` unsound `as number` cast on NA Symbol

  **Issue:** If `context.high.getRelative(0)` returns the NA Symbol (e.g., empty series), the `as number` TypeScript cast does NOT convert it to a number — it's still a Symbol at runtime. Adding a Symbol to a number throws `TypeError: Cannot convert a Symbol value to a number`.

  ```typescript
  if (expr.name === 'hl2') {
    const high = context.high.getRelative(0) as number;  // Could be Symbol(NA) at runtime
    const low = context.low.getRelative(0) as number;
    return (high + low) / 2;  // TypeError if either is Symbol
  }
  ```

  **Impact:** In edge cases with malformed/incomplete context data, the interpreter crashes rather than returning NA.

  **Probability:** Low — requires empty series in the ExecutionContext, which shouldn't happen in normal operation but can occur from programming errors.

  **Fix:** Use `isNa()` guard and return NA:
  ```typescript
  if (expr.name === 'hl2') {
    const high = context.high.getRelative(0);
    const low = context.low.getRelative(0);
    if (isNa(high) || isNa(low)) return NA;
    return ((high as number) + (low as number)) / 2;
  }
  ```

  **Test:** Execute `hl2` with an empty ExecutionContext series — should return NA, not throw.

- [x] **M-003** | [IEEE 754:CrossoverEpsilon] | `src/language/runtime/builtins/ta-builtins.ts:353-395` | `ta.crossover`, `ta.crossunder`, `ta.cross` use strict float comparison that misses near-equal cross events

  **Issue:** 
  ```typescript
  ta.crossover: prev.src <= prev.cmp && (source as number) > (compare as number)
  ta.crossunder: prev.src >= prev.cmp && (source as number) < (compare as number)
  ```
  If the two lines are within machine epsilon of each other, a crossover may not be detected because `prev.src <= prev.cmp` evaluates correctly but `source > compare` evaluates wrong (they differ by 1ulp). This should be rare but can happen with identical price series.

  **Impact:** Rare missed crossover/crossunder signals, potentially causing strategy entry/exit failures.

  **Probability:** Low — requires values within ~1e-15 of each other with crossing direction.

  **Fix:** Add epsilon tolerance:
  ```typescript
  const crossedAbove = (source as number) > (compare as number) + Number.EPSILON;
  const result = prev.src <= prev.cmp && crossedAbove;
  ```
  Or document the limitation and note that values must differ by more than ~1e-15 for reliable detection.

  **Test:** Crossover detection when difference is exactly 1e-15.

- [x] **M-004** | [IEEE 754:StochZeroRange] | `src/analysis/oscillators.ts:98` | Stoch division by zero uses strict equality that bypasses with near-zero range

  **Issue:** `rawK.push(range === 0 ? 50 : ((close[i]! - lowest) / range) * 100)` — if `range` is a tiny non-zero number due to IEEE 754 (e.g., `1e-307`) instead of exactly 0, the division produces a huge result. Same issue in MFI (line 335), ADX (line 230), and CCI (line 294).

  **Impact:** Stoch, MFI, ADX, and CCI can produce extreme spike values rather than the expected 50 when the range is extremely small.

  **Probability:** Medium — occurs when prices are nearly unchanged over the lookback window.

  **Fix:** Use epsilon comparison:
  ```typescript
  if (Math.abs(range) < 1e-10) rawK.push(50);
  else rawK.push(((close[i]! - lowest) / range) * 100);
  ```
  Apply same fix to MFI (`negativeMF`), ADX (`sum`), and CCI (`meanAbsDev`).

  **Test:** Create price data where all values are 100 except the last which is 100.0000001 — Stoch should return ~50, not Infinity.

- [x] **M-005** | [IEEE 754:CompoundAssignNaN] | `src/language/runtime/statement-executor.ts:91-94` | Compound assignment operators (`+=`, `-=`, `*=`, `/=') don't guard against NaN/Infinity

  **Issue:** 
  ```typescript
  case '+=': result = (typeof current === 'number' ? current : 0) + (typeof value === 'number' ? value : 0); break;
  ```
  The `typeof === 'number'` check passes NaN and Infinity through. `NaN + 5 = NaN`, `Infinity + Infinity = Infinity`.

  **Impact:** Compound assignments can silently infect variables with NaN/Infinity.

  **Probability:** Medium — follows from any upstream NaN/Infinity.

  **Fix:** Add post-operation guard:
  ```typescript
  case '+=': {
    const c = typeof current === 'number' ? current : 0;
    const v = typeof value === 'number' ? value : 0;
    result = Number.isFinite(c) && Number.isFinite(v) ? c + v : NA;
    break;
  }
  ```

  **Test:** `x += NaN` should set x to NA, `x += Infinity` should set x to NA.

- [x] **M-006** | [IEEE 754:SharpeInfinity] | `src/strategy/strategy-engine.ts:1122-1123` | Sharpe and Sortino ratios can produce Infinity when stdReturn is extremely small

  **Issue:** `stdReturn > 0` check: if standard deviation is a tiny non-zero number (e.g., `1e-16`) due to floating-point rounding when returns are nearly identical, `avgReturn / 1e-16` produces an extremely large number, and multiplied by `sqrt(252)` could produce Infinity. Same for Sortino.

  ```typescript
  sharpeRatio: stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0,
  ```

  **Impact:** Backtest reports can show nonsensically large Sharpe ratios.

  **Probability:** Low — requires returns to be nearly identical with tiny non-zero std.

  **Fix:** Add minimum threshold:
  ```typescript
  sharpeRatio: stdReturn > 1e-10 ? (avgReturn / stdReturn) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0,
  ```

  **Test:** Backtest with identical trade returns should produce Sharpe = 0, not Infinity.

- [x] **M-007** | [IEEE 754:MathMaxNaN] | `src/language/runtime/builtins/math-builtins.ts:7-15` | `math.max` and `math.min` use `Math.max(...validArgs)` which can receive Infinity

  **Issue:** `Math.max(...validArgs)` on arguments `[1, 2, Infinity, 3]` returns `Infinity`. While this is IEEE 754 correct, it should probably return `NA` for Infinity inputs or at least handle them gracefully. The filter only removes NA Symbol values.

  **Impact:** Can produce Infinity results when any intermediate computation produces Infinity.

  **Probability:** Low.

  **Fix:** After filtering NA, also filter non-finite:
  ```typescript
  const validArgs = args.filter((a) => !isNa(a) && typeof a === 'number' && Number.isFinite(a)) as number[];
  ```

  **Test:** `math.max(1, Infinity, 2)` should return NA.

- [x] **M-008** | [IEEE 754:WmaOverflow] | `src/language/runtime/builtins/ta-builtins.ts:309-329` | HMA weighted sum can overflow for large lengths

  **Issue:** The WMA computation accumulates `wSum += buf[i] * weight` where weight goes up to `length`. For large lengths (e.g., 10000) and large price values (e.g., 50000), `wSum` can approach or exceed `Number.MAX_SAFE_INTEGER` (9e15), losing integer precision. Even though `wSum` is a float, adding numbers at different scales loses precision.

  **Impact:** HMA for long periods with high-price assets loses precision.

  **Probability:** Low — requires very long lookbacks with high prices.

  **Fix:** Periodically re-normalize or use Kahan summation. Document the limitation.

  **Test:** HMA(5000) on BTC price data — verify no precision loss in low digits.

- [x] **M-009** | [IEEE 754:ArrayPercentileNaN] | `src/language/runtime/expression-executor.ts:333-341` | `array.percentile_linear_interpolation` can produce NaN from NaN arguments

  **Issue:** If `pct` is NaN (passed as argument), the computed `rank` is NaN, `Math.floor(NaN)` is NaN, and `nums[NaN]` is `undefined`. The result is `undefined + (NaN - lower) * (undefined - undefined) = NaN`.

  **Impact:** NaN percentile value with no error indication.

  **Probability:** Low — requires NaN argument.

  **Fix:** Add NaN guard:
  ```typescript
  if (isNaN(pct)) return NA;
  ```

  **Test:** `[1,2,3].percentile_linear_interpolation(NaN)` returns NA.

### Low

- [x] **L-001** | [IEEE 754:SarNaN] | `src/language/runtime/builtins/ta-builtins.ts:87-212` | ta.sar doesn't check for NaN at any intermediate computation step

  **Issue:** The SAR computation performs many floating-point operations without NaN guards. If any input (high, low, close) is NaN, the entire computation chain produces NaN.

  **Fix:** Add NaN checks after each critical computation step, or guard at function entry.

- [x] **L-002** | [IEEE 754:ROCZeroDivision] | `src/analysis/oscillators.ts:383` | Rate of Change returns NaN when source[i-length] is 0

  **Issue:** `source[i-length] === 0` check — if source is extremely close to 0 but not exactly 0 (e.g., `1e-200`), the division produces a huge result. Since price data can be near 0 (e.g., penny stocks), this is a real concern.

  **Fix:** Use epsilon comparison: `Math.abs(source[i - length]) < 1e-10`.

- [x] **L-003** | [IEEE 754:QuantileNaNArg] | `src/analysis/math-functions.ts:226-234` | `quantile` with NaN q parameter

  **Issue:** Similar to M-009, if `q` is NaN, `index`, `Math.floor(index)`, and array accesses all produce NaN/undefined.

  **Fix:** Guard `isNaN(q)` at function entry.

- [x] **L-004** | [IEEE 754:PowerExponent] | `src/language/runtime/expression-executor.ts:142` | `**` operator (exponentiation) can produce NaN/Infinity

  **Issue:** `Math.pow(left, right)` can produce NaN (e.g., `(-1)**0.5`) or Infinity (`0**(-1)`). No post-operation guard.

  **Fix:** Wrap with `guardResult()`.

- [x] **L-005** | [IEEE 754:UnaryNegationNaN] | `src/language/runtime/expression-executor.ts:163` | Unary negation of NaN produces NaN

  **Issue:** `-(NaN) = NaN`, `+(NaN) = NaN`. No guard after unary operations.

  **Fix:** Add `Number.isFinite` check before unary ops.

- [x] **L-006** | [IEEE 754:MathSumPrecision] | `src/language/runtime/builtins/math-builtins.ts:104-107` | `math.sum` uses simple reduce with no error checking

  **Issue:** `validArgs.reduce((sum, val) => sum + val, 0)` can accumulate precision errors and propagates Infinity/NaN.

  **Fix:** Filter non-finite numbers or use compensated summation.

- [x] **L-007** | [IEEE 754:MfiRatioStrictEquals] | `src/analysis/oscillators.ts:335` | MFI uses `negativeMF === 0` strict comparison

  **Issue:** Same pattern as M-004 — if negativeMF is a tiny non-zero float, the ratio could be huge.

  **Fix:** Use epsilon comparison.

- [x] **L-008** | [IEEE 754:CommissionRounding] | `src/strategy/commission-calculator.ts:489,450` | Basis points conversions use non-terminating binary fractions

  **Issue:** `context.tradeValue * (rate / 100)` and `context.tradeValue * (dexFeeBps / 10000)` for non-power-of-2 denominators produce non-terminating binary fractions that compound over many trades.

  **Fix:** Pre-compute as number, or use integer arithmetic (basis points as integer then divide at the end).

### Suggestions

- [ ] **S-001** | [IEEE 754:KahanSummation] | Suggestion | Use Kahan summation algorithm for all running sums (RingBuffer, EMA seed, RMA, strategy metrics)

  **Issue:** All running accumulators in the codebase use naive summation, which has O(N) error growth in the worst case. Kahan summation reduces error to O(1) independent of N.

  **Fix:** Replace `sum += value` patterns with Kahan summation where precision matters (RingBuffer `sum`, EMA `state.sum`, strategy `totalPnl`, `grossProfit`, etc.).

- [ ] **S-002** | [IEEE 754:TestCoverage] | Suggestion | Add comprehensive IEEE 754 edge case test suite

  **Missing tests:**
  - NaN propagation through all arithmetic operations
  - Infinity propagation through all arithmetic operations  
  - -0 handling (Pine Script compatibility)
  - Subnormal number handling
  - Precision of `math.round` for all common cases (1.005, 2.005, -1.005, 1.0000001)
  - `0.1 + 0.2 == 0.3` behavior documentation
  - Large number arithmetic in correlation/linreg
  - EMA/RMA/SMA drift over very long series
  - All math builtins with NaN/Infinity/0/negative inputs
  - All TA builtins with NaN/Infinity/0/negative inputs
  - Crossover/crossunder with values at machine epsilon

- [ ] **S-003** | [IEEE 754:Documentation] | Suggestion | Document IEEE 754 behavior in Pine Script compatibility docs

  **Issue:** Users porting scripts from TradingView may not know that the engine uses IEEE 754 double precision (identical to TradingView). However, differences in NaN-handling, rounding, and edge cases should be documented.

- [ ] **S-004** | [IEEE 754:GetMaxLookbackNaN] | `src/language/runtime/execution-engine.ts:233-278` | `getMaxLookback` uses `parseInt` on map keys that may not contain valid integers

  **Issue:** `parseInt(parts[1], 10)` could return `NaN` if the map key format is unexpected. `NaN > max` is `false` (IEEE 754), so the code degrades safely, but `parseInt('sma_' + undefined + '_' + callId)` could produce unexpected keys.

- [ ] **S-005** | [IEEE 754:GlobalNaNCheck] | Suggestion | Add global NaN output sanitization before returning ExecutionResult

  **Issue:** The Pine Script runtime can produce NaN values in outputs (Series). These will be serialized and sent to the UI. Adding a post-execution NaN → NA conversion on all output values would catch any NaN values that escaped runtime guards.

- [ ] **S-006** | [IEEE 754:SeriesMapNaN] | Suggestion | Add NaN detection in Series.push

  **Issue:** Adding NaN/Infinity values to Series can be detected early and converted to NA:
  ```typescript
  push(value: T): void {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      values.push(NA as T);
    } else {
      values.push(value);
    }
  }
  ```

- [ ] **S-007** | [IEEE 754:getRelativeBoundary] | `src/language/runtime/series.ts:42-56` | `getRelative` returns NA for out-of-bounds but the error is silent — no logging or tracking

  **Issue:** Out-of-bounds series access (e.g., `close[1000]` when only 500 bars exist) silently returns NA. This matches TradingView behavior but makes debugging difficult.

- [ ] **S-008** | [IEEE 754:AverageExecutionTimeMs] | `src/language/runtime/execution-engine.ts:349-350` | Running average of execution time uses naive summation with possible precision loss

  **Issue:** `this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length` for 1000 very small times (e.g., ~0.01ms) — the sum is ~10ms which is well within safe precision. This is fine in practice but could use a running average formula for consistency.

- [ ] **S-009** | [IEEE 754:BacktestComparisonEpsilon] | `src/strategy/backtest-engine.ts:272-275` | `compareResults` uses hardcoded epsilon 0.01 for comparing metrics

  **Issue:** `Math.abs(result1.metrics.totalPnl - result2.metrics.totalPnl) < 0.01` — 0.01 is reasonable for PnL in dollars, but for percentage values (winRate), this could miss significant differences.

  **Fix:** Use relative epsilon or per-field thresholds.
