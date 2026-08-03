## Purpose

Provides a persistent positions panel in the trading bot dashboard that always displays current open positions with detailed trading information.

## ADDED Requirements

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
The system SHALL update position display in real-time as the WebSocket receives position updates.

#### Scenario: Position price update
- **WHEN** a position's current price changes
- **THEN** the displayed current price and unrealized P&L update immediately

#### Scenario: Position opened
- **WHEN** a new position is opened
- **THEN** it appears in the positions panel immediately

#### Scenario: Position closed
- **WHEN** a position is closed
- **THEN** it is removed from the positions panel immediately
