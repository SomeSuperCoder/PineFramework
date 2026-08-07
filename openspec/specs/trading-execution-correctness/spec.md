# trading-execution-correctness Specification

## Purpose
Guarantees the live DEX execution path sizes buy and sell orders correctly (whole-USDC buy inputs, decimal-correct token sells, consistent unit comparisons) and enforces the risk gate before every entry, so chaos-mode test runs produce valid, interpretable trades rather than dust-sized accidents.
## Requirements
### Requirement: Buy orders sized in USDC without price division
The system SHALL compute the buy input amount as `availableBalanceUsdc * positionFraction` (whole USDC), then convert to the smallest USDC unit (`* 1_000_000`). The input amount SHALL NOT be divided by the expected price, and SHALL NOT mix token-quantity units with USDC units.

#### Scenario: Buy sized correctly from balance
- **WHEN** available USDC balance is $1,000 and position fraction is 0.10
- **THEN** the buy input amount SHALL be 100 USDC expressed in micro-USDC (100_000_000 lamports)
- **AND** the amount SHALL NOT be divided by the asset price

### Requirement: Sell orders converted with token decimals
The system SHALL convert token quantity to the smallest token unit using the traded token's actual decimals (from the token registry, e.g. ETH/BTC=8, SOL=9) before submitting a sell. Fractional quantities SHALL NOT floor to zero.

#### Scenario: Fractional sell sends correct units
- **WHEN** a sell signal carries a token quantity of 0.02 ETH
- **THEN** the system SHALL submit a sell amount of `0.02 * 10^8 = 2_000_000` lamports
- **AND** the sell SHALL NOT submit zero lamports

### Requirement: Unit-consistent dust and balance guards
The dust guard and the insufficient-balance guard SHALL compare values in the same unit (both whole-USDC or both micro-USDC). A guard SHALL NOT compare a whole-USDC value against a micro-USDC value.

#### Scenario: Dust guard evaluates whole-USDC against threshold
- **WHEN** a buy signal's whole-USDC amount is below the minimum trade threshold
- **THEN** the system SHALL skip the trade and log `success: false`
- **AND** the comparison SHALL use consistent units

### Requirement: USDC mint resolves at runtime
The token registry SHALL include a USDC entry so that every module importing `USDC_MINT` (wallet, DEX adapters, spot trading, executor) receives the canonical mainnet USDC mint address at runtime. No import site SHALL receive `undefined`.

#### Scenario: Balance query uses resolved mint
- **WHEN** the executor calls the DEX balance query for USDC
- **THEN** the mint argument SHALL be the canonical `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **AND** the balance SHALL NOT default to zero due to an undefined mint

### Requirement: Chaos-mode buys use the chaos size fraction
The system SHALL size on-chain buy inputs for chaos-originated signals using the chaos signal's `sizeFraction` (always 0.1 = 10%), not the configured `positionSizePercent`. This ensures chaos mode never spends the full balance when `positionSizePercent` is unset (default 100).

#### Scenario: Chaos buy ignores positionSizePercent default
- **WHEN** a chaos-originated buy signal executes and `positionSizePercent` is unset
- **THEN** the buy input SHALL be 10% of available USDC balance
- **AND** the buy SHALL NOT be 100% of the balance

### Requirement: Risk gate enforced before every entry
The system SHALL call `riskManager.canEnterPosition()` at the start of execution for every buy signal, before fetching balance or constructing a quote. When it returns false, the system SHALL NOT place the order and SHALL return a blocked result.

#### Scenario: Entry blocked after daily loss breach
- **WHEN** the daily loss limit has been breached and a buy signal arrives
- **THEN** the system SHALL NOT submit a swap
- **AND** the system SHALL return `{ success: false, error: 'Entry blocked by risk controls' }`

#### Scenario: Entry allowed when risk is clear
- **WHEN** no risk limit is breached and a buy signal arrives
- **THEN** the system SHALL proceed with quote and swap execution normally

