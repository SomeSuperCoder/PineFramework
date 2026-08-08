# Unmapped badge/status fills need a token decision
**Date:** 2026-08-08
**Source:** frontend-engineer (micro-sweep 1affa32), qa-engineer (pending)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Decide token mappings for the remaining unmapped badge/status fills that survive the Miro-dark adoption:
- `#64b5f6` (light-blue info accent — CodeEditor version badge, StrategySelector, TradeHistoryTab active tab, LiveDashboard)
- `#3e2a1a` / `#ffb74d` / `#ffa726` (orange-ish built-in badges)
- `#5c6bc0` / `#26a69a` (TelegramConfigPanel chat-type badges)
- `#8bc34a` / `#e0a040` / `#ff1744` / `#d0d0d0` / `#b388ff` (miscellaneous)

## Rationale
The §17 legacy-mapping table in DESIGN-MIRO-DARK.md has no entries for these, so the codemod lawfully left them untouched. They are now the ONLY hardcoded colors left in the codebase, which weakens the "single token source" guarantee. Candidates: light-blue → `tokens.colors.semantic.info` or a new `brand.sky` token; orange badges → `semantic.warning` variants; purple/cyan → new pastel tokens.

## Evidence
- grep of remaining hexes after commit 1affa32 (see Tech Lead session notes).
- DESIGN-MIRO-DARK.md §17 (table has no entry for these values).
