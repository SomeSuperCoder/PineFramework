/**
 * Route-level tests for GET /api/symbols — it MUST derive from the token
 * registry (single source of truth), never a hardcoded list.
 *
 * The symbols route previously served 15 hardcoded symbols; it now returns
 * `{ symbols: getTradablePairs() }` (7 registry pairs). The 8 legacy extra
 * symbols (AVAX/DOT/LINK/MATIC/UNI/LTC/ATOM/NEAR) were deliberately dropped —
 * registry is truth, do NOT re-add them.
 *
 * The expected list is imported from 'pine-framework' (TRADABLE_PAIRS) so the
 * test never hardcodes the list twice — it locks the ROUTE to the REGISTRY.
 *
 * Uses a real express app on an ephemeral port with only the symbols router
 * mounted (no engine, no store, no network).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { symbolsRouter } from '../src/routes/symbols.js';
import { TRADABLE_PAIRS } from 'pine-framework';

describe('GET /api/symbols derives from the token registry (SSoT)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = express();
    app.use('/api', symbolsRouter);

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

  it('returns 200 with exactly the registry pairs (TRADABLE_PAIRS)', async () => {
    const res = await fetch(`${baseUrl}/symbols`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { symbols: string[] };
    // The route's output must be EXACTLY the SSoT registry — any hardcoded
    // addition/removal fails this equality.
    expect(body.symbols).toEqual([...TRADABLE_PAIRS]);
    expect(body.symbols).toHaveLength(10);
  });

  it('does not contain any of the 8 legacy-dropped symbols (registry is truth)', async () => {
    const res = await fetch(`${baseUrl}/symbols`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { symbols: string[] };
    const dropped = [
      'AVAXUSDT',
      'DOTUSDT',
      'LINKUSDT',
      'MATICUSDT',
      'UNIUSDT',
      'LTCUSDT',
      'ATOMUSDT',
      'NEARUSDT',
    ];
    for (const symbol of dropped) {
      expect(body.symbols).not.toContain(symbol);
    }
  });
});
