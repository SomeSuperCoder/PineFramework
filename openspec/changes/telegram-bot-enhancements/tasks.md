# Tasks: Telegram Bot Enhancements

Reference: design.md sections 2-6.

## 1. Store Schema + Migration

- [ ] 1.1 Extend `TelegramConfigStore` with `admin`, `controllers`, `requests`, `chats` data + CRUD methods (getAdmin/setAdmin, getControllers/addController/removeController/isController, getRequests/addRequest/removeRequest, addChat/getChat/getChats/updateChat, memberSubscribe/memberUnsubscribe/getMemberSubscription, setChatLanguage/getChatLanguage, linkChat/unlinkChat/isLinked)
- [ ] 1.2 Add migration: old `subscribers` → private `chats` preserving per-alert prefs and defaulting all types ON
- [ ] 1.3 Update `validate()` for the new schema; unit tests for store CRUD + migration

## 2. i18n module

- [ ] 2.1 Create `backend/src/telegram/i18n.ts` with en/es/ru dictionaries covering every command, notification type, and UI reply, with `t(lang, key, params?)` interpolation
- [ ] 2.2 Add a unit test asserting identical key sets across en/es/ru

## 3. Backend layer split + wiring

- [ ] 3.1 Extract `StatsService` (in-process) over `TradeHistoryStore` (delegates getStats/getTrades/getGroupedStats); refactor `/api/bot/stats` and `/api/bot/history` routes to consume it
- [ ] 3.2 Create `TelegramBotFeature` (policy): command registration, `assertController` auth gate, `deliver(type, buildMessage)` routing, i18n wiring, handler seam testable with mock contexts
- [ ] 3.3 Implement all commands: `/start /help /request /subscribe /unsubscribe /lang /report /link /unlink /stats /stop /emergency` with proper auth + i18n replies
- [ ] 3.4 Make `TradingTelegramBot` language-aware and route through `feature.deliver(type, ...)` instead of owning destinations
- [ ] 3.5 Wire in `index.ts`: build `TradingTelegramBot` with a sender backed by `TelegramService`, pass `telegramBot` into `BotEngine`, compose `TelegramBotFeature` with engine + StatsService + store, register commands on `TelegramService`
- [ ] 3.6 Ensure WebSocket/Express transport integration still serves notify flows

## 4. REST routes for panel

- [ ] 4.1 Add admin/controllers/requests/chats/subscriptions routes to settings router (GET/PUT/POST/DELETE per design §5)
- [ ] 4.2 Add route tests

## 5. Frontend panel upgrade

- [ ] 5.1 Add admin identity config section
- [ ] 5.2 Add controllers management (revoke) + pending requests approve/deny
- [ ] 5.3 Add group link status + linked groups management
- [ ] 5.4 Add per-chat/per-member subscription-type toggles (7 types) + language selector
- [ ] 5.5 Keep existing token/proxy/test/per-alert sections working; update `frontend/src/types`

## 6. Tests

- [ ] 6.1 Unit: store CRUD + migration (1.2,1.3), formatter escaping, auth matrix (handler mocks)
- [ ] 6.2 Handler mock tests: subscribe/unsubscribe defaults by venue, link gating, lang toggle, request/approve flow, stop/emergency gates
- [ ] 6.3 StatsService delegation + `/report` output test
- [ ] 6.4 Existing `telegram.test.ts` + `trade-history-route.test.ts` updated for new schema
- [ ] 6.5 Run `pnpm test` GREEN, `pnpm typecheck` clean, `pnpm lint` clean

## 7. QA & commit

- [ ] 7.1 QA Engineer: verify each acceptance criterion from specs, regression on affected blast radius (TelegramService, store, engine, routes, panel)
- [ ] 7.2 Commit verified work with conventional commit message