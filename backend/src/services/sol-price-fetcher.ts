/**
 * SolPriceFetcher — SOL/USD price with a short disk cache.
 *
 * Backs the optional `solPriceUsd` field of `GET /api/backtest/dex-fee`
 * (openspec/changes/renovate-backtest-panel/api-contract.md §3/§6). The price
 * is non-critical: every failure path returns `null` and the route simply
 * omits the field — a SOL-price outage must never fail the DEX-fee request.
 *
 * Uses Bybit's public ticker API with a short disk cache at ~/.pine/bybit-sol-price.json.
 * The frontend probes once per mount and the panel refetches infrequently, so a second
 * in-memory tier would be dead weight. No stale-cache fallback on upstream failure — a
 * null (absent) price is preferred over serving a price that could be minutes/hours old.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { logger } from '../utils/logger.js';

/**
 * Bybit SOL/USD ticker endpoint (public, no key).
 *
 * v5 market tickers — the v2 `/v2/public/tickers` endpoint has been retired
 * (returns HTTP 404 since 2026-08), so the parser below accepts the v5
 * response shape (`result.list` + camelCase `lastPrice`) as the primary
 * shape and keeps legacy v2 shapes as defensive fallbacks.
 * `category=spot` is required to scope the query to spot pairs.
 */
const BYBIT_PRICE_API =
  'https://api.bybit.com/v5/market/tickers?category=spot&symbol=SOLUSDT';

/** Disk-cache TTL — 5 minutes (contract allows 3–10 min). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Path to the persistent price cache (same dir as jupiter-fees.json). */
const CACHE_PATH = join(homedir(), '.pine', 'bybit-sol-price.json');

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
    logger.warn('BYBIT SOL price cache write failed', { err });
  }
}

/**
 * Parse a Bybit ticker payload and return last_price number, or null.
 *
 * Non-throwing. Handles every real response shape:
 * - v5 (live):   { retCode: 0, result: { category, list: [{ symbol, lastPrice }] } }
 * - v2 (retired, defensive): result as a single ticker OBJECT or an ARRAY of
 *   tickers, using snake_case `last_price`.
 *
 * Accepts `lastPrice`/`last_price` as string or number. Any unusable payload —
 * bad JSON, error retCode, missing/empty SOLUSDT ticker, empty or non-finite
 * price — yields null. Never throws; the route treats null as "omit the field".
 */
function parseBybitTicker(raw: string): number | null {
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  // v5 names it retCode, legacy v2 named it ret_code — accept both, require 0.
  const ret = json.retCode ?? json.ret_code;
  if (ret !== 0) return null;
  const result = json.result;
  if (!result || typeof result !== 'object') return null;

  // Normalize every real shape into a list of ticker objects.
  let tickers: any[] | null = null;
  if (Array.isArray(result.list)) {
    tickers = result.list; // v5: { category, list: [...] }
  } else if (Array.isArray(result)) {
    tickers = result; // v2 multi-symbol: [...]
  } else if (result.symbol !== undefined || 'last_price' in result || 'lastPrice' in result) {
    tickers = [result]; // v2 single-symbol: { symbol, last_price }
  }
  if (!tickers || tickers.length === 0) return null;

  const ticker = tickers.find((t: any) => t && t.symbol === 'SOLUSDT');
  if (!ticker) return null;

  const lp = ticker.lastPrice ?? ticker.last_price;
  if (lp === null || lp === undefined) return null;
  if (typeof lp === 'string' && lp.trim() === '') return null; // Number('') is 0 — must not fake a price
  if (typeof lp !== 'string' && typeof lp !== 'number') return null;
  const price = Number(lp);
  return Number.isFinite(price) ? price : null;
}

/** Fetch SOL/USD price from Bybit. Returns null on any failure. */
async function fetchSolPriceUsdBybit(): Promise<number | null> {
  try {
    const res = await fetch(BYBIT_PRICE_API, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    const price = parseBybitTicker(raw);
    if (price === null) {
      logger.warn('BYBIT SOL price API returned no usable price');
    }
    return price;
  } catch (err) {
    logger.warn('BYBIT SOL price fetch failed', { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
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
    const price = await fetchSolPriceUsdBybit();
    if (price !== null) {
      writeCache({ priceUsd: price, fetchedAt: Date.now() });
    } else {
      logger.warn('BYBIT SOL price API returned no usable price');
    }
    return price;
  } catch (err) {
    logger.warn('BYBIT SOL price fetch failed', { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}