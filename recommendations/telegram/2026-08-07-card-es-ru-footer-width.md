# es/ru card footer label width vs fixed SVG columns
**Date:** 2026-08-07
**Source:** team/quality/code-reviewer + team/quality/qa-engineer
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Visual spot-check (not just measurement) of the localized report card at es/ru: the footer metric labels are longer than EN (`POSICIONES ABIERTAS` ~18ch at x=694.4; `ФАКТОР ПРИБЫЛИ`, `ОТКРЫТЫЕ ПОЗИЦИИ`). QA's measurement shows marginal headroom before the panel edge (~768). If any clip, shorten these specific labels (e.g. `POS. 24`) rather than auto-fit.

## Rationale
es/ru strings can overflow the fixed-geometry card footer and clip visible text.

## Evidence
QA rasterization: ru bytes=67876, es bytes=67306, all 800x440 valid; no throw. Reviewer flagged marginal right-edge proximity at x=694.4 middle-anchored.