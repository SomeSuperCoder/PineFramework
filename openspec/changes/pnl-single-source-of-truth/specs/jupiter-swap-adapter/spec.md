# jupiter-swap-adapter Delta Spec

## MODIFIED Requirements

### Requirement: Quote response preserves routePlan array
The adapter SHALL preserve the `routePlan` array from Jupiter API responses without converting it to a string or other format.

#### Scenario: Quote returns routePlan array
- **WHEN** a quote request is made to Jupiter API
- **THEN** the response SHALL include the original `routePlan` array as received from Jupiter

#### Scenario: RoutePlan is passed to swap request
- **WHEN** a swap request is made using a quote response
- **THEN** the `routePlan` array SHALL be sent exactly as received from Jupiter (not converted)

### Requirement: Network configuration respects environment variable
The adapter SHALL use the `SOLANA_NETWORK` environment variable to determine the target network, defaulting to `mainnet-beta` when not set.

#### Scenario: Environment variable is set
- **WHEN** `SOLANA_NETWORK` environment variable is set to a valid Solana network
- **THEN** the adapter SHALL connect to that network

#### Scenario: Environment variable is not set
- **WHEN** `SOLANA_NETWORK` environment variable is not set
- **THEN** the adapter SHALL default to `mainnet-beta` and log the network being used

### Requirement: Swap amount reflects real wallet balance
The executor SHALL calculate swap amounts based on the actual wallet balance, not the simulated chaos mode capital.

#### Scenario: Chaos mode uses real balance
- **WHEN** chaos mode executes a signal
- **THEN** the swap amount SHALL be calculated as `(realBalance * 0.1) / price` (10% of actual balance)

#### Scenario: Insufficient balance handling
- **WHEN** the calculated swap amount is below minimum trade size (e.g., < 1 USDC)
- **THEN** the adapter SHALL skip the trade and log a warning

### Requirement: Swap result captures real fee total
The adapter SHALL capture the total fee cost of a Jupiter swap from the REAL response data, using the shared `pnl-calculation` fee taxonomy. It SHALL capture: the per-route-plan-leg venue fees (`routePlan[].swapInfo.feeAmount`/`feeMint`), the platform fee (`platformFee.amount`), the actual priority fee (`prioritizationFeeLamports` echoed by the swap response), and the Solana base fee (5,000 lamports × signatures). When the swap response does not expose a fee value, the adapter SHALL return the fee components that ARE observable plus a completeness flag rather than fabricating a zero or a fixed basis-point estimate.

#### Scenario: Swap returns per-leg venue fees
- **WHEN** a successful swap response includes `routePlan[].swapInfo.feeAmount`/`feeMint`
- **THEN** the adapter SHALL accumulate these venue fee components into the canonical fee breakdown

#### Scenario: Swap returns actual priority fee
- **WHEN** a successful swap response echoes `prioritizationFeeLamports`
- **THEN** the adapter SHALL record that value as the PRIORITY fee component (not a predicted value)

#### Scenario: Platform fee captured when present
- **WHEN** the quote or swap response includes a non-zero `platformFee`
- **THEN** the adapter SHALL record it as PLATFORM fee component; when absent or zero, no platform fee is recorded

#### Scenario: Internal fee fields never fabricated
- **WHEN** a swap executes but the response does not contain fee data
- **THEN** the adapter SHALL NOT return a hardcoded fee value (e.g. `fee: '0'` or `inAmount × 5/10000`); it SHALL mark the fee as unknown and return empty fee components