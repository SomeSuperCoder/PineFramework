/**
 * Spot trading logic for DEX adapters.
 *
 * Handles:
 * - Opening long positions (USDC → Asset)
 * - Closing long positions (Asset → USDC)
 * - Balance checks and validation
 *
 * @module trading
 */

import { DexAdapter } from './dex-adapter.js';

/** USDC mint address on Solana mainnet. */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Minimum USDC balance required for trading (in smallest units). */
const MIN_USDC_BALANCE = BigInt(1_000_000); // 1 USDC (6 decimals)

export interface SpotTradeParams {
  /** Token mint address of the asset to trade. */
  assetMint: string;
  /** Amount in smallest units. For buy: USDC amount. For sell: asset amount. */
  amount: bigint;
  /** Slippage tolerance in basis points. */
  slippageBps: number;
  /** Wallet private key for signing. */
  privateKey: Uint8Array;
  /** Wallet public key string. */
  publicKey: string;
}

export interface SpotTradeResult {
  success: boolean;
  inputAmount: string;
  outputAmount: string;
  fee: string;
  signature?: string;
  error?: string;
}

/**
 * Open a long position: swap USDC for the target asset.
 * This is a "buy" operation.
 */
export async function openLongPosition(
  dex: DexAdapter,
  params: SpotTradeParams,
): Promise<SpotTradeResult> {
  // Validate USDC balance
  const usdcBalance = await dex.getBalance(USDC_MINT, params.publicKey);
  const usdcAmount = BigInt(usdcBalance.amount);

  if (usdcAmount < params.amount) {
    return {
      success: false,
      inputAmount: params.amount.toString(),
      outputAmount: '0',
      fee: '0',
      error: `Insufficient USDC balance: have ${usdcAmount}, need ${params.amount}`,
    };
  }

  if (usdcAmount < MIN_USDC_BALANCE) {
    return {
      success: false,
      inputAmount: params.amount.toString(),
      outputAmount: '0',
      fee: '0',
      error: `USDC balance below minimum: ${usdcAmount} < ${MIN_USDC_BALANCE}`,
    };
  }

  try {
    // Get quote
    const quote = await dex.quote(USDC_MINT, params.assetMint, params.amount, params.slippageBps);

    // Execute swap
    const result = await dex.swap(quote, params.privateKey);

    if (!result.success) {
      return {
        success: false,
        inputAmount: params.amount.toString(),
        outputAmount: '0',
        fee: result.fee ?? '0',
        error: result.error ?? 'Swap failed',
      };
    }

    return {
      success: true,
      inputAmount: result.inputAmount,
      outputAmount: result.outputAmount,
      fee: result.fee,
      signature: result.signature,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      inputAmount: params.amount.toString(),
      outputAmount: '0',
      fee: '0',
      error: message,
    };
  }
}

/**
 * Close a long position: swap the asset back to USDC.
 * This is a "sell" operation.
 */
export async function closeLongPosition(
  dex: DexAdapter,
  params: SpotTradeParams,
): Promise<SpotTradeResult> {
  // Validate asset balance
  const assetBalance = await dex.getBalance(params.assetMint, params.publicKey);
  const assetAmount = BigInt(assetBalance.amount);

  if (assetAmount < params.amount) {
    return {
      success: false,
      inputAmount: params.amount.toString(),
      outputAmount: '0',
      fee: '0',
      error: `Insufficient asset balance: have ${assetAmount}, need ${params.amount}`,
    };
  }

  try {
    // Get quote (swap asset → USDC)
    const quote = await dex.quote(params.assetMint, USDC_MINT, params.amount, params.slippageBps);

    // Execute swap
    const result = await dex.swap(quote, params.privateKey);

    if (!result.success) {
      return {
        success: false,
        inputAmount: params.amount.toString(),
        outputAmount: '0',
        fee: result.fee ?? '0',
        error: result.error ?? 'Swap failed',
      };
    }

    return {
      success: true,
      inputAmount: result.inputAmount,
      outputAmount: result.outputAmount,
      fee: result.fee,
      signature: result.signature,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      inputAmount: params.amount.toString(),
      outputAmount: '0',
      fee: '0',
      error: message,
    };
  }
}
