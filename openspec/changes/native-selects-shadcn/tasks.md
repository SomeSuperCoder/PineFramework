# Tasks — Native selects → shadcn Select

## C1. TradeHistoryTab timeframe filter (frontend-engineer)
- [x] 1.1 Swap <select title="Timeframe filter"> → shadcn Select with 'all' sentinel
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** diff verified; 'all'↔'' mapping; title+aria-label preserved
- [x] 1.2 Preserve refetch behavior (setTimeframe → useTradeHistory)
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** side-effect untouched; test-engineer verified timeframe=60 fetch in rewritten test
- [x] 1.3 Typecheck + lint clean
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** tsc 0 errors; eslint clean via explicit parser-options override (repo lint-gap reported)

## C2. CodeEditor script selector (frontend-engineer)
- [x] 2.1 Swap <select> with optgroups → SelectGroup + SelectLabel
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** diff verified; handleDropdownChange adapted ChangeEvent → (id: string) for Radix, logic byte-identical
- [x] 2.2 Preserve handleDropdownChange loadScript behavior
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** guard + loadScript(id) unchanged; CodeEditor.test "loads first script on open" passed as-is
- [x] 2.3 Typecheck + lint clean
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** tsc 0 errors; eslint clean

## C3. BotControls 4 selects (frontend-engineer)
- [x] 3.1 DEX select → shadcn (aria-label "DEX")
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** diff verified; dex typed union preserved
- [x] 3.2 Timezone select → shadcn, groups + filter preserved (aria-label "Timezone")
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** SelectGroup/SelectLabel + timezoneFilter filtering preserved
- [x] 3.3 Manual Pair select → shadcn + placeholder (aria-label "Pair")
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** placeholder idiom; functional setManualPair preserved; bot-stop-step test verifies SOL/USDT selection
- [x] 3.4 Manual Timeframe select → shadcn (aria-label "Timeframe")
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** 7 items; functional setManualPair preserved
- [x] 3.5 Typecheck + lint clean
  - **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** tsc 0 errors; net −13 prettier violations (130 pre-existing remain — filed as recommendation)

## C4. Test impact (test-engineer)
- [x] 4.1 Rewrite trade-dashboard.test.tsx:431 to radix pattern
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** combobox click + option '1h'; timeframe=60 fetch assertion identical
- [x] 4.2 Rewrite bot-stop-step.test.tsx:294-298 to radix pattern
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** combobox {name:/Pair/} + option 'SOL/USDT' (display label); start/ohlcv/execute assertions identical
- [x] 4.3 Verify/fix CodeEditor.test.tsx (script dropdown assertions)
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** dropdown-open assertion rewritten; "loads first script" passed as-is
- [x] 4.4 Vitest suite green
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** 33 files / 386 tests passed (1 RED = outdated SOL/USDT label test, fixed)
- [x] 4.5 Affected e2e batch green + optional trade-dashboard filter lock
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** 14/14 e2e passed; Timeframe filter 1h lock added (BTCUSDT/SOLUSDT gone, ETHUSDT remains)
