## 1. Per-Pair Timeframe Input (spec: symbol-timeframe-matrix-ui)

- [x] 1.1 Update pairs textarea placeholder to `SOLUSDT 60\nBTCUSDT 240\nETHUSDT 60\nSOLUSDT 15`
- [x] 1.2 Parse each line as `[symbol, timeframe]` — split on whitespace, default timeframe to `60` if missing
- [x] 1.3 Validate each timeframe against `VALID_TIMEFRAMES` set and show inline warning on invalid lines
- [x] 1.4 Send parsed `{ symbol, timeframe }` objects in the configure API payload (replacing the hardcoded `timeframe: '60'`)
- [x] 1.5 Verify with frontend build + manual check that a multi-timeframe payload is sent correctly

## 2. Configuration Wizard (spec: configuration-wizard)

- [x] 2.1 Create `SetupWizard` component with `useState<'wallet' | 'config' | 'review'>` step tracker
- [x] 2.2 Add step indicator UI (1→2→3) in the dashboard header replacing the flat "Setup" tab label
- [x] 2.3 Step 1 (Wallet): render existing `WalletImportPanel`, disable Next until `wallet.hasWallet === true`
- [x] 2.4 Step 2 (Config): render existing `BotConfigPanel` with updated pairs input, disable Next until strategy source + at least one pair present
- [x] 2.5 Step 3 (Review): show summary of all settings (wallet key, strategy name, DEX, pairs, risk, auto-select) + Start Bot button
- [x] 2.6 Implement Back navigation preserving all state between steps
- [x] 2.7 Replace the flat setup content in `LiveDashboard` with the wizard component
- [x] 2.8 Ensure Status/Metrics/Logs tabs still show when bot is Running (wizard hidden)

## 3. Auto-Select Progress (spec: auto-select-progress)

- [x] 3.1 Add `bot:autoSelect` channel handling to `useBotWebSocket` hook (progress events + completion event)
- [x] 3.2 Create `AutoSelectProgress` component showing current pair, phase, and count during evaluation
- [x] 3.3 Show ranked results panel when auto-select completes (list of pairs with metrics, best highlighted)
- [x] 3.4 Wire the progress component into the Review step — when Start is clicked with auto-select, show progress instead of immediately transitioning
- [x] 3.5 Verify with a test strategy that progress appears and auto-select completes

## 4. Strategy Compatibility Check (spec: strategy-compatibility-check)

- [x] 4.1 Implement `checkStrategyCompatibility(source: string): string[]` function with regex patterns for: `strategy.short`, `strategy.entry(*, limit=`, `strategy.exit(*, short`
- [x] 4.2 Show warning banner in wizard Step 2 (Config) when incompatible patterns are detected
- [x] 4.3 Ensure warnings are non-blocking (Start button remains enabled)
- [x] 4.4 Filter out matches inside strings/comments to avoid false positives
- [x] 4.5 Verify with sample strategies that produce and don't produce warnings

## 5. Backend: Auto-Select WS Channel (spec: auto-select-progress)

- [x] 5.1 Wire `SelectionProgressCallback` from `AutoMarketSelector` into the `DashboardWsService.broadcast()` in `bot-engine.ts` `start()` method
- [x] 5.2 Add `bot:autoSelectProgress` and `bot:autoSelectComplete` broadcast messages in `bot-gateway.ts` or `dashboard-ws.ts`
- [x] 5.3 Verify via backend test that progress events are broadcast during auto-select

## 6. Verify End-to-End

- [x] 6.1 Run `pnpm run build` in frontend — no TS errors from changed files
- [ ] 6.2 Manual flow: import wallet → configure with multi-timeframe pairs → apply → review → start
- [ ] 6.3 Manual flow: enable auto-select → start → verify progress + ranking shown → bot starts
- [ ] 6.4 Manual flow: paste strategy with `strategy.short` → verify warning appears → start still works
