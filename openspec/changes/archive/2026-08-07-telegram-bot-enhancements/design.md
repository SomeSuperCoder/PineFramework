# Design: Telegram Bot Enhancements

## 1. Overview

Upgrade `TelegramService` from a thin `alertcondition` forwarder to a full bot: position/lifecycle/error notifications (wired from the unwired `TradingTelegramBot`), on-demand stats/report, remote control, a controller whitelist distinct from notification subscription, group linking, and per-chat i18n.

## 2. Data Model (`backend/data/telegram.json`)

Migrate `subscribers` → `chats`. New shape:

```json
{
  "botToken": "",
  "admin": { "userId": 123, "username": "admin", "configuredAt": 0 },
  "controllers": [
    { "userId": 456, "username": "alice", "grantedAt": 0, "grantedBy": 123 }
  ],
  "requests": [
    { "userId": 789, "username": "bob", "firstName": "Bob", "requestedAt": 0 }
  ],
  "chats": [
    {
      "chatId": -100123,
      "type": "group",
      "title": "Trading",
      "linked": true,
      "linkedAt": 0,
      "linkedBy": 456,
      "language": "en",
      "memberSubscriptions": { "456": ["position_open"], "789": ["error"] }
    }
  ],
  "settings": { "proxy": {} }
}
```

Migration: old `subscribers[]` → each becomes a `chats` entry with `type:'private'`, `language:'en'`, memberSubscriptions `{ [userId]: ALL_TYPES }`, keeping `alerts` per-alert prefs under `memberAlertPrefs[userId]` so existing panel toggles still work.

Store API extends `TelegramConfigStore`: `getAdmin/setAdmin`, `getControllers/addController/removeController/isController`, `getRequests/addRequest/removeRequest`, `addChat/getChat/getChats/updateChat/memberSubscribe/memberUnsubscribe/getMemberSubscription`, `setChatLanguage/getChatLanguage`, `linkChat/unlinkChat/isLinked`, plus the existing token/proxy/alert-preference methods.

## 3. Layer Split

- **`TelegramService`** (existing, unchanged responsibilities): Telegraf lifecycle, `sendMessage`/`sendPhoto` with MarkdownV2 + plain fallback + 429 retry, WebSocket/Express integration. Becomes pure transport.
- **New `TelegramBotFeature`** (policy): owns command registration, an auth gate (`assertController(fromId)` = admin OR controller; admin always acts), notification-type routing (`deliver(type, buildMessage)`), i18n, and a `mockable command handler` seam. It wraps `TelegramService` and the engine/store/stats core.
- **`TradingTelegramBot`** (existing formatter): kept as the emoji message builder; becomes language-aware. It no longer owns destination routing — it calls `feature.deliver(type, (lang) => message)`.
- **New `StatsService`** (in-process core): exposes `getStats(filters)`, `getTrades(filters, limit)`, `getGroupedStats(groupBy, filters)` by delegating to the existing `TradeHistoryStore`. Both `/api/bot/stats`/`/api/bot/history` routes and the bot's `/report`/`/stats` commands consume this core. No backend→backend HTTP.

## 3. Command Surface

| Command | Category | Auth |
|---|---|---|
| `/start` `/help` | meta | anyone |
| `/request` | identity | anyone (store request) |
| `/subscribe` `/unsubscribe` | notification | anyone in registered chat |
| `/lang [en/es/ru]` | i18n | anyone in registered chat |
| `/report` | reports | subscriber (gated on membership, not control) |
| `/link` `/unlink` | group | controller/admin |
| `/stats` (engine state) | reports | controller/admin |
| `/stop` | control | controller/admin (confirm) |
| `/emergency` | control | controller/admin (instant; no confirm) |

Auth decision helper in the feature. i18n keys used for all replies.

## 4. Notification Flow

```
BotEngine event (trade closed, opened, emergency, error, state)
  → TradingTelegramBot.notifyPositionOpened(trade)  [formatter]
    → feature.deliver('position_open', (lang) => buildMessageEn(lang, trade))
      → for each chat subscribed to 'position_open' AND (group⇒linked):
          msg = translate(lang, msg)
          telegramService.sendMessage(chatId, msg)
```

Private DM: delivery to chatId==userId if subscribed (default all ON).
Group: delivery only if `linked:true`, per-member subscription.

## 5. Frontend Panel (`TelegramConfigPanel.tsx`)

Add sections:
- **Admin**: current admin identity (userId), set/edit.
- **Controllers**: list with revoke; pending **requests** list with approve/deny.
- **Groups**: linked groups with unlink; link status.
- **Subscriptions**: per private chat and per group-member, the 7 notification-type toggles + language selector.
- Keep existing bot token, proxy, test-message, and legacy per-alert toggles.

New REST routes (added to settings router):
- `GET/PUT /api/settings/telegram/admin`
- `GET /api/settings/telegram/controllers`, `GET/DELETE /api/settings/telegram/controllers/:userId`
- `GET /api/settings/telegram/requests`, `POST /api/settings/telegram/requests/:userId/approve`, `POST .../:userId/deny`
- `GET/PUT /api/settings/telegram/chats/:chatId` (language, link/unlink)
- `PUT /api/settings/telegram/chats/:chatId/subscriptions/:userId` (set member types)

## 6. Testing

- **Unit**: `i18n` (key parity en/es/ru, interpolation), store CRUD + migration, formatter escaping, auth matrix.
- **Handler mocks**: fabricate `{ from, chat, reply }` Telegraf contexts, drive handlers directly — no token, no `bot.launch()`. Cover permission flows, subscribe defaults, link gating, lang toggle.
- **StatsService**: delegates to existing store tests; verify `/report` output.
- Existing `telegram.test.ts` and `trade-history-route.test.ts` updated for the new schema.
- No live Telegram token used in tests.