# Telegram Bot Inline Actions — Same Source of Truth

## Purpose
Fix dead/broken Telegram inline-button UX and enforce that buttons and commands derive from one action registry.

## Requirements
- **R1 (buttons = commands)**: Missions the notion of one `BotAction` registry per the settled design. No code.
- **R2 (flat protocol):** callback_data uses `action:value` — registry + handlers parse `params` as a value; reserved exact-matches (`menu`, `confirm`, `cancel`, `show`) dispatch first; legacy 3-segment keys (`lang:set:en`, `sub:toggle:trading`) remain accepted via `params.split(':').pop()`.
- **R3 (dead-button prevention):** dashboard + keyboard emitters reference only prefixes present in the registry; `install()` validates this at boot so an orphan prefix is a boot failure, not a silent dead button.
- **R4 (report/stats buttons work):** dashboard `report:show`/`stats:show` invoke the same logic as `/report`/`/stats`; `stats` stays controller-gated.
- **R5 (no stuck spinner):** unmatched `callback_query.data` is answered + logged by the transport (catch-all), not left hanging.
- **R6 (user/group manages categories):** notification-category management moves to the bot (`/subscribe`/`/unsubscribe` toggle keyboards — fixed by R2) and is demoted to read-only in the frontend.
