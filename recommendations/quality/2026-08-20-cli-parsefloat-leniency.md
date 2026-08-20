# CLI parseFloat flags accept silent garbage
**Date:** 2026-08-20
**Source:** backend-engineer (b3-cli-gitignore handoff)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`backend/src/cli/backtest-cli.ts` numeric flags parsed with `parseFloat` (`--initial-capital`, `--slippage`, `--default-qty`) share the same silent-garbage acceptance that was fixed for the `parseInt` flags (`12abc` → 12). Replace them with strict numeric parsing (e.g. `Number(...)` + finite guard) so malformed values are rejected by the existing validators instead of silently truncated.

## Rationale
Consistency with the B3 fix for `--pyramiding`/`--max-bars`: a user typo like `--initial-capital 100abc` silently becomes 100 instead of an error, which can produce a backtest that runs with the wrong capital.

## Evidence
- `backend/src/cli/backtest-cli.ts` — parseFloat calls for the three flags
- Same file's `validateOptions` only checks `Number.isInteger` on `maxBars`; the parseFloat path has no equivalent strict guard
- Note (2026-08-20 TE): no unit test imports `parseArgs`/`validateOptions` — the garbage-rejection path is guard behavior, not asserted. When fixing, add a regression test asserting `12abc` → rejection.