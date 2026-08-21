import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { LineEntry } from '../../src/language/runtime/execution-types.js';

const WARMUP = 5;
const TOTAL_BARS = 20;
const BASE_TS = 1_700_000_000_000;

function createBarContext(barIndex: number): ExecutionContext {
  return {
    barIndex,
    barCount: TOTAL_BARS,
    timestamp: BASE_TS + barIndex * 60_000,
    open: createSeries('open', [100]),
    high: createSeries('high', [105]),
    low: createSeries('low', [95]),
    close: createSeries('close', [100 + barIndex]),
    volume: createSeries('volume', [1000000]),
  };
}

/** Engine with declared max_bars_back=WARMUP, already executed over TOTAL_BARS bars. */
async function setupEngine(): Promise<ExecutionEngine> {
  const source = `
    //@version=6
    indicator("T", max_bars_back=${WARMUP})
    plot(close, "c")
  `;
  const { ast } = parse(source);
  const engine = new ExecutionEngine(compile(ast));
  await engine.executeBars(
    Array.from({ length: TOTAL_BARS }, (_, i) => createBarContext(i)),
  );
  return engine;
}

function makeLine(overrides: Partial<LineEntry>): LineEntry {
  return {
    x1: 0,
    y1: 100,
    x2: 10,
    y2: 110,
    color: '#ff0000',
    style: 'solid',
    width: 1,
    xloc: 'bar_index',
    extend: 'none',
    ...overrides,
  };
}

/** Seed a line, then push one more bar so applyLookbackFilter runs over it. */
async function runFilterWithLine(engine: ExecutionEngine, line: LineEntry): Promise<void> {
  engine.lines.set(1, line);
  await engine.executeBars([createBarContext(TOTAL_BARS)]);
}

describe('Interpreter.applyLookbackFilter — line filtering (type-aware)', () => {
  it("removes an xloc='bar_time' line anchored on a warmup timestamp", async () => {
    const engine = await setupEngine();
    // x1 is a ms timestamp equal to bar 0's timestamp (inside warmup)
    await runFilterWithLine(
      engine,
      makeLine({ xloc: 'bar_time', x1: BASE_TS, x2: BASE_TS + 120_000 }),
    );
    expect(engine.lines.has(1)).toBe(false);
  });

  it("removes an xloc='bar_index' line fully inside warmup (x1 < warmup AND x2 < warmup)", async () => {
    const engine = await setupEngine();
    await runFilterWithLine(engine, makeLine({ xloc: 'bar_index', x1: 1, x2: 3 }));
    expect(engine.lines.has(1)).toBe(false);
  });

  it("keeps an xloc='bar_index' line anchored in warmup but extending past it (x2 >= warmupCount)", async () => {
    const engine = await setupEngine();
    await runFilterWithLine(engine, makeLine({ xloc: 'bar_index', x1: 2, x2: 9 }));
    expect(engine.lines.has(1)).toBe(true);
  });

  it('keeps any line anchored outside warmup', async () => {
    const engine = await setupEngine();
    await runFilterWithLine(engine, makeLine({ xloc: 'bar_index', x1: 7, x2: 12 }));
    expect(engine.lines.has(1)).toBe(true);
  });
});
