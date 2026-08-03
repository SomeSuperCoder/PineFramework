## Context

`BotEngine.start()` currently checks `config.autoSelect` and throws if `true`, regardless of whether pairs are already configured. The frontend always sends `autoSelect: true` in the initial configure request. Manual pair selection is stored only in React state. This means the backend never learns that pairs were resolved, and `start()` always blocks.

The existing spec (`bot-start-lifecycle`) defines the requirement as "refuse when autoSelect=true" — this was intentional to prevent `start()` from blocking on inline auto-selection. But the design conflated two questions: "has auto-selection been resolved?" and "should auto-selection run?"

## Goals / Non-Goals

**Goals:**
- Allow `start()` to succeed when pairs are configured, regardless of `autoSelect` flag
- Preserve the safety property: `start()` never blocks on inline auto-selection when pairs are empty
- Minimal code change (~5 lines)

**Non-Goals:**
- Changing the frontend flow (it already works correctly once the backend is smarter)
- Changing the auto-select evaluation logic
- Changing the config persistence behavior

## Decisions

### Decision: Check pairs, not autoSelect flag

**Approach**: In `start()`, replace `if (config.autoSelect) throw` with `if (config.autoSelect && !config.pairs?.length) throw`.

**Rationale**: The `autoSelect` flag's purpose is "pick pairs for me if needed." Once pairs exist (from any source), the question is answered. Checking pairs presence is more robust than tracking flag state across clients.

**Alternatives considered**:
1. **Frontend fix**: Send `autoSelect: false` after manual selection. Rejected because it couples correctness to frontend behavior — any API consumer that forgets hits the same bug.
2. **Track resolution state**: Add a separate `autoSelectResolved` flag. Rejected as over-engineering for a 5-line fix.

### Decision: Add explicit error for empty pairs without autoSelect

When `autoSelect=false` and pairs are empty, throw a distinct error ("no trading pairs configured") instead of the auto-select message. This helps API consumers debug configuration issues.

## Risks / Trade-offs

**Risk**: If a user configures `autoSelect: true` with stale pairs from a previous run, the engine will use those pairs instead of re-evaluating. → **Mitigation**: This is acceptable behavior — the pairs were valid when configured. If re-evaluation is desired, the user can clear pairs or re-run backtest.

**Risk**: API consumers might set `autoSelect: true` expecting auto-selection to run, but with pre-existing pairs it will be skipped. → **Mitigation**: The error message change makes this clear. The behavior is documented in the spec.

## Implementation

Change in `src/trading/bot-engine.ts`, `start()` method:

Replace:
```typescript
if (this._config.autoSelect) {
  throw new Error('auto-select must run before starting; use the Backtest step first.');
}
```

With:
```typescript
if (this._config.autoSelect && !this._config.pairs?.length) {
  throw new Error('auto-select must run before starting; use the Backtest step first.');
}
if (!this._config.pairs?.length) {
  throw new Error('No trading pairs configured. Set pairs or enable auto-select.');
}
```

This is the entire implementation. One conditional change, one new guard.
