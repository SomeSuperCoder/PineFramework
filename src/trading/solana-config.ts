/**
 * Solana RPC configuration for the trading bot.
 *
 * Provides connection settings for Solana mainnet/devnet,
 * including RPC endpoint, commitment level, and network selection.
 *
 * @module trading
 */

import { Commitment, Connection, ConnectionConfig } from '@solana/web3.js';

// ---- Types ----

export interface SolanaConfig {
  /** Solana RPC endpoint URL. */
  rpcUrl: string;
  /** Commitment level for transactions and queries. */
  commitment: Commitment;
  /** WebSocket endpoint for real-time updates (optional). */
  wsUrl?: string;
  /** Network selection (mainnet-beta, devnet, testnet). */
  network: 'mainnet-beta' | 'devnet' | 'testnet';
}

export interface SolanaConfigOptions {
  /** Override RPC URL (otherwise from env or default). */
  rpcUrl?: string;
  /** Override commitment level. */
  commitment?: Commitment;
  /** Override network selection. */
  network?: 'mainnet-beta' | 'devnet' | 'testnet';
}

// ---- Constants ----

/** Default RPC endpoints by network. */
const DEFAULT_RPC_ENDPOINTS: Record<string, string> = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
};

/** Default commitment level. */
const DEFAULT_COMMITMENT: Commitment = 'confirmed';

/** Environment variable names. */
const ENV_RPC_URL = 'SOLANA_RPC_URL';
const ENV_COMMITMENT = 'SOLANA_COMMITMENT';
const ENV_NETWORK = 'SOLANA_NETWORK';

// ---- Configuration ----

/**
 * Create a Solana configuration from options and environment variables.
 *
 * Priority:
 * 1. Explicit options (highest)
 * 2. Environment variables
 * 3. Defaults (lowest)
 */
export function createSolanaConfig(options?: SolanaConfigOptions): SolanaConfig {
  const network = options?.network
    ?? (process.env[ENV_NETWORK] as 'mainnet-beta' | 'devnet' | 'testnet')
    ?? 'devnet'; // Default to devnet for safety

  const rpcUrl = options?.rpcUrl
    ?? process.env[ENV_RPC_URL]
    ?? DEFAULT_RPC_ENDPOINTS[network];

  const commitment = options?.commitment
    ?? (process.env[ENV_COMMITMENT] as Commitment)
    ?? DEFAULT_COMMITMENT;

  return {
    rpcUrl,
    commitment,
    network,
    wsUrl: rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://'),
  };
}

/**
 * Create a Solana Connection from configuration.
 */
export function createSolanaConnection(config: SolanaConfig): Connection {
  const connectionConfig: ConnectionConfig = {
    commitment: config.commitment,
    wsEndpoint: config.wsUrl,
  };
  return new Connection(config.rpcUrl, connectionConfig);
}

/**
 * Get the default Solana configuration (devnet).
 */
export function getDefaultSolanaConfig(): SolanaConfig {
  return createSolanaConfig();
}

/**
 * Check if the current configuration is for mainnet.
 */
export function isMainnet(config: SolanaConfig): boolean {
  return config.network === 'mainnet-beta';
}

/**
 * Check if the current configuration is for devnet.
 */
export function isDevnet(config: SolanaConfig): boolean {
  return config.network === 'devnet';
}
