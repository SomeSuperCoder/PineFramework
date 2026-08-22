/**
 * A1 timeframe.* namespace — engine-fix defect 1.
 *
 * Locks the NEW Pine v6 `timeframe.*` builtins:
 *   1. parseTimeframe — exact multiplier/unit/seconds parts for known tf
 *      strings ("1" → 60s, "5" → 300s, "60" → 3600s, "240" → 14400s,
 *      "5S" → 5s, "D" → 86400s, "W" → 604800s, "M" → 2592000s per Pine's
 *      30-day month model), null for unknown strings.
 *   2. All 11 registered keys resolve through `engine.builtins.get` (thunk
 *      pattern, same harness as ta-sar-exactness.test.ts).
 *   3. Engine constructed WITH runtimeOptions.timeframe (runner-provided
 *      chart resolution wins) and WITHOUT (strategy() declaration fallback;
 *      both absent → NA — non-breaking no-tf behavior).
 *   4. SCRIPT-LEVEL property read `timeframe.period` — the A1 FIXED bug
 *      (previously fell through to executeIdentifier('timeframe') and threw).
 *   5. SCRIPT-LEVEL call path `timeframe.in_seconds()` — MemberExpression
 *      call branch resolving the same registered key.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { NA, type PineValue } from '../../src/language/types/na.js';
import { parseTimeframe } from '../../src/language/runtime/builtins/timeframe-builtins.js';

// ---------------------------------------------------------------------------
// Shared engine plumbing — fresh engine per test (builtins are stateless, but
// engine.timeframe is per-construction so runtime-option tests must not share).
// ---------------------------------------------------------------------------

const INDICATOR_SRC = '//@version=6\nindicator("TF Builtins", overlay=true)\nplot(close, "c")';
const { ast } = parse(INDICATOR_SRC);
const compiled = compile(ast);

type BuiltinFn = (...args: unknown[]) => PineValue;

function tfBuiltin(engine: ExecutionEngine, key: string): BuiltinFn {
  const fn = engine.builtins.get(key);
  if (!fn) throw new Error(`${key} not registered`);
  return fn as BuiltinFn;
}

/** Engine constructed WITHOUT runtime options — declaration fallback / NA path. */
function newEngine(): ExecutionEngine {
  return new ExecutionEngine(compiled);
}

/** Engine constructed WITH a runner-provided chart resolution. */
function newEngineWithTimeframe(timeframe: string): ExecutionEngine {
  return new ExecutionEngine(compiled, undefined, { timeframe });
}

// ---------------------------------------------------------------------------
// parseTimeframe — exact unit decomposition
// ---------------------------------------------------------------------------

describe('timeframe.parseTimeframe', () => {
  it('parses bare minutes ("1" → 60s, "5" → 300s, "60" → 3600s, "240" → 14400s)', () => {
    expect(parseTimeframe('1')).toEqual({ multiplier: 1, unit: 'm', seconds: 60 });
    expect(parseTimeframe('5')).toEqual({ multiplier: 5, unit: 'm', seconds: 300 });
    expect(parseTimeframe('60')).toEqual({ multiplier: 60, unit: 'm', seconds: 3600 });
    expect(parseTimeframe('240')).toEqual({ multiplier: 240, unit: 'm', seconds: 14400 });
  });

  it('parses explicit seconds ("5S" → 5s)', () => {
    expect(parseTimeframe('5S')).toEqual({ multiplier: 5, unit: 'S', seconds: 5 });
    expect(parseTimeframe('1S')).toEqual({ multiplier: 1, unit: 'S', seconds: 1 });
  });

  it('parses daily/weekly/monthly literals (M = 30 days per Pine)', () => {
    expect(parseTimeframe('D')).toEqual({ multiplier: 1, unit: 'D', seconds: 86400 });
    expect(parseTimeframe('W')).toEqual({ multiplier: 1, unit: 'W', seconds: 604800 });
    expect(parseTimeframe('M')).toEqual({ multiplier: 1, unit: 'M', seconds: 2592000 });
  });

  it('returns null for unknown timeframe strings (never throws)', () => {
    expect(parseTimeframe('')).toBeNull();
    expect(parseTimeframe('bogus')).toBeNull();
    expect(parseTimeframe('1D')).toBeNull(); // compound forms unsupported today
    expect(parseTimeframe('5m')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Registered keys — direct thunk access (harness pattern from ta-sar)
// ---------------------------------------------------------------------------

describe('timeframe.* builtins — runtime options (chart resolution wins)', () => {
  it('registers all 11 dotted keys on a fresh engine', () => {
    const engine = newEngineWithTimeframe('5');
    for (const key of [
      'timeframe.period',
      'timeframe.timeframe',
      'timeframe.in_seconds',
      'timeframe.multiplier',
      'timeframe.isseconds',
      'timeframe.isminutes',
      'timeframe.isintraday',
      'timeframe.isdaily',
      'timeframe.isweekly',
      'timeframe.ismonthly',
    ]) {
      expect(engine.builtins.has(key)).toBe(true);
    }
  });

  it('"5" — period/timeframe/in_seconds/multiplier + is* predicates', () => {
    const engine = newEngineWithTimeframe('5');
    expect(tfBuiltin(engine, 'timeframe.period')()).toBe('5');
    expect(tfBuiltin(engine, 'timeframe.timeframe')()).toBe('5'); // intraday keeps raw string
    expect(tfBuiltin(engine, 'timeframe.in_seconds')()).toBe(300);
    expect(tfBuiltin(engine, 'timeframe.multiplier')()).toBe(5);
    expect(tfBuiltin(engine, 'timeframe.isseconds')()).toBe(false);
    expect(tfBuiltin(engine, 'timeframe.isminutes')()).toBe(true);
    expect(tfBuiltin(engine, 'timeframe.isintraday')()).toBe(true);
    expect(tfBuiltin(engine, 'timeframe.isdaily')()).toBe(false);
    expect(tfBuiltin(engine, 'timeframe.isweekly')()).toBe(false);
    expect(tfBuiltin(engine, 'timeframe.ismonthly')()).toBe(false);
  });

  it('"60" — 3600 seconds per bar', () => {
    const engine = newEngineWithTimeframe('60');
    expect(tfBuiltin(engine, 'timeframe.in_seconds')()).toBe(3600);
    expect(tfBuiltin(engine, 'timeframe.timeframe')()).toBe('60');
  });

  it('"D" — daily identifier becomes "1D", 86400s, isdaily true', () => {
    const engine = newEngineWithTimeframe('D');
    expect(tfBuiltin(engine, 'timeframe.period')()).toBe('D');
    expect(tfBuiltin(engine, 'timeframe.timeframe')()).toBe('1D');
    expect(tfBuiltin(engine, 'timeframe.in_seconds')()).toBe(86400);
    expect(tfBuiltin(engine, 'timeframe.multiplier')()).toBe(1);
    expect(tfBuiltin(engine, 'timeframe.isdaily')()).toBe(true);
    expect(tfBuiltin(engine, 'timeframe.isintraday')()).toBe(false);
  });

  it('"W" — weekly identifier becomes "1W", 604800s, isweekly true', () => {
    const engine = newEngineWithTimeframe('W');
    expect(tfBuiltin(engine, 'timeframe.timeframe')()).toBe('1W');
    expect(tfBuiltin(engine, 'timeframe.in_seconds')()).toBe(604800);
    expect(tfBuiltin(engine, 'timeframe.isweekly')()).toBe(true);
  });

  it('"M" — monthly identifier becomes "1M", 2592000s, ismonthly true', () => {
    const engine = newEngineWithTimeframe('M');
    expect(tfBuiltin(engine, 'timeframe.timeframe')()).toBe('1M');
    expect(tfBuiltin(engine, 'timeframe.in_seconds')()).toBe(2592000);
    expect(tfBuiltin(engine, 'timeframe.ismonthly')()).toBe(true);
  });

  it('"1S" — seconds class, isseconds + isintraday true', () => {
    const engine = newEngineWithTimeframe('1S');
    expect(tfBuiltin(engine, 'timeframe.in_seconds')()).toBe(1);
    expect(tfBuiltin(engine, 'timeframe.isseconds')()).toBe(true);
    expect(tfBuiltin(engine, 'timeframe.isintraday')()).toBe(true);
    expect(tfBuiltin(engine, 'timeframe.isminutes')()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// No runtime options — declaration fallback / NA (non-breaking no-tf behavior)
// ---------------------------------------------------------------------------

describe('timeframe.* builtins — without runtime options', () => {
  it('strategy() declaration `timeframe="D"` is the fallback when runtime options absent', () => {
    const { ast: declAst } = parse(
      '//@version=6\nstrategy("TF Decl", timeframe="D")\nplot(close, "c")',
    );
    const declCompiled = compile(declAst);
    const engine = new ExecutionEngine(declCompiled);
    expect(tfBuiltin(engine, 'timeframe.period')()).toBe('D');
    expect(tfBuiltin(engine, 'timeframe.in_seconds')()).toBe(86400);
    expect(tfBuiltin(engine, 'timeframe.isdaily')()).toBe(true);
  });

  it('runtime options WIN over the strategy() declaration', () => {
    const { ast: declAst } = parse(
      '//@version=6\nstrategy("TF Decl", timeframe="W")\nplot(close, "c")',
    );
    const declCompiled = compile(declAst);
    const engine = new ExecutionEngine(declCompiled, undefined, { timeframe: '60' });
    expect(tfBuiltin(engine, 'timeframe.period')()).toBe('60');
    expect(tfBuiltin(engine, 'timeframe.in_seconds')()).toBe(3600);
    expect(tfBuiltin(engine, 'timeframe.isweekly')()).toBe(false);
  });

  it('both absent → every member resolves to NA (no-tf behavior, non-breaking)', () => {
    const engine = newEngine();
    expect(tfBuiltin(engine, 'timeframe.period')()).toBe(NA);
    expect(tfBuiltin(engine, 'timeframe.timeframe')()).toBe(NA);
    expect(tfBuiltin(engine, 'timeframe.in_seconds')()).toBe(NA);
    expect(tfBuiltin(engine, 'timeframe.multiplier')()).toBe(NA);
    expect(tfBuiltin(engine, 'timeframe.isdaily')()).toBe(NA);
  });
});

// ---------------------------------------------------------------------------
// SCRIPT-LEVEL resolution — the A1 FIXED property path + the call path
// ---------------------------------------------------------------------------

function createBarContext(): ExecutionContext {
  return {
    barIndex: 0,
    barCount: 1,
    timestamp: 1700000000000,
    open: createSeries('open', [100]),
    high: createSeries('high', [105]),
    low: createSeries('low', [95]),
    close: createSeries('close', [102]),
    volume: createSeries('volume', [1000]),
  };
}

function executeScript(source: string, timeframe?: string): ExecutionEngine {
  const { ast: srcAst } = parse(source);
  const result = compile(srcAst);
  const engine =
    timeframe === undefined
      ? new ExecutionEngine(result)
      : new ExecutionEngine(result, undefined, { timeframe });
  engine.executeBar(createBarContext());
  return engine;
}

describe('timeframe.* at script level', () => {
  it('PROPERTY read `timeframe.period` resolves (A1-fixed executeMemberExpression branch)', () => {
    const engine = executeScript(
      '//@version=6\nindicator("TF Prop")\np = timeframe.period\nplot(p, "tfPeriod")',
      '60',
    );
    const out = engine.getOutput('tfPeriod');
    expect(out).toBeDefined();
    expect(out!.values[0]).toBe('60');
  });

  it('PROPERTY read of a daily timeframe gives "D"', () => {
    const engine = executeScript(
      '//@version=6\nindicator("TF Prop D")\np = timeframe.period\nplot(p, "tfPeriodD")',
      'D',
    );
    const out = engine.getOutput('tfPeriodD');
    expect(out!.values[0]).toBe('D');
  });

  it('CALL path `timeframe.in_seconds()` resolves via executeCallExpression', () => {
    const engine = executeScript(
      '//@version=6\nindicator("TF Call")\nx = timeframe.in_seconds()\nplot(x, "tfSec")',
      '5',
    );
    const out = engine.getOutput('tfSec');
    expect(out).toBeDefined();
    expect(String(out!.values[0])).toBe('300');
  });

  it('PROPERTY read without any timeframe → NA (no throw)', () => {
    const engine = executeScript(
      '//@version=6\nindicator("TF NA")\np = timeframe.period\nplot(p, "tfNA")',
    );
    const out = engine.getOutput('tfNA');
    expect(out).toBeDefined();
    // Plot output encodes NA as null (series serialization); the thunk-level
    // NA contract is locked by the direct-access test above.
    expect(out!.values[0]).toBeNull();
  });
});
