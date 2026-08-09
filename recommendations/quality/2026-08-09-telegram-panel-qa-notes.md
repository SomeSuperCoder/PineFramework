# Telegram panel QA notes (GO-WITH-NOTES)
**Date:** 2026-08-09
**Source:** qa-engineer
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr) each

## Recommendation
1. **a11y** — CardTitle renders `div` in shared `ui/card.tsx`; upgrade primitive to real heading (h2/h3 + asChild) — touches whole app, separate change.
2. **quality** — Confirm "15 fetches" spec count vs 14 in telegramApi.ts (likely spec miscount — no code impact).
3. **quality** — Switch StatusCallout success hex `#22c55e` to a theme token; align skeleton count (2→4) for zero layout shift.
4. **frontend** — Follow-up modernize pass on SettingsPanel/BacktestPanel so exemplars match the new panel's Tailwind-token/lucide standard.

## Rationale
Non-blocking polish; the new panel now outshines its own exemplars — a follow-up pass on the stale panels keeps the app consistent.

## Evidence
- QA acceptance table: 9/9 PASS (criteria 8 & 9 pass with notes); StatusCallout.tsx:16 hardcoded hex; index.tsx:38-42 two skeletons vs four cards.
