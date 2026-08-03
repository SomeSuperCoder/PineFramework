## MODIFIED Requirements

### Requirement: Pair selection SHALL use dropdown
The manual pair selection SHALL use a `<select>` element with predefined trading pair options. Users SHALL NOT be able to enter arbitrary text. All pair options SHALL use USDC as the quote token.

#### Scenario: User selects pair from dropdown
- **WHEN** user is in manual selection mode
- **THEN** pair selection displays a dropdown with options: BTCUSDC, ETHUSDC, SOLUSDC, BNBUSDC, XRPUSDC, DOGEUSDC, ADAUSDC
- **AND** selected value is used as the trading pair
