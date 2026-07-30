## 1. Frontend: Auto-calculate Risk

- [x] 1.1 Add `calcMaxDailyLoss(balance)` function: `Math.min(1, balance * 0.10)`
- [x] 1.2 Replace static `maxDailyLoss` state with calculated value from USDC balance
- [x] 1.3 Pass calculated value to backend on configure

## 2. Frontend: Display Risk

- [x] 2.1 Show calculated maxDailyLoss in config panel (read-only)
- [x] 2.2 Update display when balance loads

## 3. Verify

- [x] 3.1 Test: $50 balance → $1.00 risk
- [x] 3.2 Test: $5 balance → $0.50 risk
- [x] 3.3 Test: $0 balance → $0.00 risk
