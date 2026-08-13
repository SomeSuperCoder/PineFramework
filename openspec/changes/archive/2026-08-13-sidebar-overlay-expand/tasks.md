# Tasks — Sidebar Overlay Expand

## B1. Implement overlay (frontend-engineer)

- [x] 1.1 ControlPanel.tsx — content row container gets `relative`; ContentArea wrapped in `div.ml-16` (4rem = 64px collapsed rail) so content never sits under the rail and never resizes on hover
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** wrapper-div deviation (ContentArea has no className prop — offset moved to wrapper in ControlPanel.tsx); tsc 0 errors; eslint clean on changed lines
- [x] 1.2 Sidebar.tsx — nav now `absolute inset-y-0 left-0 z-40 ... shadow-lg`; inline width 220↔64px + 200ms transition, hover handlers, aria-expanded, nav items unchanged
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** 2-file diff confirmed; z-40 < modal z-50; no scrim
- [x] 1.3 Z-order verified — sidebar above content (no content z-index), below modals (z-50 untouched)
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** diff review; no z-50 class modified
- [x] 1.4 Typecheck + lint clean
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** tsc --noEmit 0 errors; eslint clean on changed lines (2 pre-existing prettier errors in untouched lines, proven on git HEAD — reported)
- [x] 1.5 Chart container width constant on hover
  - **Agent:** test-engineer (e2e lock) · **Verdict:** 🟢 GREEN · **Evidence:** e2e/sidebar-overlay.spec.ts — dashboard panel region bounding box x+width byte-identical before/after hover

## B2. Test impact (test-engineer)

- [x] 2.1 Existing vitest suite green
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** 33 files / 386 tests pass, 0 failures
- [x] 2.2 Affected e2e + new regression lock
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** sidebar-overlay.spec.ts PASSED (no-flash + overlay + collapse); affected run 14 passed / 1 flaky (ECONNRESET seed, infra, retried pass) / 1 pre-existing chunk-boundary:174 cold-load flake (matches baseline, unrelated)
- [x] 2.3 Verdict
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** full evidence in handoff data/handoffs/team/quality/test-engineer/sidebar-overlay.json
