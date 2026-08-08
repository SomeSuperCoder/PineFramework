# Deferred a11y findings from shadcn conversion audit
**Date:** 2026-08-08
**Source:** UX Designer audit (plan 5.2) + Code Reviewer (plan 5.3)
**Priority:** medium
**Status:** pending
**Effort:** large (>4hr across items)

## Recommendation
Post-commit a11y sweep of deferred findings from the shadcn conversion (blockers fixed pre-commit). Highest-leverage first: extend the button-height law (already done pre-commit), StatusDot live region, brand-blue-hover for text-on-dark, keyboard sortable table headers, TelegramConfigPanel async feedback + aria-busy, NumberField keyboard steppers + label association, ControlPanel role="application" removal, wallet-lock button semantics, `<main>` landmark, chart canvas alt text, empty-state contrast, legacy CSS cleanup, raw-hex tokenization.

## Rationale
UX 4.1/4.2/4.3/4.5/4.6 and §7/§15/§17 compliance; keyboard parity; SR announcements. Deferred because: contrast blockers fixed, tests green, risk low.

## Evidence
- UX audit findings #4-#30; Code Reviewer M2-M4, N1-N5, M5 (see git diff at commit)
- Files: TopBar, ControlPanel, LiveDashboard, StrategySelector, TelegramConfigPanel, BacktestGeneralSettings, TradeHistoryTab, StatisticsTab, ErrorConsole, StrategyResultsPopup, MiniChart, ChartComponent, index.css
