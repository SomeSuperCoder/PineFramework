/**
 * Jupiter Ultra DEX adapter.
 *
 * Uses Jupiter Ultra API for improved execution pricing and routing.
 * Commission: Jupiter Ultra may apply a small fee for premium routing.
 *
 * @module trading
 */

import { captureSwapFeeComponents, DexAdapter } from './dex-adapter.js';
import type {
  Quote,
  SwapResult,
  TokenBalance,
  TxStatus,
  CommissionModel,
  SlippageConfig,
} from './dex-adapter.js';
import { Keypair } from '@solana/web3.js';
import { USDC_MINT } from '../token-registry.js';

/** Default slippage tolerance (30 bps = 0.3% — tighter than standard Swap).
 *  Per-adapter name to avoid collision with jupiter-swap-adapter's 50 bps. */
const JUPITER_ULTRA_SLIPPAGE_BPS = 30;

/** Maximum retries for swap operations. */
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Retry an async operation with exponential backoff.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = RETRY_BASE_DELAY_MS,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError!;
}

/**
 * Jupiter Ultra adapter.
 *
 * Jupiter Ultra provides improved pricing through:
 * - Shared liquidity routing
 * - Optimized order splitting
 * - Dynamic fee management
 */
export class JupiterUltraAdapter extends DexAdapter {
  readonly name = 'jupiter-ultra';
  readonly commissionModel: CommissionModel = {
    name: 'jupiter-ultra',
    // M4: no fixed rate is assumed — fees are OBSERVED from the API at
    // execution (captureSwapFeeComponents) instead of a fabricated 5 bps.
    feeBps: 0,
    variable: true,
    description: 'Jupiter Ultra — fees observed from the API at execution; no fixed rate assumed',
  };
  readonly slippageConfig: SlippageConfig = {
    bps: JUPITER_ULTRA_SLIPPAGE_BPS,
    configurable: true,
  };

  private readonly baseUrl: string;

  constructor(baseUrl = 'https://ultra-api.jup.ag/v1') {
    super();
    this.baseUrl = baseUrl;
  }

  async quote(
    inputMint: string,
    outputMint: string,
    amount: bigint,
    slippageBps: number = JUPITER_ULTRA_SLIPPAGE_BPS,
  ): Promise<Quote> {
    return retryWithBackoff(async () => {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
        dynamicSlippage: 'true',
      });

      const response = await fetch(`${this.baseUrl}/quote?${params}`);
      if (!response.ok) {
        throw new Error(`Jupiter Ultra quote API error: ${response.status} ${response.statusText}`);
      }

      // Ultra returns the full quote/fee-computation object that /swap expects
      // verbatim. Read the known leading fields with narrow widening, and keep the
      // whole response as rawQuoteResponse so swap() is not left reconstructing a
      // lossy 6-field copy (that reconstruction produced 422 field-drift errors).
      const data = (await response.json()) as unknown;

      const d = data as {
        inputMint?: string;
        outputMint?: string;
        inAmount?: string;
        outAmount?: string;
        priceImpactPct?: string | number;
        otherAmountThreshold?: string;
        swapMode?: string;
        route?: string;
        // M4: real fee data is preserved verbatim in rawQuoteResponse and
        // captured into FeeComponent[] by swap(); the bps is surfaced here.
        platformFee?: { amount?: string; feeBps?: number | string };
      };

      return {
        inputMint: d.inputMint ?? inputMint,
        outputMint: d.outputMint ?? outputMint,
        inAmount: d.inAmount ?? '0',
        outAmount: d.outAmount ?? '0',
        priceImpactPct: Number(d.priceImpactPct ?? 0), // API may return string or number; Number() handles both
        route: d.route ?? 'ultra-optimized',
        slippageBps,
        // M4: real platform fee bps when the quote surfaces one (absent → 0 —
        // never a fabricated rate).
        feeBps: Number(d.platformFee?.feeBps ?? 0) || 0,
        // Raw passthrough: /swap expects the exact quoteResponse from /quote.
        // Prefer this over any local reconstruction (the verbatim body → HTTP 200).
        rawQuoteResponse: data,
        otherAmountThreshold: d.otherAmountThreshold,
        swapMode: d.swapMode,
      };
    });
  }

  async swap(quote: Quote, privateKey: Uint8Array): Promise<SwapResult> {
    return retryWithBackoff(async () => {
      try {
        // The wallet that must receive the swap — derived from the supplied keypair.
        // Never hardcode an empty userPublicKey: Ultra rejects swaps with no owner.
        const keypair = Keypair.fromSecretKey(privateKey);

        // /swap expects the exact quoteResponse returned by /quote (Jupiter's
        // designed flow). Prefer the verbatim raw response — quote() always sets
        // it; fall back to a complete 9-field v1-valid shape (proven live: both
        // shapes return HTTP 200, the old 6-field reconstruction returned 422).
        const swapResponse = await fetch(`${this.baseUrl}/swap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteResponse: (quote.rawQuoteResponse as Record<string, unknown>) ?? {
              inputMint: quote.inputMint,
              outputMint: quote.outputMint,
              inAmount: quote.inAmount,
              outAmount: quote.outAmount,
              otherAmountThreshold: quote.otherAmountThreshold ?? '0',
              swapMode: quote.swapMode ?? 'ExactIn',
              slippageBps: quote.slippageBps,
              priceImpactPct: quote.priceImpactPct,
              routePlan: quote.routePlan,
            },
            userPublicKey: keypair.publicKey.toBase58(),
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: 'auto',
          }),
        });

        if (!swapResponse.ok) {
          const errorText = await swapResponse.text();
          return {
            success: false,
            inputAmount: quote.inAmount,
            outputAmount: '0',
            feeComponents: [],
            feeUnknown: true,
            error: `Ultra swap API error: ${swapResponse.status} — ${errorText}`,
          };
        }

        const swapData = (await swapResponse.json()) as {
          swapTransaction: string;
          // M4: /swap may echo the priority fee paid (we send
          // prioritizationFeeLamports: 'auto'); parse defensively.
          prioritizationFeeLamports?: number | string;
        };

        // M4: capture the REAL fees — venue/platform from the quote body
        // (routePlan leg fees + platformFee), priority echoed by /swap (when
        // present), base from the Solana protocol constant. Ultra may not echo
        // fees identically — capture what is present and flag feeUnknown when
        // nothing observable came back; never fabricate a rate.
        const quoteBody =
          (quote.rawQuoteResponse as { routePlan?: unknown; platformFee?: unknown } | undefined) ??
          {};
        const feeCapture = captureSwapFeeComponents({
          routePlan: quoteBody.routePlan,
          platformFee: quoteBody.platformFee,
          prioritizationFeeLamports: swapData.prioritizationFeeLamports,
          inputMint: quote.inputMint,
          // Swap-size context for the Security-F2 amount clamps.
          outputMint: quote.outputMint,
          inAmount: quote.inAmount,
          outAmount: quote.outAmount,
        });

        return {
          success: true,
          signature: swapData.swapTransaction.substring(0, 64),
          inputAmount: quote.inAmount,
          outputAmount: quote.outAmount,
          feeComponents: feeCapture.components,
          // Legacy display fee — present only when the input-token fee was
          // actually observed (never a fabricated '0').
          ...(feeCapture.inputTokenFee !== undefined ? { fee: feeCapture.inputTokenFee } : {}),
          ...(feeCapture.feeUnknown ? { feeUnknown: true } : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          inputAmount: quote.inAmount,
          outputAmount: '0',
          feeComponents: [],
          feeUnknown: true,
          error: message,
        };
      }
    });
  }

  async getBalance(mint: string, _publicKey: string): Promise<TokenBalance> {
    return {
      mint,
      amount: '0',
      decimals: mint === USDC_MINT ? 6 : 9,
    };
  }

  async getTransactionStatus(_signature: string): Promise<TxStatus> {
    return 'unknown';
  }
}
