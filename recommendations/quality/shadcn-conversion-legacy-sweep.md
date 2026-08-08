# shadcn conversion — legacy class + hex sweep (post-GO conditions)
**Date:** 2026-08-09
**Source:** QA Engineer (acceptance verification, plan task 5.4)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Three non-blocking cleanup items found during acceptance verification of the shadcn conversion. Ship is GO; these are follow-up debt, not blockers.

1. **Strip `quick-adder-*` legacy class names from StrategySelector.tsx** (lines 237, 242, 274, 284). The shadcn Command primitives (CommandInput/CommandList/CommandItem) carry vestigial `quick-adder-search` / `quick-adder-list` / `quick-adder-item` / `quick-adder-item-badges` classes. Because index.css still styles `.quick-adder-*` (lines 282-447), these are **live**, not dead CSS — a component file violating the acceptance rule ("allowed in index.css as dead CSS pending sweep, NOT in component files"). Remove the class names and sweep the now-dead index.css block.

2. **§17 raw-legacy-hex sweep in converted chrome** — replace raw hex inline styles with `var(--pf-*)` / token vars:
   - StrategySelector.tsx:291 `#64b5f6`, :300 `#2a1a3a` / `#b388ff`
   - TradeHistoryTab.tsx:231 `#64b5f6`/`#aaa`, :273-279 `#d0d0d0`
   - TelegramConfigPanel.tsx:322 `#aaa` (+ fontWeight 700), :575 `#5c6bc0`/`#26a69a`
   - ErrorConsole.tsx:101 `#ffc107`
   - CodeEditor.tsx:387 `#999`/`#d4d4d4` (if treated as converted chrome; component is bespoke-kept)
   - Exempt: MiniChart/ChartComponent series palette hexes (chart engine exception), main.css bridge (already all `var(--pf-*)`).

3. **Weights ≤600 (DESIGN §15)** — LiveDashboard.tsx:469 and TelegramConfigPanel.tsx:322 use `fontWeight: 700`; should be 600 or below.

## Rationale
These are pre-existing legacy values carried through the conversion (documented in the pre-work memory as "bespoke components use inline style objects + raw hexes violating DESIGN.md §17"). They have zero functional impact (260/260 tests green, behavior preserved) but leave the "DESIGN.md maintained" acceptance bar partially unmet in converted chrome.

## Evidence
- `grep quick-adder-` → StrategySelector.tsx (4 class sites) + index.css (19 style rules, live)
- `grep #[0-9a-fA-F]{6}` → 15 hex sites across 6 converted components
- `grep fontWeight.*[7-9]00` → 2 sites
- main.css bridge verified hex-free (all `var(--pf-*)` aliases)

## Related
- **Spec correction (requirements lane):** OpenSpec task "CodeEditor Ctrl+S + dirty-guard" does not match shipped behavior. CodeEditor has a 500ms debounced auto-save (`saveSource` PUT `/api/scripts/:id`) and Ctrl+Enter to add — no Ctrl+S handler exists anywhere in `frontend/src`, and CodeEditor.test.tsx asserts no such behavior. Classification: stale criterion, not a regression (CodeEditor is bespoke-kept, untouched by conversion). Correct the task text, or file Ctrl+S as a separate feature request.
