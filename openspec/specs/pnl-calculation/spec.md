# pnl-calculation Specification

## Purpose

The single, authoritative PnL and fee mathematics used by every subsystem — the live trading bot, the backtest engine, trade-history, and statistics dashboards — so that live and backtest PnL derive from one implementation and every commission (Jupiter-aggregator venue fees, platform fee, Solana base + priority fees, Jito tips) is counted exactly once.

## Requirements

### Requirement: Single PnL math implementation

The system SHALL provide one implementation of realized PnL and fee aggregation — a pure arithmetic module — that is the ONLY code path used to compute gross PnL, total fees, and net PnL for both live trades and backtest trades. No other subsystem SHALL compute PnL or fee totals with its own arithmetic. The module SHALL operate entirely on decimal strings (fixed-point representation) and SHALL never use floating-point arithmetic.

#### Scenario: Same math for live and backtest
- **WHEN** a trade with identical entry, exit, and quantity is evaluated through the live path and the backtest path
- **THEN** both SHALL produce identical gross PnL because both call the same module function

#### Scenario: No duplicate arithmetic
- **WHEN** any code outside the PnL module computes a PnL or fee total
- **THEN** the codebase SHALL fail the PnL contract test gate, which detects new arithmetic outside the module

### Requirement: Gross PnL derived from executed values

The module SHALL derive gross PnL from actual executed values — the in/out amounts of a swap or the executed fill prices — never from a separate "ideal" price. Gross PnL SHALL equal `(exitValue − entryValue)` for longs and `(entryValue − exitValue)` for shorts, scaled by quantity.

#### Scenario: Long trade gross
- **WHEN** a long position of quantity `q` is entered at `entry` and exited at `exit`
- **THEN** gross PnL SHALL be `(exit − entry) × q`

#### Scenario: Short trade gross
- **WHEN** a short position of quantity `q` is entered at `entry` and exited at `exit`
- **THEN** gross PnL SHALL be `(entry − exit) × q`

### Requirement: Fee total counts every commission layer

The module SHALL model the complete fee taxonomy: `VENUE` (per-route-leg DEX swap fees as reported by the aggregator), `PLATFORM` (Jupiter platform/integrator fee), `PRIORITY` (Solana priority fee lamports), `BASE` (Solana base fee of 5,000 lamports per signature), `JITO` (Jito tip when used), and `SLIPPAGE_MEMO` (informational only). The fee total SHALL be the sum of every fee component present in the canonical fee breakdown, converted to one unit via a single price boundary.

#### Scenario: All layers summed
- **WHEN** a realized trade carries venue, platform, priority, and base fee components
- **THEN** total fees SHALL equal the sum of those components converted to a single quote unit

#### Scenario: Zero-fee trade
- **WHEN** a trade has no fee components
- **THEN** total fees SHALL be `0` and net PnL SHALL equal gross PnL

### Requirement: The outAmount anchor rule

Hosted in the module, the outAmount anchor rule SHALL treat Jupiter's `outAmount` as already including venue fees and platform fees. The module SHALL NOT subtract venue or platform fees a second time from a gross value derived from `outAmount`; those components are breakout-for-reporting only, and only the SOL-side fees outside `outAmount` (priority, base, Jito) SHALL be subtracted.

#### Scenario: No double counting of venue and platform fees
- **WHEN** net PnL is computed from an outAmount-anchored gross and the breakdown includes VENUE and PLATFORM components
- **THEN** adding or removing those components SHALL NOT change net PnL (their only effect is the fee breakdown display)

#### Scenario: SOL-side fees reduce net
- **WHEN** the breakdown includes PRIORITY, BASE, or JITO components
- **THEN** those SHALL reduce net PnL by exactly their converted value

### Requirement: Net PnL identity

The module SHALL guarantee the identity `net = gross − totalFees` for every result, and SHALL report gross, totalFees, and net as separate fields so consumers never re-derive the identity themselves.

#### Scenario: Identity holds
- **WHEN** any realized PnL result is produced
- **THEN** `net` SHALL equal `gross − totalFees` exactly

#### Scenario: Fees exceed gross
- **WHEN** total fees exceed gross PnL on a losing trade
- **THEN** the module SHALL still produce a correct negative net value (fees can bankrupt a marginal winner)

### Requirement: Slippage is informational, not a fee

The module SHALL treat slippage as a derived memo (expected-vs-executed gap), never as a subtracted fee, to avoid double-counting a cost already embedded in executed values.

#### Scenario: Slippage memo only
- **WHEN** a slippage value is supplied to the module
- **THEN** it SHALL be emitted as a breakdown memo label or a separate `slippageMemo` field, limited to `net` unchanged

### Requirement: Fee provenance is labeled

Every fee breakdown SHALL carry provenance: `observed` (parsed from a real Jupiter quote/swap response or on-chain data) or `modeled` (backtest fee model). A backtest fee model SHALL have a `backtestFeeModel` tag identifying the model (`constant-tier` | `flat-bps` | `quote`) so results are comparable. Provenance SHALL be metadata, never arithmetic.

#### Scenario: Live fees labeled observed
- **WHEN** the adapter captures fees from a live Jupiter response
- **THEN** the breakdown SHALL be labeled `observed`

#### Scenario: Backtest fees labeled modeled
- **WHEN** a backtest supplies fees from a configured model
- **THEN** the breakdown SHALL be labeled `modeled` and carry the `backtestFeeModel` tag

### Requirement: Fee completeness honesty

The system SHALL never present an unknown fee as zero truth. When the on-chain fee of a trade is not observable, the trade SHALL be flagged `feesUnknown` and the module SHALL not invent a fee total to fill the gap.

#### Scenario: Unknown fee flagged
- **WHEN** a live close cannot observe the swap fee
- **THEN** the fee total is marked `feesUnknown`, zero is not persisted as a truthful fee, and the breakdown records `feeUnknown: true`

### Requirement: Single quantity conversion boundary

All fee components that arrive in native or atomic units (lamports, token feeAmount) SHALL be converted to a single quote unit through one module boundary (`feeToQuote`) using a consistent price map. No other code SHALL multiply or divide by price to convert fees.

#### Scenario: Fee converted at one boundary
- **WHEN** a fee component in lamports or atomic token units is part of a PnL calculation
- **THEN** the conversion to quote SHALL happen in the module's dedicated conversion function, and no other subsystem SHALL perform price-based conversions for fees

### Requirement: Backtest modeled fee input

The module SHALL accept a modeled fee input for backtests: configured venue bps (or flat bps), platform bps, priority lamports, base lamports (default 5,000 per signature), and record the model's SOL price basis. The module SHALL NOT hardcode a SOL/USD price; the model provides it.

#### Scenario: Backtest fee model drives fees
- **WHEN** a backtest run supplies a fee model
- **THEN** total fees are derived from the model's configured rates and price basis, replacing any hardcoded network fee constant

#### Scenario: Model tag persisted
- **WHEN** a backtest completes
- **THEN** the result SHALL include the `backtestFeeModel` tag so the run's fee assumptions are auditable