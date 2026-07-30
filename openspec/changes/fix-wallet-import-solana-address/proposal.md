## Why

When importing a wallet, the system displays a hex-encoded SHA-256 hash as the "public key" instead of a proper Solana address. Solana addresses are base58-encoded Ed25519 public keys (e.g., `5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1`). The current implementation uses a non-standard derivation that produces invalid addresses, making the wallet unusable for actual Solana transactions.

## What Changes

- Replace the SHA-256 based key derivation with proper Ed25519 keypair derivation using `@solana/web3.js`
- Use base58 encoding for public key display (standard Solana address format)
- Maintain backward compatibility with existing encrypted wallets (re-import required)

## Capabilities

### New Capabilities

- `wallet-solana-keypair`: Proper Ed25519 keypair derivation from BIP39 seed phrases using Solana's BIP44 derivation path

### Modified Capabilities

- `backend-api-server`: Wallet import endpoint returns proper Solana addresses

## Impact

- `src/trading/wallet/wallet-manager.ts` — `deriveKeypairFromSeed()` function
- `src/trading/wallet/wallet-manager.ts` — `EncryptedWallet.publicKey` field format
- Frontend wallet display will show valid Solana addresses
- Existing wallets need to be re-imported (old hex keys are invalid)

## Non-goals

- Full BIP39 mnemonic validation (current basic validation is sufficient)
- Hardware wallet integration
- Multi-account derivation (single account for now)
