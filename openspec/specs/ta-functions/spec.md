## Purpose
Implement and verify Technical Indicator Functions functionality for the ta-functions module.

## Requirements

### Requirement: Technical Indicator Functions
The engine SHALL implement a comprehensive set of Pine-compatible TA functions covering trend, momentum, volume, volatility, and statistical indicators.

#### Scenario: Moving Averages
- **WHEN** ta.sma(), ta.ema(), ta.rma(), ta.wma(), ta.vwma(), ta.hma(), ta.alma(), ta.jma(), ta.swma(), ta.linreg() are called
- **THEN** the engine SHALL compute the corresponding moving average

#### Scenario: Momentum Oscillators
- **WHEN** ta.roc(), ta.mom(), ta.rsi(), ta.stoch(), ta.cmo(), ta.wpr() are called
- **THEN** the engine SHALL compute the corresponding momentum indicator

#### Scenario: Volatility Indicators
- **WHEN** ta.atr(), ta.superTrend(), ta.highest(), ta.lowest(), ta.range(), ta.trueRange(), ta.bb(), ta.bbw(), ta.kc() are called
- **THEN** the engine SHALL compute the corresponding volatility indicator

#### Scenario: Volume Indicators
- **WHEN** ta.obv(), ta.vwap(), ta.volume(), ta.mfi(), ta.vwma() are called
- **THEN** the engine SHALL compute the corresponding volume-weighted indicator

#### Scenario: Statistical Functions
- **WHEN** ta.correlation(), ta.covariance(), ta.dev(), ta.stdev(), ta.variance(), ta.median(), ta.mode(), ta.percentile_linear_interpolation(), ta.percentile_nearest_rank(), ta.quantile() are called
- **THEN** the engine SHALL compute the corresponding statistical function

#### Scenario: Cross Detection
- **WHEN** ta.crossover() or ta.crossunder() is called
- **THEN** the engine SHALL return a boolean series indicating the cross condition

#### Scenario: Previous Bar Value Access
- **WHEN** ta.valuewhen() is called
- **THEN** the engine SHALL return the n-th most recent value matching a condition

#### Scenario: Bar Properties
- **WHEN** ta.barssince() is called
- **THEN** the engine SHALL return the number of bars since the condition was true

#### Scenario: Highest/Lowest Bars
- **WHEN** ta.highestbars() or ta.lowestbars() is called
- **THEN** the engine SHALL return the offset to the highest/lowest value

#### Scenario: Pivot Points
- **WHEN** ta.pivothigh() or ta.pivotlow() is called
- **THEN** the engine SHALL detect pivot points with strict comparison semantics

#### Scenario: Change/Difference
- **WHEN** ta.change() or ta.diff() is called
- **THEN** the engine SHALL compute the difference between current and previous values

#### Scenario: Cumulative Sum
- **WHEN** ta.cum() is called
- **THEN** the engine SHALL compute the running cumulative sum

#### Scenario: Math Functions
- **WHEN** math.abs, math.acos, math.asin, math.atan, math.avg, math.ceil, math.cos, math.exp, math.floor, math.log, math.log10, math.max, math.min, math.pow, math.round, math.sign, math.sin, math.sqrt, math.sum, math.tan, math.todegrees, math.toradians are called
- **THEN** the engine SHALL compute the corresponding mathematical function

#### Scenario: Misc Math Functions
- **WHEN** math.log2, math.logN, math.phi, math.lgamma, math.tgamma, math.beta, math.betainc, math.erf, math.erfc, math.normalDist, math.normalDistInv, math.percentRank, math.linearInterpolation, math.cagr, math.nroot, math.factorial, math.gcd, math.lcm are called
- **THEN** the engine SHALL compute the corresponding mathematical function
