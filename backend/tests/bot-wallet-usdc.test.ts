/**
 * Route-level tests for the bot USDC wallet routes — they MUST build the USDC
 * mint from the SSoT constant (USDC_MINT from 'pine-framework'), never a
 * hardcoded address literal.
 *
 *   GET  /api/bot/wallet/balance — USDC balance for the imported wallet
 *   POST /api/bot/wallet/preview — derive pubkey from seed phrase + USDC balance
 *
 * CRITICAL — REAL-DATA DANGER ZONE: both routes call `@solana/web3.js`
 * (PublicKey + Connection against Solana mainnet RPC) and preview additionally
 * derives a keypair from the seed phrase. Both are FULLY MOCKED below:
 *   - `@solana/web3.js`      → vi.mock (PublicKey stub with base58 validation,
 *                               Connection stub that returns fixed account data)
 *   - `pine-framework/trading/wallet` → vi.mock (deriveKeypairFromSeed stub)
 * NO real RPC call and NO real key derivation ever happen. Each test asserts
 * the mocked RPC was queried with the SSoT USDC mint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createBotRouter } from '../src/routes/bot.js';
import type { WalletManager } from 'pine-framework/trading/wallet';
import { USDC_MINT } from 'pine-framework';

// Shared handle into the mocked RPC so tests can inspect what the routes
// actually queried (owner + mint filter). vi.hoisted runs BEFORE the mock
// factories, so this is referenceable inside them.
const rpcState = vi.hoisted(() => ({
  getParsedTokenAccountsByOwner: vi.fn(),
}));

// Fully mock @solana/web3.js — the routes `await import('@solana/web3.js')`
// dynamically, so this factory covers both static and dynamic resolution.
// PublicKey mirrors the real constructor's base58 validation just enough to
// exercise the graceful path (invalid key → { success: true, balance: 0 }).
vi.mock('@solana/web3.js', () => {
  class MockPublicKey {
    private readonly value: string;

    constructor(value: string) {
      if (
        typeof value !== 'string' ||
        value.length < 32 ||
        value.length > 44 ||
        !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
      ) {
        throw new Error(`Invalid public key input: ${String(value)}`);
      }
      this.value = value;
    }

    toBase58(): string {
      return this.value;
    }

    toString(): string {
      return this.value;
    }

    equals(other: unknown): boolean {
      return other instanceof MockPublicKey && other.toBase58() === this.toBase58();
    }
  }

  return {
    PublicKey: MockPublicKey,
    Connection: vi.fn().mockImplementation(() => ({
      getParsedTokenAccountsByOwner: rpcState.getParsedTokenAccountsByOwner,
    })),
  };
});

// Mock keypair derivation so preview never runs real BIP39/ed25519 code
// (deterministic stub public key). bot.ts imports the wallet types statically
// (type-only, erased) and the function dynamically — the mock covers the latter.
vi.mock('pine-framework/trading/wallet', () => ({
  deriveKeypairFromSeed: vi.fn(() => ({
    publicKey: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    privateKey: new Uint8Array(0),
  })),
}));

import { deriveKeypairFromSeed } from 'pine-framework/trading/wallet';

/** Valid base58 public keys (44 chars) — pass MockPublicKey validation. */
const WALLET_PUBKEY = 'So11111111111111111111111111111111111111112';
const DERIVED_PUBKEY = '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs';

/** 12-word BIP39 mnemonic — passes the route's word-count guard. */
const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** Stubbed RPC account data: USDC tokenAmount with uiAmountString '123.45'. */
const STUBBED_ACCOUNTS = {
  value: [
    {
      account: {
        data: {
          parsed: {
            info: {
              tokenAmount: { uiAmountString: '123.45' },
            },
          },
        },
      },
    },
  ],
};

function makeWalletManager(opts: { hasWallet?: boolean; publicKey?: string | null } = {}) {
  const { hasWallet = true, publicKey = WALLET_PUBKEY } = opts;
  return {
    hasWallet: vi.fn(async () => hasWallet),
    getPublicKey: vi.fn(async () => publicKey),
  } as unknown as WalletManager;
}

describe('bot USDC wallet routes use the SSoT mint (fully mocked RPC)', () => {
  let server: Server;
  let baseUrl: string;
  let walletManager: WalletManager;

  beforeEach(async () => {
    // Reset the RPC stub to its default fixed response for each test.
    rpcState.getParsedTokenAccountsByOwner.mockReset();
    rpcState.getParsedTokenAccountsByOwner.mockResolvedValue(STUBBED_ACCOUNTS);
    vi.mocked(deriveKeypairFromSeed).mockClear();

    walletManager = makeWalletManager();

    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      createBotRouter({
        getEngine: () => null,
        getWalletManager: () => walletManager,
      }),
    );

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('GET /bot/wallet/balance returns the stubbed balance and queries with the SSoT USDC mint', async () => {
    const res = await fetch(`${baseUrl}/bot/wallet/balance`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success: boolean; balance: number };
    expect(body).toEqual({ success: true, balance: 123.45 });

    // The route MUST have queried the RPC with the SSoT USDC mint — this is
    // the change under test (no hardcoded address allowed).
    expect(rpcState.getParsedTokenAccountsByOwner).toHaveBeenCalledTimes(1);
    const [owner, filter] = rpcState.getParsedTokenAccountsByOwner.mock.calls[0]! as [
      { toBase58(): string },
      { mint: { toBase58(): string } },
    ];
    expect(owner.toBase58()).toBe(WALLET_PUBKEY);
    expect(filter.mint.toBase58()).toBe(USDC_MINT);
  });

  it('POST /bot/wallet/preview derives the public key and returns the stubbed balance', async () => {
    const res = await fetch(`${baseUrl}/bot/wallet/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seedPhrase: SEED_PHRASE }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success: boolean; publicKey: string; balance: number };
    expect(body).toEqual({ success: true, publicKey: DERIVED_PUBKEY, balance: 123.45 });

    // Preview derives via the mocked deriveKeypairFromSeed (no real derivation).
    expect(deriveKeypairFromSeed).toHaveBeenCalledWith(SEED_PHRASE.trim());

    // …and queries the RPC with the SSoT USDC mint.
    expect(rpcState.getParsedTokenAccountsByOwner).toHaveBeenCalledTimes(1);
    const [, filter] = rpcState.getParsedTokenAccountsByOwner.mock.calls[0]! as [
      { toBase58(): string },
      { mint: { toBase58(): string } },
    ];
    expect(filter.mint.toBase58()).toBe(USDC_MINT);
  });

  it('GET /bot/wallet/balance gracefully returns { success: true, balance: 0 } for an invalid public key', async () => {
    // Swap the wallet manager (router closures read it per request).
    walletManager = makeWalletManager({ publicKey: 'not-a-valid-public-key' });

    const res = await fetch(`${baseUrl}/bot/wallet/balance`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success: boolean; balance: number };
    expect(body).toEqual({ success: true, balance: 0 });

    // The graceful path returns BEFORE any RPC query (invalid key, old hex format).
    expect(rpcState.getParsedTokenAccountsByOwner).not.toHaveBeenCalled();
  });
});
