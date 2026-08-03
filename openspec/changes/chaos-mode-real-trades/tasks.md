## 1. Wire submitOrders to executeSignal

- [x] 1.1 Replace the no-op `submitOrders` callback in `BotEngine.initialize()` with real execution logic (Design §1)
- [x] 1.2 Map `Scheduler.TradeSignal` → `LiveStrategyExecutor.TradeSignal` inline in the callback (Design §2)
- [x] 1.3 Call `strategyExecutor.executeSignal()` for each mapped signal sequentially (Design §3)

## 2. Execution Result Handling

- [x] 2.1 Log each execution result (success with tx signature, or failure with error message) (spec `chaos-test-mode` Requirement: Chaos mode signal execution)
- [x] 2.2 Handle insufficient balance gracefully — log and continue, don't crash (spec `chaos-test-mode` Scenario: Insufficient balance)
- [x] 2.3 Track execution stats: total signals, executed, failed, execution time (spec `chaos-test-mode` Requirement: Chaos mode execution result tracking)

## 3. Testing

- [x] 3.1 Write unit test: verify `submitOrders` calls `executeSignal` for each signal
- [x] 3.2 Write unit test: verify type mapping from scheduler signal to executor signal
- [x] 3.3 Write unit test: verify failed execution doesn't crash the batch
- [x] 3.4 Run existing chaos mode tests to verify no regression

## 4. Polish

- [x] 4.1 Verify emergency stop still works with real DEX execution
- [x] 4.2 Run full test suite
- [x] 4.3 Verify chaos signals only execute on confirmed real-time candle closes (not on backtest candles or forming candles)
