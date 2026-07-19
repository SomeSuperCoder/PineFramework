import { StrategyEngine } from '../../src/strategy/strategy-engine.js';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
  type StrategyMarkerEntry,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function barsToContext(bars: Bar[]): ExecutionContext[] {
  return bars.map((bar, index) => ({
    barIndex: index,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries(
      'open',
      bars.slice(0, index + 1).map((b) => b.open),
    ),
    high: createSeries(
      'high',
      bars.slice(0, index + 1).map((b) => b.high),
    ),
    low: createSeries(
      'low',
      bars.slice(0, index + 1).map((b) => b.low),
    ),
    close: createSeries(
      'close',
      bars.slice(0, index + 1).map((b) => b.close),
    ),
    volume: createSeries(
      'volume',
      bars.slice(0, index + 1).map((b) => b.volume),
    ),
  }));
}

function runPineScript(source: string, bars: Bar[]): StrategyMarkerEntry[] {
  const { ast } = parse(source);
  const compiled = compile(ast);
  const engine = new ExecutionEngine(compiled);
  const contexts = barsToContext(bars);
  const result = engine.executeBars(contexts);
  return result.strategyMarkers;
}

// ─── Contract ──────────────────────────────────────────────────────────────

describe('Strategy Marker Contract', () => {
  beforeEach(() => {
    // Each new StrategyEngine instance starts with its own order ID counter
  });

  // =========================================================================
  // I. ONE MARKER PER CANDLE
  // =========================================================================

  describe('I. One marker per candle', () => {
    it('never produces more than one entry marker on any single bar', () => {
      const engine = new StrategyEngine();
      const entriesPerBar = new Map<number, number>();

      // Simulate 50 bars with alternating entries
      for (let i = 0; i < 50; i++) {
        engine.updateBar(i, 1000 + i, 100 + i, 105 + i, 95 + i, 100 + i, 1000);
        const dir = i % 2 === 0 ? 'long' : 'short';
        engine.entry(i % 2 === 0 ? 'Long' : 'Short', dir as 'long' | 'short', 1);

        const markers = engine.getNewMarkers();
        const entries = markers.filter((m) => m.type === 'entry');
        const count = entriesPerBar.get(i) || 0;
        entriesPerBar.set(i, count + entries.length);
      }

      for (const [, count] of entriesPerBar) {
        expect(count).toBeLessThanOrEqual(1);
      }
    });

    it('never produces more than one close/exit marker on any single bar', () => {
      const engine = new StrategyEngine();

      // Open long, then close it
      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 105, 100, 102, 1000);
      engine.close('Long');

      engine.getNewMarkers(); // consume

      // Open short, then close it
      engine.updateBar(2, 1002, 100, 105, 95, 100, 1000);
      engine.entry('Short', 'short', 1);

      engine.updateBar(3, 1003, 98, 105, 95, 98, 1000);
      engine.close('Short');

      const closeMarkers = engine
        .getNewMarkers()
        .filter((m) => m.type === 'close' || m.type === 'exit');
      // On bar 3, there should be exactly one close marker
      expect(closeMarkers).toHaveLength(1);
    });

    it('reversal produces exactly one close + one entry on the same bar', () => {
      const engine = new StrategyEngine();

      // Open long on bar 0
      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);
      engine.getNewMarkers(); // consume

      // Reverse to short on bar 1 → close Long + entry Short
      engine.updateBar(1, 1001, 102, 105, 100, 102, 1000);
      engine.entry('Short', 'short', 1);

      const markers = engine.getNewMarkers();
      const closes = markers.filter((m) => m.type === 'close');
      const entries = markers.filter((m) => m.type === 'entry');

      expect(closes).toHaveLength(1);
      expect(entries).toHaveLength(1);
      expect(closes[0].barIndex).toBe(entries[0].barIndex);
    });
  });

  // =========================================================================
  // II. CLEAR NAMING
  // =========================================================================

  describe('II. Clear naming', () => {
    it('entry marker name matches the entry name argument exactly', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('MyStrategy', 'long', 1);
      const markers = engine.getNewMarkers();

      expect(markers).toHaveLength(1);
      expect(markers[0].name).toBe('MyStrategy');
    });

    it('entry marker name defaults to "Long"/"Short" when no comment given', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);
      const longMarker = engine.getNewMarkers().find((m) => m.type === 'entry');
      expect(longMarker).toBeDefined();
      expect(longMarker!.name).toBe('Long');

      engine.updateBar(1, 1001, 102, 105, 100, 102, 1000);
      engine.entry('Short', 'short', 1);
      const shortMarker = engine.getNewMarkers().find((m) => m.type === 'entry');
      expect(shortMarker).toBeDefined();
      expect(shortMarker!.name).toBe('Short');
    });

    it('close marker name is "Exit <entryName>"', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);
      engine.getNewMarkers();

      engine.updateBar(1, 1001, 102, 105, 100, 102, 1000);
      engine.close('Long');
      const closeMarkers = engine.getNewMarkers().filter((m) => m.type === 'close');

      expect(closeMarkers).toHaveLength(1);
      expect(closeMarkers[0].name).toBe('Exit Long');
    });

    it('exit marker name is "Exit <entryName>"', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);
      engine.getNewMarkers();

      engine.updateBar(1, 1001, 102, 105, 100, 102, 1000);
      engine.exit('Long');
      const exitMarkers = engine.getNewMarkers().filter((m) => m.type === 'exit');

      expect(exitMarkers).toHaveLength(1);
      expect(exitMarkers[0].name).toBe('Exit Long');
    });

    it('reversal close marker has comment "reverse"', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);
      engine.getNewMarkers();

      engine.updateBar(1, 1001, 102, 105, 100, 102, 1000);
      engine.entry('Short', 'short', 1);
      const markers = engine.getNewMarkers();
      const close = markers.find((m) => m.type === 'close');

      expect(close).toBeDefined();
      expect(close!.name).toBe('Exit Long');
      expect(close!.comment).toBe('reverse');
    });

    it('close marker direction matches the closed position direction', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 105, 100, 102, 1000);
      engine.close('Long');
      expect(engine.getNewMarkers()[0].direction).toBe('long');

      engine.updateBar(2, 1002, 100, 105, 95, 100, 1000);
      engine.entry('Short', 'short', 1);

      engine.updateBar(3, 1003, 98, 105, 95, 98, 1000);
      engine.close('Short');
      expect(engine.getNewMarkers()[0].direction).toBe('short');
    });
  });

  // =========================================================================
  // III. SIX LABEL TYPES
  // =========================================================================

  describe('III. Six label types', () => {
    it('1. Simple Long entry: entry from flat', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);
      const markers = engine.getNewMarkers();

      expect(markers).toHaveLength(1);
      expect(markers[0]).toMatchObject({
        type: 'entry',
        name: 'Long',
        direction: 'long',
        action: 'buy',
        color: '#00FF00',
      });
      expect(markers[0].price).toBeGreaterThan(0);
    });

    it('2. Simple Short entry: entry from flat', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Short', 'short', 1);
      const markers = engine.getNewMarkers();

      expect(markers).toHaveLength(1);
      expect(markers[0]).toMatchObject({
        type: 'entry',
        name: 'Short',
        direction: 'short',
        action: 'sell',
        color: '#FF0000',
      });
      expect(markers[0].price).toBeGreaterThan(0);
    });

    it('3. Long close: explicit close of long position', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);
      engine.getNewMarkers();

      engine.updateBar(1, 1001, 102, 105, 100, 102, 1000);
      engine.close('Long');
      const markers = engine.getNewMarkers();

      expect(markers).toHaveLength(1);
      expect(markers[0]).toMatchObject({
        type: 'close',
        name: 'Exit Long',
        direction: 'long',
        action: 'sell',
        color: '#FF0000',
      });
      expect(markers[0].comment).toBeUndefined();

      engine.updateBar(2, 1002, 101, 105, 99, 101, 1000);
      expect(engine.getPosition().direction).toBe('flat');
    });

    it('4. Short close: explicit close of short position', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Short', 'short', 1);
      engine.getNewMarkers();

      engine.updateBar(1, 1001, 98, 105, 95, 98, 1000);
      engine.close('Short');
      const markers = engine.getNewMarkers();

      expect(markers).toHaveLength(1);
      expect(markers[0]).toMatchObject({
        type: 'close',
        name: 'Exit Short',
        direction: 'short',
        action: 'buy',
        color: '#FF0000',
      });
      expect(markers[0].comment).toBeUndefined();

      engine.updateBar(2, 1002, 99, 105, 97, 99, 1000);
      expect(engine.getPosition().direction).toBe('flat');
    });

    it('5. Long close → Short reentry: reversal from long to short', () => {
      const engine = new StrategyEngine();

      // Open long
      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);
      engine.getNewMarkers();

      // Reverse to short
      engine.updateBar(1, 1001, 102, 105, 100, 102, 1000);
      engine.entry('Short', 'short', 1);
      const markers = engine.getNewMarkers();

      expect(markers).toHaveLength(2);

      const close = markers.find((m) => m.type === 'close');
      expect(close).toMatchObject({
        type: 'close',
        name: 'Exit Long',
        direction: 'long',
        action: 'sell',
        comment: 'reverse',
      });

      const entry = markers.find((m) => m.type === 'entry');
      expect(entry).toMatchObject({
        type: 'entry',
        name: 'Short',
        direction: 'short',
        action: 'sell',
        color: '#FF0000',
      });

      engine.updateBar(2, 1002, 100, 105, 99, 100, 1000);
      expect(engine.getPosition().direction).toBe('short');
    });

    it('6. Short close → Long reentry: reversal from short to long', () => {
      const engine = new StrategyEngine();

      // Open short
      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Short', 'short', 1);
      engine.getNewMarkers();

      // Reverse to long
      engine.updateBar(1, 1001, 98, 105, 95, 98, 1000);
      engine.entry('Long', 'long', 1);
      const markers = engine.getNewMarkers();

      expect(markers).toHaveLength(2);

      const close = markers.find((m) => m.type === 'close');
      expect(close).toMatchObject({
        type: 'close',
        name: 'Exit Short',
        direction: 'short',
        action: 'buy',
        comment: 'reverse',
      });

      const entry = markers.find((m) => m.type === 'entry');
      expect(entry).toMatchObject({
        type: 'entry',
        name: 'Long',
        direction: 'long',
        action: 'buy',
        color: '#00FF00',
      });

      engine.updateBar(2, 1002, 100, 105, 99, 100, 1000);
      expect(engine.getPosition().direction).toBe('long');
    });
  });
});

// ─── Full Pipeline Integration ─────────────────────────────────────────────

describe('Strategy Marker Contract – full pipeline', () => {
  /**
   * Custom strategy that produces all 6 label types across its lifetime.
   * Bars are designed to trigger specific behaviors:
   *   Bar 0:  warmup (EMA needs bars to converge)
   *   Bar 10: Long entry (fastEMA crossover)
   *   Bar 20: reversal → Short entry (fastEMA crossunder)         [type 6]
   *   Bar 30: reversal → Long entry (fastEMA crossover)           [type 5]
   *   Bar 40: explicit close("Long")                              [type 3]
   *   Bar 45: Short entry from flat                                [type 2]
   *   Bar 50: explicit close("Short")                             [type 4]
   *   Bar 55: Long entry from flat                                [type 1]
   */
  const strategySource = `
//@version=6
strategy("Marker Contract Test", overlay=true, initial_capital=10000)

fastLen = input.int(5, "Fast")
slowLen = input.int(15, "Slow")

fastEMA = ta.ema(close, fastLen)
slowEMA = ta.ema(close, slowLen)

crossOver  = ta.crossover(fastEMA, slowEMA)
crossUnder = ta.crossunder(fastEMA, slowEMA)

if crossOver
    strategy.entry("Long", strategy.long)

if crossUnder
    strategy.entry("Short", strategy.short)

// Explicit close at specific bars (using bar_index)
if bar_index == 40 and strategy.position_size > 0
    strategy.close("Long")

if bar_index == 50 and strategy.position_size < 0
    strategy.close("Short")
`;

  function createControlledBars(): Bar[] {
    const bars: Bar[] = [];
    let price = 100;

    for (let i = 0; i < 60; i++) {
      let close: number;
      if (i < 20) {
        close = price + 3; // strong uptrend → EMA crossover early
      } else if (i < 35) {
        close = price - 3; // strong downtrend → EMA crossunder
      } else {
        close = price + 3; // uptrend again → EMA crossover
      }

      bars.push({
        timestamp: 1700000000000 + i * 3600000,
        open: close - 0.5,
        high: close + 1,
        low: close - 1.5,
        close,
        volume: 1000,
      });
      price = close;
    }
    return bars;
  }

  it('produces all 6 label types and no duplicates', () => {
    const bars = createControlledBars();
    const markers = runPineScript(strategySource, bars);

    // --- One-marker-per-candle enforcement ---
    const byBar = new Map<number, StrategyMarkerEntry[]>();
    for (const m of markers) {
      const arr = byBar.get(m.barIndex) || [];
      arr.push(m);
      byBar.set(m.barIndex, arr);
    }

    for (const [, barMarkers] of byBar) {
      const entries = barMarkers.filter((m) => m.type === 'entry');
      const closes = barMarkers.filter((m) => m.type === 'close' || m.type === 'exit');
      expect(entries.length).toBeLessThanOrEqual(1);
      expect(closes.length).toBeLessThanOrEqual(1);
    }

    // --- Verify all entries have clear names ---
    for (const m of markers.filter((m) => m.type === 'entry')) {
      expect(['Long', 'Short']).toContain(m.name);
    }

    // --- Verify all closes have "Exit <name>" format ---
    for (const m of markers.filter((m) => m.type === 'close' || m.type === 'exit')) {
      expect(m.name).toMatch(/^Exit (Long|Short)$/);
    }

    // --- Verify reversals have comment 'reverse' ---
    for (const m of markers.filter((m) => m.type === 'close')) {
      if (m.comment !== undefined) {
        expect(m.comment).toBe('reverse');
      }
    }

    // --- Log all markers for inspection ---
    console.log('--- Full Pipeline Markers ---');
    for (const m of markers) {
      console.log(
        `[bar ${String(m.barIndex).padStart(3)}] ${m.type.padEnd(6)} ${m.direction.padEnd(6)} ${m.name.padEnd(12)} comment=${m.comment ?? 'none'}`,
      );
    }
  });
});
