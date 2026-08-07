## Purpose

Makes the bot's market-data pipeline observable so a silent or dead candle feed is visible and diagnosable on the dashboard instead of looking like a healthy idle bot.

## ADDED Requirements

### Requirement: Feed connectivity surfaced on dashboard

The system SHALL broadcast feed connectivity state over a `bot:feedStatus` WebSocket channel, including connected/disconnected state, per-pair subscription attempts (which pairs the feed was asked to subscribe to and whether the subscribe message was sent on an open socket), last-confirmed-candle timestamp, and total confirmed candle count since start. The truthful connectivity signal is connected/disconnected — per-pair results reflect subscribe-request delivery, not broker acks (the Bybit service does not surface subscription confirmations). When the bot is Running but no confirmed candle has been received within the configured silence threshold, the dashboard SHALL surface a "feed silent" indicator. The connect-time `bot:snapshot` SHALL also carry the current feed state so a client connecting to an already-silent feed sees it immediately.

#### Scenario: Feed connects

- **WHEN** the bot's real-time bar feed connects and subscribe messages are sent for the configured pairs
- **THEN** the system SHALL broadcast `bot:feedStatus` with connected state and the per-pair subscription attempts

#### Scenario: Feed fails to connect

- **WHEN** the bar feed fails to connect or the socket errors
- **THEN** the system SHALL broadcast `bot:feedStatus` with disconnected state, and the dashboard SHALL show the feed as not connected

#### Scenario: Running bot with no confirmed candles

- **WHEN** the bot is Running and no confirmed candle arrives within the silence threshold
- **THEN** the dashboard SHALL display a "feed silent" indicator rather than appearing healthy

#### Scenario: Feed state available on connect

- **WHEN** a WebSocket client connects while the feed is connected but silent, or disconnected
- **THEN** the connect-time snapshot SHALL include the current feed state so the dashboard is not blind until the next feed event

### Requirement: Last-run feed state persisted

The system SHALL persist the last run's feed state (connection result, last candle timestamp, candle count, and final error if any) to disk so a dead or silent feed is diagnosable without watching the bot live. Persistence SHALL be throttled so candle-count updates do not write to disk on every candle.

#### Scenario: Feed state written during run

- **WHEN** the bot is running and feed connection/subscription state changes
- **THEN** the system SHALL persist the latest feed state to the run state file, and SHALL throttle candle-count-only updates (e.g., at most once per interval) to avoid per-candle disk churn

#### Scenario: Diagnosing after a silent run

- **WHEN** the operator inspects the run state file after a run that produced no signals
- **THEN** the file SHALL show whether the feed connected, the last candle timestamp, and candle count, allowing the operator to distinguish a dead feed from a silent pipeline
