# Backtest Explicit-Config Contract — Notes

**Change:** `openspec/changes/backtest-parity-trust` · **Wave:** W1 (api-designer) · **Complexity:** T4
**Contract module:** `backend/src/backtest-contract.ts` (pure types — no runtime)
**Implements:** `backtest-parity/spec.md` (explicit-config contract), `backtest-commission-methods/spec.md` (validation), `backtest-warnings/spec.md` (warnings shapes), design D1/D3/D4/D5/D8.

---

## 1. Explicit-vs-absent semantics (the core rule)

```
ABSENT field  → resolve from the script-declared defaults at the ENGINE's
                single merge point (execution-engine.ts:456-475).
PRESENT field → the user explicitly wants this value.
NULL          → NEVER "absent". Null is rejected by the normalizer
                (NULL_NOT_ALLOWED). Optional fields are simply omitted.
```

- The engine merge is the **only** authority for defaults. Producers never inject defaults — the frontend's hardcoded `commission 0, slippage 0, defaultQty 20, pyramiding 0, marginLong/Short 1, currency USD, initialCapital 10000, solPriceUsd 150` (useBacktestPanelState.ts:14-26,47-56) MUST all stop.
- `effectiveConfig` = the engine's post-merge result, echoed back. It is the single source of truth for "what actually ran" — the results panel renders it, never client constants.
- Parity follows from this: same script + same explicit config → same merge → byte-identical results across CLI and API.

## 2. The request surface

**`ExplicitBacktestOverride`** (one canonical shape — unifies the old API `BacktestConfigInput` and the CLI 8-field override):

| Field | Required | Notes |
|---|---|---|
| `commissionMethod` | **YES** | `'jupiter_ultra' \| 'jupiter_manual'` only. Absent/invalid → error, never a default (commission-methods spec). |
| `commissionMethodSettings` | no | Typed per method (`JupiterUltraSettings \| JupiterManualSettings`). Omitted / `{}` = no explicit fee values. |
| `initialCapital`, `slippage`, `slippageType`, `defaultQty`, `defaultQtyType`, `pyramiding`, `marginLong`, `marginShort` | no | Omitted = resolve from script-declared defaults. |

**Dropped from the old shapes (by design):**
- `commission` / `commissionType` — the legacy fee path is dead; `commission: 0` is unrepresentable (design.md risk: accepted).
- `currency` — producers never set it; the engine resolves USD.

**Wire compatibility kept:**
- Request body stays **flat** (`BacktestRunRequestBody`): `symbol, timeframe, script, startDate, endDate, days_back, ...explicitOverride` — same destructuring the route does today.
- `days_back` keeps its snake_case wire name; do not rename.
- `useCustomRate` / `useCustom` are UI-state keys, **not** contract keys — the normalizer rejects them (`UNKNOWN_FIELD`). The frontend strips them before sending (M1).

## 3. Validation envelope (normalizer output)

`NormalizeExplicitOverride: (raw: unknown) => NormalizationResult`

```
ok: true  → { value: ExplicitBacktestOverride }   // canonical, validated, copy-only-present
ok: false → { errors: ContractValidationError[] } // run MUST NOT start
```

| Code | Meaning |
|---|---|
| `MISSING_COMMISSION_METHOD` | `commissionMethod` absent (no valid default exists). |
| `INVALID_COMMISSION_METHOD` | Not `jupiter_ultra` / `jupiter_manual`. Error message names both accepted values. |
| `INVALID_FIELD_TYPE` | Field present with the wrong type. |
| `INVALID_FIELD_VALUE` | Present but out of range (e.g. `initialCapital <= 0`, negative margin). |
| `NULL_NOT_ALLOWED` | `null` on any field — null is not "absent". |
| `UNKNOWN_FIELD` | Key not in the contract. **Rejected, not ignored** — catches typos (e.g. `initial_capital`) that would silently resolve from defaults. |

**Status mapping:** API → HTTP 400 `{ error, code: 'VALIDATION_ERROR', details }` (matches the existing `{ error, code }` backend convention). CLI → print the errors and exit non-zero. **No run starts on `ok:false`.**

The returned value feeds the engine merge and must stay **copy-only-present** (never emit `undefined` keys — preserving `buildBacktestConfigOverride`'s load-bearing omission behavior so a narrow input never clobbers engine defaults).

## 4. Result surface

- **`EffectiveBacktestConfig`** = engine `StrategyConfig` (imported SSOT — zero drift) + resolved `startDate`/`endDate` (ms, UTC-midnight aligned). Built from `engine.getStrategyEngine().getConfig()` + the resolved range (the export builder already does this at routes/backtest.ts:188).
- **`BacktestWarning`** = `{ type, message, context? }` with typed union: `long-only-suppression | fee-decision | baseline-applied | live-fee-cache | live-fee-failure | auto-select-method`.
- **`BacktestResultExtension`** (`effectiveConfig` + `warnings[]`) composes onto **all three** consumers: API result (`toApiResult`/`job.result`), CLI output (`toCliSymbolResult`), and the full-data export record (warnings spec).
- `BacktestApiResult` declares the full composed API payload so TypeScript structurally enforces `toApiResult` conformance; the parity suite (D2/W4) locks behavior.

## 5. Decision log

| # | Decision | Rationale |
|---|---|---|
| D1 | Normalizer produces ONE explicit-override; engine merge stays single | One authority for defaults; a second merger would fork behavior. |
| D3 | DEX-fee fetch failure **throws** (aborts run); user-explicit fees bypass the fetch; live fees cached 5–15 min | No invented fees ever ship. `live-fee-failure` warning is reserved for NON-fatal fetches (SOL price outage — non-blocking per dex-fee contract). |
| D4 | Warning shape `{ type, message, context? }`; typed union is the extensibility point | Machine-readable diagnostics; new events append to the union. |
| D5 | Frontend sends only user-touched fields; results panel renders `effectiveConfig` | Kills margin 1/1-vs-0/0 divergence at the source. |
| D7 | auto-select: `'jupiter-swap'` → `jupiter_manual`, `'jupiter-ultra'` → `jupiter_ultra` + `auto-select-method` warning | Matches UI labels; changes auto-select results by design (flagged). |
| D8 | Labels: "Jupiter Swap" / "Jupiter Ultra" — owned by commission-methods (W2), not duplicated here | One naming scheme across UI/CLI/exports. |
| — | `commission`/`commissionType` dropped from the request | Legacy fee path dead; no path can express 0-commission (accepted). |
| — | `currency` dropped from the request | Producers never set it; engine resolves USD. |
| — | Unknown keys REJECTED (`UNKNOWN_FIELD`) | Trust: a typo must fail loudly, never silently resolve from defaults. |
| — | `null` rejected everywhere (`NULL_NOT_ALLOWED`) | Explicit-vs-absent requires omission, not null. |

## 6. Next owner (handoff)

**backend-engineer** implements, against this contract:
1. `normalizeExplicitOverride` (pure, `NormalizeExplicitOverride`) in a `normalize-explicit-config` module — whitelist enum, per-field type/range checks, null rejection, unknown-key rejection, copy-only-present output.
2. Wire it into `routes/backtest.ts` (validate before job creation; 400 on `ok:false`) and the CLI entry (`--commission-method` required; explicit error naming the two values).
3. Compose `BacktestResultExtension` into `toApiResult` and `toCliSymbolResult` (effectiveConfig from `getConfig()` + resolved range; warnings from the WarningCollector sink).
4. Migrate `buildBacktestConfigOverride`/CLI override consumers onto the single shape; remove legacy `commission`/`commissionType` plumbing from producers.
5. Leave date-range resolution (D6) and the WarningCollector (D4) to their waves — this contract only declares their shapes.
