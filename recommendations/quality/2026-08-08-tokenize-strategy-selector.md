# Tokenize StrategySelector hardcoded colors
**Date:** 2026-08-08
**Source:** QA Engineer (backtest-strategy-select)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`frontend/src/components/StrategySelector.tsx` still hardcodes hex colors (`#111128`, `#333`, `#64b5f6`, `#4caf50`, `#888`) while `BacktestPanel.tsx` now uses the CONTROL-PANEL-DESIGN.md §1 tokens (from `index.css`). Migrate the selector's inline colors to the token vars for design consistency.

## Rationale
The panel polish pass tokenized the panel itself; the selector it embeds is now the odd one out. Tokenizing keeps dark-theme theming consistent and makes future theme changes single-source.

## Evidence
QA read `StrategySelector.tsx` during acceptance (`BacktestPanel.tsx:167-226` config bar is token-driven; selector still hex).