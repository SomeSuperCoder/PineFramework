## Why

Users manage the bot from Telegram but cannot currently backtest a strategy there — they must leave the chat and run the CLI. The Director wants the ability to backtest a strategy from the Telegram bot: the user selects settings through a conversation, and the bot replies with a concise result rendered as a prettily formatted image, the same way the trading-stats card works.

## What Changes

- Add a `/backtest` bot command that starts an inline-keyboard wizard conversation: strategy → symbol → timeframe → days-back → commission method → run.
- Run the backtest in-process through a neutral producer seam that reuses the existing backtest pipeline, config mapping, and fee handling — zero behavior change to the CLI/HTTP/export paths.
- Render the result as an 800×440 SVG→PNG card (sharp), styled to match the existing trading-stats card (same palette, fonts, layout language), showing concise metrics: net PnL + %, trade count, win rate, profit factor, max drawdown, Sharpe, buy & hold return, and the effective config.
- Reply with the card as a photo (`sendPhoto` seam) with a localized caption; failed runs return a sanitized, localized error; long runs get an immediate "running…" ack and fire-and-forget execution.
- Add en/es/ru i18n keys for every new user-facing string.
- Wizard settings respect the engine's hard 1500-bar cap: days-back presets are timeframe-aware so a valid selection never exceeds it; a client-side guard blocks invalid combos with a clear message.
- Strategy picker lists the strategy library (`backend/data/scripts/manifest.json`) and handles the empty-library state.

## Capabilities

### New Capabilities
- `telegram-backtest`: Telegram bot backtest wizard — command entry, settings conversation, in-process run, concise result card image, localized errors.

### Modified Capabilities
<!-- None. The backtest engine, CLI, HTTP API, and export paths keep identical behavior; the bot consumes the existing pipeline through a new producer seam. -->

## Impact

- New files: `backend/src/telegram/backtest/` (producer seam), `backend/src/telegram/report/backtestCard.ts` (renderer + SVG template).
- Modified: `backend/src/telegram/` command/callback registries, `TelegramBotFeature.ts` (actions registry + emitted-callback gate), i18n resources (`en`, `es`, `ru`).
- Reuses: `backend/src/backtest-runner.ts` (`runBacktestPipeline`), `backend/src/backtest-config.ts` (`applyDexFee`), `backend/src/cli/backtest-cli.ts` config mapping (`resolveDateRange`, `normalizeExplicitOverride`), `backend/src/telegram/report/renderCard.ts` card style + `format.ts`, `backend/src/telegram/services/TelegramService.sendPhoto`, `backend/data/scripts/manifest.json`.
- No changes to the engine, HTTP routes, export schema, or frontend. No new runtime dependencies (sharp already used).
