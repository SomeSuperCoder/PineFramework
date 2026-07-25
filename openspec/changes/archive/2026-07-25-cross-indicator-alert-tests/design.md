## Context

The alert pipeline has three stages:
1. **Backend generation**: `execution-engine.ts` runs Pine Script and collects `AlertTriggerEntry[]` (barIndex, timestamp, alertId) + `AlertConditionEntry[]` (id, title, message) via the `alertcondition` builtin in `other-builtins.ts:667`.
2. **Frontend merge**: `useChartData.ts` receives results via HTTP (full batch) and WebSocket (diff ticks), transforms them via `buildScriptResult`, and merges via `prependIndicatorResult` (prepend scenario) or `mergeDiffIntoResult` (forming candle).
3. **Frontend rendering**: `ChartComponent.tsx` enriches triggers with condition metadata, `MarkerRenderer.ts` draws orange dots, `CrosshairRenderer.ts` shows tooltips.

Current test coverage: `every-bar-alert.ts` fixture (single unconditional `alertcondition()`) with 4 pipeline tests. This catches barIndex/timestamp alignment and basic prepend handling, but does NOT exercise:
- Stateful alert logic (`var` variables, pivot tracking, flip detection)
- Multiple simultaneous `alertcondition()` calls firing on the same bar
- Indicators where trigger count per bar varies (0-9+ triggers)
- `alert` function vs `alertcondition` differences

The two target indicators exercise these gaps:
- **HHLL** (`higher-high-lower-low.pine`): 9 `alertcondition()` calls with pivot state tracking via `var`, `ta.pivothigh`/`ta.pivotlow`, and conditional label logic
- **Volatility Trail** (`volatility-trail.pine`): 4 `alertcondition()` calls with `var`-based trend/flip tracking, Hull MA + ATR computation, and retest cooldown state

Both indicators render visual markers (labels, plots, characters) alongside alerts — we can cross-validate triggers against visual output.

## Goals / Non-Goals

**Goals:**
- Create inline Pine source fixtures for both indicators (removing `fs.readFileSync` dependency from tests)
- Add backend integration tests validating alert trigger correctness for both indicators on deterministic bar data
- Add frontend pipeline coverage (viewport mapping, prepend, diff merge) for realistic multi-condition triggers
- Find and fix any bugs in the alert pipeline revealed by these tests
- Log trigger-per-bar distribution statistics to aid manual comparison with TradingView output

**Non-Goals:**
- Pixel-perfect visual snapshot tests (beyond scope of this change)
- Full alert execution system redesign
- Real-time WebSocket end-to-end tests (WS infrastructure test belongs in a separate change)
- Testing Telegram or email alert delivery

## Decisions

### 1. Inline source fixtures over fs.readFileSync
**Decision**: Create `tests/fixtures/volatility-trail.ts` and `tests/fixtures/higher-high-lower-low.ts` containing the exact Pine Script source as exported const strings, plus metadata (expected condition count, trigger condition signatures).
**Rationale**: Current HHLL pipeline test (5.3) uses `fs.readFileSync` with a relative path `./test_indicators/` that only works when `cwd` is the repo root. Inline fixtures are self-contained, work regardless of working directory, and don't break if the `test_indicators/` files are edited later.
**Alternative considered**: Keeping `fs.readFileSync` and fixing the path — rejected because inline fixtures are more robust and follow the existing `every-bar-alert.ts` pattern.

### 2. Deterministic bar data with sine-wave + linear-up trends
**Decision**: Use the existing `createTrendBars` and `prependBars` helpers from `tests/helpers/deterministicBars.ts` with `seed=42` for reproducibility.
**Rationale**: HHLL pivots need alternating highs/lows to produce meaningful triggers — sine-wave creates natural pivot structure. Volatility trail needs sustained trends for flips — linear-up creates clear flip points. Using the same seed as existing tests ensures cross-test consistency.
**Alternative considered**: Random bars with seed — rejected because sine-wave + linear-up produce more predictable trigger patterns for validation.

### 3. Log-based diagnosis for trigger-per-bar distribution
**Decision**: Tests will log total trigger count, bars-with-triggers percentage, max triggers-per-bar, and the first 20 trigger-dense bars along with which alert IDs fired on them. No assertions on exact trigger count (it varies with indicator parameters) — only structural assertions (barIndex bounds, timestamp matching, non-empty conditions).
**Rationale**: HHLL has 9 `alertcondition()` calls — many can fire simultaneously on pivot bars, producing 0-9+ triggers per bar depending on pivot detection. Asserting exact counts would be brittle and wouldn't test correctness. Structural assertions (every barIndex is valid, timestamps match) catch the bugs we're looking for (wrong positions, dropped triggers).
**Alternative considered**: Asserting exact trigger counts per bar — rejected because it's fragile to parameter changes and would need constant updating.

### 4. Cross-validation with visual markers
**Decision**: Volatility trail tests will cross-reference `flipUp`/`flipDn` alerts with `labels[]` output (the "▲"/"▼" labels drawn on flips) and `bullRTok`/`bearRTok` alerts with `shapes[]` output (the "◆" characters). A bar that has a flip label MUST have a corresponding flip alert trigger.
**Rationale**: This catches bugs where the visual output and the alert output diverge (e.g., labels drawn but alerts not fired, or vice versa). This is exactly the class of bug the user suspects.
**Alternative considered**: Only testing alert triggers in isolation — rejected because cross-validation with visual output is the strongest correctness check for "universally broken" alerts.

### 5. Test structure: one describe block per indicator, one test per concern
**Decision**: Tests will be organized as:
- `describe('higher-high-lower-low.pine alerts')` with tests for barIndex validity, timestamp matching, condition presence, prepend survival, forming-candle integrity
- `describe('volatility-trail.pine alerts')` with tests for barIndex validity, flip/label cross-validation, retest/shape cross-validation, prepend survival, forming-candle integrity
**Rationale**: Separating by indicator makes it clear which indicator exercises which alert behavior. Each test covers one concern for easy diagnosis.

## Risks / Trade-offs

- **[Risk] Deterministic bars may not trigger all alert paths**: Some conditions (e.g., `firstLLafterBull` in HHLL) depend on specific state sequences that deterministic bar generators might not produce. → **Mitigation**: Use sine-wave + linear-up trends that are known to produce HH/HL/LH/LL pivots. Log actual trigger distribution. If a condition never fires, note it in test output.
- **[Risk] Volatility trail depends on Hull MA + ATR warmup**: The first ~72 bars may produce `na` trail values, suppressing alerts. → **Mitigation**: Use >= 200 bars and verify the test output logs the true range of bars that produced triggers.
- **[Risk] Time cost**: Running both indicators across multiple test scenarios (basic, prepend, forming-candle) doubles the existing test suite runtime. → **Mitigation**: Use reasonable bar counts (500-1000) to keep total runtime under 30s.
- **[Trade-off] No exact-count assertions**: We won't assert "exactly N triggers on bar M" because indicator logic varies with minor parameter changes. Structural assertions (validity, cross-validation with visuals) provide stronger correctness guarantees without brittleness.

## Open Questions

1. Does the forming-candle/diff path properly carry `alertConditions` forward? `mergeDiffIntoResult` spreads `...prev` so conditions survive, but `alertConditions` never appear in `FormingCandleResult.diffAlertTriggers` — is this intentional?
2. Does the `alert` function (as opposed to `alertcondition`) produce correct `alertId` values? The `alert` builtin uses the message string as the alertId, which differs from `alertcondition`'s `alert_N` pattern.
