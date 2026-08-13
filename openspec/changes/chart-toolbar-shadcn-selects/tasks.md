# Tasks — Chart Toolbar Shadcn Selects

## C1. Swap native selects to shadcn Select (frontend-engineer)

- [x] 1.1 Symbol select → shadcn Select (trigger aria-label "Symbol", items from pairOptions, value/onValueChange + localStorage pine-symbol preserved)
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** diff verified — controlled value + localStorage unchanged; tsc 0 errors
- [x] 1.2 Timeframe select → shadcn Select (trigger aria-label "Timeframe", items from timeframeOptions, value/onValueChange + localStorage pine-timeframe preserved)
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** diff verified; no native <select>/<option> remain (nushell count confirmed)
- [x] 1.3 Compact toolbar visuals — SelectTrigger className="h-9", StatisticsTab house pattern
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** trigger h-9 matches old h-9 controls
- [x] 1.4 Remove dead selectClass constant
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** removed; 0 occurrences confirmed
- [x] 1.5 Typecheck + lint clean
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** tsc --noEmit exit 0; eslint clean after 3 prettier-only formatting fixes

## C2. Test impact (test-engineer)

- [x] 2.1 Existing vitest suite green
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** 33 files / 386 tests = baseline match, 0 failures
- [x] 2.2 e2e lock chart-toolbar-selects.spec.ts
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** combobox triggers render defaults; radix dropdowns open with curated options; selection updates trigger + localStorage; cleanup restores originals
- [x] 2.3 Verdict
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** affected existing e2e 12/12 green; full evidence in data/handoffs/team/quality/test-engineer/chart-toolbar-selects.json
