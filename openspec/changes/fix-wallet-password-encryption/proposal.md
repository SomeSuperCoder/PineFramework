## Why

The wallet import flow has a critical bug where the user's password is ignored during encryption. When a user imports a wallet with a password, the backend encrypts the seed phrase using the server's `WALLET_PASSPHRASE` environment variable instead of the user's password. This means:

1. The user's password is never used for encryption
2. The wallet can only be unlocked with the env var passphrase (not the user's password)
3. All existing wallets imported through the UI are encrypted with the wrong passphrase

## What Changes

- Fix the `POST /bot/wallet/set-password` endpoint to pass the user's password to `importWallet()`
- Add a `password` parameter to `WalletManager.importWallet()` method
- Update `importWallet()` to encrypt with the user's password instead of `this.configPassphrase`
- **BREAKING**: Existing wallets encrypted with the env var passphrase will need to be re-imported with the correct password

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — this is a bugfix, not a behavior change)

## Impact

- **Files affected**:
  - `backend/src/routes/bot.ts` — `set-password` endpoint (line 451)
  - `src/trading/wallet/wallet-manager.ts` — `importWallet()` method
- **API affected**: `POST /bot/wallet/set-password` (same contract, different behavior)
- **Data**: Existing wallets may be encrypted with wrong passphrase — users need to remove and re-import
