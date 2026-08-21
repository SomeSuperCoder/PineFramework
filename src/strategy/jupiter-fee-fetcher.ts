/**
 * Jupiter Fee Fetcher
 *
 * Uses the official @jup-ag/api SDK to fetch real-time DEX swap fees from the
 * Jupiter Quote API for a given trading pair. Calibrates backtest commission
 * estimates with current on-chain fee conditions.
 *
 * ── Cache strategy ──
 *
 *   Two-tier: in-memory (session) → persistent (disk).
 *
 *   A persistent JSON file at ~/.pine/jupiter-fees.json stores the last-known
 *   fee per symbol. On startup, if the API is unreachable, the fetcher falls
 *   back to this cache. If neither API nor cache is available, the call throws.
 *
 * ── Fee extraction ──
 *
 *   The SDK's SwapInfo includes feeAmount and feeMint (present after Jupiter's
 *   May 2025 API update). The fee in bps is computed as:
 *
 *     feeBps = (feeAmount / (outAmount + feeAmount)) * 10000
 *
 *   If feeAmount is missing from a route step, a known-fee table keyed by DEX
 *   label is used as fallback. A weighted average is taken across route steps.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { createJupiterApiClient, QuoteGetRequest } from '@jup-ag/api';
import { TOKEN_MINTS, getTokenInfo, isValidPairSymbol } from '../trading/token-registry.js';
import { parsePairSymbol } from './commission-calculator.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default sample amount in atomic units (~0.01 SOL worth for 9-decimal tokens,
 * ~10 USDC for 6-decimal tokens). The fee is percentage-based, so any amount
 * above the minimum swap threshold works.
 */
const DEFAULT_SAMPLE_AMOUNT = 10_000_000;

/** Path to the persistent fee cache (lazy — avoids crashing in browser environments without `os.homedir`). */
function getCachePath(): string {
  return path.join(os.homedir(), '.pine', 'jupiter-fees.json');
}

/** Stale threshold for cache entries (30 days). */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Entry schema version. Bump when the cache entry shape or semantics change;
 * entries written by older versions are treated as cache misses (self-healing
 * migration — no manual clearing needed).
 */
const CACHE_ENTRY_VERSION = 2;

/**
 * Sanity floor for cached dexFeeBps. Real DEX pool fees are in the tens-to-
 * hundreds of bps range (Jupiter tiers: 0–50 bps for platform fees, pool fees
 * typically 2–300 bps). A sub-1 value indicates a corruption artifact such as
 * the historical 100x-undercharge bug (25 bps stored as 0.25) — reject it.
 */
const MIN_SANE_DEX_FEE_BPS = 1;

// ---------------------------------------------------------------------------
// SDK client (lazy-initialised)
// ---------------------------------------------------------------------------

let _client: ReturnType<typeof createJupiterApiClient> | null = null;

function getClient() {
  if (!_client) {
    _client = createJupiterApiClient();
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Known DEX fees on Solana (fallback when feeAmount is not in the response)
// ---------------------------------------------------------------------------

const KNOWN_DEX_FEES: Record<string, number> = {
  Raydium: 25,
  'Raydium CPMM': 25,
  'Raydium CLMM': 20,
  Orca: 20,
  'Orca V2': 20,
  'Orca Whirlpool': 20,
  'Meteora DLMM': 10,
  'Meteora Pools': 10,
  DexLab: 25,
  'Lifinity V2': 10,
  Lifinity: 10,
  Crema: 25,
  Aldrin: 25,
  Cropper: 25,
  Saber: 1,
  'Saber (Decimals)': 1,
  Mercurial: 1,
  GooseFX: 25,
  Saros: 25,
  Stepn: 25,
  'Step Finance': 25,
  Invariant: 10,
  OpenBook: 0,
  Phantom: 25,
  Whirlpool: 20,
  Guacswap: 25,
  Penguin: 25,
  Sanctum: 10,
  'Saber (Stable)': 1,
  'Mercurial (Stable)': 1,
  BonkSwap: 25,
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
  /** Schema version — entries without this (or with a stale version) are misses. */
  version: number;
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
    if (!fs.existsSync(getCachePath())) {
      return { version: 1, entries: {} };
    }
    const raw = fs.readFileSync(getCachePath(), 'utf-8');
    return JSON.parse(raw) as CacheFile;
  } catch {
    return { version: 1, entries: {} };
  }
}

function writeCacheFile(cache: CacheFile): void {
  try {
    const dir = path.dirname(getCachePath());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(getCachePath(), JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // Non-fatal — persistence is best-effort
  }
}

function getCacheEntry(symbol: string): CacheEntry | undefined {
  const cache = readCacheFile();
  const entry = cache.entries[symbol.toUpperCase()];
  if (!entry) return undefined;
  // Integrity guard 1 — version: legacy entries (no version field) and
  // entries from older schemas are treated as misses → refetched naturally.
  if (entry.version !== CACHE_ENTRY_VERSION) return undefined;
  // Integrity guard 2 — sanity bounds: sub-1 bps is a corruption artifact
  // (e.g. the historical 100x-undercharge bug), never a real pool fee.
  if (!(entry.dexFeeBps >= MIN_SANE_DEX_FEE_BPS)) return undefined;
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) return undefined;
  return entry;
}

// Version is stamped here (SSOT) — callers must not supply it, so all write
// sites are forced through the stamp (B15: fixes the :413 call site that
// predated the B13 version field).
function setCacheEntry(symbol: string, entry: Omit<CacheEntry, 'version'>): void {
  const cache = readCacheFile();
  cache.entries[symbol.toUpperCase()] = { ...entry, version: CACHE_ENTRY_VERSION };
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

  // Use new registry for base token if it's a known pair
  let inputMint: string | undefined;
  if (isValidPairSymbol(symbol)) {
    inputMint = getTokenInfo(symbol).mint;
  } else {
    // Fallback to old lookup for unknown pairs
    inputMint = TOKEN_MINTS[base];
  }

  // Quote token is typically USDT/USDC
  const outputMint = TOKEN_MINTS[quote] ?? TOKEN_MINTS['USDC'];

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
  const exact = KNOWN_DEX_FEES[label];
  if (exact !== undefined) return exact;

  for (const [key, fee] of Object.entries(KNOWN_DEX_FEES)) {
    if (label.toLowerCase().includes(key.toLowerCase())) {
      return fee;
    }
  }

  return KNOWN_DEX_FEES.DEFAULT;
}

/**
 * The SDK's QuoteResponse uses RoutePlanStep with SwapInfo that contains
 * feeAmount/feeMint in the actual API response, but the bundled .d.ts
 * omits them. This interface extends SwapInfo to access the fields.
 */
interface SwapInfoWithFee {
  ammKey: string;
  label?: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount?: string;
  feeMint?: string;
}

/**
 * Compute the DEX fee in bps from a single route step.
 */
function computeStepBps(step: { swapInfo: SwapInfoWithFee }): number {
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

  return 0;
}

// ---------------------------------------------------------------------------
// API call via SDK
// ---------------------------------------------------------------------------

/**
 * Call the Jupiter Quote API via the official SDK to get a sample quote
 * and extract the DEX fee.
 */
async function callJupiterApi(
  inputMint: string,
  outputMint: string,
  amount: number = DEFAULT_SAMPLE_AMOUNT,
): Promise<FeeFetchResult> {
  const params: QuoteGetRequest = {
    inputMint,
    outputMint,
    amount,
    slippageBps: 100,
  };

  const client = getClient();
  const quote = await client.quoteGet(params);

  if (!quote.routePlan || quote.routePlan.length === 0) {
    throw new Error('Jupiter API returned no routes for this pair');
  }

  // Compute weighted-average fee bps across route steps
  const labels = new Set<string>();
  let totalBps = 0;
  let totalWeight = 0;

  for (const step of quote.routePlan) {
    const stepWithFee = step as { swapInfo: SwapInfoWithFee };
    const stepBps = computeStepBps(stepWithFee);
    const weight = step.percent ?? 100;
    // WHY: `weight` is percent-unit (0-100; a single 100% step is 100) — do NOT
    // normalize here. The division by totalWeight below is the ONLY /100; doing
    // it here too divided by 100 twice and undercharged fees 100x (25 bps -> 0.25).
    totalBps += stepBps * weight;
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
    source: 'api' as const,
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
 *   2. Persistent cache (~/.pine/jupiter-fees.json) — survives restarts
 *   3. API call via @jup-ag/api SDK — live data, source of truth
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
 */
export function clearFeeCache(): void {
  memCache.clear();
  try {
    if (fs.existsSync(getCachePath())) {
      fs.unlinkSync(getCachePath());
    }
  } catch {
    // best-effort
  }
}

/**
 * Get the persistent cache file path (for diagnostics).
 */
export function getCacheFilePath(): string {
  return getCachePath();
}
