export { SensitiveData } from './sensitive-data.js';
export type {
  EncryptedWallet,
  WalletKeypair,
  SeedPhraseValidation,
  WalletStorage,
} from './wallet-manager.js';
// Note: WalletManager, InMemoryWalletStorage, EncryptedFileStorage,
// validateSeedPhrase, encryptSeedPhrase, decryptSeedPhrase,
// deriveKeypairFromSeed, isWalletEncrypted are NOT re-exported here
// because they depend on node:crypto. Backend code imports them
// directly from the source file.
