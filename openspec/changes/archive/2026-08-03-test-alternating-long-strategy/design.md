## Context

The Pine Framework project includes a Pine Script engine that can execute strategies. We have created `alternating-long-strategy.pine` for first practical mainnet testing. Before deploying real capital, we need a test infrastructure that validates strategy logic without blockchain interactions.

The existing test infrastructure uses Vitest. We need to extend this to support Pine Script strategy execution with mock trading capabilities.

## Goals / Non-Goals

**Goals:**
- Create a mock trading framework that simulates order execution
- Validate alternating long strategy behavior (open/close on each candle)
- Verify 10% equity position sizing works correctly
- Generate test reports showing order history and performance
- Reuse infrastructure for testing other Pine Script strategies

**Non-Goals:**
- Modify existing Pine Script files or production code
- Implement actual blockchain transactions
- Test network latency or gas optimization
- Create a full backtesting framework (use existing if available)

## Decisions

### Decision 1: Vitest-based test suite
**Choice**: Use Vitest with TypeScript for test implementation
**Rationale**: Project already uses Vitest for testing. Consistent with existing patterns.
**Alternatives considered**: Jest (not currently configured), Mocha (not in project)

### Decision 2: Mock execution layer
**Choice**: Create a MockExchange class that records orders without blockchain interaction
**Rationale**: Clean separation between strategy logic and execution. Allows testing strategy behavior independently.
**Alternatives considered**: Modify Pine Engine directly (too invasive), use existing backtesting (may have blockchain dependencies)

### Decision 3: Strategy simulation approach
**Choice**: Execute Pine Script against historical data with mocked strategy functions
**Rationale**: Tests actual strategy code, not a recreation. Validates real behavior.
**Alternatives considered**: Manual unit tests of logic (doesn't test integration), mocking entire Pine Engine (too complex)

### Decision 4: Test data approach
**Choice**: Generate synthetic candle data for deterministic testing
**Rationale**: Controlled environment, repeatable results, no external dependencies.
**Alternatives considered**: Use real market data (adds complexity, non-deterministic)

## Risks / Trade-offs

**[Risk]** Mock execution may not capture all real-world edge cases → **Mitigation**: Document limitations, focus on core logic validation

**[Risk]** Synthetic data may not represent real market conditions → **Mitigation**: Use realistic price ranges, document assumptions

**[Risk]** Test may pass but strategy fails on mainnet → **Mitigation**: Run tests before deployment, monitor initial positions closely

**[Trade-off]** Simplicity vs completeness: Mock layer is simpler but less realistic than full simulation
