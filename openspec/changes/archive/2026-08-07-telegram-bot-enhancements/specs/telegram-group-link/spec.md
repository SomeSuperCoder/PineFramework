## ADDED Requirements

### Requirement: Group Link Gating
A group chat (negative chatId) MUST require an explicit `link` action before it receives notifications. Link and unlink MUST require admin or controller permission.

#### Scenario: Link a Group
- **WHEN** a controller/admin runs `/link` inside a group
- **THEN** the group is marked linked and group notification delivery is enabled
- **WHEN** an unprivileged member runs `/link`
- **THEN** the request is rejected with a permission-denied reply

#### Scenario: Unlink a Group
- **WHEN** a controller/admin runs `/unlink` inside a group
- **THEN** the group is unlinked and its notification delivery is disabled
- **WHEN** an unprivileged member runs `/unlink`
- **THEN** the request is rejected

#### Scenario: DM Link Rejected
- **WHEN** `/link` runs in a private chat
- **THEN** the bot explains that linking only applies to group chats

### Requirement: Group Venue Subscription
Group members MUST subscribe to notification types independently of linking. Linking controls whether the group as a whole receives anything.

#### Scenario: Subscribe While Linked
- **WHEN** a group is linked and a member subscribes to position_open
- **THEN** that member receives position_open messages in the group

### Requirement: Unlink Silences Group
When a group is unlinked, the system MUST NOT deliver any notification to it even for subscribed members.

#### Scenario: Unlinked Group Receives Nothing
- **WHEN** a notification is emitted and the group is not linked
- **THEN** the group receives no message, regardless of per-member subscriptions

## Implementation Notes
- Chat records distinguish `type: 'private' | 'group'`.
- A negative chatId is a group; a positive chatId is a private DM (chatId == fromId).
- Adding a bot to a group may surface `my_chat_member`/`group_chat` updates; handled in the transport.