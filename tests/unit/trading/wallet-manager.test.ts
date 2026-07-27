import { describe, it, expect, beforeEach } from 'vitest';
import { SensitiveData } from '../../../src/trading/wallet/sensitive-data.js';
import {
  validateSeedPhrase,
  encryptSeedPhrase,
  decryptSeedPhrase,
  deriveKeypairFromSeed,
  WalletManager,
  InMemoryWalletStorage,
} from '../../../src/trading/wallet/wallet-manager.js';

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
    const result = validateSeedPhrase('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    expect(result.valid).toBe(true);
    expect(result.wordCount).toBe(12);
  });

  it('should accept a valid 24-word phrase', () => {
    const result = validateSeedPhrase(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'
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
    const result = validateSeedPhrase('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon $ymbol');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid word');
  });

  it('should normalize case', () => {
    const result = validateSeedPhrase('ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABOUT');
    expect(result.valid).toBe(true);
    expect(result.wordCount).toBe(12);
  });
});

// ---- Encryption / Decryption Tests ----

describe('encryptSeedPhrase / decryptSeedPhrase', () => {
  const passphrase = 'test-passphrase-123';
  const seedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

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
    const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const kp1 = deriveKeypairFromSeed(seed);
    const kp2 = deriveKeypairFromSeed(seed);
    expect(kp1.publicKey).toBe(kp2.publicKey);
    expect(kp1.privateKey).toEqual(kp2.privateKey);
  });

  it('should produce different keypairs from different seeds', () => {
    const kp1 = deriveKeypairFromSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    const kp2 = deriveKeypairFromSeed('void become employ bridge adapt allow transfer hint mistake entry famous guitar');
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });

  it('should return public key as a string', () => {
    const kp = deriveKeypairFromSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    expect(typeof kp.publicKey).toBe('string');
    expect(kp.publicKey.length).toBeGreaterThan(0);
  });

  it('should return private key as Uint8Array', () => {
    const kp = deriveKeypairFromSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey.length).toBe(32);
  });
});

// ---- WalletManager Tests ----

describe('WalletManager', () => {
  const passphrase = 'wallet-test-passphrase';
  const seedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
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

  it('should get public key after import', async () => {
    await manager.importWallet(seedPhrase);
    const pk = await manager.getPublicKey();
    expect(pk).toBeTruthy();
  });

  it('should require confirmation to replace existing wallet', async () => {
    await manager.importWallet(seedPhrase);

    // Without confirmReplace callback, should throw
    await expect(
      manager.importWallet('void become employ bridge adapt allow transfer hint mistake entry famous guitar'),
    ).rejects.toThrow('confirmReplace');
  });

  it('should replace wallet when confirmed', async () => {
    await manager.importWallet(seedPhrase);

    const newSeed = 'void become employ bridge adapt allow transfer hint mistake entry famous guitar';
    const publicKey = await manager.importWallet(newSeed, async () => true);
    expect(publicKey).toBeTruthy();
    expect(await manager.hasWallet()).toBe(true);
  });

  it('should not replace wallet when declined', async () => {
    await manager.importWallet(seedPhrase);
    const originalKey = await manager.getPublicKey();

    const newSeed = 'void become employ bridge adapt allow transfer hint mistake entry famous guitar';
    await expect(
      manager.importWallet(newSeed, async () => false),
    ).rejects.toThrow('declined');

    // Original wallet should still be intact
    expect(await manager.getPublicKey()).toBe(originalKey);
  });

  it('should get decryptable keypair from imported wallet', async () => {
    await manager.importWallet(seedPhrase);
    const sd = await manager.getKeypair();
    expect(sd.isDisposed).toBe(false);
    expect(sd.value.publicKey).toBeTruthy();
    expect(sd.value.privateKey.length).toBe(32);

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
});
