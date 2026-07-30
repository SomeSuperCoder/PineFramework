## Context

The `WalletManager` class has two methods for storing wallets:
- `importWallet(seedPhrase)` — used by backend route, encrypts with `this.configPassphrase` (env var)
- A missing `importWallet(seedPhrase, password)` — what should exist, encrypts with user's password

The `set-password` endpoint receives the user's password but ignores it. This is a straightforward bugfix — the password parameter exists in the request but isn't passed through.

## Goals / Non-Goals

**Goals:**
- Fix `importWallet()` to accept an optional `password` parameter
- When `password` is provided, encrypt with it instead of `configPassphrase`
- Update `set-password` endpoint to pass the password through

**Non-Goals:**
- Migrating existing encrypted wallets (users must re-import)
- Changing the unlock flow (it's already correct — decrypt with user's password)

## Decisions

### Decision 1: Add `password` parameter to `importWallet()`

**Options:**
- A) Add `password` as second parameter after `confirmReplace`
- B) Add `password` as second parameter before `confirmReplace`
- C) Create separate `importWalletWithPassword()` method

**Choice: Option B** — Add `password` before `confirmReplace`:
```typescript
async importWallet(
  seedPhrase: string,
  password?: string,
  confirmReplace?: () => Promise<boolean>,
): Promise<string>
```

**Rationale:** `password` is the common case, `confirmReplace` is rare. Keeping password second makes the API cleaner for most callers. Existing callers pass `undefined` for password (no breaking change).

### Decision 2: Use user's password when provided, fall back to configPassphrase

```typescript
const passphrase = password || this.configPassphrase;
const encrypted = encryptSeedPhrase(seedPhrase, passphrase);
```

**Rationale:** Preserves backward compatibility — callers that don't pass password still work. Only affects explicit password use.

### Decision 3: Update configPassphrase after successful unlock

Already implemented in `unlock()`:
```typescript
this.configPassphrase = password;
```

This ensures subsequent operations use the user's password after first successful unlock.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Existing wallets encrypted with wrong passphrase | Document in release notes — users must remove and re-import |
| `password` parameter could be confused with `confirmReplace` | Clear parameter naming, JSDoc documentation |

## Migration Plan

1. Deploy fix
2. Users with existing wallets must:
   - Remove wallet (DELETE /api/bot/wallet)
   - Re-import with seed phrase + password
3. New imports work correctly immediately
