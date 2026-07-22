## 1. Backend — Export route

- [x] 1.1 Create `.exports/` at repo root, add to `.gitignore`
- [x] 1.2 Add `POST /api/export` route in `backend/src/routes/` that receives JSON body, writes to `.exports/export-<unix-ms>.json`, returns `{ success, path }`

## 2. Frontend — Export assembly and trigger

- [x] 2.1 Add `exportChartData()` function in `useChartData.ts` that reads `candles` state and `indicatorResultsRef` and assembles the full export payload
- [x] 2.2 Add "Export Full State" button in the footer bar that calls `exportChartData()` then `POST /api/export`
- [x] 2.3 Display the returned file path in a toast/notification so the user (or agent) knows where the file is

## 3. Verify

- [x] 3.1 Manual test: load an indicator, click export, confirm `.exports/export-*.json` exists with all expected fields
- [x] 3.2 Manual test: multi-indicator scenario, verify all indicators appear in the export
- [x] 3.3 Run full test suite to confirm no regressions
- [ ] 3.4 Commit
