## ADDED Requirements

### Requirement: Supported Languages
The system MUST support English (`en`, default), Spanish (`es`), and Russian (`ru`), with a complete dictionary per language. All dictionaries MUST expose an identical key set.

#### Scenario: Dictionary Key Parity
- **WHEN** the i18n module is loaded
- **THEN** en, es, ru expose exactly the same keys (asserted by a parity unit test)

#### Scenario: Unknown Language
- **WHEN** an unsupported language is requested
- **THEN** the bot lists the supported languages and keeps the current language

### Requirement: Per-Chat Language
Each chat MUST carry a `language` setting, defaulting to `en`, independent across personal and group chats.

#### Scenario: Default English
- **WHEN** a chat is first registered
- **THEN** its language is `en`

#### Scenario: Toggle via /lang
- **WHEN** a user runs `/lang` with no argument
- **THEN** the bot replies with the current language and usage
- **WHEN** a user runs `/lang es` (or `ru`, `en`)
- **THEN** the chat's language is updated and the bot confirms in that language

#### Scenario: Group Language
- **WHEN** a member toggles language in a group
- **THEN** the group's language changes (last setter wins), defaulting to `en`

### Requirement: Emoji in Translated Strings
The system MUST embed emoji inside the translated strings (per-language taste), not concatenate them externally.

#### Scenario: Emoji Bundled in Translation
- **WHEN** a message is translated to a language
- **THEN** the emoji is part of that language's dictionary entry rather than appended by the caller

## Implementation Notes
- i18n dictionary lives in a typed module (e.g. `backend/src/telegram/i18n.ts`) with keys covering every command, notification type, and UI reply.
- `t(lang, key, params?)` helper with string interpolation.
- A unit test asserts identical key sets across en/es/ru.