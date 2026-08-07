## Purpose

Provides a persistent positions panel in the trading bot dashboard that always displays current open positions with detailed trading information.
## Requirements
### Requirement: Always-visible positions panel
The system SHALL always display the positions panel in the dashboard, regardless of whether positions are open.

#### Scenario: No open positions
- **WHEN** the bot is running and no positions are open
- **THEN** the positions panel is visible with a "No open positions" message

#### Scenario: With open positions
- **WHEN** the bot has one or more open positions
- **THEN** the positions panel displays each position with its details

### Requirement: Position details display
The system SHALL display the following information for each open position:
- Symbol (e.g., BTCUSDT)
- Side (long or short)
- Position size
- Entry price
- Current price
- Unrealized P&L (both absolute and percentage)
- Position duration (time since opened)

#### Scenario: Position information shown
- **WHEN** a position is open
- **THEN** all required fields are displayed in the positions panel

### Requirement: Position updates in real-time

The system SHALL populate the positions panel from the executor's real per-pair position state (not a placeholder) and update it in real-time as the backend emits `bot:position` events on open and close, so "no open positions" is truthful and open positions appear and disappear as chaos or strategy trades actually execute. The snapshot SHALL carry positions inside `status.positions` (the field the dashboard already reads). Positions SHALL reflect only CONFIRMED fills — a position SHALL NOT appear if the DEX order failed, even if the executor optimistically staged it.

#### Scenario: Position price update

- **WHEN** a position's current price is updated at the best-known price (last confirmed candle close; no live price feed exists)
- **THEN** the displayed current price and unrealized P&L update to that best-known value, and the dashboard SHALL NOT claim a fresher price than the last confirmed candle

#### Scenario: Position opened

- **WHEN** a new position is opened (DEX order confirmed)
- **THEN** it appears in the positions panel immediately, sourced from the executor's real position state

#### Scenario: Position closed

- **WHEN** a position is closed (sell order confirmed)
- **THEN** it is removed from the positions panel immediately

#### Scenario: Snapshot carries truthful positions

- **WHEN** a WebSocket client connects or receives a `bot:snapshot`
- **THEN** the `status.positions` field SHALL reflect the executor's actual per-pair positions (empty only when genuinely flat), never an always-empty placeholder

#### Scenario: Failed order does not show a phantom position

- **WHEN** the executor staged a position but the DEX order failed
- **THEN** the position SHALL NOT appear in the panel or snapshot, and a `bot:position` open event SHALL NOT be emitted

