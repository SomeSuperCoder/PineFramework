## ADDED Requirements

### Requirement: TA functions reject invalid period parameters gracefully
Built-in TA functions SHALL handle zero, negative, or NaN period/length parameters without crashing.

#### Scenario: SMA with zero length
- **WHEN** `sma(close, 0)` is called
- **THEN** the engine SHALL not crash; result SHALL be `na` or handle gracefully

#### Scenario: SMA with negative length
- **WHEN** `sma(close, -5)` is called
- **THEN** the engine SHALL not crash; result SHALL be `na` or handle gracefully

#### Scenario: EMA with NaN alpha/period
- **WHEN** `ema(close, na)` is called
- **THEN** the engine SHALL not crash; result SHALL be `na`

#### Scenario: RSI with period less than 2
- **WHEN** `rsi(close, 1)` or `rsi(close, 0)` is called
- **THEN** the engine SHALL not crash; result SHALL be `na`

#### Scenario: ATR with period zero or negative
- **WHEN** `atr(0)` or `atr(-14)` is called
- **THEN** the engine SHALL not crash; result SHALL be `na`

### Requirement: TA functions handle constant input series
TA functions SHALL produce deterministic output when fed constant-price series (all bars have the same value).

#### Scenario: SMA on constant series
- **WHEN** `sma(close, 5)` is called on a series where all closes are 100
- **THEN** the result SHALL be 100 for each bar beyond the warm-up period

#### Scenario: RSI on constant series
- **WHEN** `rsi(close, 14)` is called on a constant-price series
- **THEN** the result SHALL be `na` because there are no price changes

### Requirement: TA functions handle single-bar series
TA functions SHALL handle series with only one bar of data without crashing.

#### Scenario: SMA on single bar
- **WHEN** `sma(close, 14)` is computed on a single bar
- **THEN** the result SHALL be `na` (insufficient data for period)

#### Scenario: EMA on single bar
- **WHEN** `ema(close, 14)` is computed on a single bar
- **THEN** the result SHALL be equal to the close value (EMA initializes with first close)
