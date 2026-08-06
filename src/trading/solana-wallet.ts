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
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  ParsedAccountData,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
} from '@solana/spl-token';
import { SolanaConfig, createSolanaConfig, createSolanaConnection } from './solana-config.js';
import { TOKEN_MINTS, USDC_MINT } from './token-registry.js';

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

/** SOL mint address (native token). Re-exported from registry for backward compatibility. */
export const SOL_MINT = TOKEN_MINTS.SOL;

/** USDC mint address on Solana mainnet. Re-exported from registry for backward compatibility. */
export { USDC_MINT };

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
 *
 * Jupiter Swap v1 ALWAYS returns a VersionedTransaction (v0 message — 0x80
 * version marker). Legacy `Transaction.from()` routes to `Message.from()`,
 * which throws "Versioned messages must be deserialized with
 * VersionedMessage.deserialize()" on v0 payloads. The v0 deserializer is the
 * only correct path here.
 */
export function deserializeTransaction(base64Tx: string): VersionedTransaction {
  const txBuffer = Buffer.from(base64Tx, 'base64');
  return VersionedTransaction.deserialize(txBuffer);
}

/**
 * Sign a VersionedTransaction with a keypair.
 *
 * v0 messages have no legacy `partialSign()` — `VersionedTransaction.sign()`
 * (v1.98.4) signs in place by signer index and is the only supported path.
 * The instance is returned so callers can chain; it is the same object.
 */
export function signTransaction(
  transaction: VersionedTransaction,
  keypair: Keypair,
): VersionedTransaction {
  transaction.sign([keypair]);
  return transaction;
}

/**
 * Simulate a transaction before submission.
 *
 * Uses the v1.98.4 v0 overload
 * `Connection.simulateTransaction(transaction: VersionedTransaction, config?)`.
 */
export async function simulateTransaction(
  connection: Connection,
  transaction: VersionedTransaction,
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
 * Send a VersionedTransaction and wait for confirmation.
 *
 * The legacy `sendAndConfirmTransaction()` helper (v1.98.4) only accepts a
 * legacy `Transaction`, so it cannot send v0. Equivalent path:
 * `Connection.sendTransaction(transaction, { preflightCommitment })` (v0
 * overload) followed by `Connection.confirmTransaction(signature, commitment)`
 * — preserving the old 'confirmed' preflight + confirm semantics.
 *
 * v0 transactions are fully signed by `signTransaction()` BEFORE this is
 * called, so no `signers` argument exists (legacy `sendAndConfirmTransaction`
 * signed internally; `VersionedTransaction.sign()` cannot run here — it must
 * happen before serialization and is part of the swap flow upstream).
 */
export async function sendAndConfirmTransactionWithTimeout(
  connection: Connection,
  transaction: VersionedTransaction,
): Promise<TransactionResult> {
  try {
    const signature = await connection.sendTransaction(transaction, {
      preflightCommitment: 'confirmed',
    });

    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    if (confirmation.value.err) {
      return {
        success: false,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

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

    if (
      status.value?.confirmationStatus === 'confirmed' ||
      status.value?.confirmationStatus === 'finalized'
    ) {
      return { confirmed: true };
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_INTERVAL_MS));
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
