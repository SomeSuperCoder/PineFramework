/**
 * backtest-export-route.test.ts — route-level tests for
 * POST /api/backtest/export (OpenSpec backtest-full-data-export, task 3.2).
 *
 * Frozen contract (the frontend builds against it):
 *   200 { file } | 400 { error, code: 'VALIDATION_ERROR' | 'JOB_NOT_COMPLETED' }
 *   | 404 { error, code: 'JOB_NOT_FOUND' } | 500 { error: 'Export failed' }
 *
 * House style (see backtest-route.test.ts): a real express app on an ephemeral
 * port + native fetch. The jobs Map is private inside createBacktestRouter, so
 * completed jobs are created through the REAL POST /backtest flow — fetchBars
 * + the SOL price oracle are mocked (repo convention) for offline determinism,
 * and jobs are awaited via GET /backtest/:jobId.
 *
 * The route's EXPORTS_DIR is hardcoded to repo-root/.exports; writeExportFile
 * is mocked to a per-test temp dir so NO shared/repo directory is ever touched
 * by these tests (the real writer's disk behavior is covered separately in
 * backend/tests/backtest-export.test.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Bar, BacktestWarning } from 'pine-framework';
import {
  buildBacktestExport,
  parseBacktestExport,
  type BacktestExport,
} from 'pine-framework';
import { createBacktestRouter } from '../src/routes/backtest.js';
import { writeExportFile } from '../src/backtest-export.js';
import { fetchBars } from '../src/bybit/fetch-bars.js';

// ── Offline by design: never touch the live Bybit API / SOL price oracle. ──
vi.mock('../src/bybit/fetch-bars.js', () => ({ fetchBars: vi.fn() }));
vi.mock('../src/services/sol-price-fetcher.js', () => ({
  fetchSolPriceUsd: vi.fn().mockResolvedValue(150),
}));

/**
 * Capture every writer invocation: { temp dir, filename, export object }.
 * Hoisted so the vi.mock factory (which is hoisted above imports) can push into
 * it; the test bodies read it back for round-trip assertions + cleanup.
 */
const { mockExportWriteCalls } = vi.hoisted(() => ({
  mockExportWriteCalls: [] as Array<{
    dir: string;
    filename: string;
    exportObj: BacktestExport;
  }>,
}));

/**
 * Mock the writer glue so the route's hardcoded EXPORTS_DIR (repo-root/.exports)
 * is never touched. The mock still delegates to the REAL writeExportFile —
 * including its atomic temp-file rename and serialize — only redirecting the
 * destination into a per-call temp dir, so the file content round-trip through
 * parseBacktestExport is genuine and the sanitization test can force a throw.
 */
vi.mock('../src/backtest-export.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/backtest-export.js')>();
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  return {
    ...actual,
    writeExportFile: vi.fn(async (exportObj: BacktestExport, _dir: string) => {
      const dir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'route-export-'));
      const filename = await actual.writeExportFile(exportObj, dir);
      mockExportWriteCalls.push({ dir, filename, exportObj });
      return filename;
    }),
  };
});

/**
 * Wrap buildBacktestExport in a spy so the export-build-failure path can be
 * forced (test #6/#7 contract: a failing export NEVER fails the backtest).
 * Default implementation = the real builder.
 */
vi.mock('pine-framework', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pine-framework')>();
  return { ...actual, buildBacktestExport: vi.fn(actual.buildBacktestExport) };
});

// ── Fixtures (verbatim from backend/tests/backtest-export.test.ts) ──────────
const STRATEGY = `//@version=5
strategy("Simple EMA Cross Strategy", overlay=true, initial_capital=10000)

fastLength = input.int(9, title="Fast EMA Length")
slowLength = input.int(21, title="Slow EMA Length")

fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)

longCondition = ta.crossover(fastEMA, slowEMA)
shortCondition = ta.crossunder(fastEMA, slowEMA)

if longCondition
    strategy.entry("Long", strategy.long)

if shortCondition
    strategy.entry("Short", strategy.short)
`;

function createCrossoverBars(): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < 120; i++) {
    const open = price;
    let close: number;
    if (i < 30) close = open + 2.0;
    else if (i < 60) close = open - 2.0;
    else if (i < 90) close = open + 2.0;
    else close = open - 2.0;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    bars.push({
      timestamp: 1700000000000 + i * 3600000,
      open,
      high,
      low,
      close,
      volume: 1000,
    });
    price = close;
  }
  return bars;
}

// ── App lifecycle + helpers ─────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  mockExportWriteCalls.length = 0;
  const app = express();
  app.use(express.json());
  // diskCache is optional — no stub needed.
  app.use('/api', createBacktestRouter());
  server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  for (const call of mockExportWriteCalls.splice(0)) {
    fs.rmSync(call.dir, { recursive: true, force: true });
  }
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

function postExport(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/backtest/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Poll GET /backtest/:jobId until `want` (or any terminal state). */
async function waitForJob(
  jobId: string,
  want: 'completed' | 'failed',
  timeoutMs = 10_000,
): Promise<{ status: string; exportError?: string }> {
  const deadline = Date.now() + timeoutMs;
  let last: { status: string; exportError?: string } = { status: 'queued' };
  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl}/backtest/${jobId}`);
    last = (await res.json()) as { status: string; exportError?: string };
    if (last.status === 'completed' || last.status === 'failed') return last;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Job ${jobId} did not reach '${want}' within ${timeoutMs}ms (last: ${last.status})`);
}

/** POST a backtest and wait until it COMPLETED (fails the test otherwise). */
async function createCompletedJob(): Promise<string> {
  const postRes = await fetch(`${baseUrl}/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '60', script: STRATEGY, commissionMethod: 'jupiter_manual' }),
  });
  expect(postRes.status).toBe(200);
  const { job_id } = (await postRes.json()) as { job_id: string };
  const job = await waitForJob(job_id, 'completed');
  expect(job.status).toBe('completed');
  return job_id;
}

const NOT_COMPLETED_BODY = {
  error: 'Job is not completed or export data is no longer available',
  code: 'JOB_NOT_COMPLETED',
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/backtest/export', () => {
  it('200 { file } for a completed job — writes a parseable frontend export', async () => {
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());
    const jobId = await createCompletedJob();

    const res = await postExport({ job_id: jobId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { file: string };
    expect(body.file).toMatch(/^backtest-frontend-BTCUSDT-[0-9a-f-]{36}-[0-9TZ-]+\.json$/);

    // The writer was called exactly once, with the job's export object, and the
    // returned filename IS the file it wrote.
    expect(mockExportWriteCalls).toHaveLength(1);
    const call = mockExportWriteCalls[0]!;
    expect(call.filename).toBe(body.file);
    expect(call.exportObj.source).toBe('frontend');
    expect(call.exportObj.runId).toBe(jobId);

    // The on-disk content round-trips through parseBacktestExport.
    const round = parseBacktestExport(
      fs.readFileSync(path.join(call.dir, call.filename), 'utf-8'),
    );
    expect(round.source).toBe('frontend');
    expect(round.runId).toBe(jobId);
    expect(round.meta.symbol).toBe('BTCUSDT');
    expect(round.schemaVersion).toBe(2);
    expect(round.timestampUnit).toBe('ms');
    expect(round.input.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(round.input.bars.length).toBeGreaterThan(0);
    expect(round.params.effectiveConfig).toBeDefined();
    // params.request = the raw HTTP job config. The route destructures
    // symbol/timeframe/script/startDate/endDate/days_back OUT of req.body, so
    // the request layer carries what remains — here the explicit config the
    // contract requires (commissionMethod) plus the script source
    // (symbol/timeframe live in meta).
    expect(round.params.request).toEqual({
      commissionMethod: 'jupiter_manual',
      script: STRATEGY,
    });
  });

  it('404 JOB_NOT_FOUND for an unknown job_id', async () => {
    const res = await postExport({ job_id: 'no-such-job' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
  });

  it('400 JOB_NOT_COMPLETED while the job is still running', async () => {
    // fetchBars never resolves — the job stays queued/running forever.
    vi.mocked(fetchBars).mockImplementation(() => new Promise<Bar[]>(() => {}));

    const postRes = await fetch(`${baseUrl}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '60', script: STRATEGY, commissionMethod: 'jupiter_manual' }),
    });
    const { job_id } = (await postRes.json()) as { job_id: string };

    const res = await postExport({ job_id });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(NOT_COMPLETED_BODY);
  });

  it('400 JOB_NOT_COMPLETED for a failed job', async () => {
    // Empty bars → runBacktest throws "No bar data available" → job failed.
    vi.mocked(fetchBars).mockResolvedValue([]);

    const postRes = await fetch(`${baseUrl}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '60', script: STRATEGY, commissionMethod: 'jupiter_manual' }),
    });
    const { job_id } = (await postRes.json()) as { job_id: string };
    await waitForJob(job_id, 'failed');

    const res = await postExport({ job_id });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(NOT_COMPLETED_BODY);
  });

  it.each([
    ['missing body', undefined],
    ['missing job_id', {}],
    ['empty job_id', { job_id: '' }],
    ['whitespace job_id', { job_id: '   ' }],
    ['non-string job_id', { job_id: 123 }],
  ])('400 VALIDATION_ERROR for %s', async (_name, body) => {
    const res = await postExport(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Missing or invalid "job_id" field',
      code: 'VALIDATION_ERROR',
    });
  });

  it('a failing export build NEVER fails the backtest — job completes, export route 400s JOB_NOT_COMPLETED', async () => {
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());
    // Force the export build to throw INSIDE runBacktest's isolated try/catch.
    vi.mocked(buildBacktestExport).mockImplementationOnce(() => {
      throw new Error('export build exploded');
    });

    const jobId = await createCompletedJob();

    // The backtest itself still completed (exportError stays internal to the
    // job store — not exposed by GET /backtest/:jobId).
    const getRes = await fetch(`${baseUrl}/backtest/${jobId}`);
    expect(getRes.status).toBe(200);
    const job = (await getRes.json()) as { status: string };
    expect(job.status).toBe('completed');

    // No exportData → the export route reports JOB_NOT_COMPLETED.
    const res = await postExport({ job_id: jobId });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(NOT_COMPLETED_BODY);
    // And no file was ever written.
    expect(mockExportWriteCalls).toHaveLength(0);

    // The completed job's RESULT still carries the typed, SANITIZED
    // export-failure warning (S2) — the build failure never leaks raw detail
    // into the payload (the raw message stays in the server-side log only).
    const resultRes = await fetch(`${baseUrl}/backtest/${jobId}/result`);
    expect(resultRes.status).toBe(200);
    const result = (await resultRes.json()) as { warnings?: BacktestWarning[] };
    const failure = (result.warnings ?? []).find((w) => w.type === 'export-failure');
    expect(failure).toBeDefined();
    expect(failure!.message).toBe('Export build failed: details logged server-side');
    expect(failure!.message).not.toContain('exploded');
  });

  it('500 { error: "Export failed" } with NO URL/hostname leak when the writer fails', async () => {
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());
    const jobId = await createCompletedJob();

    vi.mocked(writeExportFile).mockImplementationOnce(async () => {
      throw new Error('connect ECONNREFUSED https://internal-secret.example.com:8443/v5/export');
    });

    const res = await postExport({ job_id: jobId });
    expect(res.status).toBe(500);
    const raw = await res.text();
    expect(raw).toBe(JSON.stringify({ error: 'Export failed' }));
    expect(raw).not.toContain('internal-secret');
    expect(raw).not.toContain('example.com');
    expect(raw).not.toContain('ECONNREFUSED');
  });
});
