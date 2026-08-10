/**
 * SolPriceFetcher — SOL/USD price with a short disk cache.
 *
 * Backs the optional `solPriceUsd` field of `GET /api/backtest/dex-fee`
 * (openspec/changes/renovate-backtest-panel/api-contract.md §3/§6). The price
 * is non-critical: every failure path returns `null` and the route simply
 * omits the field — a SOL-price outage must never fail the DEX-fee request.
 *
 * Uses Jupiter's price API (same provider family as the fee fetcher) with a
 * disk cache at ~/.pine/sol-price.json (same directory as jupiter-fees.json).
 * Deliberately disk-only: the frontend probes once per mount and the panel
 * refetches infrequently, so a second in-memory tier would be dead weight.
 * No stale-cache fallback on upstream failure — a null (absent) price is
 * preferred over serving a price that could be minutes/hours old.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { logger } from '../utils/logger.js';

/** SOL mint on Solana (Jupiter price API key). */
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/** Jupiter price API endpoint (public, no key). */
const JUPITER_PRICE_API = 'https://price.jup.ag/v6/price';

/** Disk-cache TTL — 10 minutes (contract allows 5–15 min). */
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Path to the persistent price cache (same dir as jupiter-fees.json). */
const CACHE_PATH = join(homedir(), '.pine', 'sol-price.json');

/** Upstream call budget — a hung price API must not stall the route. */
const FETCH_TIMEOUT_MS = 10_000;

interface CacheEntry {
  priceUsd: number;
  fetchedAt: number;
}

function readCache(): CacheEntry | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as Partial<CacheEntry>;
    if (typeof raw.priceUsd !== 'number' || typeof raw.fetchedAt !== 'number') return null;
    return { priceUsd: raw.priceUsd, fetchedAt: raw.fetchedAt };
  } catch {
    return null; // corrupt cache — treat as a miss
  }
}

function writeCache(entry: CacheEntry): void {
  try {
    mkdirSync(join(homedir(), '.pine'), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(entry));
  } catch (err) {
    logger.warn('SOL price cache write failed', { err });
  }
}

async function callJupiterPriceApi(): Promise<number | null> {
  const res = await fetch(`${JUPITER_PRICE_API}?ids=${SOL_MINT}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Record<string, { price?: number }> };
  const price = json.data?.[SOL_MINT]?.price;
  return typeof price === 'number' && Number.isFinite(price) ? price : null;
}

/**
 * Fetch the current SOL/USD price.
 *
 * Returns `null` on any failure (network, timeout, malformed payload) — never
 * throws. A fresh disk-cache hit performs no upstream call.
 */
export async function fetchSolPriceUsd(): Promise<number | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.priceUsd;
  }

  try {
    const price = await callJupiterPriceApi();
    if (price !== null) {
      writeCache({ priceUsd: price, fetchedAt: Date.now() });
    } else {
      logger.warn('Jupiter price API returned no usable SOL price');
    }
    return price;
  } catch (err) {
    logger.warn('SOL price fetch failed', { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
