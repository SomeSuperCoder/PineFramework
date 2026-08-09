## 1. PnL Module (src/pnl/) — foundation

- [x] 1.1 Create `src/pnl/types.ts` — canonical types: `DecimalStr`, `Fill`, `FeeKind`, `FeeComponent`, `PriceMap`, `RealizedPnl`, `FeeSource` (observed/modeled + backtestFeeModel tag), `feesUnknown` flag
  - **Agent:** backend-engineer (M2) | **Verdict:** ✅ DONE | **Evidence:** module tsc-clean; QA AC2 PASS (FeeKind = VENUE/PLATFORM/PRIORITY/BASE/JITO + SLIPPAGE_MEMO informational)
- [x] 1.2 Create `src/pnl/core.ts` — pure arithmetic: `grossPnl(side, entry, exit, qty)`, `feeTotal(breakdown)`, `netPnl(gross, fees)` enforcing `net === gross − fees`; decimal-string only, no floats
  - **Agent:** backend-engineer (M2) | **Verdict:** ✅ DONE | **Evidence:** contract F2 250 fuzz cases; decimal.ts BigInt exact, negative half-away-from-zero, no float path
- [x] 1.3 Create `src/pnl/aggregate.ts` — the ONE shared runner `aggregateRealizedPnl(fills, feeSource, prices)` that live and backtest both call
  - **Agent:** backend-engineer (M2, M9-FIX) | **Verdict:** ✅ DONE | **Evidence:** live calls it with anchor 'fills' (live-strategy-executor.ts:1581), backtest via strategy-engine.ts:751; **anchor follows GROSS SOURCE (D12)**; seam re-doc'd; Code Reviewer APPROVE
- [x] 1.4 Create `src/pnl/fees.ts` — `feeToQuote` single mint→USD boundary + `feeBreakdownToQuote`; `modelFees(order, model)` backtest fee-model generator with `BacktestFeeModel { tag, venueBps?, platformBps?, priorityLamports?, baseLamports=5000, solUsdPrice }`
  - **Agent:** backend-engineer (M2) | **Verdict:** ✅ DONE | **Evidence:** single conversion boundary (D4); fees.ts:52-58 throw → degrade path (B1-safe); Security F2 reviewed
- [x] 1.5 Create `src/pnl/index.ts` — public exports; canonical single Jupiter fee-tier table (consolidating `commission-methods/utils.ts` `JUPITER_FEE_BPS` and the live ultra flat-5bps)
  - **Agent:** backend-engineer (M2, M6) | **Verdict:** ✅ DONE | **Evidence:** D6 canonical JUPITER_FEE_TIERS (ecosystem 0 … new_token 50); dead JUPITER_FEE_BPS table deleted; QA AC2 PASS
- [x] 1.6 Create contract suite — F1 same fills live-vs-backtest → identical gross; F2 same components observed-vs-modeled → identical fees/net; F3 identity over 200 fuzzed cases; F4 venue/platform/slippage breakout never changes net (anchor rule); F5 fixed fixtures (buy-all-in win, partial fills, stop-big-loss fees>net, zero-fee, slippage memo)
  - **Agent:** test-engineer (M3, M8) | **Verdict:** ✅ DONE | **Evidence:** **actual file `tests/unit/pnl/pnl-contract.test.ts`** (path drift vs tasks text — the spec'd `src/pnl/__contract__.spec.ts` name was not used; tests live in the unit test tree, F1–F8) — 26/26 GREEN; parity contract in `tests/unit/pnl/pnl-parity.test.ts` proves live net 9.997 vs backtest net 9.647, diff = exactly venue+platform (fills semantics)
- [ ] 1.7 Add merge-gate check so no new PnL/fee arithmetic outside `src/pnl/` passes the contract suite
  - **Status:** NOT DONE — recommendation only, non-blocking (Code Reviewer m2). Saved to `recommendations/quality/2026-08-09-merge-gate-static-check.md`

## 2. Live fee capture (Jupiter adapters)

- [x] 2.1 Extend `SwapInfo` type locally with `feeAmount`/`feeMint` (official `@jup-ag/api` typings omit them)
  - **Agent:** integration-engineer (M4) | **Verdict:** ✅ DONE | **Evidence:** fee capture verified by dex-adapter/jupiter-swap/jupiter-ultra tests (25+25+23 GREEN)
- [x] 2.2 `jupiter-swap-adapter.ts` — parse quote/swap response into canonical `FeeBreakdown`: per-routePlan-leg venue fees, `platformFee`, actual `prioritizationFeeLamports` echo, base 5k lamports/sig; replace `feeBps: 0` and `fee: '0'`
  - **Agent:** integration-engineer (M4), backend-engineer (M9-FIX sanitize) | **Verdict:** ✅ DONE | **Evidence:** `captureSwapFeeComponents` (dex-adapter.ts:393-430) + sanitizeFeeComponent (never-throw, whitelist, clamps); no `fee: '0'` anywhere in adapters; Code Reviewer APPROVE
- [x] 2.3 `jupiter-ultra-adapter.ts` — same capture; remove fabricated `inAmount × 5/10000` fee and static `commissionModel.feeBps`; read tier from the canonical table
  - **Agent:** integration-engineer (M4) | **Verdict:** ✅ DONE | **Evidence:** `commissionModel.feeBps` 5→0; fabricated fee removed; jupiter-ultra-adapter.test.ts assertions updated (feeBps 0, variable true, fee undefined)
- [x] 2.4 Return `feesUnknown` when a swap response lacks fee data — never fabricate zero or fixed-bps
  - **Agent:** integration-engineer (M4), backend-engineer (M9-FIX) | **Verdict:** ✅ DONE | **Evidence:** `feeUnknown = !hasObservableFees`; absent/partial components → degrade 'none'/feesUnknown (B1 guard, confirmed closes never misclassified); QA AC3 PASS

## 3. Live executor rewiring

- [x] 3.1 `live-strategy-executor.ts` `resolveClosedTradeRealizedPnl` — compute NET realized PnL through `aggregateRealizedPnl` (fix gross-only math)
  - **Agent:** backend-engineer (M5, M9-FIX) | **Verdict:** ✅ DONE | **Evidence:** anchor **'fills'** (both call sites), `solPriceFor` supplies prices['SOL'] by construction (expectedPrice→env SOL_USD_PRICE→DEFAULT_SOL_USD_PRICE 73); B1 regression fixed (absent feeComponents degrades, recordTrade fires with net); QA AC4 PASS — real fixture: gross 82.64197 − fees 0.5 = net 82.14197
- [x] 3.2 `persistClosedTradeRecord` — persist real `fees`, fee breakdown, `grossPnl`, `netPnl`, `feesUnknown` flag (remove hardcoded `fees: 0`)
  - **Agent:** backend-engineer (M5, M9-FIX) | **Verdict:** ✅ DONE | **Evidence:** fees = Σ(subtractedFromNet) (subtractedFeesToNumber, DecimalStr dAdd, isFinite edge), feeBreakdown full display, grossPnl persisted; identity realizedPnl === gross − fees (MAJOR-3 resolved); Code Reviewer APPROVE
- [x] 3.3 `TradeRecord` type + trade-history store accept the new PnL fields (net semantics, backward-compatible read of legacy rows)
  - **Agent:** backend-engineer (M5, M7), documentation-writer (JSDoc) | **Verdict:** ✅ DONE | **Evidence:** optional additive fields (grossPnl/feeBreakdown/feesUnknown); legacy fallback `grossPnl ?? realizedPnl`, `fees ?? 0`, never invents fees; TradeRecord JSDoc corrected to anchor semantics; Code Reviewer APPROVE

## 4. Backtest rewiring

- [x] 4.1 `strategy-engine.ts` `closeOrReducePosition`/`calculateCommission`/`fillOrder` — net PnL through the shared module's `aggregateRealizedPnl` with modeled fee input
  - **Agent:** backend-engineer (M6) | **Verdict:** ✅ DONE | **Evidence:** strategy-engine.ts:751 calls aggregateRealizedPnl(anchor 'fills', modelFees); fees once per round trip; backtest-commission-methods tests updated to module math (net 17.44927 = 20 − 2.55073); legacy percent/fixed/per_contract/per_order unchanged; Code Reviewer APPROVE
- [x] 4.2 Wire `BacktestFeeModel` config (venue/platform/priority/base bps + configurable `solUsdPrice` default replacing hardcoded `$150`) into the backtest runner
  - **Agent:** backend-engineer (M6) | **Verdict:** ✅ DONE | **Evidence:** `src/strategy/commission-methods/config.ts` DEFAULT_SOL_USD_PRICE=73, DEFAULT_DEX_FEE_BPS=25; `backtest-model.ts` buildBacktestFeeModel; hardcoded $150 deleted; Security F1 review confirmed config not secret
- [x] 4.3 Delete/delegate legacy `commission-methods/` calculators (jupiter-manual, jupiter-ultra, utils) — the dead tier table is deleted in the same commit
  - **Agent:** backend-engineer (M6) | **Verdict:** ✅ DONE | **Evidence:** JUPITER_FEE_BPS + calculateSolanaNetworkFee + getSolPriceUsd deleted from utils.ts; single canonical table src/pnl/fee-tiers.ts; no stale identifiers (grep verified)
- [x] 4.4 Persist `backtestFeeModel` tag on backtest results (constant-tier | flat-bps | quote)
  - **Agent:** backend-engineer (M6) | **Verdict:** ✅ DONE | **Evidence:** buildBacktestFeeModel tags runs; feeSource.backtestFeeModel carried into RealizedPnl; QA AC2/AC4 verified

## 5. Stats consolidation (one netPnl identity)

- [x] 5.1 `strategy-metrics.computeMetrics` — consume module `net` semantics for backtest metrics
  - **Agent:** backend-engineer (M7) | **Verdict:** ✅ DONE | **Evidence:** computeMetrics consumes trade `.pnl` (module net), buildEquityCurve = Σ net, never double-adds commission; Code Reviewer verified
- [x] 5.2 `trade-history-store.computeStats` — totalGrossPnl, totalFees, netPnl from module identity; surface unknown-fee count
  - **Agent:** backend-engineer (M7) | **Verdict:** ✅ DONE | **Evidence:** TradeStats (trade-history-store.ts:580): totalGrossPnl, totalFees, netPnl = totalGrossPnl − totalFees, feesUnknownTrades; stats-service tests +3 GREEN; QA AC5 PASS
- [x] 5.3 `backend/src/services/globalPnl.ts` `buildGlobalPnlSnapshot` — same net semantics (Telegram/API)
  - **Agent:** backend-engineer (M7) | **Verdict:** ✅ DONE | **Evidence:** consumes stats.netPnl + totalFees, reconstructs avgTrade = (netPnl + totalFees)/totalTrades (identity inverse); globalPnl.test.ts + fixtures GREEN

## 6. Contract/API/frontend alignment

- [x] 6.1 Update history/stats API contracts and tests for net PnL + fees fields (backend/tests/*)
  - **Agent:** test-engineer (M8) | **Verdict:** ✅ DONE | **Evidence:** globalPnl makeStats + totalGrossPnl/feesUnknownTrades; trade-history-route HTTP test (totalGrossPnl 21, totalFees 1, netPnl 20); 112/112 M8 GREEN
- [ ] 6.2 Update frontend trade dashboard (`trade-dashboard.test.tsx`, types) — render net PnL + honest unknown-fee indicator
  - **Status:** NOT DONE — deferred, saved to `recommendations/frontend/2026-08-09-frontend-pnl-contract-mirror.md` (types mirror + default SOL price 150→73 + relabel realizedPnl NET)
- [x] 6.3 Update `tests/strategy/commission-calculator.test.ts`, `backtest-commission-methods.test.ts`, `backtest-engine.test.ts` to the module semantics (Test Engineer lane)
  - **Agent:** test-engineer (M8) | **Verdict:** ✅ DONE | **Evidence:** backtest-commission-methods updated (3 values + 3 new M6 tests); backtest-engine.test.ts 10/10 unchanged (structural); commission-calculator covered by M6 tests

## 7. Verification & QA

- [x] 7.1 Test Engineer — full affected + full-suite run, GREEN verdict (one suite owner)
  - **Agent:** test-engineer (M3, M8, M9-REVERIFY) | **Verdict:** 🟢 GREEN | **Evidence:** pnl-contract 26/26; M8 112/112 (7 files); M9-REVERIFY 58/58 scoped; **full tests/unit/trading/ 521/521 (31 files) run #1**; B1 round-trip recordTrade(100) PASS
- [x] 7.2 QA Engineer — acceptance criteria per spec (pnl-calculation, jupiter-swap-adapter, trade-history, strategy-backtest-engine, trading-stats-dashboard), regressions, GO/NO-GO
  - **Agent:** qa-engineer | **Verdict:** ✅ GO (re-gate) | **Evidence:** 5/5 acceptance criteria PASS; MAJOR-1/2/3 + F1/F2 all resolved with code evidence; regressions none
- [x] 7.3 Code Reviewer — diff review (module + rewiring), static analysis, verdict
  - **Agent:** code-reviewer | **Verdict:** ✅ APPROVE (re-gate) | **Evidence:** 0 CRITICAL / 0 MAJOR; MAJOR-1/2/3 + m1/m4 confirmed fixed; 2 MINOR (doc) + 1 observation non-blocking; tsc 323 pre-existing (tests/frontend), 0 new in src/
- [x] 7.4 Security light pass — fee data integrity, no secrets in fee parsing, no double-count path
  - **Agent:** security-engineer | **Verdict:** ✅ FINDINGS RESOLVED | **Evidence:** F1 (SOL price) fixed via solPriceFor; F2 (mint whitelist + clamps + isFinite) fixed in M9-FIX; OWASP A04 addressed; no secrets introduced
- [x] 7.5 Tech Lead — mark tasks done in tasks.md, USER INTENT GATE (does net PnL show the truth per directive), commit at feature boundary
  - **Agent:** tech-lead | **Verdict:** ✅ PASS | **Evidence:** see USER INTENT GATE in commit report — net PnL shows the truth: one module (src/pnl) shared by live + backtest, all commissions tracked, net = gross − fees everywhere, honest feesUnknown, no fabrication

## 8. Post-change (requires Director decision, NOT auto-spawned)

- [ ] 8.1 Historical fee backfill of pre-change `fees: 0` rows (data-engineer) — only on explicit Director approval
  - **Status:** AWAITING DIRECTOR DECISION — NOT auto-spawned
