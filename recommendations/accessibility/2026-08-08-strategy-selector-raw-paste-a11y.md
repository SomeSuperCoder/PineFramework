# StrategySelector raw-paste a11y
**Date:** 2026-08-08
**Source:** QA Engineer (qualityStrategySelector pass)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`StrategySelector.tsx` raw-paste branch textarea (~lines 196-163) has no `aria-label` and no focus-visible outline. Add an accessible label and ensure keyboard-visible focus.

## Rationale
Screen-reader users cannot discover the raw-paste textarea; keyboard users get no visible focus indication. WCAG 2.1 (label in name, focus visible).

## Evidence
QA read the raw-paste branch during acceptance; the combined combobox input has `role=combobox`+aria attrs (added this change) but the textarea branch lacks them.