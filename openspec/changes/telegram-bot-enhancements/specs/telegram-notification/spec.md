## MODIFIED Requirements

### Requirement: Deliverable Trading Event Types
The system MUST deliver position open, position close, bot lifecycle (start/stop/emergency/state change), errors, and warnings to subscribed chats, in addition to `alertcondition` alerts.

#### Scenario: Position Opened Delivered
- **WHEN** a position is opened
- **THEN** subscribed chats receive an emoji open message (position_open type)

#### Scenario: Position Closed Delivered
- **WHEN** a position is closed
- **THEN** subscribed chats receive a close message with PnL, fees, and exit price (position_close type)

#### Scenario: Bot Lifecycle Delivered
- **WHEN** the bot starts, stops, emergency-stops, or changes state
- **THEN** subscribed chats receive the lifecycle message (bot_lifecycle type)

### Requirement: Chats Model
The store MUST model recipients as `chats` (private or group) with per-member subscription and per-chat language, replacing the flat `subscribers` list. Existing `subscriber` records MUST migrate to the new model.

#### Scenario: Legacy Subscriber Migrated
- **WHEN** the store loads a file with the old `subscribers` shape
- **THEN** each subscriber becomes a private chat with all types enabled by default and per-alert preferences preserved

### Requirement: Routing by Transport Layer
The system MUST route messages and content via Notification subscription policy (subscriber type + chat language), while the raw formatter builds a message for a given language without owning destination selection.

#### Scenario: Escaping and Fallback
- **WHEN** MarkdownV2 encoding fails for a chat
- **THEN** the transport falls back to plain text for that chat (existing behavior preserved)

## Implementation Notes
- Reuse the existing `escapeMarkdown`/MarkdownV2 + plain-text fallback + 429-retry path in `TelegramService.sendMessage`.
- The legacy per-alert preference gating for `alertcondition` deliveries is preserved.