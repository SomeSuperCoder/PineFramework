# Tasks — Telegram Settings Screen Redesign

## 1. UX structure spec
- [x] Produced Card-grouping structure spec (Connection/Diagnostics/AccessControl/Recipients), bounded-list pattern, state/feedback map, a11y spec.
  - **Agent:** ux-designer
  - **Verdict:** ✅ DONE
  - **Evidence:** 4-card IA + Collapsible/ScrollArea bounded pattern + component contract delivered
  - **Date:** 2026-08-09

## 2. Engineer Microtask A — foundation + first-half cards
- [x] Decomposed file into TelegramConfigPanel/ folder (index.tsx keeps export + props contract).
- [x] Extracted 15 fetch helpers into telegramApi.ts (testable mock boundary, real error propagation).
- [x] Built ConnectionCard (Bot Token masked + Eye/EyeOff, HTTP Proxy w/ validation) + DiagnosticsCard (Send Test) + shared primitives (SectionHeader/SettingRow/StatusCallout/CardSkeleton) + useTelegramSettings hook (dead state removed).
  - **Agent:** frontend-engineer
  - **Verdict:** ✅ DONE
  - **Evidence:** tsc exit 0, eslint 0 rule violations, vite build clean (10.24s), 9 files created
  - **Date:** 2026-08-09

## 3. Engineer Microtask B — interaction cards + grids
- [x] Built AccessControlCard (Admin + Controller Requests + Controllers, AlertDialog destructive remove) + RecipientsCard (Chats ScrollArea + per-chat Collapsible + member switches, Per-Alert Collapsible default-collapsed w/ n/m badge). Purged inline token styles.
  - **Agent:** frontend-engineer
  - **Verdict:** ✅ DONE
  - **Evidence:** tsc 0 errors in files, vite build clean (13.84s), 2 cards + index wiring
  - **Date:** 2026-08-09

## 4. Test coverage (component had ZERO before)
- [x] 78/78 tests across 7 files: telegram-api (19), use-telegram-settings (10), telegram-shared (8), connection-card (9), diagnostics-card (6), access-control-card (13), recipients-card (13). Mocked at telegramApi boundary. Token masking, optimistic rollback, AlertDialog confirms, empty states, a11y labels asserted.
  - **Agent:** test-engineer
  - **Verdict:** 🟢 GREEN
  - **Evidence:** `pnpm exec vitest run src/__tests__/telegram-*.test.tsx ...` from frontend/ → 78 passed, EXIT=0
  - **Date:** 2026-08-09

## 5. QA acceptance
- [x] 9/9 acceptance criteria PASS (2 with notes), regressions clean, Playwright correctly skipped (component coverage + real-data mandate).
  - **Agent:** qa-engineer
  - **Verdict:** ✅ GO-WITH-NOTES (3 non-blocking notes → recommendations/)
  - **Evidence:** acceptance table w/ file:line refs; blast radius clean (only App.tsx:8,581)
  - **Date:** 2026-08-09

## 6. Tech Lead commit
- [ ] (tech-lead — this task, being executed now)
