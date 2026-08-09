# Hygiene: drop stale `fee: '0'` mock inputs from test fixtures
**Date:** 2026-08-09
**Source:** test-engineer (M9 re-verify)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Remove the stale `fee: '0'` mock INPUTS from 6 test files — they encode the pre-M9 "fabricated fee" contract that the PnL SSOT change explicitly banned. The tests pass today, but the fixtures teach readers the wrong contract (`fee` is now OPTIONAL and omitted when unobserved; `feeComponents`/`feeUnknown` carry the truth).

Files: `tests/unit/trading/live-strategy-execution-real.test.ts:118`, `live-strategy-executor.test.ts:94`, `bot-engine.test.ts:417`, `close-manager.test.ts:58`, `chaos-timeframe-gate-regression.test.ts:134`, `trade-capture-wiring.test.ts:71`.

## Rationale
Mock inputs are documentation for the contract under test. Keeping `fee: '0'` in 6 files while production never emits it invites future engineers to re-fabricate fees. Aligning the mocks to the real SwapResult contract (fee optional, feeComponents/feeUnknown present) keeps the test corpus honest.

## Evidence
- Test-engineer M9 re-verify handoff (finding #2): "6 files carry stale `fee: '0'` mock INPUTS (not failing, but encode the pre-M9 contract)."
- `SwapResult.fee` is optional since M4; `captureSwapFeeComponents` emits components + feeUnknown, never `fee: '0'`.
