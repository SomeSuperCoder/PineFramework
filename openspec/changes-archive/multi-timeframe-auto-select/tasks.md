## 1. Backend: Multi-timeframe candidates

- [x] 1.1 Add `DEFAULT_TIMEFRAMES` constant: ['5', '15', '60', '240']
- [x] 1.2 Update `defaultCandidates` in `index.ts` to generate pairs × timeframes
- [x] 1.3 Update `computeCandleCount` to handle all timeframe formats

## 2. Frontend: Timeframe selection UI

- [x] 2.1 Add timeframe toggle checkboxes in BacktestStep
- [x] 2.2 Store selected timeframes in localStorage
- [x] 2.3 Pass selected timeframes to backend (or filter candidates client-side)

## 3. Frontend: Update AutoSelectGrid

- [x] 3.1 Show timeframe in pair label: "BTCUSDT (60)" → "BTCUSDT · 1h"
- [x] 3.2 Add timeframe column or icon to distinguish timeframes

## 4. Verify

- [x] 4.1 Run TypeScript build — no new errors
- [ ] 4.2 Test: Select multiple timeframes, verify all are backtested
