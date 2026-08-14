## Context

See proposal.md — Why. The export feature proved determinism (byte-identical trades) and exposed producer divergence: CLI 0-commission legacy default vs frontend official methods; frontend hardcoded defaults (`useBacktestPanelState.ts:14-26,47-56`) overriding script declarations (marginLong 1/1 vs 0/0); CLI raw-ms now-anchored fetch vs UTC-midnight everywhere else (720-vs-721 bars); 16 engine diagnostics console-only (`strategy-engine.ts:146-148,217-227` — short suppression silent); `toApiResult`/CLI output carry no config/warnings; API has no commission validation; auto-select maps both live kinds → `jupiter_ultra` while the UI labels `jupiter_manual` for swap bots.

Key constraint: `src/language/runtime/execution-engine.ts:456-475` is the engine's single config merge point. Backend paths are `backend/src/backtest-config.ts`, `backend/src/routes/backtest.ts`, `backend/src/cli/*` (multi-symbol-runner, symbol-runner, backtest-cli). Frontend has no `src/api/` module — inline fetch in `useBacktest.ts:44`, results panel `BacktestResults.tsx` (448+ lines).

## Goals / Non-Goals

**Goals**
- Same explicit input → byte-identical results across CLI and API/frontend (parity, not default-alignment).
- Only `jupiter_manual`/`jupiter_ultra` accepted anywhere; no pseudo/legacy fee paths.
- Live-fee failure is explicit (throw) with two hatches (user-explicit fees bypass, TTL cache).
- Warnings collected per run and surfaced in API result, CLI output, and export.
- Frontend shows what actually ran (effectiveConfig summary + warnings); stops injecting engine defaults.
- Parity test suite as CI gate.

**Non-Goals**
- Not aligning producer *defaults* — different explicit input may yield different results.
- Not building a frontend `src/api/` module (keep inline fetch; only the request *shape* changes).
- Not migrating persisted frontend config (out of scope unless ambiguity blocks; escalate if needed).
- Not a security audit (no PII; API validation is hardening, not an audit — no separate security package).

## Decisions

### D1 — Shared builder is a NORMALIZER, not a second merger
The shared `buildBacktestConfigOverride` (CLI + API) produces ONE canonical **explicit-override object** (only user-provided fields, typed, validated). The engine's `execution-engine.ts:456-475` merge stays the single merge point. `effectiveConfig` = the engine's post-merge result, echoed back in `toApiResult` and CLI output.
- *Rationale:* one authority for defaults (script declarations); a second merger would fork behavior. (Wise Old Man amendment 1)
- *Alternative rejected:* shared full-config builder producing merged defaults — would duplicate engine merge logic and drift.

### D2 — Parity harness FIRST, as a RED baseline
Before any implementation wave, build the parity test (`backend/tests/backtest-parity.test.ts`): canned script + explicit config, fixed clock (`injectable now`), run through CLI path and API path; assert identical effectiveConfig, bar count, trades, PnL, metrics. It starts RED (current divergence) and turns GREEN as waves land.
- *Rationale:* locks the contract from day one; each wave gets a live gate. (Wise Old Man amendment 2)
- *Alternative rejected:* parity test at the end — divergence would be re-discovered, not prevented.

### D3 — Fee policy: THROW, with two hatches
`applyDexFee` failure → explicit error aborting the run for CLI, API, and auto-select (one policy). Hatches: (a) user-explicit fees bypass the live fetch entirely; (b) successfully fetched live fees cached (5–15 min TTL) so CLI/API runs in sequence agree.
- *Rationale:* the flat-0.1% fallback is a pseudo fee — it hides reality and caused the divergence analysis confusion. Explicit failure is the only trustworthy behavior. (Wise Old Man ruling B)
- *Alternative rejected:* keep fallback with a warning — still ships invented fees.

### D4 — WarningCollector injected at composition root
Per-run `WarningCollector` sink injected via a narrow `onWarning` interface at the composition root (NOT a constructor param of the engine, NOT global, NOT strategy ctx). All 16 silence points append typed `Warning` records (type, message, context). Export-time warnings (export sink failures) append to the same array. Output: export `warnings` (dev record), `toApiResult.warnings`, CLI output warnings.
- *Rationale:* DI-compliant (architecture law), testable, keeps engine internals decoupled from output layers.
- *Alternative rejected:* strategy ctx warnings — couples diagnostics to Pine script semantics; global sink — untestable.

### D5 — Frontend sends ONLY user-touched fields
`useBacktestPanelState.buildConfig` stops injecting engine defaults (commission 0, slippage 0, defaultQty 20, pyramiding 0, marginLong/Short 1, currency, initialCapital, stale solPriceUsd 150). It sends only user-explicit settings; backend resolves the rest from script-declared defaults. The results panel then shows the returned `effectiveConfig` (from the API payload, never client constants).
- *Rationale:* kills the margin 1/1-vs-0/0 divergence at the source; the echo display replaces client-side truth. (Wise Old Man ruling D)
- *Alternative rejected:* fixing the frontend constants to match engine defaults — still duplicates engine truth and rots.

### D6 — Shared UTC-midnight date resolution
One `resolveDateRange(daysBack, symbol, timeframe, now)` producing concrete UTC-midnight-aligned start/end, with injectable `now` for determinism. CLI fetch uses the resolved range (replacing raw-ms now-anchored `multi-symbol-runner.ts:15-23`) and reports the same range (`backtest-cli.ts:320-323`); API and frontend already resolve UTC-midnight and keep their behavior.
- *Rationale:* single semantic for all producers kills the 720/721 bar drift and makes dates testable.
- *Alternative rejected:* make frontend send `days_back` — moves resolution client-side and fragments it.

### D7 — Auto-select mapping fix
`auto-select-runner.ts:61-66`: live `'jupiter-swap'` → `jupiter_manual`, `'jupiter-ultra'` → `jupiter_ultra` (matches UI labels).
- *Rationale:* removes the label/mapping contradiction; changes existing auto-select results by design — flag in output (warning) and in the parity suite.
- *Alternative rejected:* relabel UI to match the buggy mapping — wrong.

### D8 — Commission labels normalized
`jupiter_manual` label → "Jupiter Swap" everywhere (`BacktestCommissionSettings.tsx:14-26`, review-step copy `BacktestPanel.tsx:175-180` "Jupiter Manual" → "Jupiter Swap"). "Jupiter (Basic Swap)" is replaced by "Jupiter Swap". CLI help text uses the same names.
- *Rationale:* one naming scheme across UI, CLI, exports, and docs; "manual" is an internal legacy name that confuses users.

### D9 — Backend wave order (conflict map)
`backtest-config.ts`, `routes/backtest.ts`, `multi-symbol-runner.ts`, `backtest-cli.ts`, `backtest-result.ts` are **sequential-only** (each depends on the previous). `auto-select-runner.ts` overlaps lightly (fold with the commission wave or the same warnings agent). Sequence:
1. **W1** — api-designer: explicit-config contract (explicit-vs-absent semantics, whitelist enum, validation envelope, effectiveConfig shape) → backend-engineer: normalizer + CLI/API wiring + script-defaults audit + testability seams.
2. **W2** — parallel: commission (D3, D7, D8) ∥ warnings collector (D4).
3. **W3** — parallel: date semantics (D6) ∥ CLI config-summary + warnings output (D1/D4 echo).
4. **W4** — parallel: parity suite (D2, extend to green) ∥ code review (one pass on the config+trust diff).
5. **W5** — QA trust acceptance + docs.

### D10 — Frontend wave order (contract first)
1. **M0** — mirror the locked backend contract into `frontend/src/types/index.ts` (optional request fields, `effectiveConfig`, `warnings` shapes).
2. **M1** — request-parity + label normalization (F1+F2 merged — both touch `BacktestCommissionSettings.tsx`).
3. **M2** — results panel strip: extract new components from `BacktestResults.tsx` (448+ lines) — config summary from `result.effectiveConfig` (not `jobId`), warnings via existing StatusCallout notice pattern; defensive render when fields absent.
4. **M3** — test-engineer: `backtest-flow.test.tsx` request-body + naming + date-parity tests (single owner of that file).
5. **M4** — conditional: fee-gate UI per locked fee policy (only if policy changes the wizard's Next gating).
6. **M5** — test-engineer: new results-strip test file (NOT `backtest-flow` in parallel — single-owner rule).
7. **W3** — QA (Playwright user flows) + code-reviewer.

## Module boundaries (SOLID)

- **normalize-explicit-config** (backend, new): explicit-override normalization + validation. Depends on nothing but the commission enum. Injected into CLI and API routes.
- **commission-methods** (root): unchanged ownership, extended with validation helpers; label mapping moves to a single `commissionMethodMeta` table (UI + CLI import it).
- **warning-collector** (root): narrow `onWarning` interface + typed Warning records; composed at the backtest composition root, injected into engine and export sink.
- **resolve-date-range** (root or backend): pure function, injectable `now`; imported by CLI, API routes.
- All modules depend on abstractions (types/interfaces), wired once at each composition root (CLI entry, Express routes).

## Risks / Trade-offs

- **BREAKING CLI flag** (`--commission-method` required): existing scripts/Justfile/CI callers break. Mitigation: explicit error message naming accepted values; update Justfile recipes/scripts in the same wave; parity suite covers the CLI path.
- **Fee-failure throws**: multi-symbol batch runs abort on first fee failure. Trade-off accepted — explicit failure beats invented fees; batch runs get clear per-run error context.
- **Auto-select mapping change alters existing results**: by design, but it changes what users see for swap bots. Mitigation: warning surfaced + parity suite documents the expected result.
- **Frontend contract change**: results panel must render defensively while backend ships first (M0/M2 handle absent fields gracefully).
- **API validation break**: invalid commission methods now 400 instead of silently running legacy math — intentional hardening.
- **`commission: 0` unrepresentable**: no path can express 0-commission; legacy tests/scripts asserting it must be updated (flagged by code review).
- **CLI output golden tests**: output format changes (config summary + warnings) — update golden expectations in the same wave.
- **Persisted-config migration**: frontend stored configs referencing old labels are migrated or defaulted safely (escalate only if ambiguity blocks).
