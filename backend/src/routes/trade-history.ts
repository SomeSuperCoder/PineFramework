/**
 * Trade history + statistics API routes.
 *
 * Mounted at /api/bot/* OUTSIDE the ENABLE_TRADING_BOT gate (design D4) so
 * history stays readable when the bot flag is off — the store is file-pointed
 * at module init and reads even when no engine is constructed.
 *
 * Endpoints:
 *   GET /api/bot/history — cursor-paginated, filterable trade history
 *   GET /api/bot/stats   — aggregate metrics, global or grouped
 *
 * Envelope follows the bot.ts convention: `{ success: true, ... }` on success,
 * `{ success: false, error }` on failure. No auth (matches the rest of the
 * server). This file exports ONLY `createTradeHistoryRouter`; mounting happens
 * in backend/src/index.ts (separate wave).
 *
 * Aggregation goes through the shared StatsService (see services/StatsService.ts)
 * so the REST surface and the Telegram /report command read the same numbers
 * in-process — no backend→backend HTTP. `getStore` remains accepted for
 * backward compatibility; new call sites inject `statsService`.
 */

import { Router } from 'express';
import type { TradeHistoryStore, TradeFilters, TradeStats } from 'pine-framework/trading/trade-history-store';
import { StatsService } from '../services/StatsService.js';
import { logger } from '../utils/logger.js';

const MODE_VALUES = ['live', 'chaos', 'all'] as const;
const STATUS_VALUES = ['confirmed', 'unknown', 'all'] as const;
const GROUP_BY_VALUES = ['global', 'strategy', 'timeframe', 'asset'] as const;

type ModeValue = (typeof MODE_VALUES)[number];
type StatusValue = (typeof STATUS_VALUES)[number];
type GroupByValue = (typeof GROUP_BY_VALUES)[number];

const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_MAX_LIMIT = 200;

export function createTradeHistoryRouter(opts: {
  getStore?: () => TradeHistoryStore | null;
  statsService?: StatsService;
}): Router {
  const router = Router();

  /**
   * Resolve the StatsService for a request, or null when the history backend
   * is unavailable (→ 503).
   *
   * Two construction modes:
   * - statsService (primary): index.ts injects one shared instance so the REST
   *   routes and the upcoming Telegram /report command read the same numbers
   *   through the same object — no backend→backend HTTP.
   * - getStore (legacy, kept for backward compatibility and the existing route
   *   tests): a per-request StatsService is synthesized over the store; a null
   *   store resolves to null, reproducing the previous 503 behavior exactly.
   */
  const getStatsService = (): StatsService | null => {
    if (opts.statsService) return opts.statsService;
    const store = opts.getStore ? opts.getStore() : null;
    return store ? new StatsService(store) : null;
  };

  /**
   * GET /bot/history
   * Browsable trade history, newest first, cursor-paginated.
   */
  router.get('/bot/history', (req, res) => {
    try {
      const statsService = getStatsService();
      if (!statsService) {
        res.status(503).json({ success: false, error: 'Trade history not available' });
        return;
      }

      const parsed = parseFilters(req.query);
      if (parsed.error) {
        res.status(400).json({ success: false, error: parsed.error });
        return;
      }

      // limit — bounded [1, 200]; absent defaults to 50, anything else is a 400.
      const rawLimit = req.query.limit;
      let limit = HISTORY_DEFAULT_LIMIT;
      if (rawLimit !== undefined) {
        const n = toFiniteNumber(rawLimit);
        if (n === null || n < 1 || n > HISTORY_MAX_LIMIT) {
          res.status(400).json({
            success: false,
            error: `Invalid "limit". Must be a number between 1 and ${HISTORY_MAX_LIMIT}`,
          });
          return;
        }
        limit = n;
      }

      // cursor — opaque composite "<closedAt>:<id>" echoed from a prior
      // response (e.g. "1750000000123:default-bot-1750000000123-0"). The
      // frontend passes it through untouched; it is parsed here into the
      // store's composite cursor so equal-closedAt records page correctly.
      const rawCursor = req.query.cursor;
      let cursor: { closedAt: number; id: string } | undefined;
      if (rawCursor !== undefined) {
        const parsedCursor = parsePageCursor(rawCursor);
        if (parsedCursor === null) {
          res.status(400).json({
            success: false,
            error: 'Invalid "cursor". Must be "<closedAt>:<id>"',
          });
          return;
        }
        cursor = parsedCursor;
      }

      const page = statsService.getTradesPage({
        ...parsed.filters,
        ...(cursor ? { cursor } : {}),
        limit,
      });

      res.json({
        success: true,
        trades: page.trades,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor ? `${page.nextCursor.closedAt}:${page.nextCursor.id}` : null,
      });
    } catch (err) {
      // Never leak internal error details to clients — log the real message
      // and return a generic envelope (see /bot/stats for the same pattern).
      logger.error('[Trade history] Failed to serve GET /bot/history', {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ success: false, error: 'Internal error' });
    }
  });

  /**
   * GET /bot/stats
   * Aggregate trading metrics, global or grouped by strategy/timeframe/asset.
   */
  router.get('/bot/stats', (req, res) => {
    try {
      const statsService = getStatsService();
      if (!statsService) {
        res.status(503).json({ success: false, error: 'Trade history not available' });
        return;
      }

      const rawGroupBy = asString(req.query.groupBy) ?? 'global';
      if (!isGroupBy(rawGroupBy)) {
        res.status(400).json({
          success: false,
          error: `Invalid "groupBy". Must be one of: ${GROUP_BY_VALUES.join(', ')}`,
        });
        return;
      }

      const parsed = parseFilters(req.query);
      if (parsed.error) {
        res.status(400).json({ success: false, error: parsed.error });
        return;
      }

      // The store now computes the global summary over the SAME filter set as
      // the grouped path (getStats accepts TradeFilters), so the summary and
      // groups always describe the same trade subset.
      const summary = statsService.getStats({
        ...parsed.filters,
        includeUnknown: parsed.includeUnknown,
      });
      const groups =
        rawGroupBy === 'global'
          ? null
          : toGroupEntries(
              statsService.getGroupedStats(rawGroupBy, {
                ...parsed.filters,
                includeUnknown: parsed.includeUnknown,
              }),
            );

      res.json({ success: true, summary, groups });
    } catch (err) {
      // Never leak internal error details to clients — log the real message
      // and return a generic envelope.
      logger.error('[Trade history] Failed to serve GET /bot/stats', {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ success: false, error: 'Internal error' });
    }
  });

  return router;
}

/**
 * StatsService exposes grouped stats as Record<string, TradeStats> (design.md
 * §3 — the Telegram /report shape). The REST wire contract, pinned by
 * trade-history-route.test.ts, is the store's original Array<{ key, stats }>.
 * Convert back so the HTTP envelope stays byte-identical; Object.entries keeps
 * the store's group order (the Record preserves insertion order).
 */
function toGroupEntries(
  groups: Record<string, TradeStats> | null,
): Array<{ key: string; stats: TradeStats }> | null {
  if (groups === null) return null;
  return Object.entries(groups).map(([key, stats]) => ({ key, stats }));
}

// ── Filter parsing ──

interface ParsedFilters {
  filters: TradeFilters;
  includeUnknown: boolean;
  error: string | null;
}

/**
 * Parse the shared filter query params (history + stats).
 *
 * `from`/`to` (ms timestamps on closedAt, per the API spec) map to the
 * store's real filter names `since`/`until` (trade-history-store.ts).
 */
function parseFilters(query: { [key: string]: unknown }): ParsedFilters {
  const symbol = asString(query.symbol) || undefined;
  const timeframe = asString(query.timeframe) || undefined;
  const strategy = asString(query.strategy) || undefined;

  const rawMode = asString(query.mode);
  let mode: ModeValue = 'all';
  if (rawMode !== undefined) {
    if (!isMode(rawMode)) {
      return errorResult('Invalid "mode". Must be one of: live, chaos, all');
    }
    mode = rawMode;
  }

  const rawStatus = asString(query.status);
  let status: StatusValue = 'confirmed';
  if (rawStatus !== undefined) {
    if (!isStatus(rawStatus)) {
      return errorResult('Invalid "status". Must be one of: confirmed, unknown, all');
    }
    status = rawStatus;
  }

  const from = toFiniteNumber(query.from);
  if (query.from !== undefined && from === null) {
    return errorResult('Invalid "from". Must be a millisecond timestamp');
  }
  const to = toFiniteNumber(query.to);
  if (query.to !== undefined && to === null) {
    return errorResult('Invalid "to". Must be a millisecond timestamp');
  }

  const filters: TradeFilters = {
    ...(symbol ? { symbol } : {}),
    ...(timeframe ? { timeframe } : {}),
    ...(strategy ? { strategy } : {}),
    ...(mode !== 'all' ? { mode } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(from !== null ? { since: from } : {}),
    ...(to !== null ? { until: to } : {}),
  };

  const includeUnknown = status === 'all' || status === 'unknown';

  return { filters, includeUnknown, error: null };
}

function errorResult(error: string): ParsedFilters {
  return {
    filters: {},
    includeUnknown: false,
    error,
  };
}

// ── Small query-value helpers ──

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Parse the opaque composite cursor "<closedAt>:<id>". Splits on the FIRST
 * colon only — ids may contain dashes but never colons, so the whole id is
 * preserved. Returns null for any malformed value (non-string, missing or
 * leading colon, non-numeric closedAt, empty id) so the route can 400.
 */
function parsePageCursor(value: unknown): { closedAt: number; id: string } | null {
  if (typeof value !== 'string') return null;
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  const closedAt = Number(value.slice(0, separator));
  const id = value.slice(separator + 1);
  if (!Number.isFinite(closedAt) || id === '') return null;
  return { closedAt, id };
}

/**
 * Parse a numeric query value; null for non-string values (arrays, nested
 * objects), empty strings, and NaN. Callers distinguish "absent" by checking
 * the raw param before calling.
 */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isMode(value: string): value is ModeValue {
  return MODE_VALUES.some((m) => m === value);
}

function isStatus(value: string): value is StatusValue {
  return STATUS_VALUES.some((s) => s === value);
}

function isGroupBy(value: string): value is GroupByValue {
  return GROUP_BY_VALUES.some((g) => g === value);
}
