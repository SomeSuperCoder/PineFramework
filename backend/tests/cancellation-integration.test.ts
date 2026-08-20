/**
 * B2 integration — remove-during-compute cancellation (blocking-computation fix).
 *
 * Covers the user-facing guarantee: removing an indicator (or stopping it via
 * WS stop_indicator) cancels its in-flight computation promptly, and the
 * registry that backs it never leaks entries.
 *
 * REST path: DELETE /api/indicators/:id must cancel the /execute run keyed by
 * the SAME indicatorId (body field), so the long compute stops at its next
 * yield and the DELETE resolves without waiting for the run to finish.
 *
 * WS path: stop_indicator cancels in-flight REST compute through the shared
 * registry (Wise Old Man decision) — verified here by driving the registry the
 * gateway drives (cancel on the shared token), keeping the test RAM-light and
 * free of the full WS/cache/telegram stack.
 *
 * RAM-light: synthetic bars only — no production strategy scripts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createExecuteRouter } from '../src/routes/execute.js';
import { createIndicatorsRouter } from '../src/routes/indicators.js';
import { InMemoryCancellationRegistry } from '../src/cancellation-registry.js';
import { RunningIndicatorsStore } from '../src/store/RunningIndicatorsStore.js';
import { createPineScriptEngine } from 'pine-framework';

const COMPUTE_SOURCE = `
//@version=6
indicator("remove-during-compute", max_bars_back=500)
s = ta.sma(close, 14)
plot(s, "sma")
`;

/** Deterministic OHLC bars — 10,000 bars = 200 yield points (50-bar interval). */
function makeBars(count: number) {
  const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  const startTime = Date.UTC(2024, 0, 1);
  for (let i = 0; i < count; i++) {
    const close = 100 + Math.sin(i / 7) * 5;
    bars.push({
      timestamp: startTime + i * 60_000,
      open: close - 0.1,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1_000_000 + i * 10,
    });
  }
  return bars;
}

describe('B2 integration — DELETE /api/indicators/:id cancels in-flight /execute', () => {
  const registry = new InMemoryCancellationRegistry();
  const capturedIds: string[] = [];
  let store: RunningIndicatorsStore;
  let tmpDir: string;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cancellation-int-'));
    store = new RunningIndicatorsStore(path.join(tmpDir, 'indicators.json'));

    const app = express();
    app.use(express.json({ limit: '5mb' })); // match production (backend/src/index.ts)
    app.use('/api', createExecuteRouter(createPineScriptEngine(), registry));
    app.use('/api', createIndicatorsRouter(store, registry));
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Wait until the /execute route has registered its token under `id` — i.e.
   * the computation is actually in-flight (past JSON parsing, past
   * registry.create, into the bar loop). Firing DELETE before this point
   * would cancel nothing (the route has not yet registered), and firing it
   * after the run completes would be a no-op on an already-finished compute.
   */
  async function waitForToken(id: string, timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (registry.get(id)) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(`token for ${id} was never registered within ${timeoutMs}ms`);
  }

  it('DELETE /api/indicators/:id resolves promptly and removes metadata while /execute is still computing', async () => {
    // Register an indicator so DELETE has metadata to remove.
    const addRes = await fetch(`${baseUrl}/indicators`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scriptId: 'remove-during-compute',
        name: 'Remove During Compute',
        overlay: false,
        source: COMPUTE_SOURCE,
      }),
    });
    expect(addRes.status).toBe(201);
    const added = ((await addRes.json()) as { indicator: { id: string } }).indicator;
    expect(added.id).toBeDefined();
    capturedIds.push(added.id);

    // Fire a long /execute keyed by the SAME indicator id — the run is
    // registered in the cancellation registry under that id.
    const execPromise = fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: COMPUTE_SOURCE, bars: makeBars(5_000), indicatorId: added.id }),
    });

    // Wait until the run is registered and computing, THEN measure DELETE
    // latency: it must NOT wait for the 5k-bar compute to finish.
    await waitForToken(added.id);
    const started = Date.now();
    const delRes = await fetch(`${baseUrl}/indicators/${added.id}`, { method: 'DELETE' });
    const deleteMs = Date.now() - started;

    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ success: true });
    // Prompt: far below the multi-second compute. Generous bound avoids flakes
    // on slow CI, but still catches the pre-B2 behavior (DELETE waited for the
    // full compute — seconds).
    expect(deleteMs).toBeLessThan(1_000);

    // The indicator is gone from the store.
    const listRes = await fetch(`${baseUrl}/indicators`);
    const { indicators } = (await listRes.json()) as { indicators: Array<{ id: string }> };
    expect(indicators.some((i) => i.id === added.id)).toBe(false);

    // The in-flight /execute resolves as CANCELLED — the frontend's
    // stale-result seam drops responses carrying cancelled:true, so the
    // removed indicator's result is never delivered.
    const execRes = await execPromise;
    const execBody = (await execRes.json()) as { success: boolean; cancelled?: boolean };
    expect(execBody.cancelled).toBe(true);
    expect(execBody.success).toBe(false);
  });

  it('DELETE of a non-computing id is a fast success (idempotent cancel path)', async () => {
    const addRes = await fetch(`${baseUrl}/indicators`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scriptId: 'idle-indicator',
        name: 'Idle Indicator',
        overlay: false,
        source: COMPUTE_SOURCE,
      }),
    });
    expect(addRes.status).toBe(201);
    const added = ((await addRes.json()) as { indicator: { id: string } }).indicator;
    capturedIds.push(added.id);

    const started = Date.now();
    const delRes = await fetch(`${baseUrl}/indicators/${added.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(500);

    const listRes = await fetch(`${baseUrl}/indicators`);
    const { indicators } = (await listRes.json()) as { indicators: Array<{ id: string }> };
    expect(indicators.some((i) => i.id === added.id)).toBe(false);
  });

  it('WS stop_indicator cancels in-flight REST compute through the shared registry', async () => {
    // Register an indicator (the WS live-tick initialize keys its token by id).
    const addRes = await fetch(`${baseUrl}/indicators`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scriptId: 'ws-stop-rest-compute',
        name: 'WS Stop Rest Compute',
        overlay: false,
        source: COMPUTE_SOURCE,
      }),
    });
    expect(addRes.status).toBe(201);
    const indicator = ((await addRes.json()) as { indicator: { id: string } }).indicator;
    capturedIds.push(indicator.id);

    // Fire a long /execute keyed by the indicator id (the REST compute the WS
    // stop_indicator is meant to cancel).
    const execPromise = fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: COMPUTE_SOURCE,
        bars: makeBars(5_000),
        indicatorId: indicator.id,
      }),
    });

    // Wait until the run is registered and computing (token live), then issue
    // the exact call the gateway stop_indicator handler makes (gateway.ts):
    // registry?.cancel(indicatorId) on the SHARED registry.
    await waitForToken(indicator.id);
    registry.cancel(indicator.id);

    const execRes = await execPromise;
    const execBody = (await execRes.json()) as { success: boolean; cancelled?: boolean };
    expect(execBody.cancelled).toBe(true);
    expect(execBody.success).toBe(false);

    // The execute route's finally removes the entry — no leak.
    expect(registry.get(indicator.id)).toBeUndefined();
  });

  it('registry is empty after the lifecycle (no token leaks)', () => {
    // After the runs above, no id may remain registered: the execute route
    // removes its token in finally on every path (success, cancel, error).
    for (const id of capturedIds) {
      expect(registry.get(id)).toBeUndefined();
    }
    expect(registry.get('remove-during-compute')).toBeUndefined();
    expect(registry.get('idle-indicator')).toBeUndefined();
    expect(capturedIds.length).toBeGreaterThan(0);
  });
});