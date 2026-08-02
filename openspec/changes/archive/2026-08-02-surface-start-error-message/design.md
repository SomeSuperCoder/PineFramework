## Context

The `handleStart` catch block in `SetupWizard` (`TradingBotPanel.tsx:1096`) discards the error object and hardcodes `'Failed to start bot'`. The `sendCommand` caller already throws `new Error(data.error)` with the backend's specific message — it's just not captured.

## Decisions

### Decision 1: Capture error message in catch block

**Choice**: Change `catch {` to `catch (err) {` and use `err instanceof Error ? err.message : 'Failed to start bot'` as the fallback.

**Alternatives considered**:
- *Always show the raw backend message* — risky if the backend ever returns a non-Error or empty string. The fallback handles this.
- *Parse the error JSON ourselves in handleStart* — redundant; `sendCommand` already does this.

**Rationale**: Minimal change, preserves the fallback for unexpected errors, surfaces the actionable message the backend already sends.

## Risks / Trade-offs

- **Risk**: Backend error messages may be technical. → Acceptable — the messages are already user-facing by design (e.g., "auto-select must run before starting; use the Backtest step first").
