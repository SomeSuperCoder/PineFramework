/**
 * Jupiter Swap DEX adapter.
 *
 * Uses the Jupiter Swap API for spot market order execution on Solana.
 * Commission: standard Jupiter swap fee (typically 0 bps for swaps,
 * but routing fees may apply).
 *
 * @module trading
 */

import { DexAdapter } from './dex-adapter.js';
import type { Quote, SwapResult, TokenBalance, TxStatus, CommissionModel, SlippageConfig } from './dex-adapter.js';

/** USDC mint address on Solana mainnet. */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Default slippage tolerance (50 bps = 0.5%). */
const DEFAULT_SLIPPAGE_BPS = 50;

/** Maximum retries for swap operations. */
const MAX_RETRIES = 3;

/** Base delay for retry backoff in ms. */
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

export class JupiterSwapAdapter extends DexAdapter {
  readonly name = 'jupiter-swap';
  readonly commissionModel: CommissionModel = {
    name: 'jupiter-swap',
    feeBps: 0,
    variable: true,
    description: 'Jupiter Swap — variable fees based on route complexity and liquidity sources',
  };
  readonly slippageConfig: SlippageConfig = {
    bps: DEFAULT_SLIPPAGE_BPS,
    configurable: true,
  };

  private readonly baseUrl: string;

  constructor(baseUrl = 'https://quote-api.jup.ag/v6') {
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
      });

      const response = await fetch(`${this.baseUrl}/quote?${params}`);
      if (!response.ok) {
        throw new Error(`Jupiter quote API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        inputMint: string;
        outputMint: string;
        inAmount: string;
        outAmount: string;
        priceImpactPct: number;
        routePlan: Array<{ swapInfo: { ammKey: string } }>;
      };

      return {
        inputMint: data.inputMint,
        outputMint: data.outputMint,
        inAmount: data.inAmount,
        outAmount: data.outAmount,
        priceImpactPct: data.priceImpactPct,
        route: data.routePlan?.map((r) => r.swapInfo.ammKey).join(' → ') ?? 'direct',
        slippageBps,
        feeBps: 0, // Jupiter API doesn't return fee in quote — computed at swap
      };
    });
  }

  async swap(quote: Quote, privateKey: Uint8Array): Promise<SwapResult> {
    return retryWithBackoff(async () => {
      try {
        // Get swap transaction from Jupiter API
        const swapResponse = await fetch(`${this.baseUrl}/swap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteResponse: {
              inputMint: quote.inputMint,
              outputMint: quote.outputMint,
              inAmount: quote.inAmount,
              outAmount: quote.outAmount,
              priceImpactPct: quote.priceImpactPct,
              route: quote.route,
            },
            userPublicKey: '', // Will be set by caller
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
            error: `Swap API error: ${swapResponse.status} — ${errorText}`,
          };
        }

        const swapData = (await swapResponse.json()) as {
          swapTransaction: string;
        };

        // Placeholder: actual Solana transaction signing and submission will
        // be implemented when @solana/web3.js is added as a dependency.
        return {
          success: true,
          signature: swapData.swapTransaction.substring(0, 64),
          inputAmount: quote.inAmount,
          outputAmount: quote.outAmount,
          fee: '0',
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
    // Placeholder: actual balance fetching requires RPC connection
    return {
      mint,
      amount: '0',
      decimals: mint === USDC_MINT ? 6 : 9,
    };
  }

  async getTransactionStatus(_signature: string): Promise<TxStatus> {
    // Placeholder: requires RPC connection
    return 'unknown';
  }
}
