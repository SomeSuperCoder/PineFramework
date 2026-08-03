## 1. Core Implementation

- [x] 1.1 Modify `LiveStrategyExecutor.processCandle()` to detect short markers from strategy engine and map them to close signals when position is long
- [x] 1.2 Add warning logging when short signal is received but position is flat (no action taken)
- [x] 1.3 Add warning logging when short signal is received but position is already short (theoretical, shouldn't happen on spot DEX)

## 2. Testing

- [x] 2.1 Add unit test: short signal closes existing long position
- [x] 2.2 Add unit test: short signal ignored when flat, warning logged
- [x] 2.3 Add unit test: short signal ignored when already short, warning logged
