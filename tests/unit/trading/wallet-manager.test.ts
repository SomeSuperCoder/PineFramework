import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SensitiveData } from '../../../src/trading/wallet/sensitive-data.js';
import {
  validateSeedPhrase,
  encryptSeedPhrase,
  decryptSeedPhrase,
  deriveKeypairFromSeed,
  WalletManager,
  InMemoryWalletStorage,
  EncryptedFileStorage,
  isWalletEncrypted,
} from '../../../src/trading/wallet/wallet-manager.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// ---- SensitiveData Tests ----

describe('SensitiveData', () => {
  it('should wrap and retrieve a value', () => {
    const sd = new SensitiveData(Buffer.from('hello'));
    expect(sd.value.toString()).toBe('hello');
  });

  it('should zero-fill buffer on dispose', () => {
    const buf = Buffer.from('secret-data');
    const sd = new SensitiveData(buf);
    sd.dispose();
    expect(sd.isDisposed).toBe(true);
    // After dispose, buffer should be zeroed
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('should throw on access after dispose', () => {
    const sd = new SensitiveData(Buffer.from('test'));
    sd.dispose();
    expect(() => sd.value).toThrow('SensitiveData has been disposed');
  });

  it('should execute use() callback and auto-dispose', () => {
    const sd = SensitiveData.fromString('temporary');
    let result: string | undefined;
    sd.use((val) => {
      result = val.toString();
    });
    expect(result).toBe('temporary');
    expect(sd.isDisposed).toBe(true);
  });

  it('should auto-dispose even if callback throws', () => {
    const sd = SensitiveData.fromString('fail-case');
    expect(() =>
      sd.use(() => {
        throw new Error('oops');
      }),
    ).toThrow('oops');
    expect(sd.isDisposed).toBe(true);
  });

  it('should not include value in JSON serialization', () => {
    const sd = SensitiveData.fromString('hidden');
    const json = JSON.stringify(sd);
    expect(json).not.toContain('hidden');
    expect(json).toContain('__sensitive__');
  });

  it('should not include value in string representation', () => {
    const sd = SensitiveData.fromString('hidden');
    expect(sd.toString()).not.toContain('hidden');
    expect(sd.toString()).toBe('[SensitiveData]');
  });

  it('should create from string', () => {
    const sd = SensitiveData.fromString('test-seed-phrase');
    expect(sd.value.toString()).toBe('test-seed-phrase');
    sd.dispose();
  });

  it('should be idempotent on multiple dispose calls', () => {
    const sd = new SensitiveData(Buffer.from('data'));
    sd.dispose();
    sd.dispose(); // should not throw
    expect(sd.isDisposed).toBe(true);
  });
});

// ---- Seed Phrase Validation Tests ----

describe('validateSeedPhrase', () => {
  it('should accept a valid 12-word phrase', () => {
    const result = validateSeedPhrase(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    );
    expect(result.valid).toBe(true);
    expect(result.wordCount).toBe(12);
  });

  it('should accept a valid 24-word phrase', () => {
    const result = validateSeedPhrase(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art',
    );
    expect(result.valid).toBe(true);
    expect(result.wordCount).toBe(24);
  });

  it('should reject empty phrase', () => {
    const result = validateSeedPhrase('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should reject non-string input', () => {
    const result = validateSeedPhrase(null as unknown as string);
    expect(result.valid).toBe(false);
  });

  it('should reject 6-word phrase', () => {
    const result = validateSeedPhrase('one two three four five six');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('12 or 24');
  });

  it('should detect invalid word characters', () => {
    const result = validateSeedPhrase(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon $ymbol',
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid word');
  });

  it('should normalize case', () => {
    const result = validateSeedPhrase(
      'ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABOUT',
    );
    expect(result.valid).toBe(true);
    expect(result.wordCount).toBe(12);
  });
});

// ---- Encryption / Decryption Tests ----

describe('encryptSeedPhrase / decryptSeedPhrase', () => {
  const passphrase = 'test-passphrase-123';
  const seedPhrase =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('should encrypt and decrypt correctly', () => {
    const encrypted = encryptSeedPhrase(seedPhrase, passphrase);
    expect(encrypted.algorithm).toBe('aes-256-gcm');
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.salt).toBeTruthy();
    expect(encrypted.publicKey).toBeTruthy();
    expect(encrypted.createdAt).toBeGreaterThan(0);

    const decrypted = decryptSeedPhrase(encrypted, passphrase);
    expect(decrypted).toBe(seedPhrase);
  });

  it('should produce different ciphertexts for same input (random IV)', () => {
    const e1 = encryptSeedPhrase(seedPhrase, passphrase);
    const e2 = encryptSeedPhrase(seedPhrase, passphrase);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
    expect(e1.iv).not.toBe(e2.iv);
  });

  it('should fail to decrypt with wrong passphrase', () => {
    const encrypted = encryptSeedPhrase(seedPhrase, passphrase);
    expect(() => decryptSeedPhrase(encrypted, 'wrong-passphrase')).toThrow();
  });

  it('should detect tampered ciphertext (auth tag mismatch)', () => {
    const encrypted = encryptSeedPhrase(seedPhrase, passphrase);
    const tampered = { ...encrypted, ciphertext: '00' + encrypted.ciphertext.substring(2) };
    expect(() => decryptSeedPhrase(tampered, passphrase)).toThrow();
  });
});

// ---- Keypair Derivation Tests ----

describe('deriveKeypairFromSeed', () => {
  it('should produce deterministic keypair from same seed', () => {
    const seed =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const kp1 = deriveKeypairFromSeed(seed);
    const kp2 = deriveKeypairFromSeed(seed);
    expect(kp1.publicKey).toBe(kp2.publicKey);
    expect(kp1.privateKey).toEqual(kp2.privateKey);
  });

  it('should produce different keypairs from different seeds', () => {
    const kp1 = deriveKeypairFromSeed(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    );
    const kp2 = deriveKeypairFromSeed(
      'void become employ bridge adapt allow transfer hint mistake entry famous guitar',
    );
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });

  it('should return public key as valid base58 Solana address', () => {
    const kp = deriveKeypairFromSeed(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    );
    expect(typeof kp.publicKey).toBe('string');
    // Base58: 1-9, A-H, J-N, P-Z, a-k, m-z (no 0, O, I, l)
    expect(kp.publicKey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it('should return private key as Uint8Array of 64 bytes', () => {
    const kp = deriveKeypairFromSeed(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    );
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    // Ed25519 secretKey is 64 bytes (32 private + 32 public)
    expect(kp.privateKey.length).toBe(64);
  });

  it('should derive from 12-word seed phrase', () => {
    const kp = deriveKeypairFromSeed(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    );
    expect(kp.publicKey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it('should derive from 24-word seed phrase', () => {
    const kp = deriveKeypairFromSeed(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art',
    );
    expect(kp.publicKey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it('should produce correct address for known seed phrase (Phantom-compatible)', () => {
    // Standard BIP39 + ed25519-hd-key BIP44 m/44'/501'/0'/0' derivation
    // This matches Phantom, Solflare, and other standard Solana wallets
    const kp = deriveKeypairFromSeed(
      'describe myself immense snap scorpion basket main steel tree embody legend naive',
    );
    expect(kp.publicKey).toBe('8StSXbQycF2BXmDRUNEVCBnR5q7vHT3h62mhT6QSDQmt');
  });
});

// ---- WalletManager Tests ----

describe('WalletManager', () => {
  const passphrase = 'wallet-test-passphrase';
  const seedPhrase =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  let storage: InMemoryWalletStorage;
  let manager: WalletManager;

  beforeEach(() => {
    storage = new InMemoryWalletStorage();
    manager = new WalletManager(storage, passphrase);
  });

  it('should start with no wallet', async () => {
    expect(await manager.hasWallet()).toBe(false);
    expect(await manager.getPublicKey()).toBeNull();
  });

  it('should import a wallet from seed phrase', async () => {
    const publicKey = await manager.importWallet(seedPhrase);
    expect(publicKey).toBeTruthy();
    expect(typeof publicKey).toBe('string');
    expect(await manager.hasWallet()).toBe(true);
  });

  it('rejects import with a password that differs from the boot passphrase (passphrase parity guard)', async () => {
    await expect(
      manager.importWallet(seedPhrase, 'user-chosen-wallet-password'),
    ).rejects.toThrow(
      'Wallet import rejected: the wallet password must match the bot boot passphrase',
    );
    // A rejected import must NOT persist a wallet that throws on every boot decrypt.
    expect(await manager.hasWallet()).toBe(false);
  });

  it('accepts import with a password equal to the boot passphrase', async () => {
    const publicKey = await manager.importWallet(seedPhrase, passphrase);
    expect(publicKey).toBeTruthy();
    expect(await manager.hasWallet()).toBe(true);
    // Boot-time decrypt must succeed — no passphrase mismatch.
    const sd = await manager.getKeypair();
    expect(sd.value.publicKey).toBeTruthy();
    sd.dispose();
  });

  it('should get public key after import', async () => {
    await manager.importWallet(seedPhrase);
    const pk = await manager.getPublicKey();
    expect(pk).toBeTruthy();
  });

  it('should require confirmation to replace existing wallet', async () => {
    await manager.importWallet(seedPhrase);

    // Without confirmReplace callback, should throw
    await expect(
      manager.importWallet(
        'void become employ bridge adapt allow transfer hint mistake entry famous guitar',
      ),
    ).rejects.toThrow('confirmReplace');
  });

  it('should replace wallet when confirmed', async () => {
    await manager.importWallet(seedPhrase);

    const newSeed =
      'void become employ bridge adapt allow transfer hint mistake entry famous guitar';
    const publicKey = await manager.importWallet(newSeed, undefined, async () => true);
    expect(publicKey).toBeTruthy();
    expect(await manager.hasWallet()).toBe(true);
  });

  it('should not replace wallet when declined', async () => {
    await manager.importWallet(seedPhrase);
    const originalKey = await manager.getPublicKey();

    const newSeed =
      'void become employ bridge adapt allow transfer hint mistake entry famous guitar';
    await expect(manager.importWallet(newSeed, undefined, async () => false)).rejects.toThrow(
      'declined',
    );

    // Original wallet should still be intact
    expect(await manager.getPublicKey()).toBe(originalKey);
  });

  it('should get decryptable keypair from imported wallet', async () => {
    await manager.importWallet(seedPhrase);
    const sd = await manager.getKeypair();
    expect(sd.isDisposed).toBe(false);
    expect(sd.value.publicKey).toBeTruthy();
    // Ed25519 secretKey is 64 bytes (32 private + 32 public)
    expect(sd.value.privateKey.length).toBe(64);

    // Wipe after test
    sd.dispose();
  });

  it('should wipe in-memory keypair', async () => {
    await manager.importWallet(seedPhrase);
    const sd = await manager.getKeypair();
    expect(sd.isDisposed).toBe(false);

    manager.wipeKeypair();
    // The returned reference should now be disposed
    expect(sd.isDisposed).toBe(true);
  });

  it('should remove wallet on confirmation', async () => {
    await manager.importWallet(seedPhrase);
    expect(await manager.hasWallet()).toBe(true);

    await manager.removeWallet(async () => true);
    expect(await manager.hasWallet()).toBe(false);
  });

  it('should not remove wallet when declined', async () => {
    await manager.importWallet(seedPhrase);
    await expect(manager.removeWallet(async () => false)).rejects.toThrow('declined');
    expect(await manager.hasWallet()).toBe(true);
  });

  it('should track locked/unlocked state', async () => {
    expect(manager.isLocked()).toBe(true);
    await manager.importWallet(seedPhrase);
    expect(manager.isLocked()).toBe(false);
    manager.lock();
    expect(manager.isLocked()).toBe(true);
  });

  it('should unlock with correct password', async () => {
    await manager.importWallet(seedPhrase);
    manager.lock();
    expect(manager.isLocked()).toBe(true);

    const pk = await manager.unlock(passphrase);
    expect(pk).toBeTruthy();
    expect(manager.isLocked()).toBe(false);
  }, 15000); // PBKDF2 is slow

  it('should fail to unlock with wrong password', async () => {
    await manager.importWallet(seedPhrase);
    manager.lock();
    await expect(manager.unlock('wrong-password')).rejects.toThrow();
  }, 15000); // PBKDF2 is slow

  it('should change password successfully (same as boot passphrase)', async () => {
    await manager.importWallet(seedPhrase);
    const originalPk = await manager.getPublicKey();

    await manager.changePassword(passphrase, passphrase);
    expect(await manager.getPublicKey()).toBe(originalPk);

    // Should work with new password
    manager.lock();
    const pk = await manager.unlock(passphrase);
    expect(pk).toBeTruthy();
  }, 15000); // PBKDF2 is slow

  it('rejects password change to a value differing from the boot passphrase (passphrase parity guard)', async () => {
    await manager.importWallet(seedPhrase);
    await expect(manager.changePassword(passphrase, 'new-password-123')).rejects.toThrow(
      'Password change rejected: the wallet password must match the bot boot passphrase'
    );
  });

  it('should fail to change password with wrong current password', async () => {
    await manager.importWallet(seedPhrase);
    await expect(manager.changePassword('wrong-password', 'new-password-123')).rejects.toThrow();
  });

  it('should forget password and delete wallet', async () => {
    await manager.importWallet(seedPhrase);
    expect(await manager.hasWallet()).toBe(true);

    await manager.forgotPassword();
    expect(await manager.hasWallet()).toBe(false);
    expect(manager.isLocked()).toBe(true);
  });
});

// ---- EncryptedFileStorage Tests ----

describe('EncryptedFileStorage', () => {
  const testDir = path.join(tmpdir(), 'wallet-test-' + Date.now());
  let storage: EncryptedFileStorage;

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    storage = new EncryptedFileStorage(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should save and load wallet', async () => {
    const wallet = encryptSeedPhrase('test seed phrase', 'password123');
    await storage.save('default', wallet);
    const loaded = await storage.load('default');
    expect(loaded).toBeTruthy();
    expect(loaded?.publicKey).toBe(wallet.publicKey);
    expect(loaded?.ciphertext).toBe(wallet.ciphertext);
  });

  it('should return null for non-existent wallet', async () => {
    const loaded = await storage.load('default');
    expect(loaded).toBeNull();
  });

  it('should check existence correctly', async () => {
    expect(await storage.exists('default')).toBe(false);
    const wallet = encryptSeedPhrase('test seed', 'password');
    await storage.save('default', wallet);
    expect(await storage.exists('default')).toBe(true);
  });

  it('should delete wallet', async () => {
    const wallet = encryptSeedPhrase('test seed', 'password');
    await storage.save('default', wallet);
    expect(await storage.exists('default')).toBe(true);
    await storage.delete('default');
    expect(await storage.exists('default')).toBe(false);
  });

  it('should handle corrupted file gracefully', async () => {
    const wallet = encryptSeedPhrase('test seed', 'password');
    await storage.save('default', wallet);
    // Corrupt the file
    const fs = await import('node:fs/promises');
    await fs.writeFile(path.join(testDir, 'wallet.enc'), 'not valid json');
    const loaded = await storage.load('default');
    expect(loaded).toBeNull();
  });
});

// ---- isWalletEncrypted Tests ----

describe('isWalletEncrypted', () => {
  const testDir = path.join(tmpdir(), 'wallet-encrypted-test-' + Date.now());

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return false when no wallet file exists', () => {
    expect(isWalletEncrypted(testDir)).toBe(false);
  });

  it('should return true when wallet file exists', async () => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    const storage = new EncryptedFileStorage(testDir);
    const wallet = encryptSeedPhrase('test seed', 'password');
    await storage.save('default', wallet);
    expect(isWalletEncrypted(testDir)).toBe(true);
  });
});
