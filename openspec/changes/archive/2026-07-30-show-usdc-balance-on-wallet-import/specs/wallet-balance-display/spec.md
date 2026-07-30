## ADDED Requirements

### Requirement: Display USDC balance after wallet import
The frontend SHALL fetch and display the USDC balance immediately after a wallet is imported.

#### Scenario: Balance displayed after import
- **WHEN** a wallet is successfully imported
- **THEN** the frontend fetches USDC balance from the backend
- **AND** displays the balance in the wallet status area (e.g., "USDC: 1,234.56")

#### Scenario: Loading state during fetch
- **WHEN** the balance is being fetched
- **THEN** the frontend shows a loading indicator (e.g., "Loading balance...")

#### Scenario: Fetch failure
- **WHEN** the balance fetch fails
- **THEN** the frontend shows the public key without balance
- **AND** does not block the import flow

#### Scenario: Balance shown with truncated address
- **WHEN** the wallet is imported and balance is loaded
- **THEN** the UI shows both the truncated address and the USDC balance
