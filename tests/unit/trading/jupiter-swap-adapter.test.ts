import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { JupiterSwapAdapter } from '../../../src/trading/dex/jupiter-swap-adapter.js';
import type { Quote } from '../../../src/trading/dex/dex-adapter.js';
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
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Clean env so the adapter is always constructed with production defaults.
    delete process.env.JUPITER_BASE_URL;
    delete process.env.JUPITER_API_KEY;
    adapter = new JupiterSwapAdapter();
  });

  afterEach(() => {
    // Restore the real fetch + env so no test leaks into the next.
    globalThis.fetch = originalFetch;
    delete process.env.JUPITER_BASE_URL;
    delete process.env.JUPITER_API_KEY;
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
      // Quote.routePlan is typed `unknown[] | undefined`, so cast before indexing.
      const routePlan = quote.routePlan as Array<{ swapInfo: { ammKey: string } }>;
      expect(routePlan[0].swapInfo.ammKey).toBe('amm1');
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

  describe('contract regression — live v1 endpoint (dead v6 quote-api.jup.ag)', () => {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';

    // v1 quote response shape: priceImpactPct is a STRING and routePlan is an array.
    const v1QuoteResponse = (priceImpactPct: number | string = 0.1) => ({
      inputMint: USDC_MINT,
      outputMint: SOL_MINT,
      inAmount: '1000000',
      outAmount: '5000000',
      priceImpactPct,
      routePlan: [],
    });

    const okFetch = (body: unknown) =>
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(body) });

    const swapQuote: Quote = {
      inputMint: USDC_MINT,
      outputMint: SOL_MINT,
      inAmount: '1000000',
      outAmount: '5000000',
      priceImpactPct: 0.0010622,
      slippageBps: 50,
      feeBps: 0,
      routePlan: [{ swapInfo: { ammKey: 'amm1' } }],
    };

    it('quotes against the live v1 endpoint by default — never the decommissioned v6 host', async () => {
      const mockFetch = okFetch(v1QuoteResponse());
      global.fetch = mockFetch;

      await adapter.quote(USDC_MINT, SOL_MINT, BigInt(1000000));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      // Regression guard: the old hardcoded default was
      // https://quote-api.jup.ag/v6 (decommissioned, dead in global DNS).
      expect(String(url)).toMatch(/^https:\/\/api\.jup\.ag\/swap\/v1\/quote\?/);
      expect(String(url)).not.toContain('quote-api.jup.ag');
      expect(String(url)).toContain('inputMint=');
      expect(String(url)).toContain('outputMint=');
      expect(String(url)).toContain('amount=1000000');
      expect(String(url)).toContain('slippageBps=50');
      expect(init?.headers).not.toHaveProperty('x-api-key');
    });

    it('targets JUPITER_BASE_URL when the env override is set', async () => {
      process.env.JUPITER_BASE_URL = 'https://example.com/api';
      // The baseUrl is captured at construction time, so build a fresh adapter
      // after setting the env var (the beforeEach adapter kept the default).
      const envAdapter = new JupiterSwapAdapter();
      const mockFetch = okFetch(v1QuoteResponse());
      global.fetch = mockFetch;

      await envAdapter.quote(USDC_MINT, SOL_MINT, BigInt(1000000));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(String(url)).toMatch(/^https:\/\/example\.com\/api\/quote\?/);
      expect(String(url)).not.toContain('api.jup.ag');
    });

    it('coerces the v1 string priceImpactPct to a number (the v1 reality)', async () => {
      global.fetch = okFetch(v1QuoteResponse('0.0010622'));

      const quote = await adapter.quote(USDC_MINT, SOL_MINT, BigInt(1000000));

      expect(quote.priceImpactPct).toBe(0.0010622);
      expect(typeof quote.priceImpactPct).toBe('number');
    });

    it('keeps a numeric priceImpactPct intact', async () => {
      global.fetch = okFetch(v1QuoteResponse(0.1));

      const quote = await adapter.quote(USDC_MINT, SOL_MINT, BigInt(1000000));

      expect(quote.priceImpactPct).toBe(0.1);
      expect(typeof quote.priceImpactPct).toBe('number');
    });

    it('sends x-api-key on the quote GET when JUPITER_API_KEY is set', async () => {
      process.env.JUPITER_API_KEY = 'test-api-key-123';
      const mockFetch = okFetch(v1QuoteResponse());
      global.fetch = mockFetch;

      await adapter.quote(USDC_MINT, SOL_MINT, BigInt(1000000));

      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).toMatch(/^https:\/\/api\.jup\.ag\/swap\/v1\/quote\?/);
      expect(init?.headers).toMatchObject({ 'x-api-key': 'test-api-key-123' });
    });

    it('sends the swap POST to the v1 /swap endpoint, without x-api-key when unset', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: vi.fn().mockResolvedValue('mocked failure'),
      });
      global.fetch = mockFetch;
      const keypair = Keypair.generate();

      // ok:false returns before the real transaction pipeline (deserialize/
      // simulate/send) runs — the request contract is what we assert here.
      await adapter.swap(swapQuote, keypair.secretKey);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).toBe('https://api.jup.ag/swap/v1/swap');
      expect(init?.method).toBe('POST');
      expect(init?.headers).not.toHaveProperty('x-api-key');
      expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });

      // Swap POST body contract (unchanged by the endpoint fix).
      const body = JSON.parse(init?.body as string);
      expect(body.quoteResponse.inputMint).toBe(USDC_MINT);
      expect(body.quoteResponse.priceImpactPct).toBe(0.0010622);
      expect(body.userPublicKey).toBe(keypair.publicKey.toBase58());
      expect(body.wrapAndUnwrapSol).toBe(true);
      expect(body.dynamicComputeUnitLimit).toBe(true);
      expect(body.prioritizationFeeLamports).toBe('auto');
    });

    it('carries x-api-key on the swap POST when JUPITER_API_KEY is set', async () => {
      process.env.JUPITER_API_KEY = 'test-api-key-123';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: vi.fn().mockResolvedValue('mocked failure'),
      });
      global.fetch = mockFetch;
      const keypair = Keypair.generate();

      await adapter.swap(swapQuote, keypair.secretKey);

      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).toBe('https://api.jup.ag/swap/v1/swap');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({ 'x-api-key': 'test-api-key-123' });
    });
  });

  describe('regression — /swap quoteResponse passthrough (v1 422 missing otherAmountThreshold)', () => {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';

    // Real Jupiter v1 /quote response shape (verbatim from a live probe):
    // inputMint, inAmount, outputMint, outAmount, otherAmountThreshold,
    // swapMode: "ExactIn", slippageBps, platformFee, priceImpactPct (STRING),
    // routePlan[{swapInfo{...}, percent, bps}], contextSlot, timeTaken,
    // swapUsdValue, instructionVersion, ...
    // simulateAtBestOffer is deliberately NOT part of the typed Quote — it
    // proves the adapter forwards the response VERBATIM instead of
    // reconstructing from a known field list (which is what caused the 422).
    const fullV1QuoteResponse = (overrides: Record<string, unknown> = {}) => ({
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
            updateContextSlot: 12345,
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
      ...overrides,
    });

    const okQuoteFetch = (body: unknown) =>
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(body) });

    // ok:false stops swap() before the real transaction pipeline
    // (deserialize/simulate/send) — only the request contract is asserted.
    const failingSwapFetch = () =>
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: vi.fn().mockResolvedValue('mocked failure'),
      });

    it('quote() stores the FULL raw API response as rawQuoteResponse', async () => {
      const raw = fullV1QuoteResponse();
      global.fetch = okQuoteFetch(raw);

      const quote = await adapter.quote(USDC_MINT, SOL_MINT, BigInt(1000000));

      // Every field the API returned is preserved — not a 6-field slice.
      expect(quote.rawQuoteResponse).toEqual(raw);
      expect(quote.otherAmountThreshold).toBe('4950000');
      expect(quote.swapMode).toBe('ExactIn');
    });

    it('swap() sends the rawQuoteResponse VERBATIM as quoteResponse — fields the old 6-field body dropped are present', async () => {
      const raw = fullV1QuoteResponse();
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
      expect(String(url)).toBe('https://api.jup.ag/swap/v1/swap');
      const body = JSON.parse(init?.body as string);

      // Verbatim: the /swap body is deep-equal to the raw /quote response.
      expect(body.quoteResponse).toEqual(raw);
      // Guards the bug — the old 6-field reconstruction dropped all of these:
      expect(body.quoteResponse.otherAmountThreshold).toBe('4950000');
      expect(body.quoteResponse.swapMode).toBe('ExactIn');
      expect(body.quoteResponse.contextSlot).toBe(123456);
      expect(body.quoteResponse.simulateAtBestOffer).toBe(false);
    });

    it('swap() falls back to a COMPLETE 9-field quoteResponse when rawQuoteResponse is absent (old 6-field body 422s)', async () => {
      const mockFetch = failingSwapFetch();
      global.fetch = mockFetch;
      const keypair = Keypair.generate();

      // A Quote constructed outside the adapter has no rawQuoteResponse.
      const manualQuote: Quote = {
        inputMint: USDC_MINT,
        outputMint: SOL_MINT,
        inAmount: '1000000',
        outAmount: '5000000',
        priceImpactPct: 0.0010622,
        slippageBps: 50,
        feeBps: 0,
        routePlan: [{ swapInfo: { ammKey: 'amm1' } }],
      };

      await adapter.swap(manualQuote, keypair.secretKey);

      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).toBe('https://api.jup.ag/swap/v1/swap');
      const body = JSON.parse(init?.body as string);

      // All 9 v1-required fields are present in the fallback. The old
      // 6-field body (no otherAmountThreshold, no swapMode) → HTTP 422.
      expect(body.quoteResponse.inputMint).toBe(USDC_MINT);
      expect(body.quoteResponse.outputMint).toBe(SOL_MINT);
      expect(body.quoteResponse.inAmount).toBe('1000000');
      expect(body.quoteResponse.outAmount).toBe('5000000');
      expect(body.quoteResponse.otherAmountThreshold).toBe('0'); // default
      expect(body.quoteResponse.swapMode).toBe('ExactIn'); // default
      expect(body.quoteResponse.slippageBps).toBe(50);
      expect(body.quoteResponse.priceImpactPct).toBe(0.0010622);
      expect(body.quoteResponse.routePlan).toEqual([{ swapInfo: { ammKey: 'amm1' } }]);
    });

    it('swap() fallback honors explicit otherAmountThreshold/swapMode on the Quote instead of the defaults', async () => {
      const mockFetch = failingSwapFetch();
      global.fetch = mockFetch;
      const keypair = Keypair.generate();

      const manualQuote: Quote = {
        inputMint: USDC_MINT,
        outputMint: SOL_MINT,
        inAmount: '1000000',
        outAmount: '5000000',
        priceImpactPct: 0.1,
        slippageBps: 50,
        feeBps: 0,
        routePlan: [],
        otherAmountThreshold: '4800000',
        swapMode: 'ExactOut',
      };

      await adapter.swap(manualQuote, keypair.secretKey);

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.quoteResponse.otherAmountThreshold).toBe('4800000');
      expect(body.quoteResponse.swapMode).toBe('ExactOut');
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
