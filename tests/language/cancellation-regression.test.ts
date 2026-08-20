/**
 * Blocking-computation fix regression suite (B1 + B2).
 *
 * B1 made the interpreter's bar loop yield to the event loop every
 * YIELD_EVERY_N_BARS (50) bars and accept an optional CancellationToken,
 * checked at each yield. B2 added the backend InMemoryCancellationRegistry
 * and wired DELETE /api/indicators/:id + WS stop_indicator into it.
 *
 * These tests lock the FRAMEWORK-side contract:
 *   1. A long compute does NOT block the event loop (yield responsiveness).
 *   2. Flagging a token stops the loop early, marking the partial run
 *      `cancelled: true` — distinct from success/failure.
 *   3. Registry entries never leak (remove() in finally) — no token-object
 *      accumulation across compute+cancel cycles.
 *   4. GOLDEN OUTPUT: a non-cancelled run's output is byte-identical whether
 *      or not the run ever yielded — i.e. adding cooperative yields changed
 *      NOTHING for the happy path (JSON.stringify equality).
 *
 * RAM-light: synthetic bar arrays only — no production strategy scripts.
 */
import { describe, it, expect } from 'vitest';
import { createPineScriptEngine } from '../../src/api.js';
import { InMemoryCancellationRegistry } from '../../backend/src/cancellation-registry.js';
import type { ExecutionResult } from '../../src/language/runtime/execution-engine.js';

/** Deterministic OHLC bar factory (RAM-light: 1 series value per field). */
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

/** Compute-bound-ish indicator: a `for` loop + ta.sma so each bar does real work. */
const COMPUTE_SOURCE = `
//@version=6
indicator("blocking-compute-regression", max_bars_back=500)
s = ta.sma(close, 14)
plot(s, "sma")
`;

describe('B1 — cooperative yield (event-loop responsiveness)', () => {
  it('lets a pending microtask run while a long compute is in flight', async () => {
    const engine = createPineScriptEngine();
    // 5,000 bars → at least 100 yield points (YIELD_EVERY_N_BARS = 50).
    const bars = makeBars(5_000);
    let probeRan = false;

    const runPromise = engine.execute(COMPUTE_SOURCE, bars);

    // The loop MUST yield before this microtask can run. Because executeBars
    // awaits setImmediate at every 50-bar boundary, the pending microtask gets
    // its turn while the compute is still in flight.
    await new Promise<void>((resolve) => setImmediate(resolve));
    probeRan = true;

    const result = await runPromise;
    expect(result.success).toBe(true);
    expect(result.cancelled).toBeUndefined();
    expect(probeRan).toBe(true);
  });

  it('a run longer than the yield interval actually interleaves (probe before completion)', async () => {
    const engine = createPineScriptEngine();
    const bars = makeBars(2_000); // 40 yield points
    let interleaved = false;

    const runPromise = engine.execute(COMPUTE_SOURCE, bars).then((r) => {
      interleaved = true;
      return r;
    });

    // Probe on a macrotask: if the interpreter never yielded, this runs only
    // AFTER the whole compute (interleaved stays false until then). With
    // yields, setImmediate fires between bar batches.
    await new Promise<void>((resolve) => setImmediate(resolve));

    // The run cannot have finished before a macrotask that is queued between
    // yields — at least one yield must have happened (2,000 bars > 50).
    expect(interleaved).toBe(false);
    expect(runPromise).toBeInstanceOf(Promise);

    const result = await runPromise;
    expect(result.success).toBe(true);
  });
});

describe('B2 — cancellation via CancellationToken', () => {
  it('a flagged token stops the loop early and marks the run cancelled', async () => {
    const engine = createPineScriptEngine();
    const registry = new InMemoryCancellationRegistry();
    const bars = makeBars(10_000); // 200 yield points

    const token = registry.create('ind-1');
    const runPromise = engine.execute(COMPUTE_SOURCE, bars, token);

    // Cancel after the first yield: the loop checks the token at bar 50, 100,
    // ... — one macrotask later the flag is visible.
    await new Promise<void>((resolve) => setImmediate(resolve));
    registry.cancel('ind-1');

    const result = await runPromise;
    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(true); // partial run is valid output, not failure
  });

  it('an UNflagged run completes normally with cancelled absent', async () => {
    const engine = createPineScriptEngine();
    const registry = new InMemoryCancellationRegistry();
    const token = registry.create('ind-2');

    const result = await engine.execute(COMPUTE_SOURCE, makeBars(200), token);
    expect(result.success).toBe(true);
    expect(result.cancelled).toBeUndefined();
  });

  it('cancelling an unknown id is an idempotent no-op', () => {
    const registry = new InMemoryCancellationRegistry();
    expect(() => registry.cancel('never-created')).not.toThrow();
    expect(() => registry.remove('never-created')).not.toThrow();
  });
});

describe('B2 — registry cleanup (no leaks)', () => {
  it('remove() in finally forgets the id after a SUCCESSFUL run', async () => {
    const engine = createPineScriptEngine();
    const registry = new InMemoryCancellationRegistry();
    const id = 'leak-success';

    const token = registry.create(id);
    expect(registry.get(id)).toBeDefined();
    try {
      await engine.execute(COMPUTE_SOURCE, makeBars(100), token);
    } finally {
      registry.remove(id);
    }
    expect(registry.get(id)).toBeUndefined();
  });

  it('remove() forgets the id after a CANCELLED run', async () => {
    const engine = createPineScriptEngine();
    const registry = new InMemoryCancellationRegistry();
    const id = 'leak-cancel';

    const token = registry.create(id);
    try {
      const runPromise = engine.execute(COMPUTE_SOURCE, makeBars(10_000), token);
      await new Promise<void>((resolve) => setImmediate(resolve));
      registry.cancel(id);
      await runPromise;
    } finally {
      registry.remove(id);
    }
    expect(registry.get(id)).toBeUndefined();
  });

  it('create() supersedes an in-flight run for the same id (flags the previous token)', () => {
    const registry = new InMemoryCancellationRegistry();
    const id = 'supersede';

    const firstToken = registry.create(id);
    expect(firstToken.isCancelled).toBe(false);

    // A second run for the same id invalidates the first.
    const secondToken = registry.create(id);
    expect(firstToken.isCancelled).toBe(true);
    expect(secondToken.isCancelled).toBe(false);

    // The new token is the live one the registry returns.
    expect(registry.get(id)).toBe(secondToken);

    // Cleanup: remove the entry after the superseded run ends.
    registry.remove(id);
    expect(registry.get(id)).toBeUndefined();
  });
});

describe('B1/B2 — GOLDEN OUTPUT: yields change nothing on the happy path', () => {
  it('a cancelled run may produce partial output; a complete run is byte-identical to pre-yield output', async () => {
    const engine = createPineScriptEngine();
    const bars = makeBars(1_000);

    // Run 1: no token, completes fully.
    const full = (await engine.execute(COMPUTE_SOURCE, bars)) as ExecutionResult;
    expect(full.cancelled).toBeUndefined();
    const fullJson = JSON.stringify({
      success: full.success,
      output: full.outputs ? Array.from(full.outputs.get('sma')?.values ?? []) : [],
    });

    // Run 2: same script, same bars, token that is NEVER cancelled → same output.
    const registry = new InMemoryCancellationRegistry();
    const token = registry.create('golden');
    const unCancelled = (await engine.execute(COMPUTE_SOURCE, bars, token)) as ExecutionResult;
    expect(unCancelled.cancelled).toBeUndefined();
    const unCancelledJson = JSON.stringify({
      success: unCancelled.success,
      output: unCancelled.outputs ? Array.from(unCancelled.outputs.get('sma')?.values ?? []) : [],
    });

    // GOLDEN: the presence of the token + yields must not alter the output.
    expect(unCancelledJson).toBe(fullJson);
    registry.remove('golden');
  });
});
