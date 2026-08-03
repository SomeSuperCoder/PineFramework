## ADDED Requirements

### Requirement: Live trading short signal interpretation

When a Pine Script strategy emits a short signal (`strategy.entry()` with `strategy.short` direction), the live trading executor SHALL interpret it based on the current position state. Since spot DEXes do not support short selling, the system SHALL map short signals to position-closing actions rather than silently dropping them.

#### Scenario: Short signal closes existing long position

- **WHEN** the live trading executor receives a strategy marker with `direction: 'short'` and the current position is `long`
- **THEN** the executor SHALL emit a `TradeSignal` with `action: 'close'` to close the entire long position

#### Scenario: Short signal ignored when flat

- **WHEN** the live trading executor receives a strategy marker with `direction: 'short'` and the current position is `flat`
- **THEN** the executor SHALL log a warning that short positions are not supported on spot DEXes and NOT emit any trade signal

#### Scenario: Short signal ignored when already short

- **WHEN** the live trading executor receives a strategy marker with `direction: 'short'` and the current position is already `short` (theoretical,不应 happen on spot DEX)
- **THEN** the executor SHALL log a warning and NOT emit any trade signal

### Requirement: Short signal warning logging

The system SHALL provide visible feedback when a short signal is received, so users understand why no trade was executed.

#### Scenario: Warning logged for short signal on spot DEX

- **WHEN** a strategy marker with `direction: 'short'` is processed by the live trading executor
- **THEN** the system SHALL log a warning message indicating that short positions are not supported and describing what action was taken (close if long, ignored if flat)
