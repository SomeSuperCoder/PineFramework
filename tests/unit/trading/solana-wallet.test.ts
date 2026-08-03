import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSolanaConfig,
  createSolanaConnection,
  getDefaultSolanaConfig,
  isMainnet,
  isDevnet,
} from '../../../src/trading/solana-config.js';
import {
  isValidPublicKey,
  lamportsToSol,
  solToLamports,
  SOL_MINT,
  USDC_MINT,
} from '../../../src/trading/solana-wallet.js';

// ---- SolanaConfig Tests ----

describe('SolanaConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SOLANA_RPC_URL;
    delete process.env.SOLANA_COMMITMENT;
    delete process.env.SOLANA_NETWORK;
  });

  it('should create config with defaults (devnet)', () => {
    const config = createSolanaConfig();
    expect(config.network).toBe('devnet');
    expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
    expect(config.commitment).toBe('confirmed');
  });

  it('should create config with explicit options', () => {
    const config = createSolanaConfig({
      rpcUrl: 'https://custom-rpc.solana.com',
      commitment: 'finalized',
      network: 'mainnet-beta',
    });
    expect(config.rpcUrl).toBe('https://custom-rpc.solana.com');
    expect(config.commitment).toBe('finalized');
    expect(config.network).toBe('mainnet-beta');
  });

  it('should use environment variables', () => {
    process.env.SOLANA_RPC_URL = 'https://env-rpc.solana.com';
    process.env.SOLANA_COMMITMENT = 'processed';
    process.env.SOLANA_NETWORK = 'testnet';

    const config = createSolanaConfig();
    expect(config.rpcUrl).toBe('https://env-rpc.solana.com');
    expect(config.commitment).toBe('processed');
    expect(config.network).toBe('testnet');
  });

  it('should prefer options over environment variables', () => {
    process.env.SOLANA_RPC_URL = 'https://env-rpc.solana.com';

    const config = createSolanaConfig({
      rpcUrl: 'https://option-rpc.solana.com',
    });
    expect(config.rpcUrl).toBe('https://option-rpc.solana.com');
  });

  it('should derive WebSocket URL from RPC URL', () => {
    const config = createSolanaConfig({
      rpcUrl: 'https://api.mainnet-beta.solana.com',
    });
    expect(config.wsUrl).toBe('wss://api.mainnet-beta.solana.com');
  });

  it('should create connection from config', () => {
    const config = createSolanaConfig();
    const connection = createSolanaConnection(config);
    expect(connection).toBeDefined();
  });

  it('should return default config', () => {
    const config = getDefaultSolanaConfig();
    expect(config.network).toBe('devnet');
  });

  it('should detect mainnet', () => {
    const mainnetConfig = createSolanaConfig({ network: 'mainnet-beta' });
    const devnetConfig = createSolanaConfig({ network: 'devnet' });

    expect(isMainnet(mainnetConfig)).toBe(true);
    expect(isMainnet(devnetConfig)).toBe(false);
  });

  it('should detect devnet', () => {
    const mainnetConfig = createSolanaConfig({ network: 'mainnet-beta' });
    const devnetConfig = createSolanaConfig({ network: 'devnet' });

    expect(isDevnet(devnetConfig)).toBe(true);
    expect(isDevnet(mainnetConfig)).toBe(false);
  });
});

// ---- Utility Function Tests ----

describe('Solana Wallet Utilities', () => {
  it('should validate valid public keys', () => {
    expect(isValidPublicKey('11111111111111111111111111111111')).toBe(true);
    expect(isValidPublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true);
  });

  it('should reject invalid public keys', () => {
    expect(isValidPublicKey('')).toBe(false);
    expect(isValidPublicKey('invalid')).toBe(false);
    expect(isValidPublicKey('0OIl')).toBe(false); // Invalid base58 chars
  });

  it('should convert lamports to SOL', () => {
    expect(lamportsToSol(1000000000)).toBe(1);
    expect(lamportsToSol(500000000)).toBe(0.5);
    expect(lamportsToSol(0)).toBe(0);
  });

  it('should convert SOL to lamports', () => {
    expect(solToLamports(1)).toBe(1000000000);
    expect(solToLamports(0.5)).toBe(500000000);
    expect(solToLamports(0)).toBe(0);
  });

  it('should have correct constants', () => {
    expect(SOL_MINT).toBe('So11111111111111111111111111111111111111112');
    expect(USDC_MINT).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });
});
