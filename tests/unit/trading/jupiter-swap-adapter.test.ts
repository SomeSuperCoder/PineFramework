import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { JupiterSwapAdapter } from '../../../src/trading/dex/jupiter-swap-adapter.js';
import type { Quote } from '../../../src/trading/dex/dex-adapter.js';
import { USDC_MINT } from '../../../src/trading/solana-wallet.js';
import { TOKEN_MINTS } from '../../../src/trading/token-registry.js';

const { mockGetSolBalance, mockGetTokenBalance, mockSimulateTransaction, mockSendAndConfirm } =
  vi.hoisted(() => ({
    mockGetSolBalance: vi.fn(),
    mockGetTokenBalance: vi.fn(),
    mockSimulateTransaction: vi.fn(),
    mockSendAndConfirm: vi.fn(),
  }));

// Partial module mock (same module as chaos-equity-floor.test.ts, but only the
// balance helpers + the network-touching tx pipeline helpers are replaced):
// the real createConnection/isValidPublicKey/USDC_MINT stay live so existing
// tests keep their real behavior and getBalance exercises the real public-key
// validation gate without touching the network. simulateTransaction +
// sendAndConfirmTransactionWithTimeout are mocked because they hit the RPC;
// deserializeTransaction + signTransaction stay REAL so the v0 regression guard
// below exercises the real VersionedTransaction.deserialize + sign against a
// real captured Jupiter envelope.
vi.mock('../../../src/trading/solana-wallet.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/trading/solana-wallet.js')>();
  return {
    ...actual,
    getSolBalance: mockGetSolBalance,
    getTokenBalance: mockGetTokenBalance,
    simulateTransaction: mockSimulateTransaction,
    sendAndConfirmTransactionWithTimeout: mockSendAndConfirm,
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

  describe('v0 VersionedTransaction regression — swap() with a REAL /swap/v1 envelope', () => {
    const V0_OUTPUT_MINT = '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs';

    // REAL Jupiter /swap/v1 swapTransaction envelope, captured live 2026-08-06
    // (inputMint USDC → outputMint V0_OUTPUT_MINT, amount 452571). 968 bytes;
    // v0 message with the 0x80 version marker at offset 65 — the exact payload
    // that made legacy Transaction.from() throw "Versioned messages must be
    // deserialized with VersionedMessage.deserialize()" on every live order.
    // The envelope's required signer is the keypair behind V0_SIGNER_SECRET_B64.
    const V0_SWAP_TRANSACTION_B64 =
      'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAGE9JXjza0OwYWN8FpQi2NmLFc+BexjQ9Yy78+OZUQayafCgUkQaFYTleMcAX2p74eBXQZd1dwDyQZAPJfSv2KGc4rtxAwY0Cqhu8ZEP8TpEW0iH2xK4JjF0vuGVIrA6twykKKLdLiXi3Bgl5dSwWbcy3SVaOQnMGkeMSEh/o9iTQxaFisknu1ceHnpDB3toe0vIG96vzpC3DjUyPzHzFhCWSCZMXa/OXQOHX/+qMujrYkH0t8KiCddj7KM5Mlo2yOJYr3AXlIGiUJXFOXroEqROS3wzHepB3OaCgWv1SYVWAOklynx2oUN56BII5Cit8A7mYE7Tsr3m8pXy4h+x6z9XuV68PHm7yhCRAzQD1pzch0NxmESXA1rsdE7is3yLAaXrPZnFp4qv1uXWkqGzd7RXklMgyaUFGNvXVrMn4ddNIQuYWuPLoIHj1rtPdLNX3+MqAowL1C3mfnKmBZ/gHZOU3cCCQL0CtTHXMnxXCnjV+gISwHsFuu/Vcnl3QrFyEbWuVy1kMO0Oy3FkKDWDrqTC5dj81j9887QSMkt0+urzU7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAAAR51VvyMcBu7nTFbs5oFQf9sbLeo/SOUQKxzaJWvBOPjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+Fm0P/on9df2SnTAmx8pWHneSwmrNt/J3VFLMhqns4zl6OL4d+g9rsaIj0Orta57MRu3jDSWCJf85ae4LBbiD/GXZC/1WYEiP+IoDY52/S0RH9TeSvVyjfO0kAKfnUQHw7oEDgAFAsBcFQAOAAkDBBcBAAAAAAAQBgAFACMNHgEBDzYeEgAICgsFISMPDxEPJxImHQIKGxwbHBweJQ8gEh8XAgEUFRMeCRYGBw8iHhIaARkLGAQMAyQuwSCbM0HWnIEAAwAAAGgAZAABGmQBAhEBZAID2+cGAAAAAAD5XAAAAAAAADIAAANfdgQuNHFfoXxA2cQj3o7PuVZ5F8H5k38p8s1tvPXWHQUp3N7d4AQNKhTJI/mOnQpEOdrWCSnHDoq9iOZQcHeSzqQPvDk6cYhtwpoDEBUPAwQZHNX1BJ+5xopx4Bc9mNRq9M9kkGALXMYE2phoCsidpHAYA0pESANFRkk=';

    // Secret key of the throwaway keypair whose public key the envelope above
    // was built for (FA64ASuDpxAJTHahD3R4u6ZkRHSP6WXgd4NLroDiJ7ze). swap()
    // derives the keypair from the privateKey it receives, and
    // VersionedTransaction.sign() only accepts a required signer of the
    // message — so this fixture can only be signed with THIS keypair (a random
    // one throws "Cannot sign with non signer key", which is correct v0
    // behavior).
    const V0_SIGNER_SECRET_B64 =
      'cnm91YRwWGLz0lmxPISM8QcnKyjmuLqmhNbDAyjDztzSV482tDsGFjfBaUItjZixXPgXsY0PWMu/PjmVEGsmnw==';

    // Full v1 /quote response the adapter receives (real shape: priceImpactPct
    // is a STRING, routePlan is an array, otherAmountThreshold/swapMode present).
    const quoteResponse = (overrides: Record<string, unknown> = {}) => ({
      inputMint: USDC_MINT,
      inAmount: '452571',
      outputMint: V0_OUTPUT_MINT,
      outAmount: '23801',
      otherAmountThreshold: '23682',
      swapMode: 'ExactIn',
      slippageBps: 50,
      platformFee: { amount: '0', feeBps: 0 },
      priceImpactPct: '0',
      routePlan: [
        {
          swapInfo: {
            ammKey: 'amm1',
            label: 'Orca',
            inputMint: USDC_MINT,
            outputMint: V0_OUTPUT_MINT,
            inAmount: '452571',
            outAmount: '23801',
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

    beforeEach(() => {
      // The outer beforeEach only clears call history; reset implementations so
      // each test configures its own simulate/send behavior.
      mockSimulateTransaction.mockReset();
      mockSendAndConfirm.mockReset();
    });

    it('swap() resolves success:true through the REAL v0 deserialize+sign path — never the versioned-message error', async () => {
      mockSimulateTransaction.mockResolvedValue({ success: true });
      mockSendAndConfirm.mockResolvedValue({ success: true, signature: 'mock-v0-signature' });

      // Signer matching the envelope's required signer — the same flow as a
      // real live order (the adapter builds the /swap body with this keypair's
      // public key, so Jupiter returns an envelope signed by it).
      const signer = Keypair.fromSecretKey(Buffer.from(V0_SIGNER_SECRET_B64, 'base64'));

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(quoteResponse()) })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ swapTransaction: V0_SWAP_TRANSACTION_B64 }),
        });
      global.fetch = mockFetch;

      const quote = await adapter.quote(USDC_MINT, V0_OUTPUT_MINT, BigInt(452571));
      const result = await adapter.swap(quote, signer.secretKey);

      // The regression: on the OLD legacy Transaction.from() path this resolved
      // {success:false, error:"Versioned messages must be deserialized with
      // VersionedMessage.deserialize()"}. The v0 path must succeed.
      expect(result.success).toBe(true);
      expect(result.signature).toBe('mock-v0-signature');
      expect(result.error).toBeUndefined();
      expect(result.inputAmount).toBe('452571');
      expect(result.outputAmount).toBe('23801');
      expect(result.error ?? '').not.toContain('Versioned messages');

      // M9 fee contract: the real captured components (quote routePlan has no
      // feeAmount → BASE protocol fee only), feeUnknown because no observable
      // variable fee layer came back, and NO fabricated '0' fee.
      expect(result.feeComponents).toEqual([
        { kind: 'BASE', tokenMint: 'SOL', amountAtomic: '10000' },
      ]);
      expect(result.feeUnknown).toBe(true);
      expect(result.fee).toBeUndefined();

      // The pipeline reached simulate + send — the REAL deserialize+sign ran
      // first; a v0 deserialize failure would have short-circuited before these.
      expect(mockSimulateTransaction).toHaveBeenCalledTimes(1);
      expect(mockSendAndConfirm).toHaveBeenCalledTimes(1);
    });

    it('still returns {success:false, error} on a non-ok /swap response (error handling preserved by the v0 fix)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: vi.fn().mockResolvedValue('mocked failure'),
      });
      global.fetch = mockFetch;
      const keypair = Keypair.generate();

      const result = await adapter.swap(
        {
          inputMint: USDC_MINT,
          outputMint: V0_OUTPUT_MINT,
          inAmount: '452571',
          outAmount: '23801',
          priceImpactPct: 0,
          slippageBps: 50,
          feeBps: 0,
          routePlan: [],
        },
        keypair.secretKey,
      );

      expect(result).toEqual({
        success: false,
        inputAmount: '452571',
        outputAmount: '0',
        // M9: the failure path never fabricates fee '0' — no fee claim, feeUnknown.
        feeComponents: [],
        feeUnknown: true,
        error: 'Swap API error: 400 — mocked failure',
      });
      // Never reached the transaction pipeline.
      expect(mockSimulateTransaction).not.toHaveBeenCalled();
      expect(mockSendAndConfirm).not.toHaveBeenCalled();
    });

    it('swap() threads a failure signature when the send landed but confirmation failed (no-double-sell enabler)', async () => {
      mockSimulateTransaction.mockResolvedValue({ success: true });
      mockSendAndConfirm.mockResolvedValue({
        success: false,
        signature: 'mock-v0-signature',
        error: 'Transaction confirmation timeout',
      });

      const signer = Keypair.fromSecretKey(Buffer.from(V0_SIGNER_SECRET_B64, 'base64'));

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(quoteResponse()) })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ swapTransaction: V0_SWAP_TRANSACTION_B64 }),
        });
      global.fetch = mockFetch;

      const quote = await adapter.quote(USDC_MINT, V0_OUTPUT_MINT, BigInt(452571));
      const result = await adapter.swap(quote, signer.secretKey);

      // The send landed (signature exists) but confirm raced — the failure MUST
      // keep the signature so CloseManager can verify on-chain instead of
      // assuming nothing was sold (no-double-sell close retry rule).
      expect(result.success).toBe(false);
      expect(result.signature).toBe('mock-v0-signature');
      expect(result.error).toBe('Transaction confirmation timeout');
      expect(result.inputAmount).toBe('452571');
      expect(result.outputAmount).toBe('0');
      expect(mockSimulateTransaction).toHaveBeenCalledTimes(1);
      expect(mockSendAndConfirm).toHaveBeenCalledTimes(1);
    });

    it('swap() sanitizes an absurd input-mint venue fee — dropped, feeUnknown, no fabricated fee (Security F2)', async () => {
      mockSimulateTransaction.mockResolvedValue({ success: true });
      mockSendAndConfirm.mockResolvedValue({ success: true, signature: 'mock-v0-signature' });
      const signer = Keypair.fromSecretKey(Buffer.from(V0_SIGNER_SECRET_B64, 'base64'));

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(
            quoteResponse({
              routePlan: [
                {
                  swapInfo: {
                    ammKey: 'amm1',
                    label: 'Orca',
                    inputMint: USDC_MINT,
                    outputMint: V0_OUTPUT_MINT,
                    inAmount: '452571',
                    outAmount: '23801',
                    // Absurd: exceeds the swap's own inAmount (452571).
                    feeAmount: '99999999999999999999',
                    feeMint: USDC_MINT,
                  },
                  percent: 100,
                  bps: 10000,
                },
              ],
            }),
          ),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ swapTransaction: V0_SWAP_TRANSACTION_B64 }),
        });
      global.fetch = mockFetch;

      const quote = await adapter.quote(USDC_MINT, V0_OUTPUT_MINT, BigInt(452571));
      const result = await adapter.swap(quote, signer.secretKey);

      expect(result.success).toBe(true);
      // The absurd VENUE was dropped at the trust boundary — BASE protocol fee
      // only, feeUnknown (no observable layer survived), no fabricated '0'.
      expect(result.feeComponents).toEqual([
        { kind: 'BASE', tokenMint: 'SOL', amountAtomic: '10000' },
      ]);
      expect(result.feeUnknown).toBe(true);
      expect(result.fee).toBeUndefined();
    });
  });
});
