## 1. Setup

- [x] 1.1 Create `tests/evil/helpers.ts` with shared evil-test utilities: `makeEvilBarContext()`, `compileEvilScript()`, `evilPrices` array, `evilSeries()`, `assertGraceful()`.
- [x] 1.2 Verify `jest.config.js` picks up `tests/evil/**/*.test.ts` automatically (it matches `**/tests/**/*.test.ts` so should already work).
- [x] 1.3 Run `pnpm test` to confirm existing tests still pass before adding new ones.

## 2. Parser Evil Tests (`tests/evil/parser.test.ts`)

- [x] 2.1 Test empty script and missing version declaration both throw ParseError.
- [x] 2.2 Test unsupported versions (v4, v7) throw ParseError with clear message.
- [x] 2.3 Test script exceeding 1MB size limit throws ParseError.
- [x] 2.4 Test deeply nested expressions (100+ levels of `(((...)))`) parse safely without RangeError.
- [x] 2.5 Test Unicode/zero-width/control characters in identifiers are rejected or handled.
- [x] 2.6 Test mismatched brackets `(`, `[`, `{` throw ParseError with location.
- [x] 2.7 Test unterminated string literals throw ParseError at expected position.
- [x] 2.8 Test division by zero in constant expression (`a = 1/0`) produces valid AST.

## 3. Compiler Evil Tests (`tests/evil/compiler.test.ts`)

- [x] 3.1 Test type mismatch: assign string to float variable throws CompileError.
- [x] 3.2 Test type mismatch: assign float to string variable throws CompileError.
- [x] 3.3 Test series type mismatch: non-series to series variable throws CompileError.
- [x] 3.4 Test undefined variable reference throws CompileError.
- [x] 3.5 Test function parameter type annotation mismatch throws CompileError.
- [x] 3.6 Test array type annotation mismatch throws CompileError.
- [x] 3.7 Test map key/value type mismatch throws CompileError.
- [x] 3.8 Test self-referencing variable declaration (`x = x + 1`) throws CompileError.
- [x] 3.9 Test invalid operator types (`"a" - "b"`) throws CompileError.

## 4. Runtime Evil Tests (`tests/evil/runtime.test.ts`)

- [x] 4.1 Test division by zero returns NA (not crash or Infinity).
- [x] 4.2 Test addition with NaN propagates NA.
- [x] 4.3 Test multiplication by Infinity returns NA.
- [x] 4.4 Test comparison with NA: `na > 0`, `na < 0`, `na == 0` all return false.
- [x] 4.5 Test `getRelative(0)` on empty series returns NA.
- [x] 4.6 Test `last()` on empty series returns NA.
- [x] 4.7 Test `executeBar()` with all-empty OHLCV series completes without crash.
- [x] 4.8 Test arithmetic on Number.MAX_VALUE completes without throwing.
- [x] 4.9 Test division by Number.MIN_VALUE (subnormal) completes without crash.
- [x] 4.10 Test negative zero (-0) propagation in arithmetic.
- [x] 4.11 Test lookback beyond available bars (`close[100]` on 10 bars) returns NA.
- [x] 4.12 Test `get(-1)` on series returns NA.
- [x] 4.13 Test `get(9999)` on 10-element series returns NA.

## 5. TA Function Evil Tests (`tests/evil/ta-functions.test.ts`)

- [x] 5.1 Test `sma(close, 0)` returns NA without crash.
- [x] 5.2 Test `sma(close, -5)` returns NA without crash.
- [x] 5.3 Test `ema(close, na)` returns NA without crash.
- [x] 5.4 Test `rsi(close, 0)` and `rsi(close, 1)` return NA without crash.
- [x] 5.5 Test `atr(0)` and `atr(-14)` return NA without crash.
- [x] 5.6 Test `sma(close, 5)` on constant-price (all 100) series produces 100 after warm-up.
- [x] 5.7 Test `rsi(close, 14)` on constant-price series returns NA (no price change).
- [x] 5.8 Test `sma(close, 14)` on single-bar series returns NA.
- [x] 5.9 Test `ema(close, 14)` on single-bar series returns the close value (EMA initialization).

## 6. Series Evil Tests (`tests/evil/series.test.ts`)

- [x] 6.1 Test push/pop/clear cycle: push values, clear, then `last()` returns NA.
- [x] 6.2 Test `slice()` on empty series returns empty array.
- [x] 6.3 Test `clear()` on already-empty series does not throw.
- [x] 6.4 Test multiple clear/repopulate cycles preserve data integrity.
- [x] 6.5 Test `getRelative(0)` on single-element series returns the element.
- [x] 6.6 Test `getRelative(1)` on single-element series returns NA.
- [x] 6.7 Test `last()` and `lastOrDefault(fallback)` on single-element return the element.
- [x] 6.8 Test pushing 100,000 values: all accessible, length correct.
- [x] 6.9 Test `getRelative(99999)` on 100,000-element series returns first value.

## 7. State Management Evil Tests (`tests/evil/state-management.test.ts`)

- [x] 7.1 Test `rollbackToSnapshot(0)` without any prior snapshot returns false (no crash).
- [x] 7.2 Test double rollback in succession: second call returns false or does not crash.
- [x] 7.3 Test `rollbackToSnapshot(999)` with nonexistent index returns false.
- [x] 7.4 Test snapshot → execute bar → rollback → execute different bar: state matches snapshot.
- [x] 7.5 Test multiple snapshots then rollback to middle index: discards later snapshots.
- [x] 7.6 Test rollback after forming candle update does not persist forming candle state.
- [x] 7.7 Test OHLCV series values match snapshot-time state after rollback.
- [x] 7.8 Test output series values match snapshot-time state after rollback.

## 8. Forming Candle Evil Tests (`tests/evil/forming-candle.test.ts`)

- [x] 8.1 Test 5 consecutive forming candle updates with different closes: state consistent with last.
- [x] 8.2 Test forming candle then confirmed bar at same timestamp: correct transition.
- [x] 8.3 Test `appendOrUpdateBar()` with stale timestamp returns `isConfirmed: false`.
- [x] 8.4 Test stale bar does not increment `totalBars` or change output series.
- [x] 8.5 Test forming candle with zero volume: does not crash.
- [x] 8.6 Test forming candle with NaN, Infinity, or negative close: does not crash.
- [x] 8.7 Test forming candle after all bars confirmed: returns valid result.

## 9. Strategy Engine Evil Tests (`tests/evil/strategy-engine.test.ts`)

- [x] 9.1 Test `strategy.entry()` with `qty=0` does not crash or corrupt state.
- [x] 9.2 Test `strategy.entry()` with negative quantity does not crash.
- [x] 9.3 Test `strategy.entry()` with negative limit price does not crash.
- [x] 9.4 Test `strategy.entry()` with NaN price or quantity does not crash.
- [x] 9.5 Test entry and exit on same bar: both process without double-counting.
- [x] 9.6 Test overlapping entry signals: pyramiding limit respected, no crash.
- [x] 9.7 Test zero commission: trades execute with no deduction.
- [x] 9.8 Test NaN/undefined commission: does not crash, returns 0 or NA.
- [x] 9.9 Test commission exceeding trade value: capped or handled gracefully.
- [x] 9.10 Test stop-limit order where both stop and limit hit same bar: fills at limit.
- [x] 9.11 Test stop-limit order triggered but limit not hit same bar: limit order persists.
- [x] 9.12 Test OCO pair with both sides triggered: only one executes.
- [x] 9.13 Test limit order at exact bar extreme (price == low for buy): fills.
- [x] 9.14 Test stop order at exact bar extreme (price == low for sell): triggers.

## 10. Alert System Evil Tests (`tests/evil/alert-system.test.ts`)

- [x] 10.1 Test exact duplicate alert trigger: second is suppressed.
- [x] 10.2 Test 200 rapid distinct triggers: all unique triggers recorded (exceeds 100-cap set).
- [x] 10.3 Test duplicate after dedup-set eviction: re-seen key treated as new.
- [x] 10.4 Test empty alert message: created without crash.
- [x] 10.5 Test 100,000-character alert message: handled without crash or OOM.
- [x] 10.6 Test alert with HTML/Unicode/control characters: stored without corruption.
- [x] 10.7 Test alert trigger during forming candle then rollback: trigger reverted.
- [x] 10.8 Test alert conditions after snapshot/rollback: restored to snapshot state.

## 11. Rendering Evil Tests (`tests/evil/rendering.test.ts`)

- [x] 11.1 Test line with NaN coordinates: not crash, rejected or rendered safely.
- [x] 11.2 Test line with Infinity coordinates: not crash, handled gracefully.
- [x] 11.3 Test line with negative coordinates: not crash.
- [x] 11.4 Test label with NaN, Infinity, or MAX_VALUE price: not crash.
- [x] 11.5 Test zero-width line: not crash (renders min width or rejected).
- [x] 11.6 Test box where left=right or top=bottom (zero area): not crash.
- [x] 11.7 Test plot series with NaN values: treated as na, not plotted, not crash.
- [x] 11.8 Test plot series with Infinity values: clamped or rejected, not crash.
- [x] 11.9 Test fill between plots with NaN color: skipped, not crash.
- [x] 11.10 Test creating 10,000 labels: all accessible, not crash.

## 12. Backend API Evil Tests (`tests/evil/backend-api.test.ts`)

- [x] 12.1 Test oversized POST body returns 413 or 400.
- [x] 12.2 Test malformed JSON body returns 400.
- [x] 12.3 Test extremely long URL parameters return 400 or 414.
- [x] 12.4 Test binary data in body returns 400 (not crash).
- [x] 12.5 Test empty symbol parameter returns validation error.
- [x] 12.6 Test invalid timeframe returns validation error.
- [x] 12.7 Test symbol with HTML injection chars returns validation error.
- [x] 12.8 Test 1000+ character symbol returns validation error.
- [x] 12.9 Test concurrent bar processing requests: state remains consistent.
- [x] 12.10 Test concurrent export requests: all complete without file corruption.
