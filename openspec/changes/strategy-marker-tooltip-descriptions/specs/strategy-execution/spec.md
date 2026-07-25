## MODIFIED Requirements

### Requirement: Strategy Mode Functions

> **Note**: This requirement is extended so that strategy markers carry all display-relevant fields (`action`, `quantity`, `price`) for rendering in the chart tooltip. The `comment` field is already present and serves as the user-authored description.

The engine SHALL implement strategy mode with strategy.entry(), strategy.exit(), strategy.close(), strategy.cancel(), strategy.risk.*, strategy.position_size, strategy.openprofit, strategies for pyramiding, and brokerage emulation.

#### Scenario: strategy.entry() stores marker with action, quantity, price, and comment
- **WHEN** strategy.entry() is called with optional `comment` parameter
- **THEN** the resulting `StrategyMarker` SHALL include `type: 'entry'`, `action`, `quantity`, `price`, and `comment` (if provided) so the frontend can display these in the bar tooltip

#### Scenario: strategy.exit() stores marker with action, quantity, price, and comment
- **WHEN** strategy.exit() is called with optional `comment` parameter
- **THEN** the resulting `StrategyMarker` SHALL include `type: 'exit'`, `action`, `quantity`, `price`, and `comment` (if provided) so the frontend can display these in the bar tooltip
