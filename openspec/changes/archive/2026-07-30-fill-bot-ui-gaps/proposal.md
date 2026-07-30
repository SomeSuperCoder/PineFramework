## Why

The live trading bot has a complete backend (engine, wallet, auto-select, scheduler, risk management, Telegram notifications) and a frontend that can start/stop it and show dashboards. But the frontend configuration UI has three gaps that prevent real-world use: (1) no per-pair timeframe input — all pairs get hardcoded `60m`, (2) auto-select runs silently with zero user feedback, and (3) the setup flow is a flat form rather than a guided wizard. These gaps block users from configuring a multi-timeframe strategy or understanding what auto-select is doing.

## What Changes

- **Pair format**: Replace the flat pairs textarea with a matrix editor that accepts `SYMBOL TIMEFRAME` per line (e.g., `SOLUSDT 60`, `BTCUSDT 240`), matching the spec from Section 3.3. Each pair now carries its own timeframe in the API payload.
- **Auto-select progress**: When auto-select is enabled and Start is clicked, show a live progress panel in the dashboard with evaluated counts, current pair being tested, and final ranked results.
- **Configuration wizard**: Restructure the Setup tab into a step-progress sequence: Step 1 → Wallet, Step 2 → Strategy + Pairs, Step 3 → Review & Start. Each step validates before the user can proceed.
- **Strategy compatibility check**: Add a basic client-side check for strategy syntax patterns that are incompatible with live trading, with a warning displayed before starting.
- **No backend changes** required — the existing `POST /bot/configure` already accepts `pairs: PairConfig[]` with `symbol` + `timeframe`, and `autoSelect: true`. The backend auto-select module already fires progress events. Only the frontend needs work.

## Capabilities

### New Capabilities
- `symbol-timeframe-matrix-ui`: Frontend UI for entering (Symbol × Timeframe) pairs with per-pair timeframe selection
- `auto-select-progress`: Real-time auto-selection progress display in the dashboard
- `configuration-wizard`: Step-by-step configuration wizard for wallet → strategy → review flow
- `strategy-compatibility-check`: Client-side validation of strategy source for live-trading compatibility

### Modified Capabilities
- `frontend-application`: The existing bot control panel scenarios (Start Bot, Stop Bot, Dashboard) need to be updated to reflect the wizard-based flow and proper per-pair timeframe configuration

## Impact

- `frontend/src/components/TradingBotPanel.tsx` — Major rework of `BotConfigPanel` and `LiveDashboard` setup tab. New wizard component.
- `frontend/src/App.tsx` — No change needed (already passes `backendUrl`).
- No backend changes.
- No new dependencies.
