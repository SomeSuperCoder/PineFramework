## Context

The auto-select backtest step in `TradingBotPanel.tsx` currently displays progress with a manually coded "Evaluating Pairs (X/Y)" header. The `ProgressBar` component was just created to provide consistent progress display across the app.

## Goals / Non-Goals

**Goals:**
- Use `<ProgressBar>` for the auto-select progress indicator
- Keep `AutoSelectGrid` for per-pair status visualization

**Non-Goals:**
- Changing `AutoSelectGrid` behavior
- Modifying the WebSocket progress events

## Decisions

### D1: Use ProgressBar with inline variant

**Decision**: Replace the manual "Evaluating Pairs ({current}/{total})" div with `<ProgressBar progress={autoSelectProgress.current / autoSelectProgress.total * 100} phase="Evaluating" variant="inline" />`.

**Rationale**: The inline variant matches the compact layout used in `BacktestPanel`. The phase text will show "Evaluating... X%".

### D2: Keep AutoSelectGrid

**Decision**: Keep `AutoSelectGrid` below the progress bar for per-pair status visualization.

**Rationale**: `ProgressBar` shows overall progress; `AutoSelectGrid` shows per-pair status. Both are needed.

## Risks / Trade-offs

- **[Risk]** Visual change in auto-select step → **Mitigation**: Same progress bar style as single backtest for consistency
