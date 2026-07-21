# Design Document: Single Strategy Enforcement

## 1. Overview
The system enforces at most one strategy on the chart at any time.

## 2. Behavior
- When user adds a strategy script via Quick Adder or CodeEditor "Add" button
- Frontend checks `IndicatorManager` for existing strategy indicators
- If strategy exists, shows `StrategyConflictDialog` with options:
  - **Replace**: Remove existing strategy, add new one
  - **Cancel**: Keep existing, discard new
- Backend also validates on `POST /api/indicators` — rejects if strategy already running for session
- Strategy indicators identified by `overlay: true` in execution result + presence of `strategyMarkers`

## 3. Data Flow
```
User clicks "Add" on a strategy script
  → Frontend checks IndicatorManager.runningIndicators for any with strategyMarkers
  → If existing strategy found:
    → Show StrategyConflictDialog
    → User clicks "Replace":
      → removeIndicator(existingStrategyId)
      → addIndicator(newScriptId, newSource)
    → User clicks "Cancel":
      → No action taken
  → If no existing strategy:
    → addIndicator(newScriptId, newSource) proceeds normally
  → Backend POST /api/indicators validates:
    → If strategy already running for session → 409 Conflict
    → Otherwise → 200 OK
```

## 4. StrategyConflictDialog
- Modal dialog with clear messaging:
  - "Replace existing strategy?" with current strategy name displayed
  - "Remove [Strategy Name] and add [New Strategy Name]?"
- Two buttons: Replace (primary action) | Cancel (secondary/dismiss)
- Dialog closes and the new strategy replaces the existing one on "Replace"
- Dialog closes with no action on "Cancel" or ESC

## 5. Identification Logic
Strategy indicators are identified by the presence of `strategyMarkers` in the execution result combined with `overlay: true`. Regular overlay indicators have `overlay: true` but no `strategyMarkers`, so they are not subject to the single-strategy restriction.
