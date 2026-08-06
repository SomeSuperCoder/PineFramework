/**
 * Jupiter Ultra DEX adapter.
 *
 * Uses Jupiter Ultra API for improved execution pricing and routing.
 * Commission: Jupiter Ultra may apply a small fee for premium routing.
 *
 * @module trading
 */

import { DexAdapter } from './dex-adapter.js';
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

/** Default slippage tolerance (30 bps = 0.3% — tighter than standard Swap). */
const DEFAULT_SLIPPAGE_BPS = 30;

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
    feeBps: 5,
    variable: false,
    description: 'Jupiter Ultra — fixed 5 bps fee for premium routing and execution',
  };
  readonly slippageConfig: SlippageConfig = {
    bps: DEFAULT_SLIPPAGE_BPS,
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
    slippageBps: number = DEFAULT_SLIPPAGE_BPS,
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
      };

      return {
        inputMint: d.inputMint ?? inputMint,
        outputMint: d.outputMint ?? outputMint,
        inAmount: d.inAmount ?? '0',
        outAmount: d.outAmount ?? '0',
        priceImpactPct: Number(d.priceImpactPct ?? 0), // API may return string or number; Number() handles both
        route: d.route ?? 'ultra-optimized',
        slippageBps,
        feeBps: this.commissionModel.feeBps,
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
            fee: '0',
            error: `Ultra swap API error: ${swapResponse.status} — ${errorText}`,
          };
        }

        const swapData = (await swapResponse.json()) as {
          swapTransaction: string;
        };

        return {
          success: true,
          signature: swapData.swapTransaction.substring(0, 64),
          inputAmount: quote.inAmount,
          outputAmount: quote.outAmount,
          fee: String(Number(quote.inAmount) * (this.commissionModel.feeBps / 10000)),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          inputAmount: quote.inAmount,
          outputAmount: '0',
          fee: '0',
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
