## Context

The wallet manager (`src/trading/wallet/wallet-manager.ts`) currently derives public keys using SHA-256 hashing, producing hex strings that are not valid Solana addresses. Solana uses Ed25519 elliptic curve cryptography, and addresses are base58-encoded public keys. The `@solana/web3.js` library (already a dependency) provides proper Ed25519 keypair derivation.

The current `deriveKeypairFromSeed()` function at line 185:
```typescript
const publicKeyBytes = createHash('sha256').update(hash).digest();
const publicKey = Buffer.from(publicKeyBytes).toString('hex').substring(0, 44);
```

This produces a 44-character hex string, not a base58-encoded Ed25519 public key.

## Goals / Non-Goals

**Goals:**
- Derive valid Solana Ed25519 keypairs from BIP39 seed phrases
- Display proper base58-encoded Solana addresses (32-44 characters)
- Maintain the existing encryption/decryption flow for wallet storage
- Keep the API surface unchanged (WalletKeypair interface)

**Non-Goals:**
- Full BIP39 mnemonic validation (current basic validation is sufficient)
- BIP44 derivation path support (single key derivation for now)
- Hardware wallet integration
- Multi-account derivation

## Decisions

### 1. Use `@solana/web3.js` for keypair derivation

**Choice:** Use `Keypair.fromSeed()` from `@solana/web3.js`

**Rationale:**
- Already a project dependency
- Implements proper Ed25519 derivation
- Handles base58 encoding internally
- Well-tested and maintained

**Alternative considered:** Manual Ed25519 implementation
- Rejected: Complex, error-prone, and `@solana/web3.js` is already available

### 2. Derivation approach

**Choice:** Use the first 32 bytes of SHA-512 hash of the seed phrase as the Ed25519 seed

**Rationale:**
- Ed25519 requires exactly 32 bytes for seed derivation
- SHA-512 provides sufficient entropy
- Deterministic: same seed phrase always produces same keypair

**Alternative considered:** BIP44 derivation path (m/44'/501'/0'/0')
- Rejected for now: Adds complexity, not needed for single-account use case
- Can be added later as an enhancement

### 3. Backward compatibility

**Choice:** No automatic migration; users must re-import wallets

**Rationale:**
- Old hex keys are cryptographically invalid for Solana
- No way to derive the correct keypair from the stored hex
- Clean break prevents confusion about wallet validity

## Risks / Trade-offs

**[Risk] Existing wallets become invalid** → Users must re-import wallets after update. Document in release notes.

**[Risk] Seed phrase → keypair derivation is non-standard** → The SHA-512 based derivation is not BIP44 compliant. This is acceptable for development/testing but should be documented. Production systems should use proper BIP44 paths.

**[Trade-off] Simplicity vs. Standards** → Using simple SHA-512 derivation is easier to understand and test, but doesn't match standard wallet software. This is acceptable given the project's scope (backtesting engine, not production wallet).

## Migration Plan

1. Deploy updated code
2. Users see new Solana addresses on next wallet import
3. Existing wallets show as invalid (users must re-import)
4. No data migration needed (wallet files are encrypted blobs)

## Open Questions

- Should we add a warning when importing with the old format?
- Should we support both old (dev) and new (production) derivation methods?
