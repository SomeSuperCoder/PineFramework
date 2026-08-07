## Why

The Telegram bot is currently a thin alert-forwarder: it only sends `alertcondition` events to a flat chat list and exposes four commands (`/start /help /subscribe /unsubscribe`). It has no trading-position notifications (the emojified `TradingTelegramBot` class is unwired dead code), no stats/reports, no remote control, no permissions layer, no group-chat linking, and no language support. The operator needs a real command surface: position open/close alerts, on-demand statistics, stop/emergency control, a whitelist-driven controller model that is distinct from notification subscription, group-friendly linking, and per-chat language (EN/ES/RU).

## What Changes

- Wire `TradingTelegramBot` into the backend so position open/close/stop/error notifications actually reach Telegram (today it is never instantiated).
- Add a full command surface: `/stats` (engine state), `/report` (performance), `/stop` (graceful, confirm), `/emergency` (instant), `/request` (ask for control), `/link` `/unlink` (group, controller/admin-gated), `/lang` (per-chat language toggle), `/subscribe` `/unsubscribe` (notification types).
- Introduce a **permissions model**: `admin` (local panel operator), `controllers` (whitelisted users who may run control/group commands), and `requests` (pending control requests approved in the panel). Identity is keyed by Telegram `ctx.from.id` — never username — for every privileged command.
- **Separate the two axes**: control is per-USER (`controllers`), notification subscription is per-CHAT (`memberSubscriptions`). A controller is not automatically a subscriber and vice versa.
- **Group-chat support**: chats carry a `linked` flag; group link/unlink is controller/admin-gated; group notification delivery follows the link status. Notification types are a canonical 7-set: `trading`, `position_open`, `position_close`, `report`, `daily`, `error`, `bot_lifecycle`.
- **i18n**: per-chat `language` (en/es/ru), default `en`, toggleable by `/lang`. Emoji embedded in translated strings. Key-parity test across languages.
- **Frontend panel upgrade**: admin identity config, controllers management, pending-requests approval, per-chat subscription type toggles, group link management, language display.
- **Backend layer split**: `TelegramService` stays pure transport; a new `TelegramBotFeature` owns policy (commands, auth, formatting, i18n, routing). Shared `StatsService` aggregation is consumed in-process (no backend→backend HTTP). Migration of the old `subscribers` schema to the new `chats` model.

### Non-goals

- No webhook-mode work; no database backend (the JSON store remains).
- No scheduled/daily reports (a `daily` type is reserved in the taxonomy but not implemented as a timer).
- No multi-account/bot support.
- No per-alert (alertcondition) replacement — existing per-alert toggles are preserved and coexist with the new subscription types.

## Capabilities

### New Capabilities
- `telegram-bot-control`: whitelisted controllers, pending requests, admin approval, stop/emergency/group commands gated by `ctx.from.id`.
- `telegram-notification-subscriptions`: per-chat notification-type subscriptions, delivery routing by type, distinct from control permission.
- `telegram-i18n`: per-chat language toggle with en/es/ru dictionaries and key-parity enforcement.
- `telegram-group-link`: link/unlink a group chat to receive notifications, admin/controller-gated.

### Modified Capabilities
- `telegram-notification`: the existing requirement is extended so position open/close, bot lifecycle, errors, and daily events are deliverable (not just `alertcondition`), and the `subscribers` model becomes a `chats` subscription model transport layer routes messages to the desired recipients while the new command surface and policy run alongside it.

## Impact

- **Backend**: `backend/src/telegram/TelegramService.ts`, new `TelegramBotFeature.ts`, `backend/src/store/TelegramConfigStore.ts` (schema + migration), new REST routes for admin/controllers/requests, `backend/src/index.ts` wiring, shared `StatsService`.
- **Engine**: `src/trading/telegram-bot.ts` + option passing in `src/trading/bot-engine.ts` (wire the unwired class).
- **Frontend**: `frontend/src/components/TelegramConfigPanel.tsx` (admin/controllers/requests/subscriptions/groups), `frontend/src/types/index.ts`.
- **Tests**: unit (store CRUD, i18n parity, formatters, auth matrix) + handler mock tests (Telegraf-free) + existing `telegram.test.ts`/`trade-history-route.test.ts` updates.