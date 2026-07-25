## Purpose
Statically analyze AST body to extract minimum lookback period required by a script.

## Requirements

### Requirement: AST-based Lookback Detection
The `detectLookbackFromAST` function SHALL statically analyze the AST body to extract the minimum lookback period required by the script.

#### Scenario: TA function constant period detection
- **WHEN** a `ta.*` CallExpression has constant period arguments (e.g., `ta.sma(src, 20)`, `ta.ema(src, 20)`, `ta.rsi(src, 14)`)
- **THEN** the period value SHALL be detected as the lookback requirement

#### Scenario: Pivot function combined lookback
- **WHEN** `ta.pivothigh(L, R)` or `ta.pivotlow(L, R)` is called with constant arguments
- **THEN** the lookback SHALL be L + R (combined left/right bars)

#### Scenario: Array indexing detection
- **WHEN** `close[N]`, `open[N]`, `high[N]`, `low[N]`, `volume[N]` or any user-defined series `variableName[N]` is used with constant N
- **THEN** the lookback SHALL be N

#### Scenario: Combined detection
- **WHEN** multiple lookback sources exist
- **THEN** the effective lookback SHALL be the MAX of all detected values

#### Scenario: Variable argument skipped
- **WHEN** a TA function is called with a variable or computed period argument
- **THEN** the detector SHALL skip it (fall back to runtime lookback)
