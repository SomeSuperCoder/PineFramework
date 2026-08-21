/**
 * StatsService passthrough tests (backend/src/services/StatsService.ts).
 *
 * StatsService is a thin aggregation seam over TradeHistoryStore (no business
 * logic beyond defaulting includeUnknown and assembling getSessionSummary).
 * These tests exercise the real store on a tmpdir and assert that each
 * StatsService method delegates the right thing: same numbers as the store,
 * includeUnknown defaulted, groupBy=global → null.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StatsService, type StatsGroupBy } from '../src/services/StatsService.js';
import { TradeHistoryStore as TradeHistoryStoreImpl } from '../../src/trading/trade-history-store.js';
// Type comes from pine-framework (dist) because StatsService's public API types against it;
// the src/dist classes differ only by private-field declaration identity.
import type { TradeHistoryStore } from 'pine-framework/trading/trade-history-store';
import type { TradeRecord } from '../../src/trading/types.js';

function makeTrade(overrides: Partial<TradeRecord> & { id: string; closedAt: number }): TradeRecord {
  return {
    botId: 'seeded',
    symbol: 'BTCUSDC',
    side: 'buy',
    entryPrice: 100,
    exitPrice: 110,
    size: 1,
    fees: 0,
    realizedPnl: 10,
    dex: 'jupiter-swap',
    openedAt: 0,
    mode: 'live',
    status: 'confirmed',
    ...overrides,
  };
}

describe('StatsService', () => {
  let tmpDir: string;
  let store: TradeHistoryStore;
  let stats: StatsService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'stats-svc-'));
    store = new TradeHistoryStoreImpl({ baseDir: tmpDir, botId: 'stats-test' }) as unknown as TradeHistoryStore;
    stats = new StatsService(store);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getStats defaults includeUnknown to false (passthrough)', () => {
    store.recordTrade(makeTrade({ id: 'c', closedAt: 1000, status: 'confirmed', realizedPnl: 10 }));
    store.recordTrade(makeTrade({ id: 'u', closedAt: 2000, status: 'unknown', realizedPnl: -5 }));

    const s = stats.getStats();
    // By default only confirmed trades count.
    expect(s.totalTrades).toBe(1);
    // includeUnknown: true widens the set.
    const s2 = stats.getStats({ includeUnknown: true });
    expect(s2.totalTrades).toBe(2);
  });

  it('getSessionSummary assembles headline stats + a slice of recent trades', () => {
    store.recordTrade(makeTrade({ id: 'a', closedAt: 1000, realizedPnl: 10 }));
    store.recordTrade(makeTrade({ id: 'b', closedAt: 2000, realizedPnl: 20 }));
    store.recordTrade(makeTrade({ id: 'c', closedAt: 3000, realizedPnl: -5 }));

    const summary = stats.getSessionSummary();
    expect(summary.totalTrades).toBe(3);
    expect(summary.netPnl).toBe(25);
    expect(summary.recent).toHaveLength(3);
    // Newest first.
    expect(summary.recent[0]!.id).toBe('c');
    expect(summary.recent[summary.recent.length - 1]!.id).toBe('a');
  });

  it('session summary caps recent trades to store-slice (no >5 guard in service)', () => {
    for (let i = 0; i < 8; i++) {
      store.recordTrade(makeTrade({ id: `t${i}`, closedAt: i * 10, realizedPnl: 1 }));
    }
    const summary = stats.getSessionSummary();
    expect(summary.totalTrades).toBe(8);
    expect(summary.recent.length).toBeLessThanOrEqual(5);
  });

  it('getRecentTrades forwards filters and limit', () => {
    store.recordTrade(makeTrade({ id: 'sol', closedAt: 100, symbol: 'SOLUSDC', realizedPnl: 1 }));
    store.recordTrade(makeTrade({ id: 'btc', closedAt: 200, symbol: 'BTCUSDC', realizedPnl: 2 }));
    store.recordTrade(makeTrade({ id: 'btc2', closedAt: 300, symbol: 'BTCUSDC', realizedPnl: 3 }));

    const filtered = stats.getRecentTrades({ symbol: 'BTCUSDC' });
    expect(filtered.map((t) => t.id)).toEqual(['btc2', 'btc']);

    const limited = stats.getRecentTrades(undefined, 1);
    expect(limited).toHaveLength(1);
    expect(limited[0]!.id).toBe('btc2');
  });

  it('getGroupedStats returns null for global and a Record otherwise', () => {
    store.recordTrade(makeTrade({ id: 'g1', closedAt: 100, strategy: 'alpha', realizedPnl: 1 }));
    store.recordTrade(makeTrade({ id: 'g2', closedAt: 200, strategy: 'alpha', realizedPnl: 2 }));
    store.recordTrade(makeTrade({ id: 'g3', closedAt: 300, strategy: 'beta', realizedPnl: 3 }));

    expect(stats.getGroupedStats('global' as StatsGroupBy)).toBeNull();
    const grouped = stats.getGroupedStats('strategy' as StatsGroupBy);
    expect(Object.keys(grouped!)).toEqual(['alpha', 'beta']);
    expect(grouped!['alpha']!.totalTrades).toBe(2);
    expect(grouped!['beta']!.totalTrades).toBe(1);
  });

  // ── M7 — new-style (post-M5) records: explicit grossPnl + net realizedPnl + fees ──

  it('net identity: totalGrossPnl − totalFees === netPnl for new-style records', () => {
    // Post-M5 rows carry grossPnl (gross), realizedPnl (net), and the real fees.
    store.recordTrade(makeTrade({ id: 'n1', closedAt: 100, grossPnl: 12, realizedPnl: 11, fees: 1 }));
    store.recordTrade(makeTrade({ id: 'n2', closedAt: 200, grossPnl: 8, realizedPnl: 7.5, fees: 0.5 }));

    const s = stats.getStats();
    expect(s.totalGrossPnl).toBe(20); // Σ grossPnl
    expect(s.totalFees).toBe(1.5); // Σ recorded fees
    expect(s.netPnl).toBe(18.5);
    expect(s.netPnl).toBe(s.totalGrossPnl - s.totalFees); // THE identity
    expect(s.totalPnl).toBe(s.totalGrossPnl); // totalPnl is the gross alias
    expect(s.feesUnknownTrades).toBe(0);
  });

  it('legacy fallback: grossPnl absent → realizedPnl used as gross; no invented fees', () => {
    // Pre-M5 rows wrote gross into realizedPnl and lack grossPnl/fees entirely.
    store.recordTrade(makeTrade({ id: 'l1', closedAt: 100, realizedPnl: 10 }));
    store.recordTrade(makeTrade({ id: 'l2', closedAt: 200, realizedPnl: -3 }));

    const s = stats.getStats();
    expect(s.totalGrossPnl).toBe(7); // Σ realizedPnl (fallback)
    expect(s.totalFees).toBe(0); // never invented
    expect(s.netPnl).toBe(7);
    expect(s.totalPnl).toBe(7);
    expect(s.feesUnknownTrades).toBe(0);
  });

  it('feesUnknownTrades counts records flagged feesUnknown; unknown fees are never invented', () => {
    store.recordTrade(makeTrade({ id: 'u1', closedAt: 100, grossPnl: 10, realizedPnl: 10, fees: 0, feesUnknown: true }));
    store.recordTrade(makeTrade({ id: 'u2', closedAt: 200, grossPnl: 5, realizedPnl: 5, fees: 0 }));
    store.recordTrade(makeTrade({ id: 'u3', closedAt: 300, realizedPnl: 1 })); // legacy — no flag

    const s = stats.getStats();
    expect(s.feesUnknownTrades).toBe(1);
    // Flagged rows still count toward gross with fees 0 (never fabricated).
    expect(s.totalGrossPnl).toBe(16);
    expect(s.totalFees).toBe(0);
    expect(s.netPnl).toBe(16);
  });
});