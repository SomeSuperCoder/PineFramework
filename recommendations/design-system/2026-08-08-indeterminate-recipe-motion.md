# Align pre-existing infinite animations with §13 tokens
**Date:** 2026-08-08
**Source:** design-system-engineer (R1 review)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Pre-existing infinite animations (`spin 1s linear` in ChartComponent.tsx:626 / AutoSelectGrid.tsx:13, `backtest-indeterminate 1.5s ease-in-out infinite` in ProgressBar.tsx:54/89) use durations/eases outside the §13 motion table. They're fully stopped by the reduced-motion guard, but the DESIGN doc §15.7 (indeterminate recipe, line ~443) may intend them to use `--pf-motion-base`. Align their durations/eases with the token SSOT in a future polish pass.

## Rationale
§13 says all motion speaks the token SSOT. Loop animations are the one remaining non-tokenized motion surface.

## Evidence
- R1 review of 491bbb4; tokens.ts §13 values vs the hardcoded `1s linear`/`1.5s ease-in-out`.
