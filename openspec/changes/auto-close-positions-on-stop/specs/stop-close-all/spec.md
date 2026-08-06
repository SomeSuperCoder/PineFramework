## Purpose

Ensures that stopping the trading bot — by any stop path — gracefully closes every open on-chain position through confirmed reverse swaps, so a stopped bot never leaves tokens stranded on-chain and never fabricates a close.

## ADDED Requirements

### Requirement: Every stop path closes all open positions

The bot SHALL close all open positions on every stop: user-requested stop, emergency stop, internal risk-breach stop, and process shutdown (SIGINT/SIGTERM). A stop SHALL always complete within a bounded deadline regardless of close outcomes; the bot MUST reach the Stopped state even if some closes fail.

#### Scenario: Normal user stop with open positions
- **WHEN** the user requests a graceful stop while positions are open
- **THEN** the bot closes every open position via an on-chain reverse swap (base token → USDC) and transitions to Stopped, reporting the aggregate outcome

#### Scenario: Emergency stop with open positions
- **WHEN** an emergency stop is triggered while positions are open
- **THEN** the bot attempts to close every open position with a best-effort deadline and STILL transitions to Stopped when the deadline expires, even if closes are incomplete

#### Scenario: Process receives SIGINT or SIGTERM
- **WHEN** the backend process receives SIGINT or SIGTERM
- **THEN** the bot engine's stop sequence (including close-all) runs before the process exits

#### Scenario: Stop completes within the deadline
- **WHEN** a stop is in progress and the close deadline is reached
- **THEN** the bot stops attempting new closes, marks remaining positions as timed-out, and transitions to Stopped without hanging

### Requirement: Position is closed only on confirmed chain truth

The bot SHALL consider a position closed only when the reverse swap's transaction has a confirmed on-chain signature. Simulated/engine state SHALL NOT be treated as evidence of closure. The position SHALL be removed from the reported open positions only after confirmation.

#### Scenario: Reverse swap confirms on-chain
- **WHEN** a close swap's transaction reaches a confirmed status and a signature is available
- **THEN** the position is marked closed, removed from open positions, and the close is persisted and reported with the transaction signature

#### Scenario: Close swap fails
- **WHEN** a close swap fails without a confirmed signature
- **THEN** the position remains on-chain and in the open positions, a close_failed warning is emitted, and the failure is included in the stop aggregate

#### Scenario: Close outcome is unknown after a race
- **WHEN** a close's send returned a signature but the confirmation timed out
- **THEN** the bot checks the signature's on-chain status before deciding: confirmed → closed; not found → failed; and it MUST NOT automatically retry an ambiguous attempt (no double-sell)

### Requirement: Stop sequence is safe against concurrent and in-flight activity

The bot SHALL drain in-flight order processing before closing positions and SHALL reject concurrent stop requests while a stop is already in progress. New entries MUST NOT start after a stop begins.

#### Scenario: Entry swap in flight when stop fires
- **WHEN** a stop begins while an entry swap is in flight
- **THEN** the in-flight entry is allowed to settle first, and no new entries begin after the stop starts

#### Scenario: Double-press of emergency stop
- **WHEN** a second stop request arrives while a stop is already in progress
- **THEN** the second request is rejected with a clear error and does not start a second close run

### Requirement: Close results are observable

The bot SHALL emit structured, machine-readable events for close progress and outcomes, each tagged with the same close-run identifier: close started, position closed (with signature), close failed (warning), and a final aggregate (total, closed, failed, timed out, failed symbols).

#### Scenario: Stop completes with mixed outcomes
- **WHEN** a stop finishes with some positions closed and some failed or timed out
- **THEN** the aggregate event reports total, closed, failed, timedOut, and the failed symbols so the operator knows exactly what remains on-chain

#### Scenario: Close failure surfaces to the operator
- **WHEN** a close fails during a stop
- **THEN** the operator receives a warning (existing notification channel) identifying the failed position, and the failure is visible on the status surface
