# changePassword can recreate wallet passphrase mismatch
**Date:** 2026-08-19
**Source:** Backend Engineer (flagged) + QA Engineer (non-blocking recommendation)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Guard `changePassword` (src/trading/wallet/wallet-manager.ts) the same way `importWallet` is now guarded: reject a new password that does not match the boot passphrase (WALLET_PASSPHRASE || default), so a runtime password change cannot re-create a boot-time decrypt mismatch on restart.

## Rationale
The import fix (2026-08-19) guarantees a wallet imported under the boot passphrase is always decryptable at boot. `changePassword` is a second path that can re-encrypt wallet.enc with a different passphrase, silently recreating the exact "Unsupported state or unable to authenticate data" failure on the next restart. Decrypt now fails loudly (specific message) and candles no longer die (soft fallback), but the divergence should be prevented at the source.

## Evidence
- src/trading/wallet/wallet-manager.ts importWallet guard L374-388 (new, matching boot passphrase)
- decryptSeedPhrase specific mismatch message L177-190 (new)
- changePassword path (wallet-manager.ts) — not guarded, out of scope of the 2026-08-19 fix
