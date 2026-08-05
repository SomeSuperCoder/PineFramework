/**
 * WalletManager — secure Solana wallet lifecycle.
 *
 * Responsibilities:
 * - Import and validate BIP39 seed phrases (12 or 24 words)
 * - Derive Solana keypair from seed phrase
 * - Encrypt wallet at rest using AES-256-GCM
 * - Decrypt into memory only when needed, then wipe
 * - Enforce confirmation before replacing an existing wallet
 *
 * @module trading
 */

import { createHash, randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Keypair } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import { SensitiveData } from './sensitive-data.js';

// ---- Types ----

export interface EncryptedWallet {
  /** Encryption algorithm used. */
  algorithm: 'aes-256-gcm';
  /** Initialization vector (hex). */
  iv: string;
  /** Authentication tag (hex). */
  authTag: string;
  /** Ciphertext (hex). */
  ciphertext: string;
  /** Salt used for key derivation (hex). */
  salt: string;
  /** Public key derived from the seed phrase (for identification). */
  publicKey: string;
  /** When this wallet was created. */
  createdAt: number;
  /** When this wallet was last updated. */
  updatedAt: number;
}

export interface WalletKeypair {
  publicKey: string;
  privateKey: Uint8Array;
}

// ---- Constants ----

const KEY_ITERATIONS = 600_000;
const KEY_LENGTH = 32; // 256-bit
const IV_LENGTH = 16; // 128-bit
const SALT_LENGTH = 32;

// BIP39 English wordlist is 2048 words. We validate against a minimal set of
// known valid BIP39 words. For full BIP39 compliance we'd need the full wordlist,
// but for practical purposes we validate structure: 12 or 24 space-separated words.
const VALID_WORD_COUNTS = new Set([12, 24]);
// Must be lowercase a-z, 2-8 characters
const WORD_PATTERN = /^[a-z]{2,8}$/;

// ---- Seed Phrase Validation ----

export interface SeedPhraseValidation {
  valid: boolean;
  error?: string;
  wordCount?: number;
}

/**
 * Validate a BIP39 seed phrase (basic structural validation).
 */
export function validateSeedPhrase(phrase: string): SeedPhraseValidation {
  if (!phrase || typeof phrase !== 'string') {
    return { valid: false, error: 'Seed phrase must be a non-empty string' };
  }

  const trimmed = phrase.trim().toLowerCase();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Seed phrase is empty' };
  }

  const words = trimmed.split(/\s+/);

  if (!VALID_WORD_COUNTS.has(words.length)) {
    return {
      valid: false,
      error: `Seed phrase must have 12 or 24 words, got ${words.length}`,
      wordCount: words.length,
    };
  }

  // Basic word validation
  for (const word of words) {
    if (!WORD_PATTERN.test(word)) {
      return {
        valid: false,
        error: `Invalid word in seed phrase: "${word}"`,
        wordCount: words.length,
      };
    }
  }

  return { valid: true, wordCount: words.length };
}

// ---- Key Derivation ----

/**
 * Derive an encryption key from a passphrase and salt using PBKDF2.
 * Uses 600,000 iterations with SHA-512 per OWASP 2023 recommendations.
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, KEY_ITERATIONS, KEY_LENGTH, 'sha512');
}

// ---- Encryption / Decryption ----

/**
 * Encrypt seed phrase bytes using AES-256-GCM.
 * Uses PBKDF2-derived key from a config passphrase.
 */
export function encryptSeedPhrase(
  seedPhrase: string,
  passphrase: string,
  publicKeyOverride?: string,
): EncryptedWallet {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(passphrase, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(seedPhrase, 'utf-8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Use override public key if provided (actual Solana base58 key),
  // otherwise fall back to hash-based identifier for backward compatibility
  const publicKey =
    publicKeyOverride ?? createHash('sha256').update(seedPhrase).digest('hex').substring(0, 32);

  const now = Date.now();
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    salt: salt.toString('hex'),
    publicKey,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Decrypt an encrypted wallet to recover the seed phrase.
 */
export function decryptSeedPhrase(encrypted: EncryptedWallet, passphrase: string): string {
  const key = deriveKey(passphrase, Buffer.from(encrypted.salt, 'hex'));
  const iv = Buffer.from(encrypted.iv, 'hex');
  const authTag = Buffer.from(encrypted.authTag, 'hex');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString('utf-8');
}

// ---- Keypair Derivation (Solana) ----

/**
 * Derive a Solana keypair from a seed phrase.
 * Uses BIP39 mnemonic → seed, then ed25519-hd-key with BIP44 path m/44'/501'/0'/0'.
 * Compatible with Phantom, Solflare, and other standard Solana wallets.
 */
export function deriveKeypairFromSeed(seedPhrase: string): WalletKeypair {
  const normalized = seedPhrase.trim().toLowerCase();
  // BIP39: PBKDF2-HMAC-SHA512 with 2048 iterations → 64-byte seed
  const mnemonicBuffer = Buffer.from(normalized.normalize('NFKD'), 'utf8');
  const saltBuffer = Buffer.from('mnemonic'.normalize('NFKD'), 'utf8');
  const seed = pbkdf2Sync(mnemonicBuffer, saltBuffer, 2048, 64, 'sha512');
  // ed25519-hd-key: BIP44 m/44'/501'/0'/0' (Solana standard)
  const { key } = derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
  // `key` is already a Uint8Array of the 32-byte seed — a plain copy (no hex
  // decode; the old `Buffer.from(key, 'hex')` was a TS-invalid overload that
  // would misread the bytes on some engines).
  const keypair = Keypair.fromSeed(Buffer.from(key));

  return {
    publicKey: keypair.publicKey.toBase58(),
    privateKey: keypair.secretKey,
  };
}

// ---- Wallet Manager ----

export interface WalletStorage {
  save(key: string, wallet: EncryptedWallet): Promise<void>;
  load(key: string): Promise<EncryptedWallet | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/**
 * In-memory wallet storage (for testing or when no persistent storage is configured).
 */
export class InMemoryWalletStorage implements WalletStorage {
  private store = new Map<string, EncryptedWallet>();

  async save(key: string, wallet: EncryptedWallet): Promise<void> {
    this.store.set(key, wallet);
  }

  async load(key: string): Promise<EncryptedWallet | null> {
    return this.store.get(key) ?? null;
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Encrypted file-based wallet storage.
 * Persists the encrypted wallet to a JSON file on disk.
 */
export class EncryptedFileStorage implements WalletStorage {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'wallet.enc');
  }

  async save(_key: string, wallet: EncryptedWallet): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const data = JSON.stringify(wallet, null, 2);
    await writeFile(this.filePath, data, 'utf-8');
  }

  async load(_key: string): Promise<EncryptedWallet | null> {
    try {
      if (!existsSync(this.filePath)) {
        return null;
      }
      const data = await readFile(this.filePath, 'utf-8');
      return JSON.parse(data) as EncryptedWallet;
    } catch {
      return null;
    }
  }

  async exists(_key: string): Promise<boolean> {
    return existsSync(this.filePath);
  }

  async delete(_key: string): Promise<void> {
    if (existsSync(this.filePath)) {
      await unlink(this.filePath);
    }
  }
}

/**
 * Check if a wallet encrypted file exists at the given data directory.
 */
export function isWalletEncrypted(dataDir: string): boolean {
  return existsSync(path.join(dataDir, 'wallet.enc'));
}

export class WalletManager {
  private storage: WalletStorage;
  private configPassphrase: string;
  private currentWalletKey: string | null = null;
  private decryptedKeypair: SensitiveData<WalletKeypair> | null = null;
  private unlocked = false;

  constructor(storage: WalletStorage, configPassphrase: string) {
    this.storage = storage;
    this.configPassphrase = configPassphrase;
  }

  /** Whether a wallet is currently imported. */
  async hasWallet(): Promise<boolean> {
    // Check all keys in storage — we use a fixed key for now
    return this.storage.exists('default');
  }

  /** Whether the wallet is locked (not decrypted in memory). */
  isLocked(): boolean {
    return !this.unlocked;
  }

  /** Get the public key of the currently imported wallet. */
  async getPublicKey(): Promise<string | null> {
    if (this.currentWalletKey) {
      const encrypted = await this.storage.load(this.currentWalletKey);
      return encrypted?.publicKey ?? null;
    }
    const encrypted = await this.storage.load('default');
    return encrypted?.publicKey ?? null;
  }

  /**
   * Import a wallet from a seed phrase.
   *
   * @param seedPhrase - The BIP39 seed phrase (12 or 24 words)
   * @param password - Optional password to encrypt the wallet with (falls back to configPassphrase)
   * @param confirmReplace - Optional callback that must return true to replace existing wallet
   * @returns The public key of the imported wallet
   */
  async importWallet(
    seedPhrase: string,
    password?: string,
    confirmReplace?: () => Promise<boolean>,
  ): Promise<string> {
    // 1. Validate
    const validation = validateSeedPhrase(seedPhrase);
    if (!validation.valid) {
      throw new Error(`Invalid seed phrase: ${validation.error}`);
    }

    // 2. Check if a wallet already exists and require confirmation
    const existing = await this.storage.exists('default');
    if (existing) {
      if (!confirmReplace) {
        throw new Error(
          'A wallet is already imported. Call importWallet with confirmReplace callback to confirm replacement.',
        );
      }
      const confirmed = await confirmReplace();
      if (!confirmed) {
        throw new Error('Wallet replacement was declined');
      }
    }

    // 3. Derive keypair
    const keypair = deriveKeypairFromSeed(seedPhrase);

    // 4. Encrypt and store
    const passphrase = password || this.configPassphrase;
    const encrypted = encryptSeedPhrase(seedPhrase, passphrase, keypair.publicKey);
    await this.storage.save('default', encrypted);
    this.currentWalletKey = 'default';
    this.unlocked = true;

    // Note: seed phrase string is immutable in JS — it will be garbage collected.
    // The variable goes out of scope at function return.

    return keypair.publicKey;
  }

  /**
   * Get the keypair for signing transactions.
   * The keypair is decrypted into memory, used, and wiped.
   */
  async getKeypair(): Promise<SensitiveData<WalletKeypair>> {
    const encrypted = await this.storage.load('default');
    if (!encrypted) {
      throw new Error('No wallet imported. Call importWallet() first.');
    }

    // If we already have a decrypted keypair and it's not disposed, return it
    if (this.decryptedKeypair && !this.decryptedKeypair.isDisposed) {
      return this.decryptedKeypair;
    }

    // Decrypt seed phrase
    const seedPhrase = decryptSeedPhrase(encrypted, this.configPassphrase);

    // Derive keypair
    const keypair = deriveKeypairFromSeed(seedPhrase);

    // Store decrypted keypair (caller must dispose after use)
    this.decryptedKeypair = new SensitiveData(keypair);
    return this.decryptedKeypair;
  }

  /**
   * Wipe the in-memory decrypted keypair.
   * Safe to call multiple times.
   */
  wipeKeypair(): void {
    if (this.decryptedKeypair) {
      this.decryptedKeypair.dispose();
      this.decryptedKeypair = null;
    }
    this.unlocked = false;
  }

  /**
   * Unlock the wallet with a password.
   * Decrypts the seed phrase and derives the keypair into memory.
   *
   * @param password - The password to decrypt the wallet
   * @returns The public key of the wallet
   */
  async unlock(password: string): Promise<string> {
    const encrypted = await this.storage.load('default');
    if (!encrypted) {
      throw new Error('No wallet imported. Import a wallet first.');
    }

    // Try to decrypt — will throw if password is wrong
    const seedPhrase = decryptSeedPhrase(encrypted, password);
    const keypair = deriveKeypairFromSeed(seedPhrase);

    // Store decrypted keypair
    this.decryptedKeypair = new SensitiveData(keypair);
    this.currentWalletKey = 'default';
    this.configPassphrase = password;
    this.unlocked = true;

    return keypair.publicKey;
  }

  /**
   * Lock the wallet — wipe decrypted keypair from memory.
   */
  lock(): void {
    this.wipeKeypair();
    this.unlocked = false;
  }

  /**
   * Change the wallet password.
   * Re-encrypts the seed phrase with the new password.
   *
   * @param currentPassword - The current password
   * @param newPassword - The new password to encrypt with
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const encrypted = await this.storage.load('default');
    if (!encrypted) {
      throw new Error('No wallet imported.');
    }

    // Decrypt with current password
    const seedPhrase = decryptSeedPhrase(encrypted, currentPassword);

    // Re-encrypt with new password, passing the EXISTING public key so the
    // stored identity survives re-encryption. Without the override,
    // encryptSeedPhrase falls back to a sha256-derived hash — silently
    // destroying the real public key and breaking getPublicKey()/getKeypair().
    const newEncrypted = encryptSeedPhrase(seedPhrase, newPassword, encrypted.publicKey);
    // Preserve original createdAt
    newEncrypted.createdAt = encrypted.createdAt;
    newEncrypted.updatedAt = Date.now();

    await this.storage.save('default', newEncrypted);
    this.configPassphrase = newPassword;
  }

  /**
   * Forgot password — delete the encrypted wallet file.
   * Preserves all other bot data (logs, metrics, settings).
   */
  async forgotPassword(): Promise<void> {
    this.wipeKeypair();
    await this.storage.delete('default');
    this.currentWalletKey = null;
    this.unlocked = false;
  }

  /**
   * Remove the imported wallet from storage.
   */
  async removeWallet(confirm: () => Promise<boolean>): Promise<void> {
    const exists = await this.storage.exists('default');
    if (!exists) {
      throw new Error('No wallet to remove');
    }

    const confirmed = await confirm();
    if (!confirmed) {
      throw new Error('Wallet removal was declined');
    }

    this.wipeKeypair();
    await this.storage.delete('default');
    this.currentWalletKey = null;
    this.unlocked = false;
  }
}
