# world-capital-allocation — Spec Delta

## ADDED Requirements

### Requirement: PnL-weighted capital distribution
Live capital in USDC SHALL be divided among selected worlds proportionally to each world's PnL weight (PnL_i / ΣPnL). The sum of allocated amounts SHALL equal the total capital (within rounding dust ≤ smallest USDC unit per world).

#### Scenario: example split
- **GIVEN** 3 worlds with PnL +2%, +3%, +5% and capital of 20 USDC
- **WHEN** allocation is computed
- **THEN** allocations are 4 / 6 / 10 USDC respectively

#### Scenario: rounding dust
- **WHEN** weights do not divide evenly into whole units
- **THEN** every world receives its proportional share within one smallest unit and the residual is assigned deterministically (largest-weight world last)

### Requirement: per-world sizing enforcement
Each world's position sizing SHALL use only its allocated capital slice; one world's positions or losses SHALL NOT draw on another world's allocation.

#### Scenario: isolated sizing
- **GIVEN** world A allocated 4 USDC and world B allocated 6 USDC
- **WHEN** both open positions simultaneously
- **THEN** A sizes against 4 USDC and B against 6 USDC
