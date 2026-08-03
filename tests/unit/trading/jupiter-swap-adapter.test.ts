import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JupiterSwapAdapter } from '../../../src/trading/dex/jupiter-swap-adapter.js';
import { USDC_MINT } from '../../../src/trading/solana-wallet.js';

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
      expect(quote.route).toBe('amm1');
    });

    it('should retry on failure', async () => {
      const mockFetch = vi.fn()
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
});
