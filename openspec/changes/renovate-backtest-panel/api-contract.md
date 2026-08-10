# API Contract — `GET /api/backtest/dex-fee`

**Change:** renovate-backtest-panel · **Design decision:** D5 · **Owner:** API Designer → Backend Engineer

## 1. Endpoint Summary

- **Method/Path:** `GET /api/backtest/dex-fee`
- **Purpose:** Return the live DEX fee (basis points) for a symbol via Jupiter, plus the current SOL/USD price for the frontend panel. The Backend Engineer implements this verbatim; the Test Engineer verifies against §7.
- **Why 404 = feature-absent:** backend and frontend deploy independently. When this route is NOT mounted, Express returns the framework's default 404 — this is the frontend's feature gate. Once implemented, the route MUST NEVER return 404 (no resource-not-found semantics exist here). A deployed route answers 200/400/503 only.

## 2. Query Parameters

| Name | Required | Type | Validation | Normalization |
|------|----------|------|------------|---------------|
| `symbol` | **Yes** | string | non-empty after trim; non-string (e.g. repeated `?symbol=a&symbol=b`) → 400 VALIDATION_ERROR | trim → `toUpperCase()` |

- No `commissionMethod` param (fetch is identical for `jupiter_manual`/`jupiter_ultra`). Unknown params are ignored.

## 3. Success Response — `200 OK`

`FeeFetchResult` returned verbatim; `solPriceUsd` is **present only when the SOL/USD fetch succeeds** (its failure is non-blocking — never fail the request for it).

| Field | Type | Notes |
|-------|------|-------|
| `dexFeeBps` | number (integer ≥ 0) | basis points |
| `source` | `'api' \| 'cache' \| 'in-memory-cache'` | which cache tier served the fee |
| `dexLabel` | string, optional | present when known |
| `solPriceUsd` | number, optional | present ONLY when fetched successfully; omitted otherwise |

```json
// with solPriceUsd
{ "dexFeeBps": 31, "source": "api", "dexLabel": "Jupiter (ultra)", "solPriceUsd": 152.34 }

// without solPriceUsd (SOL/USD fetch failed — still 200)
{ "dexFeeBps": 31, "source": "cache" }
```

## 4. Error Responses — envelope matches existing convention `{ error: string }` + additive `code`

```json
{ "error": "human-readable message", "code": "MACHINE_CODE" }
```

| Status | `code` | When | Example |
|--------|--------|------|---------|
| 400 | `VALIDATION_ERROR` | `symbol` missing or empty after trim | `{ "error": "Missing or invalid \"symbol\" query parameter", "code": "VALIDATION_ERROR" }` |
| 400 | `UNSUPPORTED_SYMBOL` | fetcher's clean unmapped-mint error (identify via its error type/message; do NOT match user input) | `{ "error": "Symbol BONK is not mapped to a Jupiter mint", "code": "UNSUPPORTED_SYMBOL" }` |
| 503 | `UPSTREAM_UNAVAILABLE` | total upstream failure (all sources exhausted / network error, not unmapped mint) | `{ "error": "DEX fee data temporarily unavailable, try again later", "code": "UPSTREAM_UNAVAILABLE" }` |

- **503 is opt-in:** any upstream failure that is NOT an unmapped-mint error maps to 503, never 500. A genuine programmer bug may still 500 with the existing sanitized `{ error: message }` fallback.
- SOL/USD fetch failure never triggers an error response (see §3).

## 5. 404 Semantics — Feature Gate (explicit frontend probe contract)

- Frontend probes once on mount: `GET /api/backtest/dex-fee?symbol=SOL`.
- **404 (any body — framework default)** → route absent → hide the DEX-fee panel. Do NOT parse the body; judge on status only.
- **Any other status** (200/400/503) → route present → show the panel; then handle data errors normally.

## 6. Caching & Rate Limiting

- Reuse `fetchDexFeeBps`'s existing in-memory + disk cache — never add a second layer for the fee.
- New SOL/USD fetcher: disk-cached, 5–15 min TTL, returns `number | null` on failure; cache hit = no upstream call.
- Light rate limiter: **30 req/min per IP** on this route → `429` with `Retry-After` header and the same envelope (`code: "RATE_LIMITED"`). Client treats 429 as transient retry.

## 7. Acceptance Checklist

- [ ] `?symbol=SOL` → 200 with `dexFeeBps` (int), `source` in enum, optional `dexLabel`
- [ ] SOL/USD fetch succeeds → 200 includes `solPriceUsd`; fails → 200 omits it (never error)
- [ ] missing `symbol` / `?symbol=` / `?symbol=` (whitespace) / non-string → 400 `VALIDATION_ERROR`
- [ ] unmapped mint (e.g. `FOO`) → 400 `UNSUPPORTED_SYMBOL`
- [ ] symbol normalized: `" sol "` → `SOL`; no `commissionMethod` handling
- [ ] total upstream failure (simulated) → 503 `UPSTREAM_UNAVAILABLE`; no 500
- [ ] envelope shape exactly `{ error: string, code: string }`; no nested `error` object
- [ ] route mounted → never 404; unmounted → framework 404 (probe gate)
- [ ] 31st req in a minute → 429 + `Retry-After`; fee served from disk cache without upstream call

## HANDOFF

**Verdict:** ✅ DONE — contract written, verified against existing error convention (flat `{ error: string }` + additive `code`) and FeeFetchResult shape.
**Evidence:** `openspec/changes/renovate-backtest-panel/api-contract.md`; CodeGraph confirmed existing envelope at `backend/src/routes/backtest.ts` (400/404/500 flat `{ error }`).
**Files touched:** contract doc only (no code, no backend files).
**Next owner:** backend-engineer — implement `GET /api/backtest/dex-fee` + SOL/USD fetcher per §1–§6; Test Engineer verifies §7.
