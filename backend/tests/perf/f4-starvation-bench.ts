/**
 * F4 measurement harness — WS live-tick churn vs HTTP responsiveness.
 *
 * Reproduces the B16 starvation scenario backend-side:
 *   - live ticks drive repeated indicator execution (the gateway's
 *     reexecuteForTopic chain: serialized appendOrUpdateBar calls),
 *   - concurrent HTTP GETs measure event-loop responsiveness (p50/p95/p100).
 *
 * Scenarios:
 *   A) steady-state churn — session initialized once, then tick() per tick.
 *   B) cold-start churn — every tick falls back to a FULL batch initialize()
 *      (engine==null path; the worst case B16 flagged).
 *
 * Usage: cd backend && pnpm exec tsx --conditions=source tests/perf/f4-starvation-bench.ts [bars] [loopOuter]
 */
import express, { type Request, type Response } from 'express';
import type { AddressInfo } from 'node:net';
import { parseAndCompile, barsToContext, ExecutionEngine, type Bar } from 'pine-framework';
import { ScriptSession } from '../../src/session/ScriptSession.js';

const BARS = Number(process.argv[2] ?? 3_000);
const LOOP_OUTER = Number(process.argv[3] ?? 200);
const TICKS = Number(process.argv[4] ?? 40);

const HEAVY_SOURCE = `
//@version=6
indicator("heavy-loop")
float acc = 0.0
for i = 0 to ${LOOP_OUTER}
    for j = 0 to 20
        acc += math.abs(close[i]) * 0.0000001
plot(acc, "acc")
`;

const LIGHT_SOURCE = `
//@version=6
indicator("light-sma")
s = ta.sma(close, 14)
plot(s, "sma")
`;

function makeBars(count: number): Bar[] {
  const bars: Bar[] = [];
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

function nextTick(bars: Bar[], n: number): Bar {
  const last = bars[bars.length - 1];
  const c = last.close * (1 + ((n % 5) - 2) * 0.0001);
  return {
    timestamp: n % 10 === 9 ? last.timestamp + 60_000 : last.timestamp, // confirm every 10th
    open: last.close,
    high: Math.max(last.high, c),
    low: Math.min(last.low, c),
    close: c,
    volume: last.volume,
  };
}

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function timeFullRun(source: string, bars: Bar[]): Promise<number> {
  const t0 = performance.now();
  const compiled = parseAndCompile(source);
  const engine = new ExecutionEngine(compiled);
  await engine.executeBars(barsToContext(bars));
  return performance.now() - t0;
}

async function main() {
  const bars = makeBars(BARS);
  console.log(`bars=${BARS} outerLoop=${LOOP_OUTER} ticks=${TICKS}`);

  // --- Calibration ---
  const lightMs = await timeFullRun(LIGHT_SOURCE, bars);
  const heavyMs = await timeFullRun(HEAVY_SOURCE, bars);
  console.log(`calibration: full-batch light=${lightMs.toFixed(0)}ms heavy=${heavyMs.toFixed(0)}ms`);

  // --- HTTP server (trivial GET — pure event-loop responsiveness probe) ---
  const app = express();
  app.get('/api/ping', (_req: Request, res: Response) => {
    res.json({ pong: Date.now() });
  });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ping`;

  async function runChurn(name: string, coldStartEachTick: boolean): Promise<{ p50: number; p95: number; p100: number; n: number }> {
    const latencies: number[] = [];
    let stop = false;

    const getters = (async () => {
      while (!stop) {
        const t0 = performance.now();
        try {
          const res = await fetch(baseUrl);
          await res.json();
          latencies.push(performance.now() - t0);
        } catch {
          // keepalive connection reset under heavy event-loop pressure —
          // retry rather than crash the whole harness.
          await new Promise((r) => setTimeout(r, 5));
        }
      }
    })();

    // Gateway-faithful chain: serialized reexecutes, ticks arrive between them.
    let chain: Promise<void> = Promise.resolve();
    const session = new ScriptSession(HEAVY_SOURCE, 'TEST', '1', [...bars]);
    if (!coldStartEachTick) await session.initialize();
    const churnStart = performance.now();
    for (let i = 0; i < TICKS; i++) {
      const tick = nextTick(bars, i);
      const confirmed = i % 10 === 9;
      const target = coldStartEachTick ? new ScriptSession(HEAVY_SOURCE, 'TEST', '1', [...bars]) : session;
      chain = chain.then(async () => {
        if (coldStartEachTick) await target.initialize();
        else await target.appendOrUpdateBar(tick, confirmed);
      });
      // live ticks arrive faster than the chain drains when compute is heavy
      await new Promise((r) => setTimeout(r, 15));
    }
    await chain;
    stop = true;
    await getters;
    const churnMs = performance.now() - churnStart;
    // NOTE: do NOT removeAllListeners() here — that would strip the 'request'
    // handler and hang every subsequent scenario's fetches forever.

    latencies.sort((a, b) => a - b);
    const result = { p50: pct(latencies, 50), p95: pct(latencies, 95), p100: latencies[latencies.length - 1]!, n: latencies.length };
    console.log(
      `${name}: churnWall=${churnMs.toFixed(0)}ms gets=${result.n} p50=${result.p50.toFixed(1)}ms p95=${result.p95.toFixed(1)}ms p100=${result.p100.toFixed(1)}ms`,
    );
    return result;
  }

  await runChurn('A steady-state tick churn (heavy)', false);
  await runChurn('B cold-start churn (full init per tick)', true);
  await runChurn('C steady-state tick churn (light)', false);

  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
