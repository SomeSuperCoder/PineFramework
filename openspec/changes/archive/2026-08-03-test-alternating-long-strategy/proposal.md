## Why

The `alternating-long-strategy.pine` was created for first practical testing of the trading bot on mainnet. Before deploying real capital, we need to verify the strategy logic works correctly in a controlled environment. This test will validate that the strategy alternates positions as expected without executing actual blockchain transactions.

## What Changes

- Add a mock trading test suite for Pine Script strategies
- Create test infrastructure that simulates order execution without blockchain interaction
- Validate alternating long strategy behavior: opens/closes positions on each candle
- Verify position sizing (10% of equity) works correctly
- Ensure strategy state tracking (inPosition flag) functions properly

## Capabilities

### New Capabilities
- `mock-trading-test`: Framework for testing Pine Script strategies with simulated order execution, no blockchain transactions

### Modified Capabilities

(None - this is a new testing capability)

## Impact

- New test files in `tests/` directory
- Mock trading infrastructure that can be reused for other strategy tests
- No changes to existing Pine Script files or production code
- Validation that strategy is ready for mainnet deployment
