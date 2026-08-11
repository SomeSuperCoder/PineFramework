import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TradeHistoryStore } from '../../../src/trading/trade-history-store.js';
import type { TradeRecord } from '../../../src/trading/types.js';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Minimal valid TradeRecord builder. The new extension fields
 * (strategy/timeframe/mode/status) are omitted unless explicitly provided,
 * matching the legacy record shape written before D1/D5.
 */
function makeTrade(
  overrides: Partial<TradeRecord> & { id: string; closedAt: number },
): TradeRecord {
  return {
    botId: 'test-bot',
    symbol: 'SOL/USDC',
    side: 'buy',
    entryPrice: 100,
    exitPrice: 110,
    size: 1,
    fees: 0,
    realizedPnl: 10,
    dex: 'jupiter-swap',
    openedAt: 0,
    ...overrides,
  };
}

/** Write raw JSONL content into a store's trades file before construction. */
function seedTradesFile(baseDir: string, botId: string, content: string): void {
  const dir = join(baseDir, botId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'trades.jsonl'), content, 'utf-8');
}

/** Read the store's archive file as an array of lines ([] when absent). */
function archiveLines(store: TradeHistoryStore): string[] {
  const archivePath = join(store.directory, 'trades-archive.jsonl');
  if (!existsSync(archivePath)) return [];
  return readFileSync(archivePath, 'utf-8').split('\n').filter(Boolean);
}

describe('TradeHistoryStore extension (strategy/timeframe/mode/status, paging, extended stats, rotation)', () => {
  let tmpDir: string;
  const botId = 'test-bot';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'trading-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Fresh store in the shared tmpDir. Pass a distinct botId when a test
   *  needs several independent stores in the same dir (the store reloads
   *  anything already persisted under that botId). */
  const makeStore = (
    options: { botId?: string; maxDebugSnapshots?: number } = {},
  ): TradeHistoryStore =>
    new TradeHistoryStore({
      baseDir: tmpDir,
      botId: options.botId ?? 'test-bot',
      maxDebugSnapshots: options.maxDebugSnapshots,
    });

  // ---- 1. New fields round-trip ----

  it('round-trips strategy/timeframe/mode/status through persistence', () => {
    const store = makeStore();
    store.recordTrade(
      makeTrade({
        id: 'ext-1',
        closedAt: 2000,
        strategy: 'macd-regime-filter',
        timeframe: '15',
        mode: 'chaos',
        status: 'confirmed',
      }),
    );

    // In-memory view carries the fields...
    expect(store.getTrades()[0]!.strategy).toBe('macd-regime-filter');
    expect(store.getTrades()[0]!.timeframe).toBe('15');
    expect(store.getTrades()[0]!.mode).toBe('chaos');
    expect(store.getTrades()[0]!.status).toBe('confirmed');

    // ...and so does a fresh store reloaded from disk.
    const reloaded = makeStore();
    const trades = reloaded.getTrades();
    expect(trades).toHaveLength(1);
    expect(trades[0]!.strategy).toBe('macd-regime-filter');
    expect(trades[0]!.timeframe).toBe('15');
    expect(trades[0]!.mode).toBe('chaos');
    expect(trades[0]!.status).toBe('confirmed');
  });

  // ---- 2. Legacy lines (no new fields) ----

  it('loads legacy JSONL lines without the new fields and stats do not crash', () => {
    seedTradesFile(
      tmpDir,
      botId,
      [
        JSON.stringify(makeTrade({ id: 'legacy-1', closedAt: 2000, realizedPnl: 9.5, fees: 0.5 })),
        JSON.stringify(makeTrade({ id: 'legacy-2', closedAt: 3000, realizedPnl: -4, fees: 1 })),
      ].join('\n') + '\n',
    );

    const store = makeStore();
    const trades = store.getTrades();
    expect(trades).toHaveLength(2);
    expect(trades[0]!.strategy).toBeUndefined();
    expect(trades[0]!.timeframe).toBeUndefined();
    expect(trades[0]!.mode).toBeUndefined();
    expect(trades[0]!.status).toBeUndefined();

    // Legacy records (status undefined !== 'unknown') are eligible by default.
    const stats = store.getStats();
    expect(stats.totalTrades).toBe(2);
    expect(stats.totalPnl).toBe(5.5);
    expect(stats.totalFees).toBe(1.5);
    expect(stats.netPnl).toBe(4);
  });

  // ---- 3. Corrupt line tolerance ----

  it('skips a single corrupt line instead of wiping the store', () => {
    seedTradesFile(
      tmpDir,
      botId,
      [
        JSON.stringify(makeTrade({ id: 'good-1', closedAt: 2000 })),
        'this is { not valid json',
        'null', // valid JSON but not an object — also skipped
        JSON.stringify(makeTrade({ id: 'good-2', closedAt: 3000, realizedPnl: 20 })),
      ].join('\n') + '\n',
    );

    const store = makeStore();
    const trades = store.getTrades();
    expect(trades.map((t) => t.id).sort()).toEqual(['good-1', 'good-2']);

    // Store is still writable and consistent after the partial load.
    store.recordTrade(makeTrade({ id: 'good-3', closedAt: 4000 }));
    expect(store.getTrades()).toHaveLength(3);
    expect(store.getStats().totalTrades).toBe(3);
  });

  // ---- 4. Filters ----

  it('filters by strategy / timeframe / mode / status and combines filters', () => {
    const store = makeStore();
    store.recordTrade(
      makeTrade({
        id: 't1',
        closedAt: 1000,
        strategy: 'macd',
        timeframe: '15',
        mode: 'live',
        status: 'confirmed',
      }),
    );
    store.recordTrade(
      makeTrade({
        id: 't2',
        closedAt: 2000,
        strategy: 'macd',
        timeframe: '15',
        mode: 'chaos',
        status: 'unknown',
      }),
    );
    store.recordTrade(
      makeTrade({
        id: 't3',
        closedAt: 3000,
        strategy: 'rsi',
        timeframe: '1',
        mode: 'live',
        status: 'confirmed',
        symbol: 'BTC/USDC',
      }),
    );
    store.recordTrade(makeTrade({ id: 't4', closedAt: 4000 })); // legacy — no extension fields

    const ids = (trades: TradeRecord[]): string[] => trades.map((t) => t.id).sort();

    // strategy narrows; legacy trade without the field is never matched
    expect(ids(store.getTrades({ strategy: 'macd' }))).toEqual(['t1', 't2']);
    expect(ids(store.getTrades({ strategy: 'rsi' }))).toEqual(['t3']);
    expect(ids(store.getTrades({ strategy: 'macd' }))).not.toContain('t4');

    // timeframe narrows
    expect(ids(store.getTrades({ timeframe: '15' }))).toEqual(['t1', 't2']);
    expect(ids(store.getTrades({ timeframe: '1' }))).toEqual(['t3']);

    // mode: concrete value narrows, 'all' behaves like omitted, missing field excluded
    expect(ids(store.getTrades({ mode: 'live' }))).toEqual(['t1', 't3']);
    expect(ids(store.getTrades({ mode: 'chaos' }))).toEqual(['t2']);
    expect(ids(store.getTrades({ mode: 'live' }))).not.toContain('t4');
    expect(ids(store.getTrades({ mode: 'all' }))).toEqual(['t1', 't2', 't3', 't4']);
    expect(ids(store.getTrades())).toEqual(['t1', 't2', 't3', 't4']);

    // status: concrete value narrows, 'all' behaves like omitted, missing field excluded
    expect(ids(store.getTrades({ status: 'confirmed' }))).toEqual(['t1', 't3']);
    expect(ids(store.getTrades({ status: 'unknown' }))).toEqual(['t2']);
    expect(ids(store.getTrades({ status: 'all' }))).toEqual(['t1', 't2', 't3', 't4']);

    // combining filters
    expect(ids(store.getTrades({ strategy: 'macd', mode: 'live' }))).toEqual(['t1']);
    expect(
      ids(
        store.getTrades({ strategy: 'macd', mode: 'live', status: 'confirmed', timeframe: '15' }),
      ),
    ).toEqual(['t1']);
    expect(ids(store.getTrades({ strategy: 'rsi', mode: 'chaos' }))).toEqual([]);
  });

  // ---- 5. getTradesPage cursor semantics ----

  it('pages newest-first through distinct closedAt records', () => {
    const store = makeStore();
    for (let i = 1; i <= 5; i++) {
      store.recordTrade(makeTrade({ id: `p${i}`, closedAt: i * 100 }));
    }

    const page1 = store.getTradesPage({ limit: 2 });
    expect(page1.trades.map((t) => t.id)).toEqual(['p5', 'p4']);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toEqual({ closedAt: 400, id: 'p4' });

    const page2 = store.getTradesPage({ cursor: page1.nextCursor!, limit: 2 });
    expect(page2.trades.map((t) => t.id)).toEqual(['p3', 'p2']);
    expect(page2.hasMore).toBe(true);
    expect(page2.nextCursor).toEqual({ closedAt: 200, id: 'p2' });

    const page3 = store.getTradesPage({ cursor: page2.nextCursor!, limit: 2 });
    expect(page3.trades.map((t) => t.id)).toEqual(['p1']);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursor).toEqual({ closedAt: 100, id: 'p1' });

    const page4 = store.getTradesPage({ cursor: page3.nextCursor!, limit: 2 });
    expect(page4.trades).toEqual([]);
    expect(page4.hasMore).toBe(false);
    expect(page4.nextCursor).toBeNull();
  });

  it('pages equal-closedAt records by the composite (closedAt, id) cursor without skipping or repeating', () => {
    const store = makeStore();
    store.recordTrade(makeTrade({ id: 'a', closedAt: 100 }));
    store.recordTrade(makeTrade({ id: 'b', closedAt: 100 }));
    store.recordTrade(makeTrade({ id: 'c', closedAt: 200 }));
    store.recordTrade(makeTrade({ id: 'd', closedAt: 200 }));
    store.recordTrade(makeTrade({ id: 'e', closedAt: 200 }));

    // Ordering contract: closedAt DESC then id DESC → e, d, c, b, a.
    const page1 = store.getTradesPage({ limit: 2 });
    expect(page1.trades.map((t) => t.id)).toEqual(['e', 'd']);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toEqual({ closedAt: 200, id: 'd' });

    // A bare-timestamp cursor would drop 'c' (it shares the boundary
    // timestamp); the id tiebreak keeps it — records before the cursor in the
    // sort order are returned exactly once, never skipped or repeated.
    const page2 = store.getTradesPage({ cursor: page1.nextCursor!, limit: 2 });
    expect(page2.trades.map((t) => t.id)).toEqual(['c', 'b']);
    expect(page2.hasMore).toBe(true);
    expect(page2.nextCursor).toEqual({ closedAt: 100, id: 'b' });

    const page3 = store.getTradesPage({ cursor: page2.nextCursor!, limit: 2 });
    expect(page3.trades.map((t) => t.id)).toEqual(['a']);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursor).toEqual({ closedAt: 100, id: 'a' });

    const page4 = store.getTradesPage({ cursor: page3.nextCursor!, limit: 2 });
    expect(page4.trades).toEqual([]);
    expect(page4.hasMore).toBe(false);
    expect(page4.nextCursor).toBeNull();

    // Full walk returns every record exactly once, newest-first.
    expect([...page1.trades, ...page2.trades, ...page3.trades].map((t) => t.id)).toEqual([
      'e',
      'd',
      'c',
      'b',
      'a',
    ]);
  });

  it('returns false and keeps the record out of memory when the append fails (append-first contract)', () => {
    const store = makeStore();
    store.recordTrade(makeTrade({ id: 'ok-1', closedAt: 1000 }));

    // Break the append: replace the trades file with a directory so
    // appendFileSync throws (EISDIR).
    rmSync(join(tmpDir, botId, 'trades.jsonl'), { force: true });
    mkdirSync(join(tmpDir, botId, 'trades.jsonl'));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const ok = store.recordTrade(makeTrade({ id: 'fail-1', closedAt: 2000 }));
      // Disk append failed → false, and the record is NOT in memory (no
      // phantom trade that would vanish on restart).
      expect(ok).toBe(false);
      expect(store.getTrades().map((t) => t.id)).toEqual(['ok-1']);
      // The failure is surfaced to the log.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to append trade record'),
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  // ---- 6. getStats extended fields ----

  it('computes netPnl, avgTrade, bestTrade and worstTrade', () => {
    const store = makeStore();
    store.recordTrade(makeTrade({ id: 'w', closedAt: 1000, realizedPnl: 100, fees: 10 }));
    store.recordTrade(makeTrade({ id: 'l', closedAt: 2000, realizedPnl: -50, fees: 5 }));

    const stats = store.getStats();
    expect(stats.totalTrades).toBe(2);
    expect(stats.totalPnl).toBe(50);
    expect(stats.totalFees).toBe(15);
    expect(stats.netPnl).toBe(35); // 50 - 15
    expect(stats.avgTrade).toBe(25); // 50 / 2
    expect(stats.bestTrade).toBe(100);
    expect(stats.worstTrade).toBe(-50);
  });

  it('computes profitFactor for win-only, loss-only and mixed sets', () => {
    const winOnly = makeStore({ botId: 'pf-win-only' });
    winOnly.recordTrade(makeTrade({ id: 'w1', closedAt: 1000, realizedPnl: 10 }));
    winOnly.recordTrade(makeTrade({ id: 'w2', closedAt: 2000, realizedPnl: 20 }));
    expect(winOnly.getStats().profitFactor).toBe(Number.MAX_SAFE_INTEGER);

    const lossOnly = makeStore({ botId: 'pf-loss-only' });
    lossOnly.recordTrade(makeTrade({ id: 'l1', closedAt: 1000, realizedPnl: -10 }));
    lossOnly.recordTrade(makeTrade({ id: 'l2', closedAt: 2000, realizedPnl: -20 }));
    expect(lossOnly.getStats().profitFactor).toBe(0);

    const mixed = makeStore({ botId: 'pf-mixed' });
    mixed.recordTrade(makeTrade({ id: 'w', closedAt: 1000, realizedPnl: 100 }));
    mixed.recordTrade(makeTrade({ id: 'l', closedAt: 2000, realizedPnl: -50 }));
    expect(mixed.getStats().profitFactor).toBe(2); // 100 / 50
  });

  it('computes maxDrawdown from the cumulative-PnL equity curve', () => {
    const store = makeStore();
    // Equity: +100 → 100, -50 → 50, -30 → 20, +60 → 80, -10 → 70.
    // Peak 100 → deepest trough 20 → maxDrawdown 80.
    store.recordTrade(makeTrade({ id: 't1', closedAt: 1000, realizedPnl: 100 }));
    store.recordTrade(makeTrade({ id: 't2', closedAt: 2000, realizedPnl: -50 }));
    store.recordTrade(makeTrade({ id: 't3', closedAt: 3000, realizedPnl: -30 }));
    store.recordTrade(makeTrade({ id: 't4', closedAt: 4000, realizedPnl: 60 }));
    store.recordTrade(makeTrade({ id: 't5', closedAt: 5000, realizedPnl: -10 }));
    expect(store.getStats().maxDrawdown).toBe(80);

    // A single trade cannot draw down from a peak.
    const single = makeStore({ botId: 'dd-single' });
    single.recordTrade(makeTrade({ id: 's1', closedAt: 1000, realizedPnl: 100 }));
    expect(single.getStats().maxDrawdown).toBe(0);
  });

  // ---- 7. Default exclude-unknown + cache invalidation ----

  it('excludes unknown-status trades by default and includes them with includeUnknown', () => {
    const store = makeStore();
    store.recordTrade(
      makeTrade({ id: 'confirmed-1', closedAt: 1000, status: 'confirmed', realizedPnl: 10 }),
    );
    store.recordTrade(
      makeTrade({ id: 'unknown-1', closedAt: 2000, status: 'unknown', realizedPnl: -50 }),
    );

    const defaultStats = store.getStats();
    expect(defaultStats.totalTrades).toBe(1);
    expect(defaultStats.totalPnl).toBe(10);

    const allStats = store.getStats({ includeUnknown: true });
    expect(allStats.totalTrades).toBe(2);
    expect(allStats.totalPnl).toBe(-40);
  });

  it('recomputes stats after a new trade (dirty flag invalidates the cache)', () => {
    const store = makeStore();
    store.recordTrade(
      makeTrade({ id: 'confirmed-1', closedAt: 1000, status: 'confirmed', realizedPnl: 10 }),
    );
    expect(store.getStats().totalTrades).toBe(1); // memoized

    // A new confirmed trade must invalidate the cached stats...
    store.recordTrade(
      makeTrade({ id: 'confirmed-2', closedAt: 2000, status: 'confirmed', realizedPnl: 50 }),
    );
    expect(store.getStats().totalTrades).toBe(2);
    expect(store.getStats().totalPnl).toBe(60);

    // ...and a subsequent unknown trade is picked up only with includeUnknown.
    store.recordTrade(
      makeTrade({ id: 'unknown-1', closedAt: 3000, status: 'unknown', realizedPnl: -500 }),
    );
    expect(store.getStats().totalTrades).toBe(2); // default still excludes it
    expect(store.getStats({ includeUnknown: true }).totalTrades).toBe(3);
  });

  // ---- 8. getGroupedStats ----

  it('groups by strategy / timeframe / asset with an (unknown) bucket and omits empty groups', () => {
    const store = makeStore();
    store.recordTrade(
      makeTrade({
        id: 't1',
        closedAt: 1000,
        strategy: 'macd',
        timeframe: '15',
        symbol: 'SOL/USDC',
        realizedPnl: 10,
        status: 'confirmed',
      }),
    );
    store.recordTrade(
      makeTrade({
        id: 't2',
        closedAt: 2000,
        strategy: 'macd',
        timeframe: '1',
        symbol: 'SOL/USDC',
        realizedPnl: 20,
        status: 'confirmed',
      }),
    );
    store.recordTrade(
      makeTrade({
        id: 't3',
        closedAt: 3000,
        strategy: 'rsi',
        timeframe: '15',
        symbol: 'BTC/USDC',
        realizedPnl: -5,
        status: 'confirmed',
      }),
    );
    store.recordTrade(
      makeTrade({
        id: 't4',
        closedAt: 4000,
        symbol: 'ETH/USDC',
        realizedPnl: 7,
        status: 'confirmed',
      }), // no strategy/timeframe
    );
    store.recordTrade(
      makeTrade({
        id: 't5',
        closedAt: 5000,
        strategy: 'macd',
        timeframe: '15',
        symbol: 'SOL/USDC',
        realizedPnl: 100,
        status: 'unknown',
      }), // excluded by default
    );

    const byStrategy = store.getGroupedStats('strategy');
    const strat = new Map(byStrategy.map((g) => [g.key, g.stats]));
    expect([...strat.keys()].sort()).toEqual(['(unknown)', 'macd', 'rsi']);
    expect(strat.get('macd')!.totalTrades).toBe(2);
    expect(strat.get('macd')!.totalPnl).toBe(30);
    expect(strat.get('rsi')!.totalTrades).toBe(1);
    expect(strat.get('(unknown)')!.totalTrades).toBe(1);

    // includeUnknown folds t5 into the macd group.
    const withUnknown = store.getGroupedStats('strategy', { includeUnknown: true });
    const stratAll = new Map(withUnknown.map((g) => [g.key, g.stats]));
    expect(stratAll.get('macd')!.totalTrades).toBe(3);
    expect(stratAll.get('macd')!.totalPnl).toBe(130);

    const byTimeframe = store.getGroupedStats('timeframe');
    const tf = new Map(byTimeframe.map((g) => [g.key, g.stats]));
    expect([...tf.keys()].sort()).toEqual(['(unknown)', '1', '15']);
    expect(tf.get('15')!.totalTrades).toBe(2);
    expect(tf.get('1')!.totalTrades).toBe(1);
    expect(tf.get('(unknown)')!.totalTrades).toBe(1);

    const byAsset = store.getGroupedStats('asset');
    const asset = new Map(byAsset.map((g) => [g.key, g.stats]));
    expect([...asset.keys()].sort()).toEqual(['BTC/USDC', 'ETH/USDC', 'SOL/USDC']);
    expect(asset.get('SOL/USDC')!.totalTrades).toBe(2);
    expect(asset.get('BTC/USDC')!.totalTrades).toBe(1);

    // Zero-trade groups are omitted — every returned group has ≥ 1 trade.
    for (const group of byStrategy) {
      expect(group.stats.totalTrades).toBeGreaterThan(0);
    }
  });

  // ---- 9. pruneDebugSnapshots ----

  it('prunes debug snapshots beyond maxDebugSnapshots, keeping the newest', () => {
    const store = makeStore({ maxDebugSnapshots: 2 });
    for (let i = 1; i <= 5; i++) {
      store.saveDebugSnapshot({
        timestamp: i * 1000,
        botState: `state-${i}`,
        positions: [],
        balance: 1000,
        errors: [],
        logs: [],
        recentTrades: [],
      });
    }

    const files = readdirSync(join(tmpDir, botId, 'debug')).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(2);
    // Lexicographic filename sort == chronological for ISO timestamps.
    const names = files.join('\n');
    expect(names).toContain('T00-00-04');
    expect(names).toContain('T00-00-05');
    expect(names).not.toContain('T00-00-01');
  });

  // ---- 10. Rotation guard (50k threshold → trades-archive.jsonl) ----

  it('rotates the oldest lines beyond the threshold into trades-archive.jsonl without duplicating on restart', () => {
    const threshold = 50_000;
    const excess = 5;
    const total = threshold + excess;

    const lines: string[] = [];
    for (let i = 0; i < total; i++) {
      lines.push(
        JSON.stringify(
          makeTrade({ id: `t-${i}`, closedAt: 1000 + i, realizedPnl: i % 2 === 0 ? 10 : -5 }),
        ),
      );
    }
    seedTradesFile(tmpDir, botId, lines.join('\n') + '\n');

    // First construction archives the oldest `excess` lines; memory keeps the newest `threshold`.
    const store = makeStore();
    expect(store.getTrades()).toHaveLength(threshold);
    expect(store.getTrades()[0]!.id).toBe(`t-${total - 1}`);

    const archive = archiveLines(store);
    expect(archive).toHaveLength(excess);
    expect(JSON.parse(archive[0]!).id).toBe('t-0');
    expect(JSON.parse(archive[archive.length - 1]!).id).toBe(`t-${excess - 1}`);

    // The live file is append-only — rotation never rewrites it.
    const liveLines = readFileSync(join(tmpDir, botId, 'trades.jsonl'), 'utf-8')
      .split('\n')
      .filter(Boolean);
    expect(liveLines).toHaveLength(total);

    // Second construction must NOT re-archive the same block (marker prevents duplicates).
    const store2 = makeStore();
    expect(store2.getTrades()).toHaveLength(threshold);
    expect(archiveLines(store2)).toHaveLength(excess);
  });
});
