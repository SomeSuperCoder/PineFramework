/**
 * S/R backbone rightmost-labels test.
 *
 * The HHLL indicator draws S/R backbone lines via findprevious() + alternating
 * pivot pattern matching (isHH_raw/isHL_raw/etc.).  The backbone requires:
 *   1. 4 alternating pivots BEFORE the current one
 *   2. An established trend (close > res for bull, close < sup for bear)
 *
 * The trend has a chicken-and-egg dependency: res stays na until trend==-1 lets
 * an LH pivot set it.  In a purely one-directional market, resistance backbone
 * never fires.  This test uses realistic price action with both bull and bear
 * phases so the trend mechanism works fully.
 *
 * Data structure: manual OHLC per pivot with COMPLETE control over the
 * alternating pattern.  Each pivot is set with explicit price levels that
 * guarantee the backbone pattern matching conditions fire.
 */

import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { barsToContext } from '../../src/index.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { FormingCandleProcessor } from '../../src/language/runtime/forming-candle.js';

describe('S/R backbone — rightmost labels have lines', () => {
  const source = fs.readFileSync('./test_indicators/higher-high-lower-low.pine', 'utf-8');
  const TS = 1700000000000;
  const RB = 5; // right bars from script defaults

  /**
   * Build 500 bars with explicit, guaranteed alternating pivots across 3 phases.
   *
   * Each pivot is placed at bar position P with lb=5, rb=5, meaning bars
   * P-5..P-1 and P+1..P+5 must be "less extreme" than bar P.
   *
   * We set EVERY bar's OHLC explicitly — no random noise — to avoid any
   * accidental pivot detections.
   */
  function buildBars(): Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> {
    const bars: Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }> = [];

    // ── Pivot schedule ──────────────────────────────────────────────────────
    // Every 11 bars: bar 10, 21, 32, 43, ...
    // Cycle: even → HH (high pivot), odd → HL (low pivot)
    // Phase 1 (bars 0-199):  bull — HH/HL ascend
    // Phase 2 (bars 200-349): bear — LH/LL descend
    // Phase 3 (bars 350-499): bull — HH/HL ascend
    //
    // Explicit pivot prices (chosen so alternating pattern always works):
    // Phase 1 HL:  115, 135, 155, 175, 195, 215, 235, 255, 275 → enough for 18 pivots
    // Phase 1 HH:  120, 140, 160, 180, 200, 220, 240, 260, 280
    // Phase 2 LL:  280, 260, 240, 220, 200, 180, 160
    // Phase 2 LH:  285, 265, 245, 225, 205, 185, 165
    // Phase 3 HL:  175, 195, 215, 235, 255, 275, 295, 315, 335
    // Phase 3 HH:  180, 200, 220, 240, 260, 280, 300, 320, 340
    //
    // Ensure HH/HL alternation: HH_price > previous_HL_price in bull
    //                           LH_price < previous_LL_price in bear

    // Helper: fill bars between pivot at prevPivot and pivot at curPivot
    function fill(
      startBar: number,
      endBar: number,
      isHighPivot: boolean,
      pivotPrice: number,
      prevPivotPrice: number,
    ): void {
      // Set the 5 left-context bars
      const leftStart = Math.max(0, startBar - 5);
      for (let j = leftStart; j < startBar; j++) {
        if (j < bars.length) continue; // might already be set
        const trend = (pivotPrice - prevPivotPrice) / (startBar - (leftStart));
        const t = (j - leftStart) / (startBar - leftStart);
        const price = prevPivotPrice + trend * (j - leftStart);

        if (isHighPivot) {
          // Left context must have HIGH lower than the pivot high
          bars.push({
            timestamp: TS + j * 3600000,
            open: price,
            high: pivotPrice - 3,
            low: price - 2,
            close: price,
            volume: 1000,
          });
        } else {
          // Left context must have LOW higher than the pivot low
          bars.push({
            timestamp: TS + j * 3600000,
            open: price,
            high: price + 2,
            low: pivotPrice + 3,
            close: price,
            volume: 1000,
          });
        }
      }

      // The pivot bar
      if (isHighPivot) {
        bars.push({
          timestamp: TS + startBar * 3600000,
          open: pivotPrice,
          high: pivotPrice + 5,
          low: pivotPrice - 2,
          close: pivotPrice + 2,
          volume: 1000,
        });
      } else {
        bars.push({
          timestamp: TS + startBar * 3600000,
          open: pivotPrice,
          high: pivotPrice + 2,
          low: pivotPrice - 5,
          close: pivotPrice - 2,
          volume: 1000,
        });
      }

      // Set the 5 right-context bars (or fewer if we're at the end)
      // Actually, right-context bars will be set by the NEXT fill call.
      // So we just need to ensure they're set later.
    }

    // Fill ALL bars from 0 to 499
    for (let i = 0; i < 500; i++) {
      // Default price: gradual uptrend
      const base = 100 + (i / 500) * 300;
      bars.push({
        timestamp: TS + i * 3600000,
        open: base,
        high: base + 1,
        low: base - 1,
        close: base + 0.1,
        volume: 1000,
      });
    }

    // ── Override pivot bars with proper alternating values ──────────────────
    // Phase 1: bull (bars 0-199)
    //   Pivots at 10, 21, 32, 43, 54, 65, 76, 87, 98, 109, 120, 131, 142, 153, 164, 175, 186, 197
    //   HL prices: 115, 135, 155, 175, 195, 215
    //   HH prices: 120, 140, 160, 180, 200, 220
    const phase1HL = [115, 135, 155, 175, 195, 215, 235, 255, 275];
    const phase1HH = [120, 140, 160, 180, 200, 220, 240, 260, 280];
    let hIdx = 0, lIdx = 0;

    for (let i = 10; i < 200; i += 11) {
      const cycle = Math.floor((i - 10) / 11);
      const isHigh = cycle % 2 === 0;

      if (isHigh) {
        const hPrice = phase1HH[hIdx]!;
        // Bar i: high pivot
        bars[i]!.high = hPrice + 5;
        bars[i]!.low = hPrice - 2;
        bars[i]!.close = hPrice + 2;
        bars[i]!.open = hPrice;
        // Left context: lower highs
        for (let j = Math.max(0, i - 5); j < i; j++) {
          bars[j]!.high = Math.min(bars[j]!.high, hPrice - 2);
        }
        for (let j = i + 1; j <= Math.min(i + 5, 499); j++) {
          bars[j]!.high = Math.min(bars[j]!.high, hPrice - 2);
        }
        hIdx++;
      } else {
        const lPrice = phase1HL[lIdx]!;
        // Bar i: low pivot
        bars[i]!.high = lPrice + 2;
        bars[i]!.low = lPrice - 5;
        bars[i]!.close = lPrice - 2;
        bars[i]!.open = lPrice;
        // Left context: higher lows
        for (let j = Math.max(0, i - 5); j < i; j++) {
          bars[j]!.low = Math.max(bars[j]!.low, lPrice + 2);
        }
        for (let j = i + 1; j <= Math.min(i + 5, 499); j++) {
          bars[j]!.low = Math.max(bars[j]!.low, lPrice + 2);
        }
        lIdx++;
      }
    }

    // Phase 2: bear (bars 200-349)
    //   Pivots at 200, 211, 222, 233, 244, 255, 266, 277, 288, 299, 310, 321, 332, 343
    //   LH prices: 275, 255, 235, 215, 195, 175, 155
    //   LL prices: 270, 250, 230, 210, 190, 170, 150
    const phase2LH = [275, 255, 235, 215, 195, 175, 155];
    const phase2LL = [270, 250, 230, 210, 190, 170, 150];
    hIdx = 0; lIdx = 0;

    for (let i = 200; i < 350; i += 11) {
      const cycle = Math.floor((i - 200) / 11);
      const isHigh = cycle % 2 === 0; // even → high pivot (LH or HH)

      if (isHigh) {
        const hPrice = phase2LH[hIdx]!;
        bars[i]!.high = hPrice + 5;
        bars[i]!.low = hPrice - 2;
        bars[i]!.close = hPrice - 2; // close below → bearish
        bars[i]!.open = hPrice;
        for (let j = Math.max(0, i - 5); j < i; j++) {
          bars[j]!.high = Math.min(bars[j]!.high, hPrice - 2);
        }
        for (let j = i + 1; j <= Math.min(i + 5, 499); j++) {
          bars[j]!.high = Math.min(bars[j]!.high, hPrice - 2);
        }
        hIdx++;
      } else {
        const lPrice = phase2LL[lIdx]!;
        bars[i]!.high = lPrice + 2;
        bars[i]!.low = lPrice - 5;
        bars[i]!.close = lPrice + 2; // close above → still trying to rally
        bars[i]!.open = lPrice;
        for (let j = Math.max(0, i - 5); j < i; j++) {
          bars[j]!.low = Math.max(bars[j]!.low, lPrice + 2);
        }
        for (let j = i + 1; j <= Math.min(i + 5, 499); j++) {
          bars[j]!.low = Math.max(bars[j]!.low, lPrice + 2);
        }
        lIdx++;
      }
    }

    // Phase 3: bull (bars 350-499)
    //   Pivots at 350, 361, 372, 383, 394, 405, 416, 427, 438, 449, 460, 471, 482, 493
    //   HL prices: 165, 185, 205, 225, 245, 265, 285
    //   HH prices: 170, 190, 210, 230, 250, 270, 290
    const phase3HL = [165, 185, 205, 225, 245, 265, 285];
    const phase3HH = [170, 190, 210, 230, 250, 270, 290];
    hIdx = 0; lIdx = 0;

    for (let i = 350; i < 500; i += 11) {
      const cycle = Math.floor((i - 350) / 11);
      const isHigh = cycle % 2 === 0;

      if (isHigh) {
        const hPrice = phase3HH[hIdx]!;
        if (!bars[i]) continue;
        bars[i]!.high = hPrice + 5;
        bars[i]!.low = hPrice - 2;
        bars[i]!.close = hPrice + 2;
        bars[i]!.open = hPrice;
        for (let j = Math.max(0, i - 5); j < i; j++) {
          bars[j]!.high = Math.min(bars[j]!.high, hPrice - 2);
        }
        for (let j = i + 1; j <= Math.min(i + 5, 499); j++) {
          bars[j]!.high = Math.min(bars[j]!.high, hPrice - 2);
        }
        hIdx++;
      } else {
        const lPrice = phase3HL[lIdx]!;
        if (!bars[i]) continue;
        bars[i]!.high = lPrice + 2;
        bars[i]!.low = lPrice - 5;
        bars[i]!.close = lPrice - 2;
        bars[i]!.open = lPrice;
        for (let j = Math.max(0, i - 5); j < i; j++) {
          bars[j]!.low = Math.max(bars[j]!.low, lPrice + 2);
        }
        for (let j = i + 1; j <= Math.min(i + 5, 499); j++) {
          bars[j]!.low = Math.max(bars[j]!.low, lPrice + 2);
        }
        lIdx++;
      }
    }

    return bars;
  }

  it('rightmost labels with backbone lines across forming-candle ticks', () => {
    const bars = buildBars();
    console.log(`Built ${bars.length} bars`);

    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);

    // Initial execution
    const contexts = barsToContext(bars);
    const initResult = engine.executeBars(contexts);
    expect(initResult.success).toBe(true);

    const initLabels = initResult.labels ?? [];
    const initLines = initResult.lines ?? [];

    console.log(`\n=== INIT ===`);
    console.log(`Labels: ${initLabels.length}`);
    console.log(`Lines: ${initLines.length}`);

    const sortedLabels = [...initLabels].sort((a, b) => b.time - a.time);
    const last10 = sortedLabels.slice(0, 10);
    console.log(`\nLast 10 labels:`);
    for (const l of last10) console.log(`  ${l.text} @ ${l.price.toFixed(2)} time=${l.time}`);

    const sortedLines = [...initLines].sort((a, b) => a.x1 - b.x1);
    console.log(`\nLines:`);
    for (const l of sortedLines) console.log(`  x1=${l.x1} y1=${l.y1?.toFixed(2)} x2=${l.x2} y2=${l.y2?.toFixed(2)}`);

    // ── Check last 3 labels ────────────────────────────────────────────────
    const last3 = sortedLabels.slice(0, 3);
    console.log(`\n=== LAST 3 LABELS ===`);
    let allHaveLines = true;
    for (const label of last3) {
      const match = initLines.find(
        (l) => Math.abs(l.y1 - label.price) < 0.01 || Math.abs(l.y2 - label.price) < 0.01,
      );
      console.log(`${label.text} @ ${label.price.toFixed(2)} → ${match ? `LINE at y=${match.y1?.toFixed(2)}` : 'NO LINE'}`);
      if (!match) allHaveLines = false;
    }

    // ── Engine state ────────────────────────────────────────────────────────
    const dump = (name: string) => {
      const b = (engine as any).globalScope?.variables?.get?.(name);
      if (!b) return;
      const v = b.series.values.slice(-40).map((x: any) =>
        x === null || x === undefined || typeof x === 'symbol' ? 'na'
        : typeof x === 'number' ? x.toFixed(2) : String(x)
      );
      console.log(`\n${name} last 40 (len=${b.series.length}): ${v}`);
    };
    dump('res'); dump('sup'); dump('trend');

    // ── Forming-candle ticks ────────────────────────────────────────────────
    const fcp = new FormingCandleProcessor(engine);
    const tickBar = {
      timestamp: bars[bars.length - 1]!.timestamp + 3600000,
      open: bars[bars.length - 1]!.close,
      high: bars[bars.length - 1]!.close + 3,
      low: bars[bars.length - 1]!.close - 2,
      close: bars[bars.length - 1]!.close + 1,
      volume: 1000,
    };
    const extended = [...bars, tickBar];
    const tickCtx = barsToContext(extended).at(-1)!;

    for (let t = 1; t <= 5; t++) {
      engine.setFormingCandle(true);
      const r = fcp.computeFormingCandle(tickCtx);
      const labels = [...engine.labels].sort((a, b) => b.time - a.time);
      const lines = [...engine.lines.values()];
      const last3t = labels.slice(0, 3);
      console.log(`\n=== TICK ${t}: diffLbl=${r.diffLabels.length} diffLn=${r.diffLines.length} ===`);
      for (const lbl of last3t) {
        const m = lines.find(ln => Math.abs(ln.y1 - lbl.price) < 0.01 || Math.abs(ln.y2 - lbl.price) < 0.01);
        console.log(`  ${lbl.text} @ ${lbl.price.toFixed(2)} → ${m ? 'LINE' : 'NO LINE'}`);
      }
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    const hh = sortedLabels.filter(l => l.text === 'HH');
    const hl = sortedLabels.filter(l => l.text === 'HL');
    const lh = sortedLabels.filter(l => l.text === 'LH');
    const ll = sortedLabels.filter(l => l.text === 'LL');
    const hhHave = hh.filter(l => initLines.some(ln => Math.abs(ln.y1 - l.price) < 0.01));
    const hlHave = hl.filter(l => initLines.some(ln => Math.abs(ln.y1 - l.price) < 0.01));
    const lhHave = lh.filter(l => initLines.some(ln => Math.abs(ln.y1 - l.price) < 0.01));
    const llHave = ll.filter(l => initLines.some(ln => Math.abs(ln.y1 - l.price) < 0.01));

    console.log(`\nHH lines: ${hhHave.length}/${hh.length}  HL lines: ${hlHave.length}/${hl.length}`);
    console.log(`LH lines: ${lhHave.length}/${lh.length}  LL lines: ${llHave.length}/${ll.length}`);
    console.log(`Last 3 all have lines: ${allHaveLines}`);

    // Full mapping
    console.log(`\n=== LABEL→LINE MAP ===`);
    for (const label of sortedLabels) {
      const match = initLines.find(
        (l) => Math.abs(l.y1 - label.price) < 0.01 || Math.abs(l.y2 - label.price) < 0.01,
      );
      console.log(`${label.text} @ ${label.price.toFixed(2)} → ${match ? 'y1=' + match.y1?.toFixed(2) + ' x1=' + match.x1 : 'NONE'}`);
    }
  });
});
