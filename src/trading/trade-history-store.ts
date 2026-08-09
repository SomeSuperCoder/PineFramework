/**
 * TradeHistoryStore — JSONL-based persistent storage for trade records
 * and debug snapshots.
 *
 * Design (Decision 8):
 * - JSONL (newline-delimited JSON) — append-only, human-readable, trivial to parse
 * - One file per bot instance
 * - Debug snapshots in a debug/ subdirectory
 *
 * @module trading
 */

import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import type { TradeRecord } from './types.js';

export interface HistoryConfig {
  /** Directory for storing trade history files. */
  baseDir: string;
  /** Bot instance identifier. */
  botId: string;
  /** Maximum number of debug snapshots to keep. */
  maxDebugSnapshots?: number;
}

export interface DebugSnapshot {
  timestamp: number;
  botState: string;
  positions: Array<{ symbol: string; size: number; entryPrice: number }>;
  balance: number;
  errors: Array<{ code: string; message: string }>;
  logs: Array<{ timestamp: number; level: string; message: string }>;
  recentTrades: TradeRecord[];
}

/**
 * Filter dimensions shared by getTrades, getTradesPage, getGroupedStats and
 * getStats. All fields are optional; omitted filters are not applied.
 */
export interface TradeFilters {
  symbol?: string;
  /** Earliest closedAt to include (inclusive). Not a pagination cursor. */
  since?: number;
  /** Latest closedAt to include (inclusive). */
  until?: number;
  /** Exact strategy script name. */
  strategy?: string;
  /** Exact pair timeframe, e.g. "1", "30", "240". */
  timeframe?: string;
  /** Execution mode; 'all' (or omitted) disables the mode filter. */
  mode?: 'live' | 'chaos' | 'all';
  /** On-chain confirmation status; 'all' (or omitted) disables the filter. */
  status?: 'confirmed' | 'unknown' | 'all';
}

/**
 * Stats option shared by getStats and getGroupedStats. Composes with
 * TradeFilters: `getStats(options?: TradeFilters & TradeStatsOptions)`.
 */
export interface TradeStatsOptions {
  /** Include trades whose on-chain outcome was never confirmed (status 'unknown'). */
  includeUnknown?: boolean;
}

/**
 * Opaque cursor for getTradesPage: a (closedAt, id) composite so records
 * sharing the exact same closedAt still page correctly — a bare-timestamp
 * cursor would silently drop every record with the boundary timestamp.
 * Callers must treat it as opaque and echo it back verbatim.
 */
export interface TradePageCursor {
  closedAt: number;
  id: string;
}

export class TradeHistoryStore {
  private readonly tradesPath: string;
  private readonly archivePath: string;
  private readonly debugDir: string;
  private readonly maxDebugSnapshots: number;
  private trades: TradeRecord[] = [];

  /** High-water mark for the live trades file. When the loaded line count
   *  exceeds this, the oldest lines are rotated into trades-archive.jsonl at
   *  startup (see applyRotation). */
  private static readonly ROTATION_THRESHOLD = 50_000;

  /** Set on every mutation (recordTrade, loadExisting) so the stats caches
   *  recompute lazily instead of on every read. Kept per cache: computing
   *  grouped stats must not mark the plain stats cache as fresh. */
  private statsDirty = true;
  private groupedStatsDirty = true;
  private statsCacheKey = '';
  private statsCacheValue: TradeStats | null = null;
  private groupedStatsCacheKey = '';
  private groupedStatsCacheValue: GroupedTradeStats | null = null;

  constructor(config: HistoryConfig) {
    this.maxDebugSnapshots = config.maxDebugSnapshots ?? 100;

    // Create directories
    const dir = join(config.baseDir, config.botId);
    this.tradesPath = join(dir, 'trades.jsonl');
    this.archivePath = join(dir, 'trades-archive.jsonl');
    this.debugDir = join(dir, 'debug');
    mkdirSync(this.debugDir, { recursive: true });

    // Load existing trades
    this.loadExisting();
  }

  /**
   * Record a completed trade.
   *
   * Append-first contract (Code-Review FIX 3): the record is written to disk
   * BEFORE it enters the in-memory list. On append failure the record is NOT
   * kept in memory and false is returned, so callers know the trade did not
   * persist and must not broadcast it — otherwise readers would see a phantom
   * trade that vanishes on restart.
   *
   * Returns true when the record was appended AND is in memory; false when
   * the append failed (record NOT in memory; failure logged).
   */
  recordTrade(trade: TradeRecord): boolean {
    try {
      this.appendToFile(this.tradesPath, trade);
    } catch (err) {
      console.error('[TradeHistoryStore] Failed to append trade record', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }

    this.trades.push(trade);
    this.statsDirty = true;
    this.groupedStatsDirty = true;
    // Rotation must also be enforced at runtime, not only at startup
    // (loadExisting/applyRotation) — otherwise a long-lived process that
    // records more than ROTATION_THRESHOLD trades grows memory and every
    // stats/history scan without bound. Runs only after a successful append:
    // the record is already on disk by then, so rotation trims memory +
    // archives the oldest, which is fine.
    this.rotateIfOverThreshold();
    return true;
  }

  /**
   * Get all recorded trades, optionally filtered.
   */
  getTrades(options?: TradeFilters & { limit?: number }): TradeRecord[] {
    const filtered = this.applyFilters(this.trades, options);
    const sorted = [...filtered].sort((a, b) => b.closedAt - a.closedAt);

    if (options?.limit && options.limit > 0) {
      return sorted.slice(0, options.limit);
    }
    return sorted;
  }

  /**
   * Cursor-based pagination over trades, newest first.
   *
   * Ordering is the pagination contract: closedAt DESC, then id DESC. The
   * cursor is a (closedAt, id) composite taken from the last record of the
   * previous page; the next page keeps a record iff
   * `t.closedAt < cursor.closedAt || (t.closedAt === cursor.closedAt && t.id < cursor.id)`.
   * Because the tiebreak matches the sort, records sharing the cursor's exact
   * timestamp are never skipped or repeated across page boundaries.
   */
  getTradesPage(options: TradeFilters & { cursor?: TradePageCursor; limit?: number }): {
    trades: TradeRecord[];
    hasMore: boolean;
    nextCursor: TradePageCursor | null;
  } {
    const filtered = this.applyFilters(this.trades, options);
    const sorted = [...filtered].sort(
      (a, b) => b.closedAt - a.closedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );

    let page = sorted;
    if (options?.cursor) {
      const { closedAt, id } = options.cursor;
      page = page.filter((t) => t.closedAt < closedAt || (t.closedAt === closedAt && t.id < id));
    }

    const pageSize = options?.limit && options.limit > 0 ? options.limit : Infinity;
    const hasMore = page.length > pageSize;
    const trades = page.slice(0, pageSize);
    const last = trades.length > 0 ? trades[trades.length - 1] : null;
    const nextCursor = last ? { closedAt: last.closedAt, id: last.id } : null;

    return { trades, hasMore, nextCursor };
  }

  /**
   * Save a debug snapshot for post-mortem analysis.
   */
  saveDebugSnapshot(snapshot: DebugSnapshot): string {
    const timestamp = new Date(snapshot.timestamp).toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_snapshot.json`;
    const filePath = join(this.debugDir, filename);
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    this.pruneDebugSnapshots();
    return filePath;
  }

  /**
   * Get a summary of statistics over the (optionally filtered) trade set.
   *
   * Accepts the same TradeFilters as getTrades/getGroupedStats plus
   * TradeStatsOptions. Trades whose on-chain outcome was never confirmed
   * (status 'unknown') are excluded by default; pass `{ includeUnknown: true }`
   * to include them. Results are memoized per options and recomputed only
   * after the store changes.
   */
  getStats(options?: TradeFilters & TradeStatsOptions): TradeStats {
    // Cache key is the full option set so different filter combinations never
    // share a memoized result. Undefined fields stringify away, so an options
    // object with no meaningful filters produces the same key as no options.
    const key = JSON.stringify(options ?? {});
    if (!this.statsDirty && this.statsCacheKey === key && this.statsCacheValue !== null) {
      return this.statsCacheValue;
    }

    const filtered = this.applyFilters(this.trades, options);
    const value = this.computeStats(filtered, options);
    this.statsCacheKey = key;
    this.statsCacheValue = value;
    this.statsDirty = false;
    return value;
  }

  /**
   * Compute full stats grouped by a dimension of the trade set.
   *
   * Group key resolution:
   * - 'asset'     → TradeRecord.symbol
   * - 'strategy'  → TradeRecord.strategy ?? '(unknown)'
   * - 'timeframe' → TradeRecord.timeframe ?? '(unknown)'
   *
   * Groups with zero trades are omitted. Same default exclude-unknown behavior
   * and memoization as getStats.
   */
  getGroupedStats(
    groupBy: 'strategy' | 'timeframe' | 'asset',
    filters?: TradeFilters & TradeStatsOptions,
  ): GroupedTradeStats {
    const key = JSON.stringify({ groupBy, filters: filters ?? {} });
    if (
      !this.groupedStatsDirty &&
      this.groupedStatsCacheKey === key &&
      this.groupedStatsCacheValue !== null
    ) {
      return this.groupedStatsCacheValue;
    }

    const filtered = this.applyFilters(this.trades, filters);
    const groups = new Map<string, TradeRecord[]>();
    for (const trade of filtered) {
      const groupKey = this.groupKey(trade, groupBy);
      const group = groups.get(groupKey);
      if (group) {
        group.push(trade);
      } else {
        groups.set(groupKey, [trade]);
      }
    }

    const value: GroupedTradeStats = [];
    for (const [groupKey, groupTrades] of groups) {
      // The map never holds empty arrays — the guard is defensive.
      if (groupTrades.length === 0) continue;
      value.push({ key: groupKey, stats: this.computeStats(groupTrades, filters) });
    }

    this.groupedStatsCacheKey = key;
    this.groupedStatsCacheValue = value;
    this.groupedStatsDirty = false;
    return value;
  }

  /** The directory where trades are stored. */
  get directory(): string {
    return dirname(this.tradesPath);
  }

  // ---- Private ----

  /** Shared filter pipeline used by getTrades, getTradesPage and getGroupedStats. */
  private applyFilters(trades: TradeRecord[], options?: TradeFilters): TradeRecord[] {
    let filtered = trades;

    if (options?.symbol) {
      filtered = filtered.filter((t) => t.symbol === options.symbol);
    }
    if (options?.since) {
      filtered = filtered.filter((t) => t.closedAt >= options.since!);
    }
    if (options?.until) {
      filtered = filtered.filter((t) => t.closedAt <= options.until!);
    }
    if (options?.strategy) {
      filtered = filtered.filter((t) => t.strategy === options.strategy);
    }
    if (options?.timeframe) {
      filtered = filtered.filter((t) => t.timeframe === options.timeframe);
    }
    if (options?.mode && options.mode !== 'all') {
      filtered = filtered.filter((t) => t.mode === options.mode);
    }
    if (options?.status && options.status !== 'all') {
      filtered = filtered.filter((t) => t.status === options.status);
    }

    return filtered;
  }

  /**
   * Compute the full TradeStats for a trade set.
   * Trades with an unconfirmed on-chain outcome (status 'unknown') are
   * excluded unless includeUnknown is set.
   */
  private computeStats(trades: TradeRecord[], options?: TradeStatsOptions): TradeStats {
    const eligible = options?.includeUnknown
      ? trades
      : trades.filter((t) => t.status !== 'unknown');

    const totalTrades = eligible.length;
    const winningTrades = eligible.filter((t) => t.realizedPnl > 0);
    const losingTrades = eligible.filter((t) => t.realizedPnl < 0);
    // SSOT net identity (net = gross − fees), folded the SAME way everywhere:
    //  - gross per trade = grossPnl when present (post-M5); legacy (pre-M5)
    //    rows wrote gross into realizedPnl and lack grossPnl → fall back to
    //    realizedPnl (it is the best available gross for them).
    //  - fees = the recorded real total; legacy rows carry 0 — never invented.
    //  - net = totalGrossPnl − totalFees (never a third formula).
    const totalGrossPnl = eligible.reduce((sum, t) => sum + (t.grossPnl ?? t.realizedPnl), 0);
    const totalFees = eligible.reduce((sum, t) => sum + (t.fees ?? 0), 0);
    const grossWins = winningTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
    // Sum of negative values (losing trades only), so |grossLosses| > 0
    // whenever there is at least one losing trade.
    const grossLosses = losingTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
    const feesUnknownTrades = eligible.filter((t) => t.feesUnknown === true).length;

    let profitFactor: number;
    if (winningTrades.length === 0) {
      profitFactor = 0;
    } else if (losingTrades.length === 0) {
      // Wins with no losses: the ratio is unbounded. Clamp to a finite,
      // JSON-safe value so consumers never have to handle Infinity.
      profitFactor = Number.MAX_SAFE_INTEGER;
    } else {
      profitFactor = grossWins / Math.abs(grossLosses);
    }

    let bestTrade = 0;
    let worstTrade = 0;
    if (totalTrades > 0) {
      bestTrade = eligible.reduce(
        (best, t) => (t.realizedPnl > best ? t.realizedPnl : best),
        Number.NEGATIVE_INFINITY,
      );
      worstTrade = eligible.reduce(
        (worst, t) => (t.realizedPnl < worst ? t.realizedPnl : worst),
        Number.POSITIVE_INFINITY,
      );
    }

    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: totalTrades > 0 ? winningTrades.length / totalTrades : 0,
      totalPnl: totalGrossPnl,
      totalGrossPnl,
      totalFees,
      averageWin: winningTrades.length > 0 ? grossWins / winningTrades.length : 0,
      averageLoss: losingTrades.length > 0 ? grossLosses / losingTrades.length : 0,
      // THE identity: net = gross − fees (module identity, one formula).
      netPnl: totalGrossPnl - totalFees,
      feesUnknownTrades,
      profitFactor,
      avgTrade: totalTrades > 0 ? totalGrossPnl / totalTrades : 0,
      bestTrade,
      worstTrade,
      maxDrawdown: this.computeMaxDrawdown(eligible),
    };
  }

  /**
   * Maximum peak-to-trough decline of the cumulative realized-PnL equity
   * curve, in quote units. Trades are ordered by closedAt ascending and the
   * curve is the running sum of realizedPnl. Always ≥ 0; 0 when fewer than
   * two trades (a single trade cannot draw down from a peak).
   */
  private computeMaxDrawdown(trades: TradeRecord[]): number {
    if (trades.length < 2) return 0;
    const byTime = [...trades].sort((a, b) => a.closedAt - b.closedAt);
    let peak = 0;
    let equity = 0;
    let maxDrawdown = 0;
    for (const trade of byTime) {
      equity += trade.realizedPnl;
      if (equity > peak) peak = equity;
      const decline = peak - equity;
      if (decline > maxDrawdown) maxDrawdown = decline;
    }
    return maxDrawdown;
  }

  private groupKey(trade: TradeRecord, groupBy: 'strategy' | 'timeframe' | 'asset'): string {
    switch (groupBy) {
      case 'strategy':
        return trade.strategy ?? '(unknown)';
      case 'timeframe':
        return trade.timeframe ?? '(unknown)';
      case 'asset':
        return trade.symbol;
    }
  }

  private loadExisting(): void {
    if (!existsSync(this.tradesPath)) return;

    let content: string;
    try {
      content = readFileSync(this.tradesPath, 'utf-8');
    } catch {
      // Unreadable file (permissions, race, disk error) → start fresh rather
      // than crash the store.
      this.trades = [];
      this.statsDirty = true;
      this.groupedStatsDirty = true;
      return;
    }

    const loaded: TradeRecord[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as TradeRecord;
        // A line may hold any valid JSON (null, number, string...); keep only
        // well-formed objects so a stray line cannot corrupt the store.
        if (parsed !== null && typeof parsed === 'object') {
          loaded.push(parsed);
        }
      } catch {
        // Skip a single corrupt line instead of wiping the whole store — a
        // partially broken file must still serve the valid records it has.
      }
    }

    this.trades = this.applyRotation(loaded);
    this.statsDirty = true;
    this.groupedStatsDirty = true;
  }

  /**
   * Rotate the oldest lines beyond ROTATION_THRESHOLD into trades-archive.jsonl.
   *
   * The live trades.jsonl file is append-only and never rewritten, so the old
   * lines are still present on the next restart. To avoid re-archiving the
   * same block every startup, the id of the last archived record is used as a
   * marker: only lines newer than that marker are appended. The records kept
   * in memory are the newest ROTATION_THRESHOLD.
   */
  private applyRotation(loaded: TradeRecord[]): TradeRecord[] {
    const excess = loaded.length - TradeHistoryStore.ROTATION_THRESHOLD;
    if (excess <= 0) return loaded;

    let keepFrom = 0;
    try {
      if (existsSync(this.archivePath)) {
        const lastLine = readFileSync(this.archivePath, 'utf-8')
          .split('\n')
          .filter(Boolean)
          .slice(-1)[0];
        if (lastLine) {
          const markerId = (JSON.parse(lastLine) as TradeRecord).id;
          const markerIndex = loaded.findIndex((t) => t.id === markerId);
          if (markerIndex >= 0) {
            keepFrom = Math.min(markerIndex + 1, excess);
          }
        }
      }
    } catch {
      // Best effort: if the archive is unreadable or corrupt, fall back to
      // archiving the whole excess block. Duplicates in the archive are
      // harmless; the store must never fail to start.
    }

    const block = loaded.slice(keepFrom, excess);
    if (block.length > 0) {
      try {
        this.appendLinesToFile(this.archivePath, block);
      } catch {
        // Archiving is best-effort — a disk failure must not prevent the
        // store from serving the newest trades.
      }
    }

    return loaded.slice(excess);
  }

  /**
   * Enforce ROTATION_THRESHOLD at runtime, called after every recordTrade.
   *
   * Startup rotation (applyRotation) caps the in-memory set only when the
   * store is (re)loaded; a long-lived process that keeps recording would
   * otherwise grow `trades` and every history/stats scan unbounded. When the
   * cap is exceeded, the OLDEST excess records are dropped from memory and
   * appended to trades-archive.jsonl — the same archive file and append helper
   * the startup rotation uses, so the archive's last-line marker (see
   * applyRotation) advances consistently and the same block is not re-archived
   * on the next restart.
   *
   * trades.jsonl itself is append-only and never rewritten, so the overflow
   * records still live there: if the archive write fails they are re-archived
   * by applyRotation on the next startup (the marker has simply not moved past
   * them). The write is therefore strictly best-effort — an archive I/O error
   * must never break the live record or trading.
   */
  private rotateIfOverThreshold(): void {
    const excess = this.trades.length - TradeHistoryStore.ROTATION_THRESHOLD;
    if (excess <= 0) return;

    const overflow = this.trades.splice(0, excess);
    try {
      this.appendLinesToFile(this.archivePath, overflow);
    } catch {
      // Best effort: a disk failure must not break the record or trading. The
      // overflow records remain in trades.jsonl (append-only) and are
      // re-archived by applyRotation on the next startup, since the archive
      // marker has not advanced past them.
    }
  }

  private appendToFile(filePath: string, data: unknown): void {
    const line = JSON.stringify(data) + '\n';
    appendFileSync(filePath, line, 'utf-8');
  }

  private appendLinesToFile(filePath: string, records: TradeRecord[]): void {
    const content = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    appendFileSync(filePath, content, 'utf-8');
  }

  private pruneDebugSnapshots(): void {
    let files: string[];
    try {
      files = readdirSync(this.debugDir)
        .filter((f) => f.endsWith('.json'))
        .sort();
    } catch {
      // Debug dir may not exist yet — nothing to prune.
      return;
    }

    while (files.length > this.maxDebugSnapshots) {
      const oldest = files.shift()!;
      try {
        unlinkSync(join(this.debugDir, oldest));
      } catch {
        // Best effort per file: a snapshot that is locked or already removed
        // should not abort pruning of the rest.
      }
    }
  }
}

export interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  /**
   * GROSS realized PnL (before fees) — Σ (grossPnl ?? realizedPnl). Legacy
   * (pre-M5) rows lack grossPnl and wrote gross into realizedPnl, so they fall
   * back to realizedPnl; post-M5 rows carry the explicit gross. This restores
   * the field's historical meaning: netPnl = totalPnl − totalFees by identity.
   */
  totalPnl: number;
  /** Explicit SSOT name for the gross total — identical to totalPnl (alias). */
  totalGrossPnl: number;
  /** Σ fees (the recorded real total; legacy rows carry 0 — never invented). */
  totalFees: number;
  averageWin: number;
  averageLoss: number;
  /** totalGrossPnl − totalFees — the SSOT identity (net = gross − fees). */
  netPnl: number;
  /** Count of trades whose fee total could not be fully determined (feesUnknown === true). */
  feesUnknownTrades: number;
  /** Wins / |losses| over realizedPnl (net); 0 when no wins; MAX_SAFE_INTEGER when wins but no losses. */
  profitFactor: number;
  /** totalPnl / totalTrades (gross average); 0 when no trades. */
  avgTrade: number;
  /** Largest realizedPnl in the set; 0 when no trades. */
  bestTrade: number;
  /** Smallest realizedPnl in the set; 0 when no trades. */
  worstTrade: number;
  /** Max peak-to-trough decline of the cumulative PnL curve; ≥ 0; 0 when fewer than 2 trades. */
  maxDrawdown: number;
}

/** Result of getGroupedStats — one entry per non-empty group. */
export type GroupedTradeStats = Array<{ key: string; stats: TradeStats }>;
