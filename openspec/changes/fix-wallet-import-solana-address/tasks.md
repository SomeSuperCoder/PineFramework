## 1. Core Key Derivation

- [x] 1.1 Update `deriveKeypairFromSeed()` in `wallet-manager.ts` to use `Keypair.fromSeed()` from `@solana/web3.js`
- [x] 1.2 Ensure the seed is exactly 32 bytes (use SHA-512 hash of seed phrase, take first 32 bytes)
- [x] 1.3 Return base58-encoded public key via `keypair.publicKey.toBase58()`

## 2. Testing

- [x] 2.1 Add test for deterministic derivation (same seed → same address)
- [x] 2.2 Add test for valid base58 format (matches `[1-9A-HJ-NP-Za-km-z]{32,44}`)
- [x] 2.3 Add test for 12-word and 24-word seed phrases

## 3. Integration

- [x] 3.1 Verify frontend displays the new Solana address format
- [x] 3.2 Test wallet import flow end-to-end
