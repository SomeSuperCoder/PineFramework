/**
 * Route-level regression tests for the bot API configure merge
 * (OpenSpec change: fix-chaos-mode-silent-vanish, task 5.3).
 *
 * POST /api/bot/configure MERGES validated fields into the current engine
 * config instead of rebuilding from scratch, so an existing `chaosMode` set by
 * a prior toggle survives a re-configure — both in the engine and on disk.
 *
 * Uses a real express app on an ephemeral port with a mocked engine + config
 * store (no production code is exercised beyond the route itself).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createBotRouter } from '../src/routes/bot.js';
import type { BotEngine, BotConfig } from 'pine-framework';
import type { BotConfigStore } from 'pine-framework/trading/config-store';

function makeEngine(initialConfig: BotConfig) {
  let cfg: BotConfig = initialConfig;
  return {
    get config(): BotConfig {
      return cfg;
    },
    configure: vi.fn((c: BotConfig) => {
      cfg = c;
    }),
    toggleChaosMode: vi.fn(async (enabled: boolean) => {
      cfg = { ...cfg, chaosMode: { enabled } };
    }),
    state: 'Idle' as const,
  };
}

function makeStore() {
  let saved: BotConfig | null = null;
  return {
    load: vi.fn(() => saved),
    save: vi.fn((c: BotConfig) => {
      saved = c;
    }),
    delete: vi.fn(),
    get saved(): BotConfig | null {
      return saved;
    },
  };
}

const VALID_PAYLOAD = {
  strategySource: '//@version=5\nstrategy("new")',
  dex: 'jupiter-swap',
  pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
  risk: { maxDailyLoss: 50 },
};

describe('POST /api/bot/configure merge (D4)', () => {
  let server: Server;
  let baseUrl: string;
  let engine: ReturnType<typeof makeEngine>;
  let store: ReturnType<typeof makeStore>;

  beforeEach(async () => {
    // Simulate a bot that was previously configured with chaos mode enabled
    // (e.g. via toggleChaosMode / POST /bot/chaos-mode).
    engine = makeEngine({
      strategySource: '//@version=5\nstrategy("existing")',
      dex: 'jupiter-swap',
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
      risk: { maxDailyLoss: 100 },
      chaosMode: { enabled: true },
    });
    store = makeStore();

    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      createBotRouter({
        getEngine: () => engine as unknown as BotEngine,
        getConfigStore: () => store as unknown as BotConfigStore,
      }),
    );

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('with chaosMode present in the payload preserves it in the engine config AND on disk', async () => {
    const res = await fetch(`${baseUrl}/bot/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_PAYLOAD, chaosMode: { enabled: true } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Engine config keeps chaosMode (the merge never drops it).
    expect(engine.config.chaosMode).toEqual({ enabled: true });
    // Disk write (store.save) keeps chaosMode too.
    expect(store.save).toHaveBeenCalled();
    const lastSaved = store.save.mock.calls[store.save.mock.calls.length - 1]![0] as BotConfig;
    expect(lastSaved.chaosMode).toEqual({ enabled: true });
  });

  it('configure without chaosMode does not silently drop an existing one (engine + disk)', async () => {
    const res = await fetch(`${baseUrl}/bot/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(200);

    // The regression: a plain (frontend-style) configure must not erase the
    // chaos flag the engine already holds.
    expect(engine.config.chaosMode).toEqual({ enabled: true });

    const lastSaved = store.save.mock.calls[store.save.mock.calls.length - 1]![0] as BotConfig;
    expect(lastSaved.chaosMode).toEqual({ enabled: true });
  });

  it('merges updated fields while preserving the untouched chaosMode on disk', async () => {
    const res = await fetch(`${baseUrl}/bot/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_PAYLOAD, risk: { maxDailyLoss: 999 } }),
    });

    expect(res.status).toBe(200);

    // The payload's field IS applied…
    expect(engine.config.risk.maxDailyLoss).toBe(999);
    // …and the untouched chaosMode still survives in both places.
    expect(engine.config.chaosMode).toEqual({ enabled: true });
    const lastSaved = store.save.mock.calls[store.save.mock.calls.length - 1]![0] as BotConfig;
    expect(lastSaved.chaosMode).toEqual({ enabled: true });
    expect(lastSaved.risk.maxDailyLoss).toBe(999);
  });

  it('payload chaosMode enabled=false flips an enabled base to false (engine + disk)', async () => {
    const res = await fetch(`${baseUrl}/bot/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_PAYLOAD, chaosMode: { enabled: false } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // The payload explicitly changed chaosMode → the merge must APPLY the new
    // value to the engine, not keep the base's `true`. (The old same-value
    // test passed even with the broken code — this asserts the actual flip.)
    expect(engine.config.chaosMode).toEqual({ enabled: false });
    // …and the disk write must match the engine.
    const lastSaved = store.save.mock.calls[store.save.mock.calls.length - 1]![0] as BotConfig;
    expect(lastSaved.chaosMode).toEqual({ enabled: false });
  });

  it('payload chaosMode enabled=true flips a disabled base to true (engine + disk)', async () => {
    // Reverse direction: the shared beforeEach engine starts with chaosMode
    // ENABLED, so rebuild engine+store with a disabled base for this test. The
    // router closures read the mutable `engine`/`store` bindings at request
    // time, so this swap is picked up by the already-listening app.
    engine = makeEngine({
      strategySource: '//@version=5\nstrategy("existing")',
      dex: 'jupiter-swap',
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
      risk: { maxDailyLoss: 100 },
      chaosMode: { enabled: false },
    });
    store = makeStore();

    const res = await fetch(`${baseUrl}/bot/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_PAYLOAD, chaosMode: { enabled: true } }),
    });

    expect(res.status).toBe(200);

    expect(engine.config.chaosMode).toEqual({ enabled: true });

    const lastSaved = store.save.mock.calls[store.save.mock.calls.length - 1]![0] as BotConfig;
    expect(lastSaved.chaosMode).toEqual({ enabled: true });
  });

  it('chaos configure omitting strategySource preserves the base strategySource (engine + disk)', async () => {
    // Regression for the "silent wipe": when chaos mode is enabled in the
    // payload, strategySource is optional — omitting it must NOT overwrite the
    // base config's strategySource with undefined.
    const res = await fetch(`${baseUrl}/bot/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chaosMode: { enabled: true },
        dex: 'jupiter-ultra',
        pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
        risk: { maxDailyLoss: 50 },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // The base strategySource survives the merge…
    expect(engine.config.strategySource).toBe('//@version=5\nstrategy("existing")');
    // …while the payload's other fields still apply (the merge is not skipped).
    expect(engine.config.dex).toBe('jupiter-ultra');
    expect(engine.config.risk.maxDailyLoss).toBe(50);
    expect(engine.config.chaosMode).toEqual({ enabled: true });

    const lastSaved = store.save.mock.calls[store.save.mock.calls.length - 1]![0] as BotConfig;
    expect(lastSaved.strategySource).toBe('//@version=5\nstrategy("existing")');
    expect(lastSaved.dex).toBe('jupiter-ultra');
  });
});
