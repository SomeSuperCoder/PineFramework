## 1. Create test fixtures

- [x] 1.1 Create `tests/fixtures/volatility-trail.ts` — reads actual .pine from disk, exports source + metadata (4 conditions, cross-validation data)
- [x] 1.2 Create `tests/fixtures/higher-high-lower-low.ts` — reads actual .pine from disk, exports source + metadata (9 conditions)
- [x] 1.3 Update existing `alert-trigger-pipeline.test.ts` to import HHLL fixture instead of `fs.readFileSync`

## 2. Backend integration tests — HHLL

- [x] 2.1 Add `tests/integration/alert-multi-condition.test.ts` with HHLL describe block testing barIndex validity and timestamp matching on sine-wave data
- [x] 2.2 Add test for HHLL `alertConditions` metadata — verify 9 entries with non-empty title/message
- [x] 2.3 Add prepend scenario for HHLL — verify shifted barIndex values via timestamp intersection
- [x] 2.4 Log trigger-per-bar distribution for HHLL with 9-condition diagnostic output

## 3. Backend integration tests — Volatility Trail

- [x] 3.1 Add volatility-trail describe block testing barIndex validity and timestamp matching on linear-up data
- [x] 3.2 Add test for volatility trail `alertConditions` metadata — verify 4 entries with non-empty title/message
- [x] 3.3 Add cross-validation test: verify flipUp/flipDn triggers match "▲"/"▼" labels from the script output
- [x] 3.4 Add cross-validation test: verify bullRTok/bearRTok triggers match "◆" plotchar style (not text)
- [x] 3.5 Add prepend scenario for volatility trail — verify trigger positions survive prepend
- [x] 3.6 Add forming-candle diff merge test — verify triggers appended without duplication

## 4. Diagnose and fix bugs

- [x] 4.1 Run all new tests against current codebase; collected failures
- [x] 4.2 Traced root causes: `alertcondition` builtin didn't support positional title/message args; plotchar stores char in `style` not `text`
- [x] 4.3 Fixed `alertcondition` in `other-builtins.ts` to fall back to positional args for title/message
- [x] 4.4 All tests pass (10/10 multi-condition + 4/4 pipeline)

## 5. Verify completeness

- [x] 5.1 Run full test suite (`pnpm test`) — 84/85 pass, 1 pre-existing failure (hhll-e2e-pivot unrelated)
- [x] 5.2 Captured final trigger statistics for both indicators from test output
- [x] 5.3 Commit all changes with conventional commit message
