## Purpose
Implement and verify Multi-Symbol Data Access functionality for the multi-symbol-data module.

## Requirements

### Requirement: Multi-Symbol Data Access
The engine SHALL support cross-symbol data access via request.security and request.security_lower_tf, including data transformation functions.

#### Scenario: request.security Access
- **WHEN** request.security() is called
- **THEN** the engine SHALL fetch data from the specified symbol/context

#### Scenario: request.security_lower_tf Access
- **WHEN** request.security_lower_tf() is called
- **THEN** the engine SHALL fetch data at a lower timeframe

#### Scenario: Data Transformation Functions
- **WHEN** request.currency_rate() is called
- **THEN** the engine SHALL return the currency exchange rate

#### Scenario: Financial Data
- **WHEN** request.financial() is called for specific metrics (sales_per_share, net_income_per_share, etc.)
- **THEN** the engine SHALL return the requested financial data
