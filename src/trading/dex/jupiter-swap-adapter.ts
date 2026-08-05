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
import type {
  Quote,
  SwapResult,
  TokenBalance,
  TxStatus,
  CommissionModel,
  SlippageConfig,
} from './dex-adapter.js';
import {
  createConnection,
  getSolBalance,
  getTokenBalance,
  deserializeTransaction,
  signTransaction,
  simulateTransaction,
  sendAndConfirmTransactionWithTimeout,
  isValidPublicKey,
} from '../solana-wallet.js';
import { Keypair } from '@solana/web3.js';
import { TOKEN_MINTS, USDC_MINT } from '../token-registry.js';

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
  private readonly connection;

  constructor(baseUrl = 'https://quote-api.jup.ag/v6') {
    super();
    this.baseUrl = baseUrl;
    this.connection = createConnection();
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
        slippageBps,
        feeBps: 0, // Jupiter API doesn't return fee in quote — computed at swap
        routePlan: data.routePlan, // Preserve original routePlan array for swap requests
      };
    });
  }

  async swap(quote: Quote, privateKey: Uint8Array): Promise<SwapResult> {
    return retryWithBackoff(async () => {
      try {
        // Create keypair from private key
        const keypair = Keypair.fromSecretKey(privateKey);

        // Get swap transaction from Jupiter API
        // Send routePlan array (not route string) for API v6 compatibility
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
              routePlan: quote.routePlan, // Use routePlan array instead of route string
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
            error: `Swap API error: ${swapResponse.status} — ${errorText}`,
          };
        }

        const swapData = (await swapResponse.json()) as {
          swapTransaction: string;
        };

        // Deserialize the transaction
        const transaction = deserializeTransaction(swapData.swapTransaction);

        // Sign the transaction
        signTransaction(transaction, keypair);

        // Simulate before submission
        const simulation = await simulateTransaction(this.connection, transaction);
        if (!simulation.success) {
          return {
            success: false,
            inputAmount: quote.inAmount,
            outputAmount: '0',
            fee: '0',
            error: simulation.error,
          };
        }

        // Submit the transaction
        const result = await sendAndConfirmTransactionWithTimeout(this.connection, transaction, [
          keypair,
        ]);

        if (!result.success) {
          return {
            success: false,
            inputAmount: quote.inAmount,
            outputAmount: '0',
            fee: '0',
            error: result.error,
          };
        }

        return {
          success: true,
          signature: result.signature,
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

  async getBalance(mint: string, publicKey: string): Promise<TokenBalance> {
    // Validate public key
    if (!isValidPublicKey(publicKey)) {
      return {
        mint,
        amount: '0',
        decimals: mint === USDC_MINT ? 6 : 9,
      };
    }

    try {
      // Check if this is native SOL
      if (mint === TOKEN_MINTS.SOL) {
        const balance = await getSolBalance(this.connection, publicKey);
        return {
          mint,
          amount: balance.amount.toString(),
          decimals: balance.decimals,
        };
      }

      // SPL token balance
      const balance = await getTokenBalance(this.connection, publicKey, mint);
      return {
        mint,
        amount: balance.amount.toString(),
        decimals: balance.decimals,
      };
    } catch (err) {
      // Return zero balance on error
      return {
        mint,
        amount: '0',
        decimals: mint === USDC_MINT ? 6 : 9,
      };
    }
  }

  async getTransactionStatus(signature: string): Promise<TxStatus> {
    try {
      const status = await this.connection.getSignatureStatus(signature);

      if (!status.value) {
        return 'unknown';
      }

      if (status.value.err) {
        return 'failed';
      }

      if (
        status.value.confirmationStatus === 'confirmed' ||
        status.value.confirmationStatus === 'finalized'
      ) {
        return 'confirmed';
      }

      return 'unknown';
    } catch (err) {
      return 'unknown';
    }
  }
}
