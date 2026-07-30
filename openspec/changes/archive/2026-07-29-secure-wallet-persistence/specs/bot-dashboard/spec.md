## MODIFIED Requirements

### Requirement: Live dashboard displays bot state
The LiveDashboard SHALL show the current bot state including a locked/unlocked status indicator.

#### Scenario: Dashboard in locked state
- **WHEN** the wallet is encrypted and not unlocked
- **THEN** the dashboard displays a lock icon and unlock prompt
- **AND** shows bot logs and metrics if available
- **AND** trading controls are disabled

#### Scenario: Dashboard after unlock
- **WHEN** the user successfully unlocks the wallet
- **THEN** the dashboard transitions to the normal idle/running state
- **AND** trading controls become enabled

#### Scenario: Lock button
- **WHEN** user clicks "Lock Wallet" button in the dashboard
- **THEN** the system clears the decrypted wallet from memory
- **AND** the dashboard returns to the locked state
- **AND** bot logs and metrics remain visible
