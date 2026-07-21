# Design Document: Telegram and Alerts

## 1. Alert System

### 1.1 Responsibility
Evaluate alert conditions and trigger notifications.

### 1.2 Alert Functions
- `alert(message, alert_freq)`: Trigger notifications with the specified message and frequency
- `alertcondition(condition, title, message)`: Create named alert conditions visible in UI

### 1.3 Alert Frequencies
- `alert.freq_once_per_bar`: Trigger once per bar (first occurrence)
- `alert.freq_once_per_bar_close`: Trigger once on bar close
- `alert.freq_all`: Trigger on every condition true
- `alert.freq_max_per_bar`: Trigger maximum once per bar

### 1.4 Message Templates
- Template variables: `{{plot_0}}`, `{{plot_1}}`, `{{plot_2}}`, etc. for referencing plot values
- Bar data: `{{close}}`, `{{open}}`, `{{high}}`, `{{low}}`, `{{volume}}`, `{{time}}`, `{{interval}}`

### 1.5 Key Features
- Condition evaluation on each bar
- Message formatting with template syntax
- Duplicate prevention with configurable windows
- Multiple output destinations (email, webhook, popup, Telegram, etc.)
- Alert logging and auditing
- Display alertcondition() in indicator settings UI
- Alert markers rendered on chart at trigger bar
- Bar-close dispatch: alert triggers are suppressed during intra-bar updates and forming-candle recalculations; Telegram/email/webhook delivery only fires on confirmed bar close (`barstate.isconfirmed`), preventing notification spam during live candle formation

### 1.6 Three-Layer Alert Dedup Enforcement

1. **ScriptSession `lastConfirmedTimestamp`** — Per-session timestamp tracking: if a second `confirmed=true` kline arrives with the same or older timestamp, the session skips re-execution entirely (returns forming-candle result with `isConfirmed=false`, alerts suppressed).

2. **Gateway `recentAlertKeys` Set** — Module-level Set keyed by `alertId:timestamp:topic` (bounded at 100 entries, oldest evicted first). Before dispatching a Telegram alert, the gateway checks this Set; if the key exists, the duplicate is suppressed with a log message.

3. **Stale connection pruning** — Before iterating topic subscribers, closed WebSocket connections are removed from the subscriber Set, preventing orphaned sessions from producing phantom alerts.

---

## 2. Telegram Bot Integration

### 2.1 Responsibility
Send script alert notifications to a Telegram user via a Telegram Bot.

### 2.2 Architecture
```
Backend (Alert System) → Telegram Bot (HTTP API) → Telegram User
```

### 2.3 Configuration Storage
Telegram Bot Token and Telegram Username stored in Database.

### 2.4 Telegraf Bot Framework
Uses the **Telegraf** library (v4+, 9.2k GitHub stars, Bot API v7.1 compatible) as the Telegram Bot API framework:
- Bot runs as a long-lived service colocated with the Backend, using `bot.launch()` with graceful `SIGINT`/`SIGTERM` shutdown via `bot.stop()`
- On alert trigger, formats message with alert text, script name, symbol, timeframe, timestamp and dispatches via `ctx.telegram.sendMessage()`
- Supports MarkdownV2-formatted alert messages via `ctx.replyWithMarkdownV2()` with embedded OHLCV, indicator values, and plot references
- Supports sending chart screenshots with alerts via `ctx.telegram.sendPhoto()` using the canvas as a `Buffer`
- Command system via `bot.command()`: `/start`, `/help`, `/subscribe`, `/unsubscribe` with persistent subscription storage in `backend/data/telegram.json`
- Middleware pipeline via `bot.use()` for logging, rate-limiting, and authorization checks
- Webhook mode support for production: attaches to the existing Express server via `bot.createWebhook()` for shared port usage
- Graceful error handling for Telegram API failures (rate limits, network, Bot API errors)

### 2.5 SOCKS5 Proxy
All Telegram Bot API outbound connections are routed through a configurable SOCKS5 proxy:
- Proxy settings (host, port, username, password) are persisted in the `proxy` key under `settings` in `backend/data/telegram.json`
- On bot initialization, if proxy settings are present, a SOCKS5 agent (via `socks-proxy-agent` or equivalent) is created and passed as the Telegram HTTP agent via Telegraf's `telegram.options.agent` configuration
- If no proxy is configured, the bot connects directly (backward compatible)
- Proxy configuration is exposed via REST endpoints `GET /api/settings/telegram/proxy` and `PUT /api/settings/telegram/proxy`

### 2.6 JSON File Persistence (`backend/data/telegram.json`)
- Single-file storage for all Telegram configuration and subscriptions — no database dependency
- Schema: `{ botToken: string, subscribers: Array<{chatId, username, subscribedAt, alerts: [{id, title, enabled}]}>, settings: object }`
- Auto-creates `backend/data/` directory and `telegram.json` with defaults on first launch
- Synchronous atomic reads/writes with file-locking (via `proper-lockfile` or similar) to prevent concurrent write corruption
- Reloads from disk on every read to support manual edits and external backup workflows
- Lightweight JSON CRUD service (`JsonStore`) wrapping `fs.readFileSync`/`fs.writeFileSync` with validation

### 2.7 Key Features
- Sends Telegram messages when `alert()` or `alertcondition()` triggers during chart rendering
- Messages formatted with alert text, script name, symbol, timeframe, and timestamp
- Per-alert enable/disable toggle stored in Database — each alert condition has a `telegramEnabled` flag
- Disabled alerts still fire locally (chart markers, logs) but skip Telegram notification
- Configuration UI provided in the Frontend to set/update Telegram credentials
- Configuration UI provides per-alert toggle controls for Telegram selection
- Graceful error handling: retries on rate limit (429), logs failures, never blocks script execution
- Uses `telegraf` or raw fetch-based HTTP client to call Telegram Bot API (`sendMessage`)
- Database layer provides CRUD operations for Telegram config and per-alert preferences

---

## 3. Database Layer

### 3.1 Responsibility
Provide persistent storage for application configuration and user preferences.

### 3.2 Data Stores
SQLite (development) / PostgreSQL (production)

### 3.3 Tables
- `telegram_config`: stores `bot_token`, `chat_id/username`, `enabled`
- `alert_preferences`: stores `alert_id`, `script_name`, `telegram_enabled`
- `user_settings`: general user preferences (extensible)

### 3.4 Key Features
- Database client integrated into the Backend service
- CRUD API exposed via REST endpoints: `GET/PUT /api/settings/telegram`, `GET/PUT /api/settings/alerts/:id/telegram`
- Migrations managed via simple migration scripts
- Connection pooling for production use
- Prepared statements to prevent injection
- Synchronous read/write for init-time config loading; async for runtime updates
