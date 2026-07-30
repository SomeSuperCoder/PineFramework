## Why

The imported wallet is currently stored in memory only — restarting the backend loses it. Users must re-import their seed phrase every time. This is frustrating for a production trading bot that should persist its configuration across restarts.

Additionally, the seed phrase is sensitive. Storing it unencrypted on disk is a security risk — anyone with filesystem access could steal the wallet. The bot needs password-protected encryption so the seed phrase is only accessible to the authorized user.

## What Changes

- **Persist wallet seed phrase** encrypted with a user-chosen password using AES-256-GCM
- **Add password unlock flow**: on startup, the bot presents a locked screen; user enters password to decrypt and load the wallet
- **Add "Forgot Password" flow**: erases the encrypted wallet file but preserves all bot data (logs, metrics, trade history, settings)
- **Decouple wallet from bot data**: bot logs, metrics, configuration, and trade history remain accessible without a wallet — only live trading requires the decrypted wallet
- **Add password change flow**: requires current password, then re-encrypts with new password

## Capabilities

### New Capabilities
- `wallet-encryption`: AES-256-GCM encryption of seed phrase at rest, password-based key derivation (PBKDF2)
- `password-gate`: Unlock/lock screen on the frontend, password set/unlock/forgot-password flows

### Modified Capabilities
- `wallet-import`: Seed phrase import now encrypts and persists to disk instead of storing in memory
- `bot-dashboard`: Dashboard shows locked state when wallet is encrypted; wallet panel shows encryption status

## Impact

- **Backend**: `WalletManager` class changes — persistent encrypted storage, password verification, key derivation
- **Backend**: New API endpoints for password management (`/api/bot/wallet/lock`, `/api/bot/wallet/unlock`, `/api/bot/wallet/forgot-password`, `/api/bot/wallet/change-password`)
- **Frontend**: `WalletImportPanel` adds password set/unlock UI; `LiveDashboard` shows locked state
- **Storage**: New encrypted wallet file at `data/wallet.enc` (replaces in-memory-only storage)
- **Security**: No plaintext seed phrase on disk at any time; PBKDF2 with 600,000 iterations for key derivation
