import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Keypair, VersionedTransaction } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
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
  deserializeTransaction,
  signTransaction,
  sendAndConfirmTransactionWithTimeout,
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

  it('should create config with defaults (mainnet-beta)', () => {
    const config = createSolanaConfig();
    expect(config.network).toBe('mainnet-beta');
    expect(config.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
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
    expect(config.network).toBe('mainnet-beta');
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

// ---- VersionedTransaction (v0) Regression ----
//
// Guards the live-order crash (proven 2026-08-06, log 11:05:01.938Z): Jupiter
// /swap/v1 ALWAYS returns a v0 VersionedTransaction (0x80 version marker). The
// OLD solana-wallet helper used legacy `Transaction.from()`, which routed to
// `Message.from()` and threw "Versioned messages must be deserialized with
// VersionedMessage.deserialize()" on every live order. These tests FAIL on
// that legacy path and PASS on the v0 path (VersionedTransaction.deserialize).

/** REAL Jupiter /swap/v1 swapTransaction envelope, captured live 2026-08-06
 *  (inputMint USDC → outputMint 7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs,
 *  amount 452571). 968 bytes; v0 message with the 0x80 version marker at
 *  offset 65. Embedded so the test run never touches the network. */
const V0_SWAP_TRANSACTION_B64 =
  'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAGE9JXjza0OwYWN8FpQi2NmLFc+BexjQ9Yy78+OZUQayafCgUkQaFYTleMcAX2p74eBXQZd1dwDyQZAPJfSv2KGc4rtxAwY0Cqhu8ZEP8TpEW0iH2xK4JjF0vuGVIrA6twykKKLdLiXi3Bgl5dSwWbcy3SVaOQnMGkeMSEh/o9iTQxaFisknu1ceHnpDB3toe0vIG96vzpC3DjUyPzHzFhCWSCZMXa/OXQOHX/+qMujrYkH0t8KiCddj7KM5Mlo2yOJYr3AXlIGiUJXFOXroEqROS3wzHepB3OaCgWv1SYVWAOklynx2oUN56BII5Cit8A7mYE7Tsr3m8pXy4h+x6z9XuV68PHm7yhCRAzQD1pzch0NxmESXA1rsdE7is3yLAaXrPZnFp4qv1uXWkqGzd7RXklMgyaUFGNvXVrMn4ddNIQuYWuPLoIHj1rtPdLNX3+MqAowL1C3mfnKmBZ/gHZOU3cCCQL0CtTHXMnxXCnjV+gISwHsFuu/Vcnl3QrFyEbWuVy1kMO0Oy3FkKDWDrqTC5dj81j9887QSMkt0+urzU7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAAAR51VvyMcBu7nTFbs5oFQf9sbLeo/SOUQKxzaJWvBOPjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+Fm0P/on9df2SnTAmx8pWHneSwmrNt/J3VFLMhqns4zl6OL4d+g9rsaIj0Orta57MRu3jDSWCJf85ae4LBbiD/GXZC/1WYEiP+IoDY52/S0RH9TeSvVyjfO0kAKfnUQHw7oEDgAFAsBcFQAOAAkDBBcBAAAAAAAQBgAFACMNHgEBDzYeEgAICgsFISMPDxEPJxImHQIKGxwbHBweJQ8gEh8XAgEUFRMeCRYGBw8iHhIaARkLGAQMAyQuwSCbM0HWnIEAAwAAAGgAZAABGmQBAhEBZAID2+cGAAAAAAD5XAAAAAAAADIAAANfdgQuNHFfoXxA2cQj3o7PuVZ5F8H5k38p8s1tvPXWHQUp3N7d4AQNKhTJI/mOnQpEOdrWCSnHDoq9iOZQcHeSzqQPvDk6cYhtwpoDEBUPAwQZHNX1BJ+5xopx4Bc9mNRq9M9kkGALXMYE2phoCsidpHAYA0pESANFRkk=';

/** Secret key of the throwaway keypair whose public key
 *  (FA64ASuDpxAJTHahD3R4u6ZkRHSP6WXgd4NLroDiJ7ze) the envelope above was built
 *  for. VersionedTransaction.sign() only accepts a keypair that is a required
 *  signer of the message, so this fixture can only be signed by this keypair. */
const V0_SIGNER_SECRET_B64 =
  'cnm91YRwWGLz0lmxPISM8QcnKyjmuLqmhNbDAyjDztzSV482tDsGFjfBaUItjZixXPgXsY0PWMu/PjmVEGsmnw==';

describe('VersionedTransaction (v0) regression — live Jupiter /swap/v1 envelope', () => {
  const signer = Keypair.fromSecretKey(Buffer.from(V0_SIGNER_SECRET_B64, 'base64'));

  it('deserializeTransaction returns a v0 VersionedTransaction, not a legacy Transaction (legacy path threw the versioned-message error)', () => {
    const tx = deserializeTransaction(V0_SWAP_TRANSACTION_B64);

    expect(tx).toBeInstanceOf(VersionedTransaction);
    expect(tx.message.version).toBe(0);
    expect(tx.message.version).not.toBe('legacy');
  });

  it('signTransaction signs the v0 envelope in place with the envelope signer (legacy partialSign has no v0 path)', () => {
    const tx = deserializeTransaction(V0_SWAP_TRANSACTION_B64);

    expect(tx.signatures.length).toBeGreaterThan(0);
    const signed = signTransaction(tx, signer);

    expect(signed).toBe(tx); // signed in place — same instance
    expect(signed.signatures.length).toBeGreaterThan(0);
    expect(signed.signatures[0].length).toBe(64);
    // A no-op sign() would leave the signature slot all-zero (still 64 bytes),
    // so the length check alone can't catch a regression to a no-op. The slot
    // must be NON-ZERO — a real ed25519 signature is never all zeros.
    expect(signed.signatures[0]).not.toEqual(new Uint8Array(64));
  });

  it('sendAndConfirmTransactionWithTimeout sends the v0 tx (preflight confirmed) and confirms the returned signature', async () => {
    const sendTransaction = vi.fn().mockResolvedValue('mock-v0-signature');
    const confirmTransaction = vi.fn().mockResolvedValue({ value: { err: null } });
    const connection = { sendTransaction, confirmTransaction } as unknown as Connection;
    const tx = deserializeTransaction(V0_SWAP_TRANSACTION_B64);

    const result = await sendAndConfirmTransactionWithTimeout(connection, tx);

    expect(result).toEqual({ success: true, signature: 'mock-v0-signature' });
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction).toHaveBeenCalledWith(tx, { preflightCommitment: 'confirmed' });
    expect(confirmTransaction).toHaveBeenCalledTimes(1);
    expect(confirmTransaction).toHaveBeenCalledWith('mock-v0-signature', 'confirmed');
  });

  it('sendAndConfirmTransactionWithTimeout reports an on-chain confirm error as {success:false, error}', async () => {
    const sendTransaction = vi.fn().mockResolvedValue('mock-v0-signature');
    const confirmTransaction = vi.fn().mockResolvedValue({
      value: { err: { InstructionError: [0, 'Custom'] } },
    });
    const connection = { sendTransaction, confirmTransaction } as unknown as Connection;
    const tx = deserializeTransaction(V0_SWAP_TRANSACTION_B64);

    const result = await sendAndConfirmTransactionWithTimeout(connection, tx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Transaction failed');
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(confirmTransaction).toHaveBeenCalledTimes(1);
  });

  it('sendAndConfirmTransactionWithTimeout carries the send signature when confirmation throws/times out (signature-carrying failure path)', async () => {
    const sendTransaction = vi.fn().mockResolvedValue('mock-v0-signature');
    const confirmTransaction = vi
      .fn()
      .mockRejectedValue(new Error('Transaction confirmation timeout'));
    const connection = { sendTransaction, confirmTransaction } as unknown as Connection;
    const tx = deserializeTransaction(V0_SWAP_TRANSACTION_B64);

    const result = await sendAndConfirmTransactionWithTimeout(connection, tx);

    // The RPC accepted the transaction (send landed) before confirm raced — the
    // failure MUST keep the signature so the close retry rule can verify on-chain
    // instead of assuming nothing was sold (no-double-sell).
    expect(result.success).toBe(false);
    expect(result.signature).toBe('mock-v0-signature');
    expect(result.error).toBe('Transaction confirmation timeout');
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(confirmTransaction).toHaveBeenCalledTimes(1);
  });
});
