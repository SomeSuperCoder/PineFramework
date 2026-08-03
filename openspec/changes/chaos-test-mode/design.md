## Context

The live trading bot (`BotEngine` → `LiveScheduler` → `LiveStrategyExecutor`) processes real-time candles from Bybit WebSocket, compiles Pine Script strategies, and translates strategy signals into DEX orders via Jupiter. The frontend has a `TradingBotPanel` with a `LiveDashboard` component and a backtest/review screen. Chaos mode needs to intercept the signal generation step and replace it with random signals while keeping the rest of the pipeline (position tracking, DEX execution, wallet management) intact.

## Goals / Non-Goals

**Goals:**
- Inject chaos signal generation at the `LiveStrategyExecutor` level, replacing strategy execution
- Keep chaos mode opt-in via `BotConfig.chaosMode.enabled`
- Provide clear UX: hidden activation gesture, dashboard warning, persistent status indicator
- Log all chaos signals for post-test analysis

**Non-Goals:**
- Configurable signal distributions (uniform random is sufficient)
- Chaos mode for backtesting (only real-time)
- Replacing the backtesting or paper trading systems
- Advanced statistics dashboard for chaos test results (v1 just logs)

## Decisions

### 1. Signal generation lives in `LiveStrategyExecutor`, not `BotEngine`

**Decision**: Create a `ChaosSignalGenerator` class that the `LiveStrategyExecutor` delegates to when chaos mode is active. The executor calls `generator.generate(currentEquity)` instead of running the compiled strategy.

**Why**: The executor already owns the signal → order pipeline. Injecting at this level keeps the change minimal — `BotEngine`, `LiveScheduler`, and DEX adapter remain untouched. The generator is a pure function (equity → signal) that's easy to test in isolation.

**Alternatives considered**:
- Inject at `BotEngine` level: Would require modifying the scheduler and executor interfaces. Overkill.
- Replace the entire executor: Too invasive, would duplicate order execution logic.

### 2. Chaos mode flag in `BotConfig` alongside existing fields

**Decision**: Add `chaosMode: { enabled: boolean }` to the `BotConfig` type in `src/trading/types.ts`. Default to `{ enabled: false }` when not specified.

**Why**: Follows the existing config pattern. No new config file or separate state needed. The flag is checked once at executor initialization.

**Alternatives considered**:
- Separate chaos config file: Adds complexity for a single boolean.
- Runtime toggle only (no persistence): Would lose state on server restart, which contradicts the requirement for persistence.

### 3. Hidden activation: 5-tap gesture on review screen

**Decision**: The review/backtest screen (`BacktestResults` or similar) gets a hidden tap target (invisible `div` with fixed position). 5 taps within 3 seconds toggles `BotConfig.chaosMode.enabled` via the existing config API.

**Why**: Easter-egg style activation prevents accidental enablement while keeping it discoverable for developers/testers. The 5-tap pattern is familiar from mobile developer settings.

**Alternatives considered**:
- Keyboard shortcut: Less discoverable, doesn't work on mobile.
- Settings panel toggle: Too accessible, risk of accidental activation in production.
- URL parameter: Doesn't persist, lost on refresh.

### 4. Dashboard warning as a modal overlay

**Decision**: When chaos mode is active and `botDashboardOpen` becomes `true`, render a full-screen warning overlay with "⚠️ CHAOS MODE ACTIVE — RANDOM SIGNALS" and an "I understand" button. The dashboard content renders behind the overlay and is only interactive after acknowledgment.

**Why**: The warning must be impossible to miss. A modal overlay blocks all interaction until acknowledged, satisfying the "dashboard blocked until acknowledged" requirement.

**Alternatives considered**:
- Banner at top of dashboard: User could scroll past it, not prominent enough.
- Toast notification: Auto-dismisses, user might miss it.

### 5. Chaos signal logging via existing logger

**Decision**: Use the `BotLogger` interface already wired into `BotEngine` to log chaos signals. Add a structured log event `chaos.signal` with type, equity, timestamp, and result.

**Why**: No new logging infrastructure needed. The logs are already captured and can be sent to Telegram or console. Structured logging makes post-test analysis straightforward.

**Alternatives considered**:
- Separate chaos log file: Adds file I/O complexity. The existing logger is sufficient for v1.

## Risks / Trade-offs

- **[Risk] Statistical variance in small samples** → With 1/3 probability per signal, short runs may appear biased. Mitigation: Document that chaos mode is designed for long-running stress tests, not short validation.
- **[Risk] Hidden activation may be too hidden** → Developers might not discover it. Mitigation: Document in developer docs; the activation gesture is a known pattern (5 taps).
- **[Risk] Chaos mode accidentally left enabled** → If someone enables it and forgets. Mitigation: The dashboard warning makes it immediately obvious; the status indicator is always visible.
- **[Trade-off] Uniform random vs weighted** → Uniform is simplest and sufficient for stress testing. Weighted distributions could be added later without changing the spec.
