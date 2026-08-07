## ADDED Requirements

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
- **THEN** the executor SHALL skip the trade and log a warning
