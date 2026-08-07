## ADDED Requirements

### Requirement: Notification Type Taxonomy
The system MUST define a canonical set of notification types: `trading` (alertcondition alerts), `position_open`, `position_close`, `report` (on-demand stats), `daily` (reserved for future), `error`, `bot_lifecycle` (start/stop/emergency/state changes).

#### Scenario: Known Types Accepted
- **WHEN** a subscription command references a known type
- **THEN** the type is validated against the canonical list

#### Scenario: Unknown Type Rejected
- **WHEN** an unknown type is passed to a subscription command
- **THEN** the bot lists the valid types and rejects the value

### Requirement: Per-Chat Subscriptions
Notification subscriptions MUST be per-chat: a private DM (chatId == userId) or a group each carries its own list of enabled notification types per member.

#### Scenario: Defaults by Venue
- **WHEN** a private chat subscribes
- **THEN** by default all notification types are enabled (opt-out per type)

#### Scenario: Defaults for Group
- **WHEN** a group chat is linked
- **THEN** all types are OFF by default for the group (opt-in per type per member)

#### Scenario: Subscribe to Types
- **WHEN** a user runs `/subscribe` specifying types
- **THEN** those types are enabled for their chat/membership

#### Scenario: Unsubscribe from Types
- **WHEN** a user runs `/unsubscribe` specifying types
- **THEN** those types are disabled for their chat/membership

### Requirement: Delivery Routing by Type
The system MUST dispatch each outgoing notification to the chats subscribed to that specific type, formatted in the chat's language.

#### Scenario: Position Opened to Subscribers
- **WHEN** the engine fires a position_open event
- **THEN** every chat subscribed to position_open receives the emoji open message in its configured language; other chats receive nothing

#### Scenario: Unsubscribed Chat Silent
- **WHEN** a type fires but a chat is not subscribed to it
- **THEN** that chat receives nothing

### Requirement: Group Delivery Follows Link Status
Group delivery MUST only occur for linked groups.

#### Scenario: Unlinked Group Silent
- **WHEN** a notification fires and a group is not linked
- **THEN** the group receives nothing regardless of member subscriptions

#### Scenario: Linked Group Delivers
- **WHEN** a group is linked and a member subscribes to a type
- **THEN** the group receives that type for the subscribed member

### Requirement: Subscription Without Control
Membership subscription MUST be open to any user; it is a preference, not a control grant.

#### Scenario: Member Subscribes Freely
- **WHEN** any group member runs `/subscribe`
- **THEN** their per-member subscription is updated without a controller check

### Requirement: Legacy Per-Alert Toggles Coexist
The existing per-chat per-alert toggles MUST continue to work alongside the new type-based subscriptions.

#### Scenario: Legacy Alert Preference
- **WHEN** a notification is a trading alert with an alertId
- **THEN** delivery is gated by BOTH the per-alert toggle AND the `trading` subscription type

## Implementation Notes
- Subscriptions live in the `chats` model as `memberSubscriptions` (chatId → memberId → types).
- Private chat: chatId == fromId. Group chat: negative chatId, memberId = fromId.
- Routing is handled by `TelegramBotFeature.deliver(type, buildMessage)`.