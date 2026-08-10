## Purpose

Exposes the sample Jupiter fees fetch (DEX swap fee in bps and SOL/USD price) through a lightweight backend endpoint so the backtest start panel can display real autofetched fee values when the user selects a trading pair — and the display appears only if and only if the prefetch feature is implemented (graceful absence otherwise).

## ADDED Requirements

### Requirement: Sample fees prefetch endpoint

The system SHALL expose a `GET /api/backtest/dex-fee?symbol=<SYMBOL>` endpoint that returns the sample DEX swap fee and SOL price for the given symbol. The response SHALL be the fee fetch result: `{ dexFeeBps: number, source: 'api' | 'cache' | 'in-memory-cache', dexLabel?: string, solPriceUsd?: number }`. The `symbol` query parameter SHALL be required, trimmed, and upper-cased; an empty or missing symbol SHALL be rejected with HTTP `400`.

#### Scenario: Valid symbol returns sample fees

- **WHEN** a client calls `GET /api/backtest/dex-fee?symbol=BTCUSDT`
- **THEN** the endpoint SHALL return HTTP `200` with a JSON body containing `dexFeeBps` (number), `source` (`api`, `cache`, or `in-memory-cache`), optional `dexLabel`, and optional `solPriceUsd`

#### Scenario: Unsupported symbol rejected

- **WHEN** a client calls `GET /api/backtest/dex-fee?symbol=NOPE`
- **THEN** the endpoint SHALL return HTTP `400` with an error body and SHALL NOT return fee data

#### Scenario: Missing symbol rejected

- **WHEN** a client calls `GET /api/backtest/dex-fee` without a `symbol` parameter
- **THEN** the endpoint SHALL return HTTP `400` with an error body

#### Scenario: Upstream total failure

- **WHEN** the Jupiter API and all caches fail to produce a fee for a valid symbol
- **THEN** the endpoint SHALL return HTTP `503` and SHALL NOT return fee data

#### Scenario: Feature not implemented

- **WHEN** the sample fees prefetch feature is not implemented in a given deployment
- **THEN** the endpoint route SHALL NOT exist and any request SHALL receive HTTP `404` (this 404 is the frontend gate's signal that the feature is absent)

### Requirement: Panel SHALL show sample fees on pair selection, gated on feature implementation

The backtest start panel SHALL display the sample fees fetch result when the user selects a trading pair, but ONLY when the prefetch feature is implemented. When the feature is absent, the panel SHALL NOT show the sample-fees card at all and SHALL NOT surface an error. When the feature is present, the panel SHALL fetch the sample fees for the selected symbol and display the DEX fee (with source badge and label when available) and the SOL price when available.

#### Scenario: Feature present — pair selection shows sample fees

- **WHEN** the user selects a trading pair and the sample fees endpoint responds HTTP `200`
- **THEN** the panel SHALL display the sample fees card showing the fetched `dexFeeBps`, its `source` badge (`api`/`cache`/`in-memory-cache`), `dexLabel` when present, and `solPriceUsd` when present

#### Scenario: Feature absent — card hidden

- **WHEN** the sample fees endpoint responds HTTP `404` (feature not implemented)
- **THEN** the panel SHALL render NO sample-fees card and SHALL NOT surface any error to the user

#### Scenario: Fetch failure — visible error with retry

- **WHEN** the sample fees endpoint responds HTTP `503` (or the request fails at the network level)
- **THEN** the panel SHALL show a visible error state on the sample-fees card with a retry action, and SHALL NOT block the backtest run

#### Scenario: SOL price unavailable

- **WHEN** the sample fees response omits `solPriceUsd`
- **THEN** the panel SHALL hide the SOL price line and SHALL still show the DEX fee data

#### Scenario: Loading state has no layout shift

- **WHEN** a sample fees request is in flight
- **THEN** the card SHALL render a skeleton loading state (no layout shift) with `aria-busy` set

### Requirement: Panel SHALL NOT accept manual dex swap fee or SOL price

The backtest start panel SHALL NOT expose manual inputs for dex swap fee (bps) or SOL price (USD). Those values SHALL be produced exclusively by the autofetch prefetch and shown read-only when available.

#### Scenario: No manual fee inputs rendered

- **WHEN** the backtest start panel renders its commission settings
- **THEN** no editable `dexFeeBps` or `solPriceUsd` input SHALL be present

#### Scenario: Run payload uses autofetched values

- **WHEN** a backtest is run with a Jupiter commission method
- **THEN** the server SHALL autofetch the DEX fee (existing behavior) and the panel SHALL NOT send user-entered fee overrides
