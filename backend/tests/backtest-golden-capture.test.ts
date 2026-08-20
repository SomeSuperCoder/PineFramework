/**
 * Golden-fixture capture for the two backtest output shapes.
 *
 * PURPOSE
 * -------
 * Lock the CURRENT output of the two backtest code paths into JSON fixtures so a
 * future refactor can prove it reproduces them byte-for-byte:
 *   - API path  (POST /api/backtest)  -> backend/src/routes/backtest.ts  `job.result` build
 *   - CLI path  (pnpm backtest)       -> backend/src/cli/symbol-runner.ts  `runSymbolBacktest` build
 *
 * This test is a HARNESS ONLY. It does NOT import the route or CLI builders — it
 * re-implements their EXACT inline mapping logic (copied verbatim from source) so
 * it snapshots whatever the shared engine (`runBacktestPipeline` +
 * `computeBacktestMetrics`) produces today. No production source is modified.
 *
 * RUN ONCE to (re)generate:
 *   cd backend && pnpm exec vitest run tests/backtest-golden-capture.test.ts
 * (or from repo root: pnpm exec vitest run backend/tests/backtest-golden-capture.test.ts)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBacktestPipeline, computeBacktestMetrics } from '../src/backtest-runner.js';
import type { Bar } from 'pine-framework';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Fixed strategy (proven trade-generating v5 strategy from
//    test_indicators/simple_ema_cross_strategy.pine) ────────────────────────────
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

// ── Fixed deterministic bars (EMA-crossover pattern, 120 bars) ─────────────────
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

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const API_FIXTURE = path.join(FIXTURE_DIR, 'backtest-api-result.golden.json');
const CLI_FIXTURE = path.join(FIXTURE_DIR, 'backtest-cli-metrics.golden.json');

function writeGolden(filePath: string, obj: unknown): void {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

describe('backtest golden fixture capture', () => {
  it('captures the current API + CLI output shapes into golden JSON', async () => {
    const bars = createCrossoverBars();
    expect(bars.length).toBe(120);

    const pipeline = await runBacktestPipeline({ script: STRATEGY, bars });
    expect(pipeline.success).toBe(true);
    expect(pipeline.engine).toBeDefined();

    const metricsResult = computeBacktestMetrics(bars, pipeline.engine!);
    expect(metricsResult).not.toBeNull();

    const {
      trades,
      metrics,
      filledOrders,
      equityCurve,
      drawdownCurve,
      equityPoints,
      monthlyReturns,
      buyHoldReturn,
    } = metricsResult!;

    // ═══════════════════════════════════════════════════════════════════════════
    // API PATH — copied VERBATIM from backend/src/routes/backtest.ts (lines 162-220)
    // ═══════════════════════════════════════════════════════════════════════════
    const sanitizeApi = (v: number) => (Number.isFinite(v) ? v : (v === Infinity ? null : 0));

    const apiResult = {
      metrics: {
        totalTrades: metrics.totalTrades,
        winningTrades: metrics.winningTrades,
        losingTrades: metrics.losingTrades,
        winRate: metrics.winRate,
        profitFactor: sanitizeApi(metrics.profitFactor),
        totalPnl: metrics.totalPnl,
        totalPnlPercent: metrics.totalPnlPercent,
        maxDrawdown: metrics.maxDrawdown,
        maxDrawdownPercent: metrics.maxDrawdownPercent,
        sharpeRatio: sanitizeApi(metrics.sharpeRatio),
        sortinoRatio: sanitizeApi(metrics.sortinoRatio),
        averageWin: metrics.averageWin,
        averageLoss: metrics.averageLoss,
        largestWin: metrics.largestWin,
        largestLoss: metrics.largestLoss,
        averageTradeDuration: metrics.averageTradeDuration,
        commission: metrics.commission,
      },
      equityCurve,
      drawdownCurve,
      trades: trades.map((t) => ({
        id: t.id,
        direction: t.direction,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        entryTime: t.entryTime,
        exitTime: t.exitTime,
        quantity: t.quantity,
        pnl: t.pnl,
        pnlPercent: t.pnlPercent,
        commission: t.commission,
        entryName: t.entryName,
        exitName: t.exitName,
        mae: t.mae,
        mfe: t.mfe,
        barsHeld: t.barsHeld,
      })),
      orders: filledOrders.map((o) => ({
        id: o.id,
        direction: o.direction,
        action: o.action,
        type: o.type,
        quantity: o.quantity,
        price: o.price,
        fillPrice: o.fillPrice,
        fillTime: o.fillTime,
        entryName: o.entryName,
        commission: o.commission,
      })),
      equityPoints,
      monthlyReturns,
      buyHoldReturn: Math.round(buyHoldReturn * 100) / 100,
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // CLI PATH — copied VERBATIM from backend/src/cli/symbol-runner.ts (lines 59-70)
    // ═══════════════════════════════════════════════════════════════════════════
    const sanitizeCli = (v: number) => (Number.isFinite(v) ? v : 0);

    const cliMetrics = {
      netProfit: sanitizeCli(metrics.totalPnl),
      netProfitPercent: sanitizeCli(metrics.totalPnlPercent),
      profitFactor: sanitizeCli(metrics.profitFactor),
      maxDrawdownPercent: sanitizeCli(metrics.maxDrawdownPercent),
      winRate: sanitizeCli(metrics.winRate),
      sharpeRatio: sanitizeCli(metrics.sharpeRatio),
      totalTrades: metrics.totalTrades,
      buyHoldReturn: Math.round(buyHoldReturn * 100) / 100,
    };

    // ── Write the golden fixtures ──
    writeGolden(API_FIXTURE, apiResult);
    writeGolden(CLI_FIXTURE, cliMetrics);

    // ── Assert they are non-empty + at least one trade was produced ──
    const apiRaw = fs.readFileSync(API_FIXTURE, 'utf-8');
    const cliRaw = fs.readFileSync(CLI_FIXTURE, 'utf-8');
    expect(apiRaw.length).toBeGreaterThan(0);
    expect(cliRaw.length).toBeGreaterThan(0);

    const apiCheck = JSON.parse(apiRaw) as { trades: unknown[] };
    const cliCheck = JSON.parse(cliRaw) as { totalTrades: number };
    expect(apiCheck.trades.length).toBeGreaterThan(0);
    expect(cliCheck.totalTrades).toBeGreaterThan(0);
  });
});
