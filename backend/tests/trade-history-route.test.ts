/**
 * Route-level tests for the trade-history + statistics API
 * (OpenSpec change: add-trade-history-stats-dashboard, spec `trade-history`,
 * design D4).
 *
 * Scope: `createTradeHistoryRouter` (backend/src/routes/trade-history.ts) —
 * GET /api/bot/history and GET /api/bot/stats.
 *
 * House style (see bot-route.test.ts): real express app on an ephemeral port
 * + native fetch. The router is exercised against a REAL TradeHistoryStore
 * over a per-test tmpdir so the query parsing layer is tested end-to-end
 * against the store's actual filter/stats behavior. The parity assertions
 * (route summary === store.getStats over the same filter set) enforce the
 * design rule that the route must NOT duplicate store logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTradeHistoryRouter } from '../src/routes/trade-history.js';
import { TradeHistoryStore } from '../../src/trading/trade-history-store.js';
import type { TradeRecord, TradeStats } from '../../src/trading/trade-history-store.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Minimal valid TradeRecord builder. Optional extension fields (strategy,
 * timeframe, mode, status) are omitted unless explicitly provided. */
function makeTrade(
  overrides: Partial<TradeRecord> & { id: string; closedAt: number },
): TradeRecord {
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
    // Production-realistic defaults: the route's DEFAULT status filter is
    // 'confirmed', so seeds without a status field would be invisible to it.
    // Overrides can still flip these per-test (mode/status filter tests).
    mode: 'live',
    status: 'confirmed',
    ...overrides,
  };
}

let botCounter = 0;
function uniqueBotId(): string {
  botCounter += 1;
  return `route-test-${Date.now()}-${botCounter}`;
}

async function startServer(getStore: () => TradeHistoryStore | null) {
  const app = express();
  app.use(express.json());
  app.use('/api', createTradeHistoryRouter({ getStore }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  return { server, baseUrl };
}

async function stopServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

/** Fixed fixture used by the stats parity/grouping tests. Every trade has a
 * distinct closedAt and a deliberately clean PnL so group memberships and
 * counts are unambiguous:
 *  confirmed, live,    alpha, '60',  BTCUSDC: +10 (t1), -5 (t2)
 *  confirmed, chaos,   beta,  '240', SOLUSDC: +20 (t3)
 *  unknown,   chaos,   beta,  '240', SOLUSDC: -3  (t4)
 *  confirmed, live,    (no strategy/timeframe), ETHUSDC: +8 (t5)
 */
function seedStatsStore(store: TradeHistoryStore): void {
  store.recordTrade(
    makeTrade({ id: 't1', closedAt: 1000, realizedPnl: 10, fees: 1, status: 'confirmed', mode: 'live', strategy: 'alpha', timeframe: '60', symbol: 'BTCUSDC' }),
  );
  store.recordTrade(
    makeTrade({ id: 't2', closedAt: 2000, realizedPnl: -5, fees: 0.5, status: 'confirmed', mode: 'live', strategy: 'alpha', timeframe: '60', symbol: 'BTCUSDC' }),
  );
  store.recordTrade(
    makeTrade({ id: 't3', closedAt: 3000, realizedPnl: 20, fees: 2, status: 'confirmed', mode: 'chaos', strategy: 'beta', timeframe: '240', symbol: 'SOLUSDC' }),
  );
  store.recordTrade(
    makeTrade({ id: 't4', closedAt: 4000, realizedPnl: -3, fees: 1, status: 'unknown', mode: 'chaos', strategy: 'beta', timeframe: '240', symbol: 'SOLUSDC' }),
  );
  store.recordTrade(
    makeTrade({ id: 't5', closedAt: 5000, realizedPnl: 8, fees: 0, status: 'confirmed', mode: 'live', symbol: 'ETHUSDC' }),
  );
}

// ── GET /api/bot/history ──────────────────────────────────────────────────

describe('GET /api/bot/history — happy path', () => {
  let server: Server;
  let baseUrl: string;
  let store: TradeHistoryStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'route-test-'));
    store = new TradeHistoryStore({ baseDir: tmpDir, botId: uniqueBotId() });
    ({ server, baseUrl } = await startServer(() => store));
  });

  afterEach(async () => {
    await stopServer(server);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns seeded trades newest-first with the success envelope', async () => {
    store.recordTrade(makeTrade({ id: 'a', closedAt: 1000, realizedPnl: 5 }));
    store.recordTrade(makeTrade({ id: 'b', closedAt: 2000, realizedPnl: 8 }));
    store.recordTrade(makeTrade({ id: 'c', closedAt: 3000, realizedPnl: -2 }));

    const res = await fetch(`${baseUrl}/bot/history`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.trades)).toBe(true);
    expect(body.trades.map((t: TradeRecord) => t.id)).toEqual(['c', 'b', 'a']);
    expect(body.hasMore).toBe(false);
    // Composite cursor contract: nextCursor is "<closedAt>:<id>" of the last
    // page record; null only when the page is empty (hasMore is the end-of-
    // list signal).
    expect(body.nextCursor).toBe('1000:a');
  });

  it('sets hasMore=true and nextCursor when limit is smaller than the total', async () => {
    store.recordTrade(makeTrade({ id: 'a', closedAt: 1000 }));
    store.recordTrade(makeTrade({ id: 'b', closedAt: 2000 }));
    store.recordTrade(makeTrade({ id: 'c', closedAt: 3000 }));

    const res = await fetch(`${baseUrl}/bot/history?limit=2`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trades.map((t: TradeRecord) => t.id)).toEqual(['c', 'b']);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe('2000:b');
  });

  it('defaults limit to 50 when absent', async () => {
    for (let i = 1; i <= 60; i += 1) {
      store.recordTrade(makeTrade({ id: `t${i}`, closedAt: i * 100 }));
    }
    const res = await fetch(`${baseUrl}/bot/history`);
    const body = await res.json();
    expect(body.trades).toHaveLength(50);
    expect(body.hasMore).toBe(true);
    // Newest first.
    expect(body.trades[0].id).toBe('t60');
    expect(body.trades[49].id).toBe('t11');
  });
});

describe('GET /api/bot/history — filters', () => {
  let server: Server;
  let baseUrl: string;
  let store: TradeHistoryStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'route-test-'));
    store = new TradeHistoryStore({ baseDir: tmpDir, botId: uniqueBotId() });
    ({ server, baseUrl } = await startServer(() => store));
  });

  afterEach(async () => {
    await stopServer(server);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('filters by symbol', async () => {
    store.recordTrade(makeTrade({ id: 'btc', closedAt: 3000, symbol: 'BTCUSDC' }));
    store.recordTrade(makeTrade({ id: 'sol', closedAt: 2000, symbol: 'SOLUSDC' }));
    store.recordTrade(makeTrade({ id: 'eth', closedAt: 1000, symbol: 'ETHUSDC' }));

    const res = await fetch(`${baseUrl}/bot/history?symbol=SOLUSDC`);
    const body = await res.json();
    expect(body.trades.map((t: TradeRecord) => t.id)).toEqual(['sol']);
  });

  it('filters by timeframe', async () => {
    store.recordTrade(makeTrade({ id: 'm1', closedAt: 3000, timeframe: '1' }));
    store.recordTrade(makeTrade({ id: 'm60', closedAt: 2000, timeframe: '60' }));
    store.recordTrade(makeTrade({ id: 'm240', closedAt: 1000, timeframe: '240' }));

    const res = await fetch(`${baseUrl}/bot/history?timeframe=60`);
    const body = await res.json();
    expect(body.trades.map((t: TradeRecord) => t.id)).toEqual(['m60']);
  });

  it('filters by strategy', async () => {
    store.recordTrade(makeTrade({ id: 'alpha1', closedAt: 3000, strategy: 'alpha' }));
    store.recordTrade(makeTrade({ id: 'alpha2', closedAt: 2000, strategy: 'alpha' }));
    store.recordTrade(makeTrade({ id: 'beta1', closedAt: 1000, strategy: 'beta' }));

    const res = await fetch(`${baseUrl}/bot/history?strategy=alpha`);
    const body = await res.json();
    expect(body.trades.map((t: TradeRecord) => t.id)).toEqual(['alpha1', 'alpha2']);
  });

  it('filters by mode — live, chaos, and all semantics', async () => {
    store.recordTrade(makeTrade({ id: 'live1', closedAt: 3000, mode: 'live' }));
    store.recordTrade(makeTrade({ id: 'chaos1', closedAt: 2000, mode: 'chaos' }));
    store.recordTrade(makeTrade({ id: 'live2', closedAt: 1000, mode: 'live' }));

    const live = await (await fetch(`${baseUrl}/bot/history?mode=live`)).json();
    expect(live.trades.map((t: TradeRecord) => t.id)).toEqual(['live1', 'live2']);

    const chaos = await (await fetch(`${baseUrl}/bot/history?mode=chaos`)).json();
    expect(chaos.trades.map((t: TradeRecord) => t.id)).toEqual(['chaos1']);

    // mode=all and the absent default both disable the mode filter.
    const all = await (await fetch(`${baseUrl}/bot/history?mode=all`)).json();
    expect(all.trades.map((t: TradeRecord) => t.id)).toEqual(['live1', 'chaos1', 'live2']);
    const absent = await (await fetch(`${baseUrl}/bot/history`)).json();
    expect(absent.trades.map((t: TradeRecord) => t.id)).toEqual(['live1', 'chaos1', 'live2']);
  });

  it('filters by status — default excludes unknown, all includes it', async () => {
    store.recordTrade(makeTrade({ id: 'conf1', closedAt: 3000, status: 'confirmed' }));
    store.recordTrade(makeTrade({ id: 'unk1', closedAt: 2000, status: 'unknown' }));
    store.recordTrade(makeTrade({ id: 'conf2', closedAt: 1000, status: 'confirmed' }));

    // Route default status is 'confirmed' — unknown trades are hidden.
    const defaultRes = await (await fetch(`${baseUrl}/bot/history`)).json();
    expect(defaultRes.trades.map((t: TradeRecord) => t.id)).toEqual(['conf1', 'conf2']);

    const confirmed = await (await fetch(`${baseUrl}/bot/history?status=confirmed`)).json();
    expect(confirmed.trades.map((t: TradeRecord) => t.id)).toEqual(['conf1', 'conf2']);

    const unknown = await (await fetch(`${baseUrl}/bot/history?status=unknown`)).json();
    expect(unknown.trades.map((t: TradeRecord) => t.id)).toEqual(['unk1']);

    const all = await (await fetch(`${baseUrl}/bot/history?status=all`)).json();
    expect(all.trades.map((t: TradeRecord) => t.id)).toEqual(['conf1', 'unk1', 'conf2']);
  });

  it('filters by from/to window (inclusive ms timestamps on closedAt)', async () => {
    store.recordTrade(makeTrade({ id: 'a', closedAt: 1000 }));
    store.recordTrade(makeTrade({ id: 'b', closedAt: 2000 }));
    store.recordTrade(makeTrade({ id: 'c', closedAt: 3000 }));

    const fromOnly = await (await fetch(`${baseUrl}/bot/history?from=1500`)).json();
    expect(fromOnly.trades.map((t: TradeRecord) => t.id)).toEqual(['c', 'b']);

    const toOnly = await (await fetch(`${baseUrl}/bot/history?to=2500`)).json();
    expect(toOnly.trades.map((t: TradeRecord) => t.id)).toEqual(['b', 'a']);

    const both = await (await fetch(`${baseUrl}/bot/history?from=1500&to=2500`)).json();
    expect(both.trades.map((t: TradeRecord) => t.id)).toEqual(['b']);

    // Boundaries are inclusive.
    const inclusive = await (await fetch(`${baseUrl}/bot/history?from=1000&to=3000`)).json();
    expect(inclusive.trades.map((t: TradeRecord) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('combines filters', async () => {
    store.recordTrade(
      makeTrade({ id: 't1', closedAt: 4000, symbol: 'BTCUSDC', strategy: 'alpha', timeframe: '60', mode: 'live' }),
    );
    store.recordTrade(
      makeTrade({ id: 't2', closedAt: 3000, symbol: 'BTCUSDC', strategy: 'alpha', timeframe: '60', mode: 'chaos' }),
    );
    store.recordTrade(
      makeTrade({ id: 't3', closedAt: 2000, symbol: 'SOLUSDC', strategy: 'alpha', timeframe: '60', mode: 'live' }),
    );
    store.recordTrade(
      makeTrade({ id: 't4', closedAt: 1000, symbol: 'BTCUSDC', strategy: 'beta', timeframe: '60', mode: 'live' }),
    );

    const res = await fetch(
      `${baseUrl}/bot/history?symbol=BTCUSDC&strategy=alpha&mode=live&timeframe=60`,
    );
    const body = await res.json();
    expect(body.trades.map((t: TradeRecord) => t.id)).toEqual(['t1']);
  });
});

describe('GET /api/bot/history — pagination', () => {
  let server: Server;
  let baseUrl: string;
  let store: TradeHistoryStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'route-test-'));
    store = new TradeHistoryStore({ baseDir: tmpDir, botId: uniqueBotId() });
    ({ server, baseUrl } = await startServer(() => store));
  });

  afterEach(async () => {
    await stopServer(server);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('walks pages with cursor+limit, no duplicates, and signals the end', async () => {
    // 5 trades, distinct closedAt: a(1000) … e(5000).
    store.recordTrade(makeTrade({ id: 'a', closedAt: 1000 }));
    store.recordTrade(makeTrade({ id: 'b', closedAt: 2000 }));
    store.recordTrade(makeTrade({ id: 'c', closedAt: 3000 }));
    store.recordTrade(makeTrade({ id: 'd', closedAt: 4000 }));
    store.recordTrade(makeTrade({ id: 'e', closedAt: 5000 }));

    const page1 = await (await fetch(`${baseUrl}/bot/history?limit=2`)).json();
    expect(page1.trades.map((t: TradeRecord) => t.id)).toEqual(['e', 'd']);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe('4000:d');

    const page2 = await (
      await fetch(`${baseUrl}/bot/history?limit=2&cursor=${page1.nextCursor}`)
    ).json();
    expect(page2.trades.map((t: TradeRecord) => t.id)).toEqual(['c', 'b']);
    expect(page2.hasMore).toBe(true);
    expect(page2.nextCursor).toBe('2000:b');

    // Last non-empty page: hasMore=false is the end signal. Per the composite
    // contract nextCursor is still the last record's "<closedAt>:<id>" (it is
    // only null when the page itself is empty).
    const page3 = await (
      await fetch(`${baseUrl}/bot/history?limit=2&cursor=${page2.nextCursor}`)
    ).json();
    expect(page3.trades.map((t: TradeRecord) => t.id)).toEqual(['a']);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursor).toBe('1000:a');

    // Requesting past the end yields an empty page → nextCursor null.
    const page4 = await (
      await fetch(`${baseUrl}/bot/history?limit=2&cursor=${page3.nextCursor}`)
    ).json();
    expect(page4.trades).toEqual([]);
    expect(page4.hasMore).toBe(false);
    expect(page4.nextCursor).toBeNull();

    // No duplicates across pages.
    const allIds = [...page1.trades, ...page2.trades, ...page3.trades].map(
      (t: TradeRecord) => t.id,
    );
    expect(new Set(allIds).size).toBe(5);
  });

  it('echoes an opaque "<closedAt>:<id>" cursor split on the FIRST colon (dashed ids preserved)', async () => {
    store.recordTrade(makeTrade({ id: 'bot-1-1700000000000', closedAt: 1000 }));
    store.recordTrade(makeTrade({ id: 'bot-1-1700000001000', closedAt: 2000 }));
    store.recordTrade(makeTrade({ id: 'bot-1-1700000002000', closedAt: 3000 }));

    const page1 = await (await fetch(`${baseUrl}/bot/history?limit=1`)).json();
    expect(page1.trades.map((t: TradeRecord) => t.id)).toEqual(['bot-1-1700000002000']);
    expect(page1.nextCursor).toBe('3000:bot-1-1700000002000');

    // The id contains dashes (never colons) — the cursor must split on the
    // first colon only, or the id would be truncated.
    const page2 = await (
      await fetch(`${baseUrl}/bot/history?limit=1&cursor=${page1.nextCursor}`)
    ).json();
    expect(page2.trades.map((t: TradeRecord) => t.id)).toEqual(['bot-1-1700000001000']);
    expect(page2.nextCursor).toBe('2000:bot-1-1700000001000');
  });
});

describe('GET /api/bot/history — errors', () => {
  let server: Server;
  let baseUrl: string;
  let store: TradeHistoryStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'route-test-'));
    store = new TradeHistoryStore({ baseDir: tmpDir, botId: uniqueBotId() });
    ({ server, baseUrl } = await startServer(() => store));
  });

  afterEach(async () => {
    await stopServer(server);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each([
    ['0', '0'],
    ['-1', '-1'],
    ['abc', 'abc'],
    ['999', '999'],
    ['', 'empty-string'],
  ])('rejects invalid limit %s → 400', async (limit, label) => {
    const res = await fetch(`${baseUrl}/bot/history?limit=${limit}`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('limit');
  });

  it('accepts the limit boundaries (1 and 200)', async () => {
    store.recordTrade(makeTrade({ id: 'a', closedAt: 1000 }));
    store.recordTrade(makeTrade({ id: 'b', closedAt: 2000 }));

    const min = await fetch(`${baseUrl}/bot/history?limit=1`);
    expect(min.status).toBe(200);
    const minBody = await min.json();
    expect(minBody.trades).toHaveLength(1);

    const max = await fetch(`${baseUrl}/bot/history?limit=200`);
    expect(max.status).toBe(200);
  });

  it('rejects invalid mode and status values → 400', async () => {
    const mode = await fetch(`${baseUrl}/bot/history?mode=paper`);
    expect(mode.status).toBe(400);
    expect((await mode.json()).error).toContain('mode');

    const status = await fetch(`${baseUrl}/bot/history?status=pending`);
    expect(status.status).toBe(400);
    expect((await status.json()).error).toContain('status');
  });

  it.each([
    ['abc', 'no colon'],
    [':123', 'leading colon'],
    ['abc:def', 'non-numeric closedAt'],
    ['123:', 'empty id'],
  ])('rejects invalid composite cursor "%s" (%s) → 400', async (cursor) => {
    const res = await fetch(`${baseUrl}/bot/history?cursor=${cursor}`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('cursor');
  });

  it('rejects invalid from and to → 400', async () => {
    const from = await fetch(`${baseUrl}/bot/history?from=not-a-date`);
    expect(from.status).toBe(400);
    expect((await from.json()).error).toContain('from');

    const to = await fetch(`${baseUrl}/bot/history?to=later`);
    expect(to.status).toBe(400);
    expect((await to.json()).error).toContain('to');
  });
});

// ── GET /api/bot/stats ────────────────────────────────────────────────────

describe('GET /api/bot/stats — global summary', () => {
  let server: Server;
  let baseUrl: string;
  let store: TradeHistoryStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'route-test-'));
    store = new TradeHistoryStore({ baseDir: tmpDir, botId: uniqueBotId() });
    seedStatsStore(store);
    ({ server, baseUrl } = await startServer(() => store));
  });

  afterEach(async () => {
    await stopServer(server);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('global summary equals the store getStats over the same (empty) filter set and groups is null', async () => {
    const res = await fetch(`${baseUrl}/bot/stats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Parity: the route must NOT re-derive stats — it passes the parsed
    // filters straight to the store.
    expect(body.summary).toEqual(store.getStats());
    // global → groups is null (not an empty array).
    expect(body.groups).toBeNull();
  });

  it('global filtered summary equals store.getStats({ strategy })', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?groupBy=global&strategy=alpha`);
    const body = await res.json();
    expect(body.summary).toEqual(store.getStats({ strategy: 'alpha' }));
    expect(body.summary.totalTrades).toBe(2);
  });

  it('global filtered summary equals the per-group entry in groupBy=strategy (cross-path parity)', async () => {
    const globalRes = await (await fetch(`${baseUrl}/bot/stats?groupBy=global&strategy=alpha`)).json();
    const groupedRes = await (await fetch(`${baseUrl}/bot/stats?groupBy=strategy`)).json();

    const alphaGroup = groupedRes.groups.find(
      (g: { key: string }) => g.key === 'alpha',
    );
    expect(alphaGroup).toBeDefined();
    expect(alphaGroup.stats).toEqual(globalRes.summary);
    expect(alphaGroup.stats).toEqual(store.getStats({ strategy: 'alpha' }));
  });
});

describe('GET /api/bot/stats — grouped', () => {
  let server: Server;
  let baseUrl: string;
  let store: TradeHistoryStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'route-test-'));
    store = new TradeHistoryStore({ baseDir: tmpDir, botId: uniqueBotId() });
    seedStatsStore(store);
    ({ server, baseUrl } = await startServer(() => store));
  });

  afterEach(async () => {
    await stopServer(server);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('groupBy=strategy returns one group per present strategy incl. (unknown)', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?groupBy=strategy`);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.groups)).toBe(true);
    // Default status excludes unknown (t4, beta/chaos) — 4 confirmed trades:
    // alpha (t1,t2), beta (t3), (unknown) (t5 no strategy field).
    const keys = body.groups.map((g: { key: string }) => g.key).sort();
    expect(keys).toEqual(['(unknown)', 'alpha', 'beta']);
    const byKey = Object.fromEntries(
      body.groups.map((g: { key: string; stats: TradeStats }) => [g.key, g.stats]),
    );
    expect(byKey['alpha'].totalTrades).toBe(2);
    expect(byKey['beta'].totalTrades).toBe(1);
    expect(byKey['(unknown)'].totalTrades).toBe(1);
  });

  it('groupBy=timeframe uses (unknown) for trades without a timeframe', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?groupBy=timeframe`);
    const body = await res.json();
    const keys = body.groups.map((g: { key: string }) => g.key).sort();
    expect(keys).toEqual(['(unknown)', '240', '60']);
  });

  it('groupBy=asset keys are the trade symbols (symbol is always present)', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?groupBy=asset`);
    const body = await res.json();
    const keys = body.groups.map((g: { key: string }) => g.key).sort();
    expect(keys).toEqual(['BTCUSDC', 'ETHUSDC', 'SOLUSDC']);
  });

  it('omits zero-trade groups — every returned key corresponds to a seeded trade', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?groupBy=strategy`);
    const body = await res.json();
    const groupKeys = new Set(body.groups.map((g: { key: string }) => g.key));
    const presentKeys = new Set(
      store
        .getTrades({ status: 'confirmed' })
        .map((t) => t.strategy ?? '(unknown)'),
    );
    expect(groupKeys).toEqual(presentKeys);
  });
});

describe('GET /api/bot/stats — mode/status semantics', () => {
  let server: Server;
  let baseUrl: string;
  let store: TradeHistoryStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'route-test-'));
    store = new TradeHistoryStore({ baseDir: tmpDir, botId: uniqueBotId() });
    seedStatsStore(store);
    ({ server, baseUrl } = await startServer(() => store));
  });

  afterEach(async () => {
    await stopServer(server);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('mode=live excludes chaos trades', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?mode=live`);
    const body = await res.json();
    // Confirmed + live: t1, t2, t5.
    expect(body.summary).toEqual(store.getStats({ mode: 'live' }));
    expect(body.summary.totalTrades).toBe(3);
  });

  it('mode=chaos returns only chaos trades', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?mode=chaos`);
    const body = await res.json();
    // Confirmed + chaos: t3 only (t4 is unknown → still excluded by default).
    expect(body.summary).toEqual(store.getStats({ mode: 'chaos' }));
    expect(body.summary.totalTrades).toBe(1);
  });

  it('default status excludes unknown trades', async () => {
    const res = await fetch(`${baseUrl}/bot/stats`);
    const body = await res.json();
    expect(body.summary).toEqual(store.getStats());
    expect(body.summary.totalTrades).toBe(4);
  });

  it('status=all includes unknown trades', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?status=all`);
    const body = await res.json();
    expect(body.summary).toEqual(store.getStats({ includeUnknown: true }));
    expect(body.summary.totalTrades).toBe(5);
  });

  it('status=unknown returns only unknown trades', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?status=unknown`);
    const body = await res.json();
    expect(body.summary).toEqual(
      store.getStats({ status: 'unknown', includeUnknown: true }),
    );
    expect(body.summary.totalTrades).toBe(1);
  });

  it('grouped stats respect mode=live (chaos-only groups are omitted)', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?groupBy=strategy&mode=live`);
    const body = await res.json();
    const keys = body.groups.map((g: { key: string }) => g.key).sort();
    // Confirmed + live: alpha (t1,t2), (unknown) (t5). beta is chaos-only (t3)
    // and t4 is unknown — neither survives, so the beta group is absent.
    expect(keys).toEqual(['(unknown)', 'alpha']);
  });
});

describe('GET /api/bot/stats — errors', () => {
  let server: Server;
  let baseUrl: string;
  let store: TradeHistoryStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'route-test-'));
    store = new TradeHistoryStore({ baseDir: tmpDir, botId: uniqueBotId() });
    ({ server, baseUrl } = await startServer(() => store));
  });

  afterEach(async () => {
    await stopServer(server);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects an invalid groupBy → 400', async () => {
    const res = await fetch(`${baseUrl}/bot/stats?groupBy=wallet`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('groupBy');
  });

  it('rejects invalid mode/status/from/to through the shared filter parser → 400', async () => {
    for (const qs of ['mode=paper', 'status=pending', 'from=abc', 'to=xyz']) {
      const res = await fetch(`${baseUrl}/bot/stats?${qs}`);
      expect(res.status).toBe(400);
      expect((await res.json()).success).toBe(false);
    }
  });
});

// ── Store unavailable ──────────────────────────────────────────────────────

describe('store unavailable — 503 for both endpoints', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    ({ server, baseUrl } = await startServer(() => null));
  });

  afterEach(async () => {
    await stopServer(server);
  });

  it('GET /bot/history → 503', async () => {
    const res = await fetch(`${baseUrl}/bot/history`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Trade history not available',
    });
  });

  it('GET /bot/stats → 503', async () => {
    const res = await fetch(`${baseUrl}/bot/stats`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Trade history not available',
    });
  });
});
