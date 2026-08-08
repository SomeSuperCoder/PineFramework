/**
 * Route-level regression tests for the backtest early-script-400 guard
 * (OpenSpec change: backtest-strategy-dropdown).
 *
 * POST /api/backtest must validate `script` at request time — a missing,
 * empty, or non-string script gets an immediate 400 BEFORE runBacktest (and
 * therefore before any Bybit data fetch). A valid request creates a queued job
 * and returns { job_id } without awaiting job completion.
 *
 * House style (see bot-route.test.ts / settings-route.test.ts): a real express
 * app on an ephemeral port + native fetch. fetchBars is mocked so the
 * fire-and-forget runBacktest never touches the real Bybit API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createBacktestRouter } from '../src/routes/backtest.js';

// The POST handler fires runBacktest() as a fire-and-forget promise. Mock
// fetchBars so that background job fails fast instead of hitting the real
// Bybit API during tests.
vi.mock('../src/bybit/fetch-bars.js', () => ({
  fetchBars: vi.fn(async () => []),
}));

const VALID_BODY = {
  symbol: 'BTCUSDT',
  timeframe: '1d',
  script: '//@version=6\nstrategy("Test")\nplot(close)',
};

describe('POST /api/backtest script validation', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    // diskCache is optional — no stub needed.
    app.use('/api', createBacktestRouter());
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('returns 400 when script is missing (valid symbol+timeframe)', async () => {
    const res = await fetch(`${baseUrl}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1d' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing or invalid "script" field' });
  });

  it('returns 400 when script is an empty string', async () => {
    const res = await fetch(`${baseUrl}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, script: '' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing or invalid "script" field' });
  });

  it('returns 400 when script is not a string', async () => {
    const res = await fetch(`${baseUrl}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, script: 123 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing or invalid "script" field' });
  });

  it('returns 200 with a job_id for a valid request (does not await job completion)', async () => {
    const res = await fetch(`${baseUrl}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { job_id: string };
    expect(typeof body.job_id).toBe('string');
    expect(body.job_id.length).toBeGreaterThan(0);
  });

  it('creates a job that GET /backtest/:jobId can fetch afterwards', async () => {
    const postRes = await fetch(`${baseUrl}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const { job_id } = (await postRes.json()) as { job_id: string };

    const getRes = await fetch(`${baseUrl}/backtest/${job_id}`);
    expect(getRes.status).toBe(200);
    const job = (await getRes.json()) as { status?: string };
    expect(typeof job.status).toBe('string');
  });

  it('does not create a job when the request is rejected (no orphaned job id)', async () => {
    const res = await fetch(`${baseUrl}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1d' }),
    });
    expect(res.status).toBe(400);

    const getRes = await fetch(`${baseUrl}/backtest/never-created`);
    expect(getRes.status).toBe(404);
  });
});