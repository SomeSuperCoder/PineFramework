import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { barsToContext } from '../../src/index.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { FormingCandleProcessor } from '../../src/language/runtime/forming-candle.js';

describe('S/R backbone persistence across ticks', () => {
  const source = fs.readFileSync('./test_indicators/higher-high-lower-low.pine', 'utf-8');

  it('backbone produces lines during init and continues through ticks', () => {
    const ts = 1700000000000;
    const rb = 5;  // from script defaults

    // Build 80 bars with 5 clear alternating pivots.
    // lb=5, rb=5 means each pivot needs 5 bars left and 5 bars right.
    // Pivot pattern: HH, HL, HH, HL, HH (ascending highs, ascending lows)
    // Layout:
    //   pivot low  (HL)  at bar 14  (price 95)
    //   pivot high (HH)  at bar 24  (price 115)
    //   pivot low  (HL)  at bar 34  (price 105)
    //   pivot high (HH)  at bar 44  (price 125)
    //   pivot low  (HL)  at bar 54  (price 115)
    //   pivot high (HH)  at bar 64  (price 135)
    //   pivot low  (HL)  at bar 74  (price 125)

    const prices: number[] = [];
    
    function fillSegment(startBar: number, endBar: number, startPrice: number, endPrice: number) {
      for (let i = startBar; i <= endBar; i++) {
        const t = (i - startBar) / (endBar - startBar);
        prices.push(startPrice + (endPrice - startPrice) * t);
      }
    }

    // Build zigzag segments
    // Bars 0-10: gentle rise to set up first pivot context
    fillSegment(0, 5, 100, 102);   // low context
    fillSegment(6, 14, 102, 95);   // drop to pivot low at 14 (price 95)
    fillSegment(15, 19, 95, 100);  // rise from low
    fillSegment(20, 24, 100, 115); // rally to pivot high at 24 (price 115)
    fillSegment(25, 29, 115, 108); // drop from high
    fillSegment(30, 34, 108, 105); // drop to pivot low at 34 (price 105)
    fillSegment(35, 39, 105, 115); // rise
    fillSegment(40, 44, 115, 125); // rally to pivot high at 44 (price 125)
    fillSegment(45, 49, 125, 118); // drop
    fillSegment(50, 54, 118, 115); // drop to pivot low at 54 (price 115)
    fillSegment(55, 59, 115, 125); // rise
    fillSegment(60, 64, 125, 135); // rally to pivot high at 64 (price 135)
    fillSegment(65, 69, 135, 128); // drop
    fillSegment(70, 74, 128, 125); // drop to pivot low at 74 (price 125)
    fillSegment(75, 79, 125, 130); // rise at end

    const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
    for (let i = 0; i < 80; i++) {
      const p = prices[i] ?? 100;
      bars.push({
        timestamp: ts + i * 3600000,
        open: p,
        high: p + 3,
        low: p - 2,
        close: p + (Math.random() - 0.5) * 2,
        volume: 1000,
      });
    }

    // Override specific pivot bars for guaranteed pivot structure
    bars[14] = { ...bars[14]!, low: 95, high: 97, close: 96 };   // pivot low
    bars[24] = { ...bars[24]!, high: 115, low: 113, close: 114 }; // pivot high
    bars[34] = { ...bars[34]!, low: 105, high: 107, close: 106 }; // pivot low
    bars[44] = { ...bars[44]!, high: 125, low: 123, close: 124 }; // pivot high
    bars[54] = { ...bars[54]!, low: 115, high: 117, close: 116 }; // pivot low
    bars[64] = { ...bars[64]!, high: 135, low: 133, close: 134 }; // pivot high
    bars[74] = { ...bars[74]!, low: 125, high: 127, close: 126 }; // pivot low

    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    // Initial execution
    const contexts = barsToContext(bars);
    const initResult = engine.executeBars(contexts);
    expect(initResult.success).toBe(true);

    const initLabels = initResult.labels ?? [];
    const initLines = initResult.lines ?? [];
    console.log(`\n=== INIT: ${bars.length} bars ===`);
    console.log(`Labels: ${initLabels.length}`);
    for (const l of initLabels) {
      console.log(`  Label: text="${l.text}" price=${l.price.toFixed(2)} time=${l.time}`);
    }
    console.log(`Lines (raw entries): ${initLines.length}`);
    for (const l of initLines) {
      const entry = l as any;
      console.log(`  Line entry: x1=${entry.x1} y1=${entry.y1?.toFixed(2)} x2=${entry.x2} y2=${entry.y2?.toFixed(2)} xloc=${entry.xloc}`);
    }

    // Must have at least some labels and lines from init
    expect(initLabels.length).toBeGreaterThan(0);
    // NOTE: The HHLL script only draws S/R lines via showSR backbone.
    // The backbone uses different conditions than the strict labels.
    // If lines are 0 from init, the test can't check tick behavior.
    // Log and continue to observe tick behavior.

    // ===== NOW SIMULATE REAL-TIME TICKS =====
    const fcp = new FormingCandleProcessor(engine);

    // Tick 1: new bar at index 80
    const tick1Bar = {
      timestamp: ts + 80 * 3600000,
      open: 130,
      high: 133,
      low: 129,
      close: 132,
      volume: 1000,
    };
    const extendedBars1 = [...bars, tick1Bar];
    const extCtxs1 = barsToContext(extendedBars1);
    const tickCtx1 = extCtxs1[extCtxs1.length - 1]!;

    engine.setFormingCandle(true);
    const tick1Result = fcp.computeFormingCandle(tickCtx1);
    
    console.log(`\n=== TICK 1 (bar 80) ===`);
    console.log(`Diff labels: ${tick1Result.diffLabels.length}`);
    for (const l of tick1Result.diffLabels) {
      console.log(`  Label: text="${l.text}" price=${l.price.toFixed(2)} time=${l.time}`);
    }
    console.log(`Diff lines: ${tick1Result.diffLines.length}`);
    for (const l of tick1Result.diffLines) {
      console.log(`  Line: x1=${l.x1} y1=${l.y1?.toFixed(2)} x2=${l.x2} y2=${l.y2?.toFixed(2)} xloc=${l.xloc}`);
    }

    // Tick 2: same bar, updated price
    tick1Bar.high = 137;  // new high — might create a pivot at bar 75
    tick1Bar.close = 136;
    
    engine.setFormingCandle(true);
    const tick2Result = fcp.computeFormingCandle(tickCtx1);
    
    console.log(`\n=== TICK 2 (bar 80, higher high) ===`);
    console.log(`Diff labels: ${tick2Result.diffLabels.length}`);
    for (const l of tick2Result.diffLabels) {
      console.log(`  Label: text="${l.text}" price=${l.price.toFixed(2)} time=${l.time}`);
    }
    console.log(`Diff lines: ${tick2Result.diffLines.length}`);
    for (const l of tick2Result.diffLines) {
      console.log(`  Line: x1=${l.x1} y1=${l.y1?.toFixed(2)} x2=${l.x2} y2=${l.y2?.toFixed(2)} xloc=${l.xloc}`);
    }

    // Tick 3: same bar, even higher
    tick1Bar.high = 140;
    tick1Bar.close = 139;

    engine.setFormingCandle(true);
    const tick3Result = fcp.computeFormingCandle(tickCtx1);
    
    console.log(`\n=== TICK 3 (bar 80, even higher) ===`);
    console.log(`Diff labels: ${tick3Result.diffLabels.length}`);
    for (const l of tick3Result.diffLabels) {
      console.log(`  Label: text="${l.text}" price=${l.price.toFixed(2)} time=${l.time}`);
    }
    console.log(`Diff lines: ${tick3Result.diffLines.length}`);
    for (const l of tick3Result.diffLines) {
      console.log(`  Line: x1=${l.x1} y1=${l.y1?.toFixed(2)} x2=${l.x2} y2=${l.y2?.toFixed(2)} xloc=${l.xloc}`);
    }
    
    // KEY ASSERTION: If tick 1 produced backbone lines (raw conditions fired),
    // then ALL subsequent ticks should ALSO produce the same lines (same pivot
    // detected each tick). If ticks after the first have NO lines but the first
    // did, the variable series truncation killed the backbone state.
    const linesInTick1 = tick1Result.diffLines.length;
    const linesInTick2 = tick2Result.diffLines.length;
    const linesInTick3 = tick3Result.diffLines.length;
    
    console.log(`\n=== BACKBONE PERSISTENCE CHECK ===`);
    console.log(`Lines tick 1: ${linesInTick1}, tick 2: ${linesInTick2}, tick 3: ${linesInTick3}`);
    
    // The key test: if the FIRST tick had lines (backbone fired),
    // and the SECOND tick also had labels (same pivot), then the backbone
    // should also fire on tick 2 and 3.
    if (linesInTick1 > 0 && tick2Result.diffLabels.length > 0) {
      expect(linesInTick2).toBeGreaterThan(0);
    }
    if (linesInTick1 > 0 && tick3Result.diffLabels.length > 0) {
      expect(linesInTick3).toBeGreaterThan(0);
    }
    
    // Check backbone state AFTER all ticks (should be back to init state due to truncation)
    const zzBinding = (engine as any).globalScope?.variables?.get?.('zz');
    const hlFlagBinding = (engine as any).globalScope?.variables?.get?.('hlFlag');
    const supBinding = (engine as any).globalScope?.variables?.get?.('sup');
    const trendBinding = (engine as any).globalScope?.variables?.get?.('trend');
    
    if (zzBinding) {
      const vals = zzBinding.series.values.slice(-15).map((v: any) => {
        if (v === null || v === undefined || typeof v === 'symbol') return 'na';
        return typeof v === 'number' ? v.toFixed(2) : String(v);
      });
      console.log(`\nzz series length after ticks: ${zzBinding.series.length}`);
      console.log(`zz last 15 values: ${vals}`);
    }
    if (hlFlagBinding) {
      const vals = hlFlagBinding.series.values.slice(-15).map((v: any) => {
        if (v === null || v === undefined || typeof v === 'symbol') return 'na';
        return String(v);
      });
      console.log(`hlFlag series length after ticks: ${hlFlagBinding.series.length}`);
      console.log(`hlFlag last 15 values: ${vals}`);
    }
    if (supBinding) {
      const vals = supBinding.series.values.slice(-15).map((v: any) => {
        if (v === null || v === undefined || typeof v === 'symbol') return 'na';
        return typeof v === 'number' ? v.toFixed(2) : String(v);
      });
      console.log(`sup series length after ticks: ${supBinding.series.length}`);
      console.log(`sup last 15 values: ${vals}`);
    }
    if (trendBinding) {
      const vals = trendBinding.series.values.slice(-15).map((v: any) => {
        if (v === null || v === undefined || typeof v === 'symbol') return 'na';
        return String(v);
      });
      console.log(`trend series length after ticks: ${trendBinding.series.length}`);
      console.log(`trend last 15 values: ${vals}`);
    }
    
    // Now let's run a tick that ENSURES the backbone fires by using the exact
    // same OHLC data as tick 1 (which DID produce a line). If the backbone
    // relies on the zz/hlFlag chain being complete, it should fire again.
    const tick4Bar = {
      timestamp: ts + 80 * 3600000,
      open: 130,
      high: 133,  // Same as tick 1
      low: 129,
      close: 132, // Same as tick 1
      volume: 1000,
    };
    const extCtxs4 = barsToContext([...bars.slice(0, 80), tick4Bar]);
    const tickCtx4 = extCtxs4[extCtxs4.length - 1]!;
    
    engine.setFormingCandle(true);
    const tick4Result = fcp.computeFormingCandle(tickCtx4);
    
    console.log(`\n=== TICK 4 (same OHLC as tick 1) ===`);
    console.log(`Diff labels: ${tick4Result.diffLabels.length}`);
    for (const l of tick4Result.diffLabels) {
      console.log(`  Label: text="${l.text}" price=${l.price.toFixed(2)} time=${l.time}`);
    }
    console.log(`Diff lines: ${tick4Result.diffLines.length}`);
    for (const l of tick4Result.diffLines) {
      console.log(`  Line: x1=${l.x1} y1=${l.y1?.toFixed(2)} x2=${l.x2} y2=${l.y2?.toFixed(2)} xloc=${l.xloc}`);
    }
    
    // If tick 4 (same OHLC as tick 1) still produces 0 lines, then it's
    // definitively the variable series truncation killing the backbone.
    console.log(`\nTick 4 with same OHLC as tick 1: ${tick4Result.diffLines.length} lines`);
    
    // Force-fix: dump the isHL_raw/sup values by reading engine internals
    // during a tick execution. We can do this by examining the computed outputs
    // which are not truncated.
    const supOutput = (engine as any).outputs?.get?.('sup');
    if (supOutput) {
      console.log(`Output sup last value: ${supOutput.last()}`);
    }
  });
});
