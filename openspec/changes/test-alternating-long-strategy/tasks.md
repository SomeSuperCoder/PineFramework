## 1. Mock Trading Infrastructure

- [x] 1.1 Create MockExchange class that records orders without blockchain interaction
- [x] 1.2 Implement position tracking (size, entry price, unrealized P&L)
- [x] 1.3 Add capital percentage sizing support (10% of equity)
- [x] 1.4 Create test report generation functionality

## 2. Strategy Test Suite

- [x] 2.1 Create Vitest test file for alternating-long-strategy
- [x] 2.2 Generate synthetic candle data for deterministic testing
- [x] 2.3 Implement test that validates alternating open/close behavior
- [x] 2.4 Verify 10% equity position sizing works correctly
- [x] 2.5 Test position state tracking (inPosition flag)

## 3. Integration & Reporting

- [x] 3.1 Integrate mock exchange with Pine Script execution
- [x] 3.2 Generate test report showing order history and performance
- [x] 3.3 Document test limitations and assumptions
- [x] 3.4 Verify tests run successfully with `pnpm test`
