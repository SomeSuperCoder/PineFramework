import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { JupiterSwapAdapter } from '../../../src/trading/dex/jupiter-swap-adapter.js';
import { USDC_MINT } from '../../../src/trading/solana-wallet.js';
import { TOKEN_MINTS } from '../../../src/trading/token-registry.js';

const { mockGetSolBalance, mockGetTokenBalance } = vi.hoisted(() => ({
  mockGetSolBalance: vi.fn(),
  mockGetTokenBalance: vi.fn(),
}));

// Partial module mock (same module as chaos-equity-floor.test.ts, but only the
// two balance helpers are replaced): the real createConnection/isValidPublicKey/
// USDC_MINT stay live so existing tests keep their real behavior and getBalance
// exercises the real public-key validation gate without touching the network.
vi.mock('../../../src/trading/solana-wallet.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/trading/solana-wallet.js')>();
  return {
    ...actual,
    getSolBalance: mockGetSolBalance,
    getTokenBalance: mockGetTokenBalance,
  };
});

describe('JupiterSwapAdapter', () => {
  let adapter: JupiterSwapAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new JupiterSwapAdapter();
  });

  describe('constructor', () => {
    it('should have correct name and commission model', () => {
      expect(adapter.name).toBe('jupiter-swap');
      expect(adapter.commissionModel.name).toBe('jupiter-swap');
      expect(adapter.commissionModel.feeBps).toBe(0);
      expect(adapter.commissionModel.variable).toBe(true);
    });

    it('should have correct slippage config', () => {
      expect(adapter.slippageConfig.bps).toBe(50);
      expect(adapter.slippageConfig.configurable).toBe(true);
    });
  });

  describe('quote', () => {
    it('should fetch quote from Jupiter API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          inputMint: USDC_MINT,
          outputMint: 'So11111111111111111111111111111111111111112',
          inAmount: '1000000',
          outAmount: '5000000',
          priceImpactPct: 0.1,
          routePlan: [{ swapInfo: { ammKey: 'amm1' } }],
        }),
      });
      global.fetch = mockFetch;

      const quote = await adapter.quote(
        USDC_MINT,
        'So11111111111111111111111111111111111111112',
        BigInt(1000000),
      );

      expect(quote.inputMint).toBe(USDC_MINT);
      expect(quote.outputMint).toBe('So11111111111111111111111111111111111111112');
      expect(quote.inAmount).toBe('1000000');
      expect(quote.outAmount).toBe('5000000');
      expect(quote.priceImpactPct).toBe(0.1);
      // Adapter returns the routePlan (API v6) and never sets `route`.
      expect(quote.routePlan[0].swapInfo.ammKey).toBe('amm1');
    });

    it('should retry on failure', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, statusText: 'Internal Server Error' })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            inputMint: USDC_MINT,
            outputMint: 'So11111111111111111111111111111111111111112',
            inAmount: '1000000',
            outAmount: '5000000',
            priceImpactPct: 0.1,
            routePlan: [],
          }),
        });
      global.fetch = mockFetch;

      const quote = await adapter.quote(
        USDC_MINT,
        'So11111111111111111111111111111111111111112',
        BigInt(1000000),
      );

      expect(quote.inAmount).toBe('1000000');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTransactionStatus', () => {
    it('should return unknown on error', async () => {
      // The adapter's getTransactionStatus should handle errors gracefully
      // Since we can't easily mock the connection, we test the error handling
      const status = await adapter.getTransactionStatus('mockSignature');
      expect(status).toBe('unknown');
    });
  });

  describe('getBalance', () => {
    // A real, valid Solana public key — the real isValidPublicKey() accepts it,
    // so getBalance proceeds past the validation gate without any mocking.
    const VALID_PUBKEY = Keypair.generate().publicKey.toBase58();

    beforeEach(() => {
      mockGetSolBalance.mockReset();
      mockGetTokenBalance.mockReset();
    });

    it('throws on a transport/RPC error instead of returning amount 0', async () => {
      // A transport/RPC failure (NOT a TokenAccountNotFoundError) must propagate
      // so callers can distinguish "provider down" from "verified empty wallet".
      mockGetTokenBalance.mockRejectedValue(new Error('RPC unreachable: connection refused'));

      await expect(adapter.getBalance(USDC_MINT, VALID_PUBKEY)).rejects.toThrow(
        'RPC unreachable: connection refused',
      );
      expect(mockGetTokenBalance).toHaveBeenCalledTimes(1);
    });

    it('returns a genuine 0 for a verified empty wallet (missing token account)', async () => {
      // getTokenBalance resolves a real zero — the verified-empty-wallet case
      // (TokenAccountNotFoundError is handled inside the helper). The adapter
      // must surface the 0, not throw and not fabricate anything.
      mockGetTokenBalance.mockResolvedValue({ amount: 0n, humanReadable: 0, decimals: 6 });

      await expect(adapter.getBalance(USDC_MINT, VALID_PUBKEY)).resolves.toEqual({
        mint: USDC_MINT,
        amount: '0',
        decimals: 6,
      });
    });

    it('returns the correct amount and decimals for a healthy SPL balance', async () => {
      // 25,000,000 base units of a 6-decimal token = 25 USDC.
      mockGetTokenBalance.mockResolvedValue({
        amount: 25_000_000n,
        humanReadable: 25,
        decimals: 6,
      });

      await expect(adapter.getBalance(USDC_MINT, VALID_PUBKEY)).resolves.toEqual({
        mint: USDC_MINT,
        amount: '25000000',
        decimals: 6,
      });
    });

    it('propagates an error from the native SOL balance path (no silent 0)', async () => {
      mockGetSolBalance.mockRejectedValue(new Error('RPC down'));

      await expect(adapter.getBalance(TOKEN_MINTS.SOL, VALID_PUBKEY)).rejects.toThrow('RPC down');
      expect(mockGetSolBalance).toHaveBeenCalledTimes(1);
      expect(mockGetTokenBalance).not.toHaveBeenCalled();
    });

    it('returns the correct amount and decimals for a healthy native SOL balance', async () => {
      // 5,000,000,000 lamports = 5 SOL (9 decimals).
      mockGetSolBalance.mockResolvedValue({
        amount: 5_000_000_000n,
        humanReadable: 5,
        decimals: 9,
      });

      await expect(adapter.getBalance(TOKEN_MINTS.SOL, VALID_PUBKEY)).resolves.toEqual({
        mint: TOKEN_MINTS.SOL,
        amount: '5000000000',
        decimals: 9,
      });
    });
  });
});
