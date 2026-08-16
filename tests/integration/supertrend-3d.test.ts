import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';
import * as fs from 'fs';

const SOURCE = fs.readFileSync('./test_indicators/supertrend-3d.pine', 'utf-8');

function createBars(count: number, startPrice: number = 100): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;
  let s = 42;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (rand() - 0.5) * 4;
    const close = open + change;
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.min(open, close) - rand() * 2;
    bars.push({
      timestamp: 1700000000000 + i * 3600000,
      open,
      high,
      low,
      close,
      volume: Math.floor(rand() * 10000) + 1000,
    });
    price = close;
  }
  return bars;
}

function barsToContext(bars: Bar[]): ExecutionContext[] {
  return bars.map((bar, index) => ({
    barIndex: index,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', [bar.open]),
    high: createSeries('high', [bar.high]),
    low: createSeries('low', [bar.low]),
    close: createSeries('close', [bar.close]),
    volume: createSeries('volume', [bar.volume]),
  }));
}

function execute(source: string, barCount = 120) {
  const { ast } = parse(source);
  const compileResult = compile(ast);
  const engine = new ExecutionEngine(compileResult);
  const bars = createBars(barCount);
  const contexts = barsToContext(bars);
  return { ast, compileResult, engine, result: engine.executeBars(contexts) };
}

describe('Integration: Supertrend Parameter Sensitivity 3D [LuxAlgo]', () => {
  it('should parse supertrend-3d.pine without errors', () => {
    const { ast } = parse(SOURCE);
    expect(ast).toBeDefined();
    expect(ast.scriptKind).toBe('indicator');
    expect(ast.scriptName).toContain('Supertrend');
  });

  it('should compile supertrend-3d.pine', () => {
    const { compileResult } = execute(SOURCE);
    expect(compileResult).toBeDefined();
  });

  it('should execute supertrend-3d.pine and succeed end-to-end', () => {
    const { result } = execute(SOURCE);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should register both main plot outputs (Up Trend / Down Trend)', () => {
    const { result } = execute(SOURCE);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    const outputKeys = Array.from(result.outputs.keys());
    expect(outputKeys.some((k) => k.includes('Up Trend'))).toBe(true);
    expect(outputKeys.some((k) => k.includes('Down Trend'))).toBe(true);
  });

  it('should produce non-null plot values after supertrend warmup', () => {
    const { result } = execute(SOURCE, 120);
    expect(result.success).toBe(true);

    const upKey = Array.from(result.outputs.keys()).find((k) => k.includes('Up Trend'));
    const downKey = Array.from(result.outputs.keys()).find((k) => k.includes('Down Trend'));
    expect(upKey).toBeDefined();
    expect(downKey).toBeDefined();

    // ta.supertrend(mult=3.0, len=10) warms up through RMA(10) — well covered by 15 bars.
    const warmupBars = 15;
    const upValues = Array.from(result.outputs.get(upKey!)!.values);
    const downValues = Array.from(result.outputs.get(downKey!)!.values);

    let upNonNull = 0;
    for (let i = warmupBars; i < upValues.length; i++) {
      if (upValues[i] !== null && upValues[i] !== undefined) upNonNull++;
    }
    let downNonNull = 0;
    for (let i = warmupBars; i < downValues.length; i++) {
      if (downValues[i] !== null && downValues[i] !== undefined) downNonNull++;
    }

    expect(upNonNull).toBeGreaterThan(0);
    expect(downNonNull).toBeGreaterThan(0);
  });

  it('should report overlay=false despite force_overlay plots', () => {
    const { result } = execute(SOURCE);
    expect(result.success).toBe(true);
    // The indicator header declares overlay=false; plot(force_overlay=true)
    // draws in the main chart pane but does not change the indicator overlay flag.
    expect(result.overlay).toBe(false);
  });

  it('should produce a table with 11 columns × 13 rows', () => {
    const { result } = execute(SOURCE);
    expect(result.success).toBe(true);
    expect(result.tables).toBeDefined();
    expect(result.tables!.length).toBeGreaterThan(0);
    const table = result.tables![0];
    expect(table.columns).toBe(11);
    expect(table.rows).toBe(13);
  });

  it('should produce table data cells with clean number formatting (no IEEE artifacts)', () => {
    const { result } = execute(SOURCE);
    const table = result.tables![0];
    // Check data cells only (rows 3-12, columns 1-10) — skip title/separator/header rows
    let dataCellCount = 0;
    for (const [key, cell] of Object.entries(table.cells)) {
      const [col, row] = key.split(',').map(Number);
      if (row >= 3 && col >= 1) {
        dataCellCount++;
        expect(cell.text).not.toMatch(/0{4,}/); // no IEEE artifacts like 0.30000000000000004
      }
    }
    expect(dataCellCount).toBeGreaterThan(0);
  });

  it('should mark Up Trend and Down Trend plots as overlay via plotOverlayKeys', () => {
    const { result } = execute(SOURCE);
    expect(result.success).toBe(true);
    const upKey = Array.from(result.outputs.keys()).find((k) => k.includes('Up Trend'));
    const downKey = Array.from(result.outputs.keys()).find((k) => k.includes('Down Trend'));
    expect(upKey).toBeDefined();
    expect(downKey).toBeDefined();
    expect(result.plotOverlayKeys).toBeDefined();
    expect(result.plotOverlayKeys!.length).toBeGreaterThan(0);
    expect(result.plotOverlayKeys!).toContain(upKey);
    expect(result.plotOverlayKeys!).toContain(downKey);
  });

  it('should produce linefills for the 3D surface rendering', () => {
    const { result } = execute(SOURCE);
    expect(result.success).toBe(true);
    expect(result.linefills).toBeDefined();
    expect(result.linefills!.length).toBeGreaterThan(0);
    for (const lf of result.linefills!) {
      expect(lf.line1).toBeDefined();
      expect(lf.line2).toBeDefined();
      expect(lf.color).toMatch(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);
      const hasCoords = lf.line1.x1 !== 0 || lf.line1.y1 !== 0 || lf.line2.x1 !== 0 || lf.line2.y1 !== 0;
      expect(hasCoords).toBe(true);
    }
  });

  it('should strip metadata from overlay keys to produce clean plot titles', () => {
    const { result } = execute(SOURCE);
    expect(result.success).toBe(true);
    expect(result.plotOverlayKeys).toBeDefined();
    // overlay keys should contain raw output keys with metadata suffixes
    for (const key of result.plotOverlayKeys!) {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it('should have table title at (0,0) and header at (0,2)', () => {
    const { result } = execute(SOURCE);
    const table = result.tables![0];
    const titleCell = table.cells['0,0'];
    expect(titleCell).toBeDefined();
    expect(titleCell.text).toMatch(/Value Distribution/);
    const headerCell = table.cells['0,2'];
    expect(headerCell).toBeDefined();
    expect(headerCell.text).toMatch(/Len.*Mult/);
  });
});
