## Context

The trading bot setup wizard follows a 4-step flow: Wallet → Config → Backtest → Review. Currently, when the user submits the Config step (`BotConfigPanel.handleConfigure`), it immediately triggers the backtest API call (`POST /api/bot/backtest`) and advances to the Backtest step. The backtest runs automatically with no user choice.

The Backtest step already has timeframe selection checkboxes and displays auto-select progress/results. The Review step shows the selected pair and allows starting the bot.

## Goals / Non-Goals

**Goals:**
- Insert a decision prompt between Config submission and Backtest execution
- Let users choose between auto-select backtest (current behavior) and manual pair/timeframe selection
- Display a clear warning when manual selection is chosen
- Provide manual pair/timeframe pickers in the Backtest step
- Apply the same prompt to the re-run flow from Review step

**Non-Goals:**
- Changing the backend backtest API or auto-select logic
- Adding new trading pairs or data sources
- Modifying the Review step layout (only the selected pair display source changes)
- Changing the wallet import flow

## Decisions

### Decision 1: Add a new wizard step "backtest-choice" between Config and Backtest

**Approach:** Introduce a new step `'backtest-choice'` in the step state machine (`'wallet' | 'config' | 'backtest-choice' | 'backtest' | 'review'`). This step renders the choice prompt (auto-select vs manual). Selecting auto-select triggers the backtest and advances to `'backtest'`. Selecting manual advances to `'backtest'` with a `manualSelection` flag.

**Alternative considered:** Show the prompt inline in the Backtest step itself. Rejected because it couples the prompt logic with the backtest progress UI and makes the step state harder to reason about.

**Rationale:** A dedicated step keeps the wizard flow explicit, makes the state machine clear, and allows the Backtest step to focus on either auto-progress or manual pickers without conditional prompt rendering.

### Decision 2: Track selection mode via state variable

**Approach:** Add `backtestMode: 'auto' | 'manual'` state to `TradingBotWizard`. Set to `'auto'` when user picks auto-select, `'manual'` when user picks manual. The Backtest step checks this to decide what to render.

**Alternative considered:** Use a nullable `manualPair` state to infer mode. Rejected because it's implicit and harder to extend.

**Rationale:** Explicit enum state is self-documenting and trivially extensible.

### Decision 3: Manual selection uses existing pair data from backend

**Approach:** The manual selection UI in the Backtest step will fetch available pairs from the backend (or use a hardcoded common set like BTC, ETH, SOL with the configured timeframes) and present dropdowns. The user's selection is stored in state and passed to the Review step.

**Alternative considered:** Free-text input for pair symbol. Rejected because it's error-prone and the backend already knows valid pairs.

**Rationale:** Dropdowns prevent typos and ensure only valid pairs are selected.

### Decision 4: BotConfigPanel no longer triggers backtest

**Approach:** Remove the `fetch('/api/bot/backtest')` call from `BotConfigPanel.handleConfigure`. The config endpoint (`POST /api/bot/configure`) saves the config, and the backtest is only triggered when the user explicitly chooses auto-select from the prompt.

**Rationale:** This is the core behavioral change — config submission should not have side effects on backtest execution.

### Decision 5: Re-run flow from Review also shows the prompt

**Approach:** Modify `handleRerunBacktest` to advance to `'backtest-choice'` instead of directly to `'backtest'` and triggering the API. The prompt handles the rest.

**Rationale:** Consistent UX — the user always sees the choice when transitioning to backtest, whether from Config or Review.

## Risks / Trade-offs

- **[Risk]** Users may find the extra step annoying when they always want auto-select → **Mitigation**: The prompt is quick (two buttons), and the default path (auto-select) is one click. Could add a "don't ask again" preference in a follow-up.

- **[Risk]** Manual selection requires knowing valid pairs → **Mitigation**: Fetch pairs from backend or use well-known majors (BTC, ETH, SOL). The warning makes the trade-off clear.

- **[Risk]** State machine becomes more complex with 5 steps → **Mitigation**: The new step is simple (just a prompt), and the explicit state makes transitions traceable. The existing 4-step flow is already well-structured.
