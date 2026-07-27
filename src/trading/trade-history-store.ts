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

import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
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

export class TradeHistoryStore {
  private readonly tradesPath: string;
  private readonly debugDir: string;
  private readonly maxDebugSnapshots: number;
  private trades: TradeRecord[] = [];
  private readonly botId: string;

  constructor(config: HistoryConfig) {
    this.botId = config.botId;
    this.maxDebugSnapshots = config.maxDebugSnapshots ?? 100;

    // Create directories
    const dir = join(config.baseDir, config.botId);
    this.tradesPath = join(dir, 'trades.jsonl');
    this.debugDir = join(dir, 'debug');
    mkdirSync(this.debugDir, { recursive: true });

    // Load existing trades
    this.loadExisting();
  }

  /**
   * Record a completed trade.
   */
  recordTrade(trade: TradeRecord): void {
    this.trades.push(trade);
    this.appendToFile(this.tradesPath, trade);
  }

  /**
   * Get all recorded trades, optionally filtered.
   */
  getTrades(options?: {
    symbol?: string;
    since?: number;
    until?: number;
    limit?: number;
  }): TradeRecord[] {
    let filtered = this.trades;

    if (options?.symbol) {
      filtered = filtered.filter((t) => t.symbol === options.symbol);
    }
    if (options?.since) {
      filtered = filtered.filter((t) => t.closedAt >= options.since!);
    }
    if (options?.until) {
      filtered = filtered.filter((t) => t.closedAt <= options.until!);
    }

    // Sort by closedAt descending
    filtered = [...filtered].sort((a, b) => b.closedAt - a.closedAt);

    if (options?.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
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
   * Get a summary of statistics.
   */
  getStats(): TradeStats {
    const totalTrades = this.trades.length;
    const winningTrades = this.trades.filter((t) => t.realizedPnl > 0);
    const losingTrades = this.trades.filter((t) => t.realizedPnl < 0);
    const totalPnl = this.trades.reduce((sum, t) => sum + t.realizedPnl, 0);
    const totalFees = this.trades.reduce((sum, t) => sum + t.fees, 0);

    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: totalTrades > 0 ? winningTrades.length / totalTrades : 0,
      totalPnl,
      totalFees,
      averageWin: winningTrades.length > 0
        ? winningTrades.reduce((s, t) => s + t.realizedPnl, 0) / winningTrades.length
        : 0,
      averageLoss: losingTrades.length > 0
        ? losingTrades.reduce((s, t) => s + t.realizedPnl, 0) / losingTrades.length
        : 0,
    };
  }

  /** The directory where trades are stored. */
  get directory(): string {
    return dirname(this.tradesPath);
  }

  // ---- Private ----

  private loadExisting(): void {
    if (!existsSync(this.tradesPath)) return;
    try {
      const content = readFileSync(this.tradesPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      this.trades = lines.map((line) => JSON.parse(line) as TradeRecord);
    } catch {
      // Start fresh if file is corrupted
      this.trades = [];
    }
  }

  private appendToFile(filePath: string, data: unknown): void {
    const line = JSON.stringify(data) + '\n';
    appendFileSync(filePath, line, 'utf-8');
  }

  private pruneDebugSnapshots(): void {
    try {
      const files = readFileSync(join(this.debugDir, '..'), 'utf-8')
        .split('\n')
        .filter((f) => f.endsWith('.json'))
        .sort();

      while (files.length > this.maxDebugSnapshots) {
        const oldest = files.shift()!;
        try {
          const fs = require('node:fs');
          fs.unlinkSync(join(this.debugDir, oldest));
        } catch {
          // Best effort
        }
      }
    } catch {
      // debug dir may not exist yet
    }
  }
}

export interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalFees: number;
  averageWin: number;
  averageLoss: number;
}
