## 1. Backend — Encrypted Storage

- [x] 1.1 Create `EncryptedFileStorage` class implementing `WalletStorage` interface — reads/writes `data/wallet.enc` as JSON (version, salt, iv, ciphertext, authTag, timestamps)
- [x] 1.2 Add password-based key derivation: `crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha512')` with random 16-byte salt
- [x] 1.3 Add AES-256-GCM encrypt/decrypt functions using Node.js `crypto` module
- [x] 1.4 Add `isWalletEncrypted()` static check — returns true if `data/wallet.enc` exists

## 2. Backend — Password API Endpoints

- [x] 2.1 Add `POST /bot/wallet/set-password` — accepts seedPhrase + password, encrypts and persists wallet, returns publicKey
- [x] 2.2 Add `POST /bot/wallet/unlock` — accepts password, decrypts wallet into memory, returns success/error
- [x] 2.3 Add `POST /bot/wallet/lock` — wipes decrypted keypair from memory, returns to locked state
- [x] 2.4 Add `POST /bot/wallet/forgot-password` — deletes `data/wallet.enc`, clears in-memory state, preserves bot data
- [x] 2.5 Add `POST /bot/wallet/change-password` — accepts current + new password, re-encrypts wallet
- [x] 2.6 Add `GET /bot/wallet/status` — returns `{ locked: boolean, hasWallet: boolean }` without exposing seed phrase

## 3. Backend — Integration

- [x] 3.1 Update `backend/src/index.ts` to use `EncryptedFileStorage` instead of `InMemoryWalletStorage` when `data/` directory exists
- [x] 3.2 Update `createBotRouter` to pass `getWalletManager` and add lock-gating middleware for trading endpoints (start, configure) when wallet is locked
- [x] 3.3 Add rate limiting to unlock endpoint (5 attempts per 60s per IP)

## 4. Frontend — Wallet Encryption UI

- [x] 4.1 Update `WalletImportPanel` to include password input field and "Set Password" step after seed phrase entry
- [x] 4.2 Add unlock screen component — shown when `GET /bot/wallet/status` returns `locked: true`
- [x] 4.3 Add "Lock Wallet" button to LiveDashboard header
- [x] 4.4 Add "Forgot Password" link on unlock screen with confirmation dialog
- [x] 4.5 Add password change form in wallet settings section

## 5. Frontend — Dashboard Integration

- [x] 5.1 Update `LiveDashboard` to check wallet status on mount and show locked state
- [x] 5.2 Disable trading controls (start/stop/configure) when wallet is locked
- [x] 5.3 Allow logs/metrics to display when wallet is locked
- [x] 5.4 Add lock icon indicator in dashboard header showing wallet state

## 6. Testing

- [x] 6.1 Add unit tests for `EncryptedFileStorage` — encrypt/decrypt round-trip, wrong password rejection, file corruption handling
- [x] 6.2 Add unit tests for password endpoints — set, unlock, lock, forgot, change flows
- [x] 6.3 Add integration test — full flow: import with password → lock → unlock → forgot password → re-import
