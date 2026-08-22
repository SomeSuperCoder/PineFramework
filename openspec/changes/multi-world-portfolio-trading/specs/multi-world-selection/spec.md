# multi-world-selection — Spec Delta

## ADDED Requirements

### Requirement: Top-N auto-selection with positive-PnL hard filter
The system SHALL select up to N best worlds (user-configured N) from backtest results, sorted by PnL descending. Worlds whose backtest PnL is non-positive (≤ 0) SHALL NEVER be selected, even if fewer than N qualify.

#### Scenario: N larger than qualifying worlds
- **WHEN** the user sets N=5 and only 3 worlds have positive PnL
- **THEN** exactly those 3 positive worlds are selected and the flow proceeds

#### Scenario: all results negative
- **WHEN** every backtested world has PnL ≤ 0
- **THEN** selection returns zero worlds and the UI blocks progression to the next step, offering the user to go back and pick another strategy

#### Scenario: normal selection
- **WHEN** more than N worlds have positive PnL
- **THEN** the top N by PnL are selected

### Requirement: Bounded parallel backtests
Candidate backtests SHALL run concurrently with a bounded concurrency limit so that no more than a small fixed number (default ~4) of backtests execute at once. Completion order SHALL NOT affect result correctness or ranking.

#### Scenario: faster than sequential
- **WHEN** 20 candidates are evaluated
- **THEN** total wall-clock time is materially lower than sequential execution and never exceeds system resource limits

#### Scenario: deterministic ranking
- **WHEN** backtests complete out of order
- **THEN** final ranking by PnL is identical to the sequential result

### Requirement: Multi-world live configuration
The bot SHALL accept a live setup consisting of multiple worlds, each defined as timeframe+symbol+strategy. Each configured world trades concurrently and independently.

#### Scenario: multiple strategies across timeframes
- **GIVEN** a setup `tf1+sym1+stg1, tf1+sym2+stg2, tf2+sym1+stg1`
- **WHEN** the bot starts
- **THEN** all three worlds run simultaneously, each with its own state and positions
