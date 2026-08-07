## Purpose

Live-trading bot logging with dedicated categories and subcategories, integrated with the existing `BotEngine` and `BotLogger` interface, writing to `logs/bot/`.

## ADDED Requirements

### Requirement: Bot logger extends PineLogger with trading-specific metadata
The system SHALL provide a `createBotLogger` function that returns a PineLogger-compatible instance pre-bound with `category: "bot"` and appropriate subcategories for trading operations.

#### Scenario: Bot logger call includes trading metadata
- **WHEN** `botLogger.info("trade.executed", { pair: "BTCUSDT", side: "buy", quantity: 0.5, price: 67000 })`
- **THEN** the log entry contains `category: "bot"`, `subcategory: "execution"`, the message `"trade.executed"`, and the trading metadata

### Requirement: Bot logger subcategories cover trading domains
The system SHALL support these subcategories for bot logging: `execution`, `risk`, `telegram`, `scheduler`, `wallet`, `strategy`.

#### Scenario: Risk event is logged with correct subcategory
- **WHEN** a daily loss limit breach occurs
- **THEN** the bot logger records it with `subcategory: "risk"` and `level: "error"`

#### Scenario: Telegram notification is logged with correct subcategory
- **WHEN** a Telegram alert is sent
- **THEN** the bot logger records it with `subcategory: "telegram"` and `level: "info"`

### Requirement: Bot logger integrates with existing BotEngine
The system SHALL allow `BotEngine` to accept a `PineLogger`-compatible logger via its constructor options, replacing the current `BotLogger` interface or extending it.

#### Scenario: BotEngine uses PineLogger instead of consoleLogger
- **WHEN** `BotEngine` is constructed with a `PineLogger` instance
- **THEN** all bot events (start, stop, emergency stop, trade execution) are logged through the PineLogger with appropriate categories and subcategories

### Requirement: Bot logs are stored in gitignored directory
The system SHALL write bot logs to `logs/bot/` which is gitignored and accessible to AI agents.

#### Scenario: AI agent reads bot execution log
- **WHEN** an AI agent reads `logs/bot/execution.log`
- **THEN** it finds structured JSON lines with trading bot events, timestamps, and metadata

### Requirement: Bot logger supports the existing `bot:log` WebSocket channel
The system SHALL broadcast bot log entries to the frontend via the existing `bot:log` WebSocket channel so the TradingBotPanel can display them.

#### Scenario: Bot error appears in TradingBotPanel
- **WHEN** a risk limit breach is logged via the bot logger
- **THEN** it is broadcast over `bot:log` WebSocket and appears in the TradingBotPanel log display
