/**
 * Minimal test: distribution logic in isolation with known values.
 * Tests that the bin calculation + array.from block chars produce correct sparkline.
 */
import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';

function barsToContext(count: number): ExecutionContext[] {
  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) {
    bars.push({
      timestamp: 1700000000000 + i * 3600000,
      open: 100 + Math.sin(i * 0.1) * 10,
      high: 105 + Math.sin(i * 0.1) * 10,
      low: 95 + Math.sin(i * 0.1) * 10,
      close: 100 + Math.sin(i * 0.1) * 10,
      volume: 1000,
    });
  }
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

// Minimal reproduction: known values → bins → sparkline
const MINIMAL_TEST = `
//@version=6
indicator("Dist Test", overlay=true)
if bar_index == 0
    // Known values: 10 items ranging from 0 to 100
    float min_z = 0.0
    float max_z = 100.0
    float range_z = max_z - min_z
    
    int NUM_BINS = 25
    float[] bins = array.new_float(NUM_BINS, 0)
    
    // Manually set known distribution
    // Values: [0, 10, 20, 30, 40, 50, 60, 70, 80, 100]
    // Bin calc: floor((v - 0) / 100 * 24.99)
    float v0 = 0.0    // bin 0
    float v1 = 10.0   // bin 2
    float v2 = 20.0   // bin 4
    float v3 = 30.0   // bin 7
    float v4 = 40.0   // bin 9
    float v5 = 50.0   // bin 12
    float v6 = 60.0   // bin 14
    float v7 = 70.0   // bin 17
    float v8 = 80.0   // bin 19
    float v9 = 100.0  // bin 24
    
    int bin0 = math.floor((v0 - min_z) / range_z * (NUM_BINS - 0.01))
    int bin1 = math.floor((v1 - min_z) / range_z * (NUM_BINS - 0.01))
    int bin2 = math.floor((v2 - min_z) / range_z * (NUM_BINS - 0.01))
    int bin3 = math.floor((v3 - min_z) / range_z * (NUM_BINS - 0.01))
    int bin4 = math.floor((v4 - min_z) / range_z * (NUM_BINS - 0.01))
    int bin5 = math.floor((v5 - min_z) / range_z * (NUM_BINS - 0.01))
    int bin6 = math.floor((v6 - min_z) / range_z * (NUM_BINS - 0.01))
    int bin7 = math.floor((v7 - min_z) / range_z * (NUM_BINS - 0.01))
    int bin8 = math.floor((v8 - min_z) / range_z * (NUM_BINS - 0.01))
    int bin9 = math.floor((v9 - min_z) / range_z * (NUM_BINS - 0.01))
    
    bins.set(bin0, bins.get(bin0) + 1)
    bins.set(bin1, bins.get(bin1) + 1)
    bins.set(bin2, bins.get(bin2) + 1)
    bins.set(bin3, bins.get(bin3) + 1)
    bins.set(bin4, bins.get(bin4) + 1)
    bins.set(bin5, bins.get(bin5) + 1)
    bins.set(bin6, bins.get(bin6) + 1)
    bins.set(bin7, bins.get(bin7) + 1)
    bins.set(bin8, bins.get(bin8) + 1)
    bins.set(bin9, bins.get(bin9) + 1)
    
    float max_bin = array.max(bins)
    float avg_val = 50.0
    int avg_bin_idx = math.floor((avg_val - min_z) / range_z * (NUM_BINS - 0.01))
    avg_bin_idx := math.max(0, math.min(NUM_BINS - 1, avg_bin_idx))
    
    string[] blocks = array.from(" ", "▂", "▃", "▄", "▅", "▆", "▇", "█")
    string dist_str1 = ""
    
    label.new(bar_index, close, "bins_ok=" + str.tostring(array.max(bins)) + " avg_bin=" + str.tostring(avg_bin_idx) + " max_bin=" + str.tostring(max_bin), color=color.red, size=size.tiny)
    
    for i = 0 to NUM_BINS - 1
        float b = bins.get(i)
        int block_idx = max_bin > 0 ? math.round((b / max_bin) * 7) : 0
        if i == avg_bin_idx
            dist_str1 += "┃"
        else
            dist_str1 += blocks.get(block_idx)
    
    label.new(bar_index + 1, close, "sparkline=[" + dist_str1 + "]", color=color.blue, size=size.tiny)
    label.new(bar_index + 2, close, "chars=" + str.tostring(str.length(dist_str1)), color=color.green, size=size.tiny)
`;

function execute(source: string) {
  const { ast } = parse(source);
  const compileResult = compile(ast);
  const engine = new ExecutionEngine(compileResult);
  const contexts = barsToContext(5);
  return engine.executeBars(contexts);
}

describe('Minimal distribution test', () => {
  it('bins + array.from + sparkline with known values', () => {
    const result = execute(MINIMAL_TEST);
    expect(result.success).toBe(true);

    const labels = (result as any).labels ?? [];
    console.log('\n=== LABELS ===');
    labels.forEach((l: any, i: number) => {
      console.log(`  [${i}] ${l.text}`);
    });

    // Find the sparkline label
    const sparklineLabel = labels.find((l: any) => l.text.startsWith('sparkline='));
    expect(sparklineLabel).toBeDefined();

    const sparkline = sparklineLabel.text.replace('sparkline=[', '').replace(']', '');
    console.log('\n=== SPARKLINE CONTENT ===');
    console.log('Length:', sparkline.length);
    const chars = [...sparkline];
    chars.forEach((ch, j) => {
      const code = ch.codePointAt(0)!;
      if (ch !== ' ') {
        console.log(`  [${j}] U+${code.toString(16).toUpperCase().padStart(4, '0')} "${ch}"`);
      }
    });

    // Should have at least some block chars (we put 10 items in 10 different bins)
    const BLOCK_CHARS = /[\u2581-\u2588]/;
    const hasBlocks = BLOCK_CHARS.test(sparkline);
    console.log('\nHas block chars:', hasBlocks);
    expect(hasBlocks).toBe(true);

    // Should have the avg marker
    expect(sparkline).toContain('┃');
  });
});
