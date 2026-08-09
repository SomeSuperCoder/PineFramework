import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { JupiterUltraAdapter } from '../../../src/trading/dex/jupiter-ultra-adapter.js';
import type { Quote } from '../../../src/trading/dex/dex-adapter.js';
import { USDC_MINT } from '../../../src/trading/token-registry.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEFAULT_URL = 'https://ultra-api.jup.ag/v1';

describe('JupiterUltraAdapter', () => {
  let adapter: JupiterUltraAdapter;
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new JupiterUltraAdapter();
  });

  afterEach(() => {
    // Restore the real fetch so no test leaks into the next.
    globalThis.fetch = originalFetch;
  });

  // Real Jupiter Ultra /quote response shape: the full fee-computation object
  // that /swap expects VERBATIM. Extra fields beyond the typed Quote (route,
  // contextSlot, timeTaken, platformFee, simulateAtBestOffer...) prove the
  // adapter forwards the whole response instead of a lossy 6-field copy — the
  // 6-field reconstruction produced 422 field-drift errors.
  const fullUltraQuoteResponse = (overrides: Record<string, unknown> = {}) => ({
    inputMint: USDC_MINT,
    inAmount: '1000000',
    outputMint: SOL_MINT,
    outAmount: '5000000',
    otherAmountThreshold: '4950000',
    swapMode: 'ExactIn',
    slippageBps: 50,
    platformFee: { amount: '0', feeBps: 0 },
    priceImpactPct: '0.0010622',
    routePlan: [
      {
        swapInfo: {
          ammKey: 'amm1',
          label: 'Orca',
          inputMint: USDC_MINT,
          outputMint: SOL_MINT,
          inAmount: '1000000',
          outAmount: '5000000',
        },
        percent: 100,
        bps: 10000,
      },
    ],
    contextSlot: 123456,
    timeTaken: 0.05,
    swapUsdValue: '10.5',
    instructionVersion: 1,
    simulateAtBestOffer: false,
    route: 'ultra-route-v1',
    ...overrides,
  });

  const okFetch = (body: unknown) =>
    vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(body) });

  // ok:false stops swap() before the real transaction pipeline and (because
  // swap() returns success:false instead of throwing) avoids retryWithBackoff
  // delays — only the request contract is asserted, no real network, no waits.
  const failingSwapFetch = () =>
    vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: vi.fn().mockResolvedValue('mocked failure'),
    });

  describe('constructor', () => {
    it('should have correct name and commission model', () => {
      expect(adapter.name).toBe('jupiter-ultra');
      expect(adapter.commissionModel.name).toBe('jupiter-ultra');
      // M4: no fixed rate is assumed — fees are OBSERVED from the API at
      // execution (captureSwapFeeComponents), so feeBps is 0 and variable.
      expect(adapter.commissionModel.feeBps).toBe(0);
      expect(adapter.commissionModel.variable).toBe(true);
    });

    it('should have correct slippage config', () => {
      expect(adapter.slippageConfig.bps).toBe(30);
      expect(adapter.slippageConfig.configurable).toBe(true);
    });
  });

  describe('quote', () => {
    it('fetches a quote from the Ultra API with dynamic slippage and returns the leading fields', async () => {
      const raw = fullUltraQuoteResponse();
      const mockFetch = okFetch(raw);
      global.fetch = mockFetch;

      const quote = await adapter.quote(USDC_MINT, SOL_MINT, BigInt(1000000));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(String(url)).toMatch(/^https:\/\/ultra-api\.jup\.ag\/v1\/quote\?/);
      expect(String(url)).toContain('inputMint=');
      expect(String(url)).toContain('outputMint=');
      expect(String(url)).toContain('amount=1000000');
      expect(String(url)).toContain('slippageBps=30');
      expect(String(url)).toContain('dynamicSlippage=true');

      expect(quote.inputMint).toBe(USDC_MINT);
      expect(quote.outputMint).toBe(SOL_MINT);
      expect(quote.inAmount).toBe('1000000');
      expect(quote.outAmount).toBe('5000000');
      expect(quote.otherAmountThreshold).toBe('4950000');
      expect(quote.swapMode).toBe('ExactIn');
      // The whole API response is preserved for /swap, not a field subset.
      expect(quote.rawQuoteResponse).toEqual(raw);
    });

    it('coerces a string priceImpactPct from the API to a number', async () => {
      const raw = fullUltraQuoteResponse({ priceImpactPct: '0.0010622' });
      global.fetch = okFetch(raw);

      const quote = await adapter.quote(USDC_MINT, SOL_MINT, BigInt(1000000));

      expect(quote.priceImpactPct).toBe(0.0010622);
      expect(typeof quote.priceImpactPct).toBe('number');
    });
  });

  describe('swap — quoteResponse contract regression', () => {
    it('sends the FULL raw /quote response VERBATIM as quoteResponse — not a 6-field subset', async () => {
      const raw = fullUltraQuoteResponse();
      // Call 0 = quote GET (ok), call 1 = swap POST (ok:false stops the tx pipeline).
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(raw) })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: vi.fn().mockResolvedValue('mocked failure'),
        });
      global.fetch = mockFetch;
      const keypair = Keypair.generate();

      const quote = await adapter.quote(USDC_MINT, SOL_MINT, BigInt(1000000));
      await adapter.swap(quote, keypair.secretKey);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [url, init] = mockFetch.mock.calls[1];
      expect(String(url)).toBe(`${DEFAULT_URL}/swap`);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });

      const body = JSON.parse(init?.body as string);
      // Verbatim: deep-equal to the ENTIRE raw response. The old 6-field
      // reconstruction dropped every one of these fields.
      expect(body.quoteResponse).toEqual(raw);
      expect(body.quoteResponse.route).toBe('ultra-route-v1');
      expect(body.quoteResponse.contextSlot).toBe(123456);
      expect(body.quoteResponse.timeTaken).toBe(0.05);
      expect(body.quoteResponse.otherAmountThreshold).toBe('4950000');
      expect(body.quoteResponse.swapMode).toBe('ExactIn');
    });

    it('falls back to a COMPLETE 9-field quoteResponse when rawQuoteResponse is absent (routePlan, not the old route)', async () => {
      const mockFetch = failingSwapFetch();
      global.fetch = mockFetch;
      const keypair = Keypair.generate();

      // A Quote built outside the adapter has no rawQuoteResponse.
      const manualQuote: Quote = {
        inputMint: USDC_MINT,
        outputMint: SOL_MINT,
        inAmount: '1000000',
        outAmount: '5000000',
        priceImpactPct: 0.0010622,
        slippageBps: 30,
        feeBps: 5,
        routePlan: [{ swapInfo: { ammKey: 'amm1' } }],
      };

      await adapter.swap(manualQuote, keypair.secretKey);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).toBe(`${DEFAULT_URL}/swap`);
      const body = JSON.parse(init?.body as string);

      // All 9 fields Ultra requires are present — the old 6-field body
      // (no otherAmountThreshold, no swapMode) → HTTP 422.
      expect(body.quoteResponse.inputMint).toBe(USDC_MINT);
      expect(body.quoteResponse.outputMint).toBe(SOL_MINT);
      expect(body.quoteResponse.inAmount).toBe('1000000');
      expect(body.quoteResponse.outAmount).toBe('5000000');
      expect(body.quoteResponse.otherAmountThreshold).toBe('0'); // default
      expect(body.quoteResponse.swapMode).toBe('ExactIn'); // default
      expect(body.quoteResponse.slippageBps).toBe(30);
      expect(body.quoteResponse.priceImpactPct).toBe(0.0010622);
      // The old body reconstructed `route` — Ultra rejects that shape.
      expect(body.quoteResponse.routePlan).toEqual([{ swapInfo: { ammKey: 'amm1' } }]);
      expect(body.quoteResponse.route).toBeUndefined();
    });

    it('fallback honors explicit otherAmountThreshold/swapMode on the Quote instead of the defaults', async () => {
      const mockFetch = failingSwapFetch();
      global.fetch = mockFetch;
      const keypair = Keypair.generate();

      const manualQuote: Quote = {
        inputMint: USDC_MINT,
        outputMint: SOL_MINT,
        inAmount: '1000000',
        outAmount: '5000000',
        priceImpactPct: 0.1,
        slippageBps: 30,
        feeBps: 5,
        routePlan: [],
        otherAmountThreshold: '4800000',
        swapMode: 'ExactOut',
      };

      await adapter.swap(manualQuote, keypair.secretKey);

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.quoteResponse.otherAmountThreshold).toBe('4800000');
      expect(body.quoteResponse.swapMode).toBe('ExactOut');
    });

    it('derives userPublicKey from the supplied keypair — never sends an empty owner', async () => {
      const mockFetch = failingSwapFetch();
      global.fetch = mockFetch;
      const keypair = Keypair.generate();

      const manualQuote: Quote = {
        inputMint: USDC_MINT,
        outputMint: SOL_MINT,
        inAmount: '1000000',
        outAmount: '5000000',
        priceImpactPct: 0.0010622,
        slippageBps: 30,
        feeBps: 5,
        routePlan: [],
      };

      await adapter.swap(manualQuote, keypair.secretKey);

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      // The old code hardcoded userPublicKey: '' — Ultra rejects swaps with no owner.
      expect(body.userPublicKey).toBe(keypair.publicKey.toBase58());
      expect(body.userPublicKey).not.toBe('');
      expect(body.wrapAndUnwrapSol).toBe(true);
      expect(body.dynamicComputeUnitLimit).toBe(true);
      expect(body.prioritizationFeeLamports).toBe('auto');
    });
  });

  describe('swap — success and error paths', () => {
    const manualQuote: Quote = {
      inputMint: USDC_MINT,
      outputMint: SOL_MINT,
      inAmount: '1000000',
      outAmount: '5000000',
      priceImpactPct: 0.0010622,
      slippageBps: 30,
      feeBps: 5,
      routePlan: [],
    };

    it('returns a success result with the swapTransaction signature when the POST succeeds', async () => {
      const swapTx = 'x'.repeat(88);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ swapTransaction: swapTx }),
      });
      const keypair = Keypair.generate();

      const result = await adapter.swap(manualQuote, keypair.secretKey);

      expect(result.success).toBe(true);
      expect(result.signature).toBe(swapTx.substring(0, 64));
      expect(result.inputAmount).toBe('1000000');
      expect(result.outputAmount).toBe('5000000');
      // M4: the legacy display fee is OMITTED (never fabricated) when no
      // input-token VENUE/PLATFORM fee was observable — the manual quote has
      // no routePlan leg fees / platformFee, so feeUnknown flags the swap.
      expect(result.fee).toBeUndefined();
      expect(result.feeUnknown).toBe(true);
    });

    it('returns success:false with the API error text when the swap POST fails', async () => {
      global.fetch = failingSwapFetch();
      const keypair = Keypair.generate();

      const result = await adapter.swap(manualQuote, keypair.secretKey);

      expect(result.success).toBe(false);
      expect(result.inputAmount).toBe('1000000');
      expect(result.outputAmount).toBe('0');
      // M4: a failed swap carries no fee claim at all — never a fabricated '0'.
      expect(result.fee).toBeUndefined();
      expect(result.feeUnknown).toBe(true);
      expect(result.error).toContain('Ultra swap API error: 400');
      expect(result.error).toContain('mocked failure');
    });
  });
});
