## 1. Core Module

- [x] 1.1 Create `src/util/candle-string-format.ts` with `CandleFormatContext` interface and `formatCandleString(template, context)` function supporting all variables: `ticker`, `interval`, `open`, `high`, `low`, `close`, `volume`, `time`, `bar_index`, `timestamp` (both `{{var}}` and single-curly `{var}` for time/bar_index/timestamp)
- [x] 1.2 Add `ticker` field to `AlertBarData` interface in `src/strategy/alert-system.ts`
- [x] 1.3 Write unit tests for `formatCandleString` covering: basic substitution, all variables, single-curly fallback, missing context fields, no variables, partial template

## 2. Pine Runtime Integration

- [x] 2.1 Replace `formatMessage` in `src/strategy/alert-system.ts` with a call to the shared `formatCandleString`, passing `currentBarData` (including the new `ticker` field)
- [x] 2.2 Verify existing alert tests still pass (`tests/strategy/alert-system.test.ts`, `tests/integration/alert-*.test.ts`)

## 3. Backend Telegram Integration

- [x] 3.1 Apply `formatCandleString` in `backend/src/ws/gateway.ts` before calling `sendAlertToSubscribers`, passing `symbol` as `ticker` and `interval` from the topic context
- [x] 3.2 Update `backend/src/ws/gateway.ts` imports to include the shared formatting module

## 4. Frontend Integration

- [x] 4.1 Import and apply `formatCandleString` in `frontend/src/hooks/chart-alert-processor.ts` or the alert rendering path so displayed alerts show resolved values

## 5. Cleanup & Verify

- [x] 5.1 Remove any remaining inline formatting logic from `alert-system.ts` (the old `formatMessage` method)
- [x] 5.2 Run full test suite (`pnpm test`) to confirm no regressions
- [x] 5.3 Run lint (`pnpm lint`) and typecheck (`pnpm typecheck`)
