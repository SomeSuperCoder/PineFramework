## 1. Backend: Fix importWallet to accept password

- [x] 1.1 Add `password?: string` parameter to `WalletManager.importWallet()` method signature
- [x] 1.2 Use `password || this.configPassphrase` when encrypting the seed phrase
- [x] 1.3 Update JSDoc to document the new parameter

## 2. Backend: Update set-password endpoint

- [x] 2.1 Pass `password` from request body to `wm.importWallet(seedPhrase, password)`
- [x] 2.2 Verify password is passed correctly (already validated at line 436-438)

## 3. Verify

- [x] 3.1 Run TypeScript build — no new errors
- [x] 3.2 Test: Import wallet with password, then unlock with same password — should succeed
