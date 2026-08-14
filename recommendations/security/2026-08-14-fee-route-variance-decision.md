# Fee route variance — deterministic vs live display (DIRECTOR DECISION)
**Date:** 2026-08-14
**Source:** qa-engineer (fee-strip-acceptance.json)
**Priority:** medium
**Status:** pending
**Effort:** varies by decision

## Recommendation
Director decision needed: Jupiter route selection flaps across fetches — observed live `dexFeeBps` of **25 (Byreal) → 10 (Invariant) → 25 (Deriverse)** within 5 minutes, all `source: api`. The UI descriptor says "DEX fee (default 25 bps)" (frontend/src/components/BacktestCommissionSettings.tsx:23-24) which is only true for some routes. Options:
1. **Accept live route variance (current, correct behavior)** — the charged/displayed fee is the actual route fee at fetch time; update UI copy to "live, varies by route (~10-25 bps)".
2. **Deterministic displayed fee** — pick a fixed default (e.g. 25 bps) and stop live-fetching, losing route accuracy.
3. **Route-agnostic floor** — show live but never below a documented floor.

## Rationale
The trust promise is "what actually ran is what's shown". If the UI promises a default that the live fee can differ from, users will see 10 bps and think it's broken. The value 0.25 (the 100× undercharge) is definitively dead; this is about copy/expectations, not math.

## Evidence
- qa-engineer fee-strip-acceptance.json: live probes 25/Byreal → 10/Invariant → 25/Deriverse across 5 minutes, cache write at 15:18:51 proves live values
- BacktestCommissionSettings.tsx:23-24 descriptor "DEX fee (default 25 bps)"
