/**
 * A2 --max-bars + timeframe forwarding — backend-runner tests (engine-fix
 * defect 2).
 *
 * Locks runBacktestPipeline's contract with the NEW BacktestRunnerOptions
 * fields:
 *   1. Default cap preserved — absent maxBars → 1500 (legacy hard literal is
 *      now the DEFAULT; a run opts into a higher cap instead of editing code).
 *   2. Raised cap passes through — options.maxBars is honored.
 *   3. Cap actually enforced — the runner rejects bars.length > maxBars.
 *   4. Engine receives { timeframe } runtime option — the runner-provided
 *      chart resolution reaches the engine's timeframe.* builtins; the
 *      strategy() declaration stays the fallback; both absent → NA.
 *
 * Harness follows backtest-golden-capture.test.ts (proven trade-generating
 * v5 strategy + deterministic EMA-crossover bars). Offline by design — no
 * fetchBars involved.
 */
import { describe, expect, it } from 'vitest';
import { runBacktestPipeline } from '../src/backtest-runner.js';
import type { Bar } from 'pine-framework';

// ── Fixed strategy (verbatim from backtest-golden-capture.test.ts) ──────────
const STRATEGY = `//@version=5
strategy("Simple EMA Cross Strategy", overlay=true, initial_capital=10000)

// --- Inputs ---
fastLength = input.int(9, title="Fast EMA Length")
slowLength = input.int(21, title="Slow EMA Length")

// --- Calculate Indicators ---
fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)

// --- Strategy Logic ---
longCondition = ta.crossover(fastEMA, slowEMA)
shortCondition = ta.crossunder(fastEMA, slowEMA)

// --- Execute Trades ---
if longCondition
    strategy.entry("Long", strategy.long)

if shortCondition
    strategy.entry("Short", strategy.short)
`;

/** Strategy that declares a timeframe — used for the fallback-precedence lock. */
const STRATEGY_WITH_TF = `//@version=6
strategy("TF Decl Runner", overlay=true, timeframe="W")
plot(close, "c")
`;

// ── Deterministic bars — count-driven EMA-crossover pattern ─────────────────
function createBars(count: number): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    let close: number;
    if (i % 60 < 30) close = open + 2.0;
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

describe('runBacktestPipeline — maxBars cap', () => {
  it('preserves the DEFAULT 1500-bar cap when maxBars absent', async () => {
    const over = await runBacktestPipeline({ script: STRATEGY, bars: createBars(1501) });
    expect(over.success).toBe(false);
    expect(over.error).toContain('Maximum is 1500');

    const atCap = await runBacktestPipeline({ script: STRATEGY, bars: createBars(1500) });
    expect(atCap.success).toBe(true);
  });

  it('raises the cap when options.maxBars is provided', async () => {
    const result = await runBacktestPipeline({
      script: STRATEGY,
      bars: createBars(1800),
      maxBars: 2000,
    });
    expect(result.success).toBe(true);
    expect(result.engine).toBeDefined();
  });

  it('enforces the provided cap (maxBars is honored, not ignored)', async () => {
    const result = await runBacktestPipeline({
      script: STRATEGY,
      bars: createBars(101),
      maxBars: 100,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Maximum is 100');
    expect(result.error).toContain('101');
  });

  it('rejects maxBars below the bar count even for large runs', async () => {
    const result = await runBacktestPipeline({
      script: STRATEGY,
      bars: createBars(5000),
      maxBars: 4000,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Maximum is 4000');
  });
});

describe('runBacktestPipeline — timeframe forwarding into the engine', () => {
  it('engine receives the runner-provided timeframe as a runtime option', async () => {
    const result = await runBacktestPipeline({
      script: STRATEGY,
      bars: createBars(120),
      timeframe: 'D',
    });
    expect(result.success).toBe(true);
    const engine = result.engine!;
    const period = engine.builtins.get('timeframe.period')!();
    const inSeconds = engine.builtins.get('timeframe.in_seconds')!();
    expect(period).toBe('D');
    expect(inSeconds).toBe(86400);
  });

  it('strategy() declaration is the fallback when the runner passes no timeframe', async () => {
    const result = await runBacktestPipeline({
      script: STRATEGY_WITH_TF,
      bars: createBars(120),
    });
    expect(result.success).toBe(true);
    const engine = result.engine!;
    expect(engine.builtins.get('timeframe.period')!()).toBe('W');
    expect(engine.builtins.get('timeframe.isweekly')!()).toBe(true);
  });

  it('runner-provided timeframe WINS over the strategy() declaration', async () => {
    const result = await runBacktestPipeline({
      script: STRATEGY_WITH_TF, // declares timeframe="W"
      bars: createBars(120),
      timeframe: '60',
    });
    expect(result.success).toBe(true);
    const engine = result.engine!;
    expect(engine.builtins.get('timeframe.period')!()).toBe('60');
    expect(engine.builtins.get('timeframe.isweekly')!()).toBe(false);
  });

  it('both absent → timeframe.* resolves to NA (non-breaking no-tf)', async () => {
    const result = await runBacktestPipeline({ script: STRATEGY, bars: createBars(120) });
    expect(result.success).toBe(true);
    const engine = result.engine!;
    expect(engine.builtins.get('timeframe.period')!()).toBe(Symbol.for('pine.na'));
  });
});