## ADDED Requirements

### Requirement: Wallet encryption at rest
The system SHALL encrypt the seed phrase using AES-256-GCM with a password-derived key before writing to disk.

#### Scenario: First-time password setup
- **WHEN** user imports a wallet for the first time and sets a password
- **THEN** the system derives a 256-bit key using PBKDF2 with 600,000 iterations and a random 16-byte salt, encrypts the seed phrase, and writes it to `data/wallet.enc`

#### Scenario: Password verification on unlock
- **WHEN** user enters a password to unlock the wallet
- **THEN** the system derives the key using the stored salt and the provided password, decrypts the ciphertext, and verifies the GCM auth tag
- **AND** if the auth tag verification fails, the system returns an error and does not expose the seed phrase

#### Scenario: Encrypted file format
- **WHEN** the wallet is persisted to disk
- **THEN** the file `data/wallet.enc` contains JSON with fields: `version`, `salt`, `iv`, `ciphertext`, `authTag`, `createdAt`, `updatedAt`

### Requirement: Password change
The system SHALL allow changing the password by re-encrypting the seed phrase with a new password.

#### Scenario: Successful password change
- **WHEN** user provides current password and new password
- **THEN** the system verifies the current password, re-encrypts the seed phrase with the new password, and updates the encrypted file

#### Scenario: Wrong current password
- **WHEN** user provides an incorrect current password
- **THEN** the system returns an error and the encrypted file is not modified

### Requirement: Wallet erasure on forgot password
The system SHALL delete the encrypted wallet file when the user chooses "Forgot Password".

#### Scenario: Forgot password flow
- **WHEN** user clicks "Forgot Password" and confirms
- **THEN** the system deletes `data/wallet.enc` and clears the in-memory wallet state
- **AND** all bot data (logs, metrics, trade history, settings) is preserved
