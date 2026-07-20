/**
 * Jupiter Fee Fetcher
 *
 * Fetches real-time DEX swap fees from the Jupiter Quote API for a given
 * trading pair. Used to calibrate backtest commission estimates with
 * current on-chain fee conditions rather than hardcoding a default.
 *
 * ── Cache strategy ──
 *
 *   Two-tier: in-memory (session) → persistent (disk).
 *
 *   A persistent JSON file at ~/.pine/jupiter-fees.json stores the
 *   last-known fee per symbol. On startup, if the API is unreachable,
 *   the fetcher falls back to this cache. If neither API nor cache is
 *   available, the call throws.
 *
 * ── API ──
 *
 *   GET https://quote-api.jup.ag/v6/quote?inputMint=...&outputMint=...&amount=...
 *
 *   Response includes routePlan[].swapInfo with:
 *     - outAmount:  output token amount (atomic units, after fee)
 *     - feeAmount:  optional — fee deducted, in feeMint token (atomic units)
 *     - label:      DEX name (e.g. "Raydium", "Orca V2", "Meteora DLMM")
 *     - feeMint:    mint address of the token the fee is paid in
 *
 *   Fee extraction strategy (per route step):
 *     1. If feeAmount + feeMint are present → compute from ratio
 *     2. Else → look up known fee for the DEX label
 *     3. Else → use conservative default (25 bps)
 *
 *   Then weighted-average across steps by percent.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { parsePairSymbol } from './commission-calculator.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';

/**
 * Default sample amount in atomic units (~0.01 SOL worth for 9-decimal
 * tokens, ~10 USDC for 6-decimal tokens). The fee structure is percentage-
 * based, so the exact amount only needs to be above the minimum swap
 * threshold for the pair.
 */
const DEFAULT_SAMPLE_AMOUNT = 10_000_000;

/** Path to the persistent fee cache. */
const CACHE_PATH = path.join(os.homedir(), '.pine', 'jupiter-fees.json');

/** Stale threshold for cache entries (30 days). */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Token mint addresses on Solana
// ---------------------------------------------------------------------------

/** Well-known native Solana token mints. */
const TOKEN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USD: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  MSOL: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  MNDE: 'MNDEFzGvMt87ueuHvcsU3Jh1LMMqtMJF5Z5k6bSgxLL',
  SRM: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeSAdsrsu',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  STSOL: '7dHbWXmci3dT8UFYWqweMEc6c4uyiQvRY4HcT2z7e6c',
  JITOSOL: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
  BSOL: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',
};

/** Bridged/foreign token mints on Solana. */
const BRIDGED_MINTS: Record<string, string> = {
  BTC: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  BNB: 'bnj35V3tC6ELwYceVAKJkWkLn8mCRgxiUc2K9NJs3bN',
};

// ---------------------------------------------------------------------------
// Known DEX fees on Solana (fallback when feeAmount is not in the response)
// ---------------------------------------------------------------------------

/**
 * Known DEX swap fees in bps, keyed by the label returned by Jupiter's
 * routePlan. These are used as fallback when the API response doesn't
 * include feeAmount/feeMint for a route step.
 *
 * Sources: official DEX docs, Jupiter route labels.
 */
const KNOWN_DEX_FEES: Record<string, number> = {
  // Major CPMMs
  Raydium: 25,
  'Raydium CPMM': 25,
  'Raydium CLMM': 20, // Concentrated liquidity — varies, 20 is a rough average
  'Orca': 20, // varies 1-30, 20 is rough average for volatile pairs
  'Orca V2': 20,
  'Orca Whirlpool': 20,
  'Meteora DLMM': 10, // Dynamic — varies widely, 10 is a conservative average
  'Meteora Pools': 10,
  'DexLab': 25,

  // Smaller / niche DEXes
  'Lifinity V2': 10,
  'Lifinity': 10,
  'Crema': 25,
  'Aldrin': 25,
  'Cropper': 25,
  'Saber': 1,
  'Saber (Decimals)': 1,
  'Mercurial': 1,
  'GooseFX': 25,
  'Saros': 25,
  'Stepn': 25,
  'Step Finance': 25,
  'Invariant': 10,
  'OpenBook': 0, // Order-book — no swap fee (taker fees separate)
  'Phantom': 25,
  'Whirlpool': 20,
  'Guacswap': 25,
  'Penguin': 25,
  'Sanctum': 10,

  // Stable swap AMMs (typically very low fees)
  'Saber (Stable)': 1,
  'Mercurial (Stable)': 1,
  'BonkSwap': 25,

  // Labels that signal a direct route with no intermediary
  DEFAULT: 25,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeeFetchResult {
  /** DEX swap fee in basis points (1 bps = 0.01%). */
  dexFeeBps: number;
  /** Where the fee was sourced from. */
  source: 'api' | 'cache' | 'in-memory-cache';
  /** Human-readable DEX label(s) from the route. */
  dexLabel?: string;
}

interface CacheEntry {
  dexFeeBps: number;
  timestamp: number;
  dexLabel?: string;
}

interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}

// ---------------------------------------------------------------------------
// In-memory cache (session-scoped)
// ---------------------------------------------------------------------------

const memCache = new Map<string, FeeFetchResult>();

// ---------------------------------------------------------------------------
// Persistent cache I/O
// ---------------------------------------------------------------------------

function readCacheFile(): CacheFile {
  try {
    if (!fs.existsSync(CACHE_PATH)) {
      return { version: 1, entries: {} };
    }
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as CacheFile;
  } catch {
    return { version: 1, entries: {} };
  }
}

function writeCacheFile(cache: CacheFile): void {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // Non-fatal — persistence is best-effort
  }
}

function getCacheEntry(symbol: string): CacheEntry | undefined {
  const cache = readCacheFile();
  const entry = cache.entries[symbol.toUpperCase()];
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) return undefined;
  return entry;
}

function setCacheEntry(symbol: string, entry: CacheEntry): void {
  const cache = readCacheFile();
  cache.entries[symbol.toUpperCase()] = entry;
  writeCacheFile(cache);
}

// ---------------------------------------------------------------------------
// Mint resolution
// ---------------------------------------------------------------------------

/**
 * Map a trading pair symbol (e.g. "SOLUSDT", "BTCUSDT") to Solana mint
 * addresses for the Jupiter Quote API.
 *
 * Returns null for pairs that cannot be mapped (unsupported tokens).
 */
function symbolToMints(symbol: string): { inputMint: string; outputMint: string } | null {
  const pair = parsePairSymbol(symbol);
  if (!pair) return null;

  const { base, quote } = pair;
  const inputMint = TOKEN_MINTS[base] ?? BRIDGED_MINTS[base];
  const outputMint = TOKEN_MINTS[quote] ?? BRIDGED_MINTS[quote];

  if (!inputMint || !outputMint) return null;
  return { inputMint, outputMint };
}

// ---------------------------------------------------------------------------
// Fee extraction
// ---------------------------------------------------------------------------

/**
 * Get the known DEX fee for a given DEX label, falling back to default.
 */
function getKnownFeeBps(label: string): number {
  // Try exact match first
  const exact = KNOWN_DEX_FEES[label];
  if (exact !== undefined) return exact;

  // Try partial match (e.g. "Orca V2" contains "Orca")
  for (const [key, fee] of Object.entries(KNOWN_DEX_FEES)) {
    if (label.toLowerCase().includes(key.toLowerCase())) {
      return fee;
    }
  }

  return KNOWN_DEX_FEES.DEFAULT;
}

/**
 * Compute the DEX fee in bps from a single route step.
 *
 * Strategy (in order of preference):
 *   1. If feeAmount is present → compute from fee / output ratio
 *   2. Else → look up known fee for the DEX label
 *   3. Else → return 0 (caller handles the fallback)
 */
function computeStepBps(step: {
  swapInfo: {
    label?: string;
    inAmount: string;
    outAmount: string;
    feeAmount?: string;
    feeMint?: string;
    outputMint: string;
  };
}): number {
  const inAmount = Number.parseInt(step.swapInfo.inAmount, 10);
  const outAmount = Number.parseInt(step.swapInfo.outAmount, 10);

  if (inAmount <= 0 || outAmount <= 0) return 0;

  // Strategy 1: feeAmount explicit in response
  const feeAmountStr = step.swapInfo.feeAmount;
  const feeMint = step.swapInfo.feeMint;
  if (feeAmountStr !== undefined && feeMint !== undefined) {
    const feeAmount = Number.parseInt(feeAmountStr, 10);
    if (feeAmount > 0) {
      if (feeMint === step.swapInfo.outputMint) {
        const effectiveOutput = outAmount + feeAmount;
        return (feeAmount / effectiveOutput) * 10000;
      } else {
        return (feeAmount / inAmount) * 10000;
      }
    }
  }

  // Strategy 2: known DEX fee by label
  if (step.swapInfo.label) {
    return getKnownFeeBps(step.swapInfo.label);
  }

  return 0; // caller averages and falls back to default
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

interface JupiterSwapInfo {
  label?: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount?: string;
  feeMint?: string;
  [key: string]: unknown;
}

interface JupiterRouteStep {
  swapInfo: JupiterSwapInfo;
  percent: number;
}

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  routePlan: JupiterRouteStep[];
  [key: string]: unknown;
}

/**
 * Call the Jupiter Quote API to get a sample quote and extract the DEX fee.
 */
async function callJupiterApi(
  inputMint: string,
  outputMint: string,
  amount: number = DEFAULT_SAMPLE_AMOUNT,
): Promise<FeeFetchResult> {
  const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=100`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `Jupiter API returned ${response.status}${response.statusText ? ': ' + response.statusText : ''}`,
    );
  }

  const data = (await response.json()) as JupiterQuoteResponse;

  if (!data.routePlan || data.routePlan.length === 0) {
    throw new Error('Jupiter API returned no routes for this pair');
  }

  // Compute weighted-average fee bps across route steps
  const labels = new Set<string>();
  let totalBps = 0;
  let totalWeight = 0;

  for (const step of data.routePlan) {
    const stepBps = computeStepBps(step);
    const weight = step.percent ?? 100;
    totalBps += stepBps * (weight / 100);
    totalWeight += weight;
    if (step.swapInfo.label) {
      labels.add(step.swapInfo.label);
    }
  }

  // If all steps returned 0 (no fee info at all), use the default
  const dexFeeBps =
    totalBps > 0 && totalWeight > 0
      ? Math.round((totalBps / totalWeight) * 100) / 100
      : KNOWN_DEX_FEES.DEFAULT;

  const labelArr = [...labels];

  return {
    dexFeeBps,
    source: 'api',
    dexLabel: labelArr.join(' + ') || 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the current DEX swap fee for a trading pair from the Jupiter API.
 *
 * Cache strategy:
 *   1. In-memory cache (session) — instant, no I/O
 *   2. Persistent cache (~/.pine/jupiter-fees.json) — survives restarts,
 *      provides fallback when API is unreachable
 *   3. API call — live data, source of truth
 *
 * Throws if ALL sources are unavailable (no API, no cache).
 *
 * @param symbol  Trading pair symbol (e.g. "SOLUSDT", "BTCUSDT")
 * @param sampleAmount  Optional override for the sample amount in atomic units
 */
export async function fetchDexFeeBps(
  symbol: string,
  sampleAmount?: number,
): Promise<FeeFetchResult> {
  const key = symbol.toUpperCase();

  // 1. Check in-memory cache
  const memResult = memCache.get(key);
  if (memResult) {
    return memResult;
  }

  // 2. Resolve mint addresses
  const mints = symbolToMints(key);
  if (!mints) {
    throw new Error(
      `Cannot resolve Solana mint addresses for symbol "${symbol}". ` +
        'The trading pair contains tokens not mapped to Solana mints.',
    );
  }

  // 3. Try API
  let apiResult: FeeFetchResult | null = null;
  try {
    apiResult = await callJupiterApi(mints.inputMint, mints.outputMint, sampleAmount);
  } catch (err) {
    console.warn(
      `[jupiter-fee-fetcher] API call failed for ${key}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 4. If API succeeded, cache and return
  if (apiResult) {
    memCache.set(key, apiResult);
    setCacheEntry(key, {
      dexFeeBps: apiResult.dexFeeBps,
      timestamp: Date.now(),
      dexLabel: apiResult.dexLabel,
    });
    return apiResult;
  }

  // 5. Fall back to persistent cache
  const cacheEntry = getCacheEntry(key);
  if (cacheEntry) {
    const result: FeeFetchResult = {
      dexFeeBps: cacheEntry.dexFeeBps,
      source: 'cache',
      dexLabel: cacheEntry.dexLabel,
    };
    memCache.set(key, result);
    return result;
  }

  // 6. Nothing worked — fail
  throw new Error(
    `Cannot determine DEX swap fee for ${key}: Jupiter API unreachable ` +
      'and no cached fee data available. The backtest requires a live API ' +
      'response or a previously cached fee. Check your network connection ' +
      'and try again.',
  );
}

/**
 * Get a cached fee result without making an API call.
 * Returns undefined if no cache entry exists for this symbol.
 */
export function getCachedDexFeeBps(symbol: string): FeeFetchResult | undefined {
  const key = symbol.toUpperCase();

  const memResult = memCache.get(key);
  if (memResult) return memResult;

  const cacheEntry = getCacheEntry(key);
  if (cacheEntry) {
    const result: FeeFetchResult = {
      dexFeeBps: cacheEntry.dexFeeBps,
      source: 'cache',
      dexLabel: cacheEntry.dexLabel,
    };
    return result;
  }

  return undefined;
}

/**
 * Clear both in-memory and persistent fee caches.
 * Useful for testing or forcing a fresh API fetch on the next call.
 */
export function clearFeeCache(): void {
  memCache.clear();
  try {
    if (fs.existsSync(CACHE_PATH)) {
      fs.unlinkSync(CACHE_PATH);
    }
  } catch {
    // best-effort
  }
}

/**
 * Get the persistent cache file path (for diagnostics).
 */
export function getCacheFilePath(): string {
  return CACHE_PATH;
}
