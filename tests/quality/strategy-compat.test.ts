/**
 * Strategy compat tests — CONTRACT-FIRST for `strategy.equity` (T4, financial
 * correctness). The contract suites below define the API BEFORE implementation:
 * they are RED now and flip GREEN when the Backend Engineer lands the
 * `ExecutionEngine.setEquitySource` seam + the `strategy.equity` builtin.
 *
 * Suite 1 — member-access error diagnostics (the fix landed in
 * src/language/runtime/expression-executor.ts): a defined namespace with a
 * missing member must report the MEMBER (`Variable '<member>' is not defined in
 * '<namespace>'`), never the namespace (`Variable '<namespace>' is not defined`).
 * A truly-undefined bare variable keeps its original diagnostic. The probe was
 * moved OFF `strategy.equity` (it becomes a REAL member under the contract
 * suites below) to a genuinely-unknown member so this diagnostic keeps its guard.
 *
 * Suite 2 — full compile+execute of test_indicators/example-buy-sell-stg.pine.
 * CONTRACT (RED today): the script calls
 * `strategy.entry("Long", strategy.long, qty = strategy.equity * 0.10 / close)`
 * but `equity` is NOT registered on the strategy namespace, so execution must
 * fail with a message naming `equity`. That exact failure text is the payload
 * for the implementation; the assertion flips GREEN once `strategy.equity` lands.
 *
 * Suites 3–6 — the `strategy.equity` CONTRACT (from the accepted backend-lead
 * plan): EquitySource seam with default = strategy engine equity; injected
 * source FULLY OVERRIDES (never AND); NA fallback for indicator scripts;
 * backtest equity reflects realized PnL − commissions on the bar after a trade.
 */

import fs from 'node:fs';
import type { Bar } from '../../src/data/bar.js';
import { barsToContexts, createPineScriptEngine } from '../../src/api.js';
import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import {
  ExecutionEngine,
  type ExecutionResult,
} from '../../src/language/runtime/execution-engine.js';
import type { PineValue } from '../../src/language/types/na.js';
import type { StrategyConfig } from '../../src/strategy/strategy-engine.js';

const STRATEGY_SOURCE = fs.readFileSync('./test_indicators/example-buy-sell-stg.pine', 'utf-8');

/**
 * Deterministic V-shape: 50 bars declining, 50 bars rallying. Guarantees the
 * UT-bot trailing stop (xATRTrailingStop) is crossed back up mid-script, so the
 * `if buy` branch fires and `strategy.entry`'s `qty = strategy.equity * ...`
 * argument is actually evaluated. A flat/random series could never enter the
 * branch and would mask the missing member.
 */
function makeVBars(count = 100): Bar[] {
  const bars: Bar[] = [];
  const startTime = Date.UTC(2024, 0, 1);
  const half = Math.floor(count / 2);
  for (let i = 0; i < count; i++) {
    const price = i < half ? 100 - (i * 30) / half : 70 + ((i - half) * 30) / (count - half);
    bars.push({
      timestamp: startTime + i * 86_400_000,
      open: price,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000,
    });
  }
  return bars;
}

describe('strategy member-access error diagnostics (fixed)', () => {
  const engine = createPineScriptEngine();

  it('strategy.<unknown member> reports the member, not the namespace', async () => {
    // Probe moved off `equity`: `strategy.equity` becomes a REAL member under the
    // contract suites below, so this diagnostic is locked on a genuinely-unknown
    // member that must keep reporting the member name, never the namespace.
    const result = await engine.execute(
      '//@version=6\nstrategy("S", overlay = true)\nplot(strategy.not_a_real_member)',
      makeVBars(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    const message = result.error?.message ?? '';
    expect(message).toContain('not_a_real_member');
    expect(message).toContain('strategy');
    expect(message).not.toContain("Variable 'strategy' is not defined");
  });

  it('a truly-undefined bare variable still reports that variable name', async () => {
    const result = await engine.execute('//@version=6\nindicator("I")\nplot(name1)', makeVBars());

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    const message = result.error?.message ?? '';
    expect(message).toContain('name1');
    expect(message).toContain("Variable 'name1' is not defined");
  });
});

describe('example-buy-sell-stg.pine compile+execute (CONTRACT — RED until strategy.equity lands)', () => {
  const engine = createPineScriptEngine();

  it('compiles the strategy script to IR', async () => {
    // compile() throws CompileError on failure — no errors field on the result.
    const compileResult = engine.compile(STRATEGY_SOURCE);
    expect(compileResult.ir.scriptName).toBe('Example Buy/Sell');
    expect(compileResult.ir.scriptKind).toBe('strategy');
  });

  it('executes the strategy script to completion (CONTRACT — GREEN when strategy.equity is registered)', async () => {
    // RED today: the script evaluates `strategy.equity * 0.10 / close` and
    // `equity` is NOT registered on the strategy namespace, so execution must
    // fail with a message naming `equity`. On RED, the second arg surfaces the
    // full structured error in the failure output — the exact missing-member
    // payload for the implementation. Flips GREEN once the builtin lands.
    const result = await engine.execute(STRATEGY_SOURCE, makeVBars(100));

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// CONTRACT — `strategy.equity` (from the accepted backend-lead plan)
// ----------------------------------------------------------------------------
// RED today, for two distinct reasons:
//   a) `ExecutionEngine.setEquitySource` does not exist yet → runtime TypeError
//      on the seam calls (Groups 1–2).
//   b) `strategy.equity` is not registered on the strategy namespace → member /
//      namespace execution error on any script that reads it (Groups 2–4 and
//      Suite 2 above).
// Implement both to make these GREEN. Deterministic bars only — no randomness.
// ============================================================================

/**
 * CONTRACT — strategy script whose equity must become observable after
 * implementation. On the deterministic V-shape (100 → 70 → 100):
 *   `close < 80` fires first mid-decline  → `strategy.entry` (long, qty 1)
 *   `close > 95` fires on the late rally  → `strategy.close` (flattens)
 * Both branches are guaranteed to fire by construction of makeVBars().
 */
const CONTRACT_EQUITY_STRATEGY = `//@version=6
strategy("EquityContract", overlay = true)
plot(strategy.equity, title = "equity_out")
if close < 80
    strategy.entry("Long", strategy.long, qty = 1)
if close > 95
    strategy.close("Long")`;

/** CONTRACT — no-trade strategy; isolates the default provider (no PnL noise). */
const CONTRACT_EQUITY_NO_TRADE = `//@version=6
strategy("EquityDefault", overlay = true)
plot(strategy.equity, title = "equity_out")`;

/** CONTRACT — indicator script; `strategy.equity` must fall back to NA. */
const CONTRACT_EQUITY_INDICATOR = `//@version=6
indicator("EquityContractIndicator")
plot(strategy.equity, title = "equity_out")`;

/**
 * CONTRACT — run a script through a direct `ExecutionEngine` so the
 * post-construction `setEquitySource` seam (mirrors the `setWarningSink`
 * precedent) can be exercised. The `setEquitySource` call does NOT exist yet —
 * that is the contract; it fails at runtime today (RED baseline).
 */
async function executeContractEngine(
  source: string,
  bars: Bar[],
  strategyConfig?: Partial<StrategyConfig>,
  equitySource?: () => number,
): Promise<{ result: ExecutionResult; engine: ExecutionEngine }> {
  const { ast } = parse(source);
  const cr = compile(ast);
  const engine = new ExecutionEngine(cr, strategyConfig);
  if (equitySource) {
    // CONTRACT — implement to make GREEN: post-construction setter on
    // ExecutionEngine, OR semantics (injected source fully overrides default).
    engine.setEquitySource(equitySource);
  }
  const result = await engine.executeBars(barsToContexts(bars));
  return { result, engine };
}

/** Plotted `strategy.equity` values from the contract scripts' `equity_out` output. */
function equitySeries(result: ExecutionResult): PineValue[] {
  return result.outputs.get('equity_out')?.values ?? [];
}

describe('CONTRACT — strategy.equity · EquitySource seam default (Group 1)', () => {
  it('setEquitySource is callable; default provider reads the strategy engine equity', async () => {
    const { result, engine } = await executeContractEngine(CONTRACT_EQUITY_NO_TRADE, makeVBars());

    expect(result.success).toBe(true);
    // DEFAULT_STRATEGY_CONFIG.initialCapital; the engine created a StrategyEngine
    // for the strategy script and its equity is the default source.
    expect(engine.getStrategyEngine()?.getEquity()).toBe(10000);

    const values = equitySeries(result);
    expect(values.length).toBeGreaterThan(0);
    // CONTRACT — implement to make GREEN: every bar reads the engine equity
    // (constant 10000 here — no trades) through the DEFAULT provider.
    expect(values.every((v) => v === 10000)).toBe(true);
  });
});

describe('CONTRACT — strategy.equity · injected source wins over engine default (Group 2)', () => {
  it('setEquitySource(() => 1234.5) returns 1234.5 — injected wins, never ANDs engine PnL', async () => {
    // The script TRADES on the V-shape. If the injected source were AND-ed with
    // the engine default, the series would dip to 9990 after the buy fill
    // (commission). OR semantics: the injected value wins, flat 1234.5.
    const { result } = await executeContractEngine(
      CONTRACT_EQUITY_STRATEGY,
      makeVBars(),
      undefined,
      () => 1234.5,
    );

    expect(result.success).toBe(true);

    const values = equitySeries(result);
    expect(values.length).toBeGreaterThan(0);
    // CONTRACT — implement to make GREEN: injected source fully overrides the
    // default provider (never AND → no double-counted PnL).
    expect(values.every((v) => v === 1234.5)).toBe(true);
  });
});

describe('CONTRACT — strategy.equity · NA fallback without a strategy engine (Group 3)', () => {
  it('indicator scripts read strategy.equity as NA instead of failing', async () => {
    const { result } = await executeContractEngine(CONTRACT_EQUITY_INDICATOR, makeVBars());

    // CONTRACT — implement to make GREEN: no strategy engine → the builtin
    // returns NA (null/undefined), never an error. RED today: execution fails
    // on the unregistered member/namespace.
    expect(result.success).toBe(true);

    const values = equitySeries(result);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((v) => v === null || v === undefined)).toBe(true);
  });
});

describe('CONTRACT — strategy.equity · backtest reflects the CORRECTED equity formula (Group 4)', () => {
  it('open-position bars carry floating PnL; after close, realized folds in (initial + closed + open)', async () => {
    // CORRECTED formula (Director-mandated):
    //   Strategy Equity = Initial Capital + Closed Net Profit + Open Position Profit
    // On an OPEN long with a moved current price:
    //   equity = initialCapital − entry commission + (barClose − avgEntryPrice) × qty
    //
    // Deterministic V-shape (makeVBars, 100 bars): price = 100 − 0.6·i (i < 50).
    //   bar 34 close 79.6 < 80 → entry "Long" qty=1 submitted (market order).
    //   bar 35 open 79 → fill (marketFillPrice 'open'): avgPrice 79, qty 1,
    //         equity 10000 − 10 = 9990; close 79 → floating 0 → plot 9990.
    //   bar 36 close 78.4 → floating = (78.4 − 79) × 1 = −0.6 →
    //         CORRECTED plot = 9990 − 0.6 = 9989.4.
    //   RED today: the engine returns realized-only 9990 (floating missing).
    const { result, engine } = await executeContractEngine(CONTRACT_EQUITY_STRATEGY, makeVBars(), {
      commission: 10,
      commissionType: 'fixed',
    });

    expect(result.success).toBe(true);

    const strat = engine.getStrategyEngine();
    expect(strat).not.toBeNull();
    // The V-shape must have triggered buy AND close — guards against a script
    // that silently never trades (which would make every equity assertion trivially pass).
    const trades = strat!.getTrades();
    expect(trades.length).toBeGreaterThan(0);

    const values = equitySeries(result);
    expect(values[0]).toBe(10000); // pre-trade bars read initialCapital

    // CORRECTED — open-position bar with a moved price carries floating PnL:
    // 10000 − 10 (entry commission) + (78.4 − 79) × 1 = 9989.4 exactly.
    expect(values[36]).toBeCloseTo(9989.4, 6);

    // The OLD realized-only value (initialCapital − commission, no floating)
    // must NOT be returned once the price moved — proves the floating
    // component is present. RED today: the impl returns exactly 9990 here.
    expect(values[36]).not.toBe(9990);

    // The plotted series equals the strategy engine's live equity...
    const finalPlotted = values[values.length - 1]!;
    expect(finalPlotted).toBeCloseTo(strat!.getEquity(), 6);

    // ...and after the close, the floating component vanishes and the closed
    // trade's realized PnL folds into equity: initialCapital + realized net
    // PnL − commissions. The close fills at bar 93 open 95.8 →
    // realized (95.8 − 79) × 1 = 16.8 → final equity 10000 − 10 + 16.8 =
    // 10006.8 (independent arithmetic via getTrades(); the fixed commission
    // is charged once on the entry fill — exit commission is 0 for fixed).
    const realizedSum = trades.reduce((sum, t) => sum + t.pnl, 0);
    const expectedEquity = 10000 + realizedSum - 10;
    expect(strat!.getEquity()).toBeCloseTo(expectedEquity, 6);

    // The value CHANGED after the trade (financial-correctness guard: the
    // series must not sit at initialCapital forever).
    expect(finalPlotted).not.toBe(10000);
  });
});
