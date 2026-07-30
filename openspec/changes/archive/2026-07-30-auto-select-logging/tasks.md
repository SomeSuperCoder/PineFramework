## 1. Backend: Add error field to CandidateStatus

- [x] 1.1 Add `error?: string` to `CandidateStatus` interface in `auto-select.ts`
- [x] 1.2 Update all `statuses[key] = { phase, status: 'failed' }` to include error message
- [x] 1.3 Add console.log statements for each phase transition

## 2. Frontend: Display error messages

- [x] 2.1 Update `AutoSelectProgress` type in `useAutoSelectProgress.ts` to include `error`
- [x] 2.2 Update `CandidateStatus` type in `TradingBotPanel.tsx` to include `error`
- [x] 2.3 Add error message display in `AutoSelectGrid` (tooltip + small text)

## 3. Verify

- [x] 3.1 Run TypeScript build — no new errors
- [x] 3.2 Test: Trigger auto-select with invalid script — verify error message appears
