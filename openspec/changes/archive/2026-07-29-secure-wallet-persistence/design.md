## Context

Currently, `WalletManager` stores the seed phrase in memory (`InMemoryWalletStorage`). Restarting the backend loses the wallet. The bot has no password protection — anyone with access to the server can import a wallet and trade.

The user wants:
1. Wallet seed phrase persisted to disk, encrypted with a password
2. Password gate on the dashboard — must unlock before trading
3. "Forgot Password" option that erases wallet but keeps bot data
4. Bot data (logs, metrics, settings) accessible without a wallet

## Goals / Non-Goals

**Goals:**
- Encrypt seed phrase at rest using AES-256-GCM with PBKDF2 key derivation
- Password set/unlock/forgot-password/change-password flows
- Dashboard shows locked state until wallet is decrypted
- Bot logs, metrics, trade history remain accessible without wallet
- "Forgot Password" erases wallet file, preserves all other data

**Non-Goals:**
- Hardware wallet integration (future)
- Multi-signature wallets
- Key rotation or Shamir secret sharing
- Two-factor authentication (future)

## Decisions

### Decision 1: AES-256-GCM with PBKDF2 for encryption

**Choice:** Use Node.js built-in `crypto` module: `crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha512')` for key derivation, then `crypto.createCipheriv('aes-256-gcm', key, iv)` for encryption.

**Rationale:**
- No external dependencies — Node.js native crypto
- PBKDF2 with 600,000 iterations matches OWASP 2023 recommendations
- AES-256-GCM provides authenticated encryption (tamper detection)
- Salt stored alongside ciphertext (unique per wallet)
- IV (nonce) generated randomly per encryption operation

**Alternatives considered:**
- bcrypt: Not designed for key derivation, slower than PBKDF2 for this use case
- argon2: Requires native addon, adds dependency
- scrypt: Less standardized than PBKDF2

### Decision 2: Encrypted file format

**Choice:** Single JSON file at `data/wallet.enc` containing:
```json
{
  "version": 1,
  "salt": "<hex>",
  "iv": "<hex>",
  "ciphertext": "<hex>",
  "authTag": "<hex>",
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

**Rationale:**
- JSON is human-readable for debugging (no binary format)
- Version field allows future migration
- Auth tag from GCM mode stored for decryption verification
- Salt, IV, ciphertext all needed for decryption — stored together

**Alternatives considered:**
- SQLite database: Overkill for a single encrypted blob
- Raw binary file: Harder to debug, no versioning

### Decision 3: Backend-only encryption

**Choice:** Encryption and decryption happen entirely on the backend. The frontend never sees the seed phrase in plaintext after initial import. The password is sent over HTTP POST, validated server-side.

**Rationale:**
- Seed phrase never touches browser storage
- Password only transmitted once (on unlock/set)
- Backend can rate-limit unlock attempts
- Simpler frontend — just password input fields

**Alternatives considered:**
- Client-side encryption: Would require sending password to frontend, browser crypto API complexity
- Hybrid: Client encrypts, server stores — adds complexity without security benefit

### Decision 4: Password gate on frontend

**Choice:** When wallet is encrypted and not unlocked, `LiveDashboard` shows an unlock screen. The bot REST API returns 401 for wallet-dependent endpoints until unlocked. Frontend polls `/api/bot/wallet/status` to know if locked.

**Rationale:**
- Simple UX: user enters password, dashboard unlocks
- Backend enforces lock — frontend can't bypass
- Status endpoint lets frontend show lock state without exposing wallet

**Alternatives considered:**
- JWT token after unlock: Adds token management complexity
- Session-based auth: Overkill for single-user local bot

## Risks / Trade-offs

- **[Password brute-force]** PBKDF2 with 600K iterations makes each attempt ~100ms, limiting offline attacks. **Mitigation:** Rate-limit unlock API to 5 attempts/minute.
- **[Forgot Password = wallet loss]** User loses access to wallet if they forget password. **Mitigation:** Clear warning in UI; bot data preserved; user can re-import with seed phrase.
- **[No password recovery]** There's no recovery mechanism by design (can't decrypt without password). **Mitigation:** User must remember password or re-import seed phrase.
- **[InMemoryWalletStorage replacement]** Current `WalletManager` uses `InMemoryWalletStorage`. Must swap to `EncryptedFileStorage`. **Mitigation:** Same interface, drop-in replacement.
