/**
 * Solana wallet operations for balance queries and transaction handling.
 *
 * Provides functions to query SOL and SPL token balances,
 * derive Associated Token Account addresses, and handle transactions.
 *
 * @module trading
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  ParsedAccountData,
} from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TokenAccountNotFoundError } from '@solana/spl-token';
import { SolanaConfig, createSolanaConfig, createSolanaConnection } from './solana-config.js';

// ---- Types ----

export interface SolanaBalance {
  /** Balance in lamports (SOL) or smallest units (SPL tokens). */
  amount: bigint;
  /** Balance in human-readable format. */
  humanReadable: number;
  /** Token decimals. */
  decimals: number;
}

export interface TransactionResult {
  /** Whether the transaction succeeded. */
  success: boolean;
  /** Transaction signature. */
  signature?: string;
  /** Error message if failed. */
  error?: string;
}

// ---- Constants ----

/** SOL mint address (native token). */
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

/** USDC mint address on Solana mainnet. */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Maximum transaction confirmation timeout (ms). */
const MAX_CONFIRM_TIMEOUT_MS = 60_000;

/** Polling interval for transaction confirmation (ms). */
const CONFIRM_POLL_INTERVAL_MS = 2_000;

// ---- Connection Management ----

/**
 * Create a Solana connection from environment or defaults.
 */
export function createConnection(config?: SolanaConfig): Connection {
  const solanaConfig = config ?? createSolanaConfig();
  return createSolanaConnection(solanaConfig);
}

// ---- Balance Queries ----

/**
 * Get SOL balance for a public key.
 */
export async function getSolBalance(
  connection: Connection,
  publicKey: string,
): Promise<SolanaBalance> {
  const pubkey = new PublicKey(publicKey);
  const balance = await connection.getBalance(pubkey);

  return {
    amount: BigInt(balance),
    humanReadable: balance / LAMPORTS_PER_SOL,
    decimals: 9,
  };
}

/**
 * Get SPL token balance for a public key and mint.
 */
export async function getTokenBalance(
  connection: Connection,
  walletPublicKey: string,
  mintAddress: string,
): Promise<SolanaBalance> {
  const walletPubkey = new PublicKey(walletPublicKey);
  const mintPubkey = new PublicKey(mintAddress);

  try {
    // Derive Associated Token Account address
    const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);

    // Get token account info
    const tokenAccount = await getAccount(connection, ata);

    // Get mint decimals
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    const decimals = (mintInfo.value?.data as ParsedAccountData)?.parsed?.info?.decimals ?? 6;

    return {
      amount: tokenAccount.amount,
      humanReadable: Number(tokenAccount.amount) / Math.pow(10, decimals),
      decimals,
    };
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError) {
      // Token account doesn't exist — zero balance
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      const decimals = (mintInfo.value?.data as ParsedAccountData)?.parsed?.info?.decimals ?? 6;

      return {
        amount: BigInt(0),
        humanReadable: 0,
        decimals,
      };
    }
    throw err;
  }
}

/**
 * Get native SOL balance using the DEX adapter interface.
 */
export async function getNativeBalance(
  connection: Connection,
  publicKey: string,
): Promise<{ amount: string; decimals: number }> {
  const balance = await getSolBalance(connection, publicKey);
  return {
    amount: balance.amount.toString(),
    decimals: balance.decimals,
  };
}

/**
 * Get SPL token balance using the DEX adapter interface.
 */
export async function getSplTokenBalance(
  connection: Connection,
  walletPublicKey: string,
  mintAddress: string,
): Promise<{ amount: string; decimals: number }> {
  const balance = await getTokenBalance(connection, walletPublicKey, mintAddress);
  return {
    amount: balance.amount.toString(),
    decimals: balance.decimals,
  };
}

// ---- Transaction Operations ----

/**
 * Deserialize a base64-encoded transaction.
 */
export function deserializeTransaction(base64Tx: string): Transaction {
  const txBuffer = Buffer.from(base64Tx, 'base64');
  return Transaction.from(txBuffer);
}

/**
 * Sign a transaction with a keypair.
 */
export function signTransaction(
  transaction: Transaction,
  keypair: Keypair,
): Transaction {
  transaction.partialSign(keypair);
  return transaction;
}

/**
 * Simulate a transaction before submission.
 */
export async function simulateTransaction(
  connection: Connection,
  transaction: Transaction,
): Promise<{ success: boolean; error?: string }> {
  try {
    const simulation = await connection.simulateTransaction(transaction);

    if (simulation.value.err) {
      return {
        success: false,
        error: `Simulation failed: ${JSON.stringify(simulation.value.err)}`,
      };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Simulation error: ${message}`,
    };
  }
}

/**
 * Send a transaction and wait for confirmation.
 */
export async function sendAndConfirmTransactionWithTimeout(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  _timeoutMs: number = MAX_CONFIRM_TIMEOUT_MS,
): Promise<TransactionResult> {
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      signers,
      {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      },
    );

    return {
      success: true,
      signature,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Wait for transaction confirmation with polling.
 */
export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  timeoutMs: number = MAX_CONFIRM_TIMEOUT_MS,
): Promise<{ confirmed: boolean; err?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await connection.getSignatureStatus(signature);

    if (status.value?.err) {
      return {
        confirmed: false,
        err: `Transaction failed: ${JSON.stringify(status.value.err)}`,
      };
    }

    if (status.value?.confirmationStatus === 'confirmed' ||
        status.value?.confirmationStatus === 'finalized') {
      return { confirmed: true };
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, CONFIRM_POLL_INTERVAL_MS));
  }

  return {
    confirmed: false,
    err: `Transaction confirmation timeout after ${timeoutMs}ms`,
  };
}

// ---- Utility Functions ----

/**
 * Check if a string is a valid Solana public key.
 */
export function isValidPublicKey(key: string): boolean {
  try {
    new PublicKey(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert lamports to SOL.
 */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Convert SOL to lamports.
 */
export function solToLamports(sol: number): number {
  return sol * LAMPORTS_PER_SOL;
}
