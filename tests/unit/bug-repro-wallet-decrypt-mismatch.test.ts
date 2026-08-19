/**
 * BUG HUNTER REPRO — root cause of "real strategy signals never executed".
 *
 * PROVEN CHAIN (logs + code):
 *   processCandle (live-strategy-executor.ts:499)
 *     -> fetchUsdcBalance (L1105: walletManager.getKeypair())
 *       -> decryptSeedPhrase (wallet-manager.ts:380, L169 decipher.final())
 *         -> THROWS wallet passphrase mismatch (operator message — now loud + actionable)
 *   -> Scheduler.tick catch (scheduler.ts:228-246) -> candle-error -> NO bars run
 *
 * This repro proves the AES-256-GCM auth-tag failure when the WalletManager
 * passphrase does NOT match the passphrase used at importWallet time —
 * production wiring: import can use a custom `password` (bot.ts:847) while
 * WalletManager is constructed with process.env.WALLET_PASSPHRASE ||
 * 'pine-default-passphrase' (index.ts:372).
 */
import { describe, expect, it } from 'vitest';
import {
  encryptSeedPhrase,
  decryptSeedPhrase,
} from '../../src/trading/wallet/wallet-manager.js';

const SEED =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('BUG REPRO: strategy never executes — wallet decrypt passphrase mismatch', () => {
  it('decrypting with the bot default passphrase throws the wallet passphrase mismatch message', () => {
    // Production import with a CUSTOM wallet password (bot.ts:847 passes `password` from the request).
    const encrypted = encryptSeedPhrase(SEED, 'user-chosen-wallet-password');

    // Production WalletManager constructed with the DEFAULT passphrase (index.ts:372).
    expect(() => decryptSeedPhrase(encrypted, 'pine-default-passphrase')).toThrowError(
      'wallet passphrase mismatch: the boot passphrase does not match the one used at import — set WALLET_PASSPHRASE or re-import the wallet with the boot passphrase',
    );
  });

  it('same passphrase decrypts fine (control) — proving the failure is passphrase mismatch, not corruption', () => {
    const encrypted = encryptSeedPhrase(SEED, 'pine-default-passphrase');
    expect(decryptSeedPhrase(encrypted, 'pine-default-passphrase')).toBe(SEED);
  });
});