/**
 * REPRODUCTION TEST: Q-Trend real-time plot/shape correctness.
 *
 * Q-Trend produces:
 *   - plot("trend line") — a continuous value `m` at every bar
 *   - plotshape(...) — BUY/SELL/STRONG labels at specific bars
 *
 * The user reports that after real-time updates (forming candle ticks +
 * confirmed bar WS messages), the last N bars have labels but the
 * trend line plot is missing/extinct for those bars.
 *
 * This test simulates:
 *   1. Initial HTTP execution → buildScriptResult
 *   2. Forming candle ticks → mergeDiffIntoResult
 *   3. Confirmed bar WS → buildScriptResult (full replacement) OR
 *      indicator WS path → mergeDiffIntoResult
 *
 * And then checks: every bar that has a shape should also have a
 * trend line value. Conversely, the trend line should extend to
 * every bar.
 */
import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { ScriptResult } from '../../frontend/src/types/index.js';

// ---- Replicas of the frontend functions ----

interface ExecMsg {
  success: boolean;
  overlay: boolean;
  indicatorId?: string;
  outputs: Record<string, (number | string | boolean | null)[]>;
  plotColors?: Record<string, (string | null)[]>;
  fillColorData?: Record<string, (string | null)[]>;
  shapes: Array<{ style: string; location: string; color: string; time: number; text: string; price?: number; overlay?: boolean }>;
  fills: Array<{ from: string; to: string; color: string }>;
  strategyMarkers: Array<any>;
  bgcolor?: Array<{ time: number; color: string }>;
  lines?: Array<{ points: Array<{ time: number; price: number }>; color: string; width?: number; style?: string }>;
  labels?: Array<{ time: number; price: number; text: string; color?: string; textColor?: string; style?: string; size?: string }>;
  boxes?: Array<{ startTime: number; startPrice: number; endTime: number; endPrice: number; borderColor?: string; backgroundColor?: string }>;
  barTimestamps?: number[];
  formingCandle?: boolean;
  alertConditions?: Array<any>;
  alertTriggers?: Array<any>;
  barIndex: number;
  tables?: any[];
  hiddenPlotKeys?: string[];
}

const COLORS = ['#2196f3', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];

function buildScriptResult(
  overlay: boolean,
  outputs: Record<string, (number | string | boolean | null)[]>,
  shapes: ExecMsg['shapes'],
  fills: ExecMsg['fills'],
  strategyMarkers: ExecMsg['strategyMarkers'],
  ohlcvData: Array<{ timestamp: number }>,
  bgcolor?: ExecMsg['bgcolor'],
  plotColors?: Record<string, (string | null)[]>,
  fillColorData?: Record<string, (string | null)[]>,
  lines?: ExecMsg['lines'],
  labels?: ExecMsg['labels'],
  barTimestamps?: number[],
  alertConditions?: Array<any>,
  alertTriggers?: Array<any>,
  boxes?: ExecMsg['boxes'],
  tables?: any[],
  hiddenPlotKeys?: string[],
): ScriptResult {
  const getTimestamp = (i: number): number | undefined => {
    if (barTimestamps && i < barTimestamps.length) return barTimestamps[i]!;
    return ohlcvData[i]?.timestamp;
  };
  const plotData: any[] = [];
  let colorIndex = 0;
  for (const [key, values] of Object.entries(outputs)) {
    let plotColor: string | undefined;
    let lineWidth: number | undefined;
    const lwMatch = key.match(/__lw:(\d+)/);
    const styleMatch = key.match(/__style:([^_]+)/);
    if (lwMatch) lineWidth = parseInt(lwMatch[1], 10);
    const plotStyle = (styleMatch ? styleMatch[1] : 'line');
    const title = key.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '');
    const perBarColors = plotColors?.[key];
    if (!plotColor) plotColor = COLORS[colorIndex % COLORS.length];
    colorIndex++;
    const mappedData = values
      .map((v, i) => {
        const ts = getTimestamp(i);
        if (ts === undefined) return null;
        let numValue: number | null;
        if (v === null || v === undefined) numValue = null;
        else if (typeof v === 'boolean') numValue = v ? 1 : 0;
        else if (typeof v === 'number') numValue = v;
        else numValue = null;
        return { time: Math.floor(ts / 1000), value: numValue, color: perBarColors?.[i] ?? undefined };
      });
    plotData.push({
      type: plotStyle, data: mappedData.filter((d): any => d !== null),
      color: plotColor, lineWidth, title,
    });
  }

  const stripMeta = (s: string) => s.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '').trim();
  const hiddenPlotTitlesList: string[] = (hiddenPlotKeys || []).map((key) => stripMeta(key));

  return {
    overlay,
    plots: plotData,
    shapes: (shapes || []).map((s) => ({
      type: s.style as any, time: Math.floor(s.time / 1000), price: s.price ?? 0,
      color: s.color, text: s.text, textcolor: s.textcolor,
      location: s.location as any, overlay: s.overlay,
    })),
    lines: (lines || []).map((l) => ({
      points: l.points.map((p: any) => ({ time: Math.floor(p.time / 1000), price: p.price })),
      color: l.color, width: l.width,
      style: l.style as 'solid' | 'dotted' | 'dashed' | undefined,
    })),
    labels: (labels || []).map((l) => ({
      time: Math.floor(l.time / 1000), price: l.price, text: l.text,
      color: l.color, textColor: l.textColor, style: l.style, size: l.size,
    })),
    fills: (fills || []).map((f) => ({ from: stripMeta(f.from), to: stripMeta(f.to), color: f.color })),
    fillColorData: fillColorData || {},
    plotColors: plotColors || {},
    strategyMarkers: (strategyMarkers || []).map((m: any) => ({ ...m })),
    bgcolor: (bgcolor || []).map((b: any) => ({ time: Math.floor(b.time / 1000), color: b.color })),
    alertConditions: (alertConditions || []).map((a: any) => ({ id: a.id, title: a.title, message: a.message })),
    alertTriggers: (alertTriggers || []).map((t: any) => ({ alertId: t.alertId, barIndex: t.barIndex, timestamp: t.timestamp })),
    boxes: (boxes || []).map((b: any) => ({
      startTime: Math.floor(b.startTime / 1000), startPrice: b.startPrice,
      endTime: Math.floor(b.endTime / 1000), endPrice: b.endPrice,
      borderColor: b.borderColor, backgroundColor: b.backgroundColor,
    })),
    tables: tables || [],
    hiddenPlotTitles: hiddenPlotTitlesList.length > 0 ? hiddenPlotTitlesList : undefined,
  };
}

function mergeDiffIntoResult(prev: ScriptResult, msg: ExecMsg): ScriptResult {
  const mergedPlots = prev.plots.map((plot: any) => {
    const diffKey = Object.keys(msg.outputs).find((k) => {
      const stripped = k.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '');
      return stripped === plot.title || k === plot.title;
    });
    if (diffKey && msg.outputs[diffKey] && msg.outputs[diffKey].length > 0) {
      const diffValue = msg.outputs[diffKey]![0];
      const numValue = diffValue === null || diffValue === undefined ? null
        : typeof diffValue === 'boolean' ? (diffValue ? 1 : 0)
        : typeof diffValue === 'number' ? diffValue : null;
      const perBarColors = msg.plotColors?.[diffKey];
      const color = perBarColors?.[perBarColors.length - 1] ?? plot.data[plot.data.length - 1]?.color;
      const isNewBar = (msg.barIndex ?? 0) >= plot.data.length;
      if (isNewBar) {
        const rawTime = msg.barTimestamps?.[msg.barIndex];
        const newTime = rawTime !== undefined ? Math.floor(rawTime / 1000) : (plot.data[plot.data.length - 1]?.time ?? 0);
        return { ...plot, data: [...plot.data, { time: newTime, value: numValue, color }] };
      }
      const lastEntry = plot.data[plot.data.length - 1];
      if (lastEntry) {
        return { ...plot, data: [...plot.data.slice(0, -1), { ...lastEntry, value: numValue, color }] };
      }
    } else if ((msg.barIndex ?? 0) >= plot.data.length && plot.data.length > 0) {
      const lastEntry = plot.data[plot.data.length - 1];
      const rawTime = msg.barTimestamps?.[msg.barIndex] ?? (lastEntry?.time ?? 0);
      const newTime = Math.floor(rawTime / 1000);
      return { ...plot, data: [...plot.data, { time: newTime, value: lastEntry?.value ?? null, color: lastEntry?.color }] };
    }
    return plot;
  });

  const diffShapes = (msg.shapes || []).map((s: any) => ({
    type: s.style as any, time: Math.floor(s.time / 1000), price: 0,
    color: s.color, text: s.text, location: s.location as any,
  }));
  const mergedShapes = diffShapes.length > 0
    ? [...prev.shapes.filter((s: any) => !diffShapes.some((d: any) => d.time === s.time)), ...diffShapes]
    : prev.shapes;

  const diffLines = (msg.lines || []).map((l: any) => ({
    points: l.points.map((p: any) => ({ time: Math.floor(p.time / 1000), price: p.price })),
    color: l.color, width: l.width, style: l.style as any,
  }));
  const mergedLines = diffLines.length > 0
    ? [...prev.lines.filter((l: any) => !diffLines.some((d: any) => d.points[0]?.time === l.points[0]?.time)), ...diffLines]
    : prev.lines;

  const diffLabels = (msg.labels || []).map((l: any) => ({
    time: Math.floor(l.time / 1000), price: l.price, text: l.text,
    color: l.color, textColor: l.textColor, style: l.style, size: l.size,
  }));
  const mergedLabels = diffLabels.length > 0
    ? [...prev.labels.filter((l: any) => !diffLabels.some((d: any) => d.time === l.time)), ...diffLabels]
    : prev.labels;

  const diffBoxes = (msg.boxes || []).map((b: any) => ({
    startTime: Math.floor(b.startTime / 1000), startPrice: b.startPrice,
    endTime: Math.floor(b.endTime / 1000), endPrice: b.endPrice,
    borderColor: b.borderColor, backgroundColor: b.backgroundColor,
  }));
  const mergedBoxes = diffBoxes.length > 0
    ? [...(prev.boxes || []).filter((b: any) => !diffBoxes.some((d: any) => d.startTime === b.startTime)), ...diffBoxes]
    : (prev.boxes || []);

  return {
    ...prev,
    plots: mergedPlots,
    shapes: mergedShapes,
    lines: mergedLines,
    labels: mergedLabels,
    boxes: mergedBoxes,
  };
}

// ---- Fixture helpers ----

function loadBars(): { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[] {
  const raw = JSON.parse(fs.readFileSync('./tests/fixtures/solusdt-5m-jul17.json', 'utf-8'));
  if (raw.retCode !== 0) throw new Error(`Bybit API error: ${raw.retMsg}`);
  return raw.result.list.reverse().map((k: any[]) => ({
    timestamp: Number(k[0]), open: Number(k[1]), high: Number(k[2]),
    low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]),
  }));
}

function buildContexts(bars: ReturnType<typeof loadBars>): ExecutionContext[] {
  return bars.map((bar, i) => ({
    barIndex: i,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
    high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
    low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
    close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
    volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
  }));
}

describe('Q-Trend real-time plot/shape correctness', () => {
  const source = fs.readFileSync('./test_indicators/q-trend.pine', 'utf-8');
  const { ast } = parse(source);
  const compiled = compile(ast);
  const fullBars = loadBars();
  const testBars = fullBars.slice(-300);

  it('trend line values survive forming candle ticks and confirmed bar WS', () => {
    // --- Phase 1: Initial HTTP execution (fresh engine = new session) ---
    const engine = new ExecutionEngine(compiled);
    const contexts = buildContexts(testBars);
    const httpResult = engine.executeBars(contexts);

    // Convert to ScriptResult via buildScriptResult
    const outputs: Record<string, any[]> = {};
    if (httpResult.outputs) {
      for (const [key, series] of httpResult.outputs) {
        outputs[key] = Array.from(series.values);
      }
    }
    const plotColors: Record<string, (string | null)[]> = {};
    if (httpResult.plotColors) {
      for (const [key, colors] of httpResult.plotColors) plotColors[key] = Array.from(colors);
    }

    const httpShapes = httpResult.shapes as any[] || [];
    const httpLines = (httpResult.lines || []).map((l: any) => ({
      points: [
        { time: l.xloc === 'bar_index' ? (httpResult.barTimestamps?.[l.x1] ?? l.x1) : l.x1, price: l.y1 },
        { time: l.xloc === 'bar_index' ? (httpResult.barTimestamps?.[l.x2] ?? l.x2) : l.x2, price: l.y2 },
      ],
      color: l.color, width: l.width,
      style: l.style === 'style_dotted' ? 'dotted' : l.style === 'style_dashed' ? 'dashed' : 'solid',
    }));
    const httpLabels = (httpResult.labels || []).map((l: any) => ({
      time: l.time, price: l.price, text: l.text,
      color: l.color, textColor: l.textcolor, style: l.style, size: l.size,
    }));

    const initialResult = buildScriptResult(
      httpResult.overlay, outputs, httpShapes, httpResult.fills || [],
      httpResult.strategyMarkers || [], testBars, httpResult.bgcolor,
      plotColors, undefined, httpLines, httpLabels,
      httpResult.barTimestamps, httpResult.alertConditions, httpResult.alertTriggers,
      httpResult.boxes, httpResult.tables, httpResult.hiddenPlotKeys,
    );

    console.log(`\n=== Phase 1: Initial HTTP (${testBars.length} bars) ===`);
    console.log(`Plots (trend line) data length: ${initialResult.plots.find((p: any) => p.title === 'trend line')?.data?.length ?? 'MISSING'}`);
    console.log(`Shapes (labels/arrows) count: ${initialResult.shapes.length}`);

    const trendLinePlot = initialResult.plots.find((p: any) => p.title === 'trend line');
    expect(trendLinePlot).toBeDefined();
    expect(trendLinePlot.data.length).toBe(testBars.length);

    // Verify we have some shapes (signals)
    expect(initialResult.shapes.length).toBeGreaterThan(0);
    console.log(`Sample shapes:`);
    for (const s of initialResult.shapes.slice(0, 5)) {
      console.log(`  time=${s.time} type=${s.type} text="${s.text}"`);
    }

    // Verify: the trend line has a value for the bar immediately before each shape
    const shapeTimestamps = new Set(initialResult.shapes.map((s: any) => s.time));
    const trendLineTimestamps = new Set(trendLinePlot.data.map((d: any) => d.time));
    const shapesWithoutTrend = initialResult.shapes.filter((s: any) => !trendLineTimestamps.has(s.time));
    console.log(`\nShapes at timestamps NOT in trend line: ${shapesWithoutTrend.length}`);
    for (const s of shapesWithoutTrend.slice(0, 5)) {
      console.log(`  time=${s.time} text="${s.text}"`);
    }
    expect(shapesWithoutTrend.length).toBe(0);

    // --- Phase 2: Forming candle ticks ---
    const lastBar = testBars[testBars.length - 1];
    let mergedResult = initialResult;
    const numTicks = 20;

    const newBarTimestamp = lastBar.timestamp + 300_000; // next 5m bar's timestamp

    for (let tick = 0; tick < numTicks; tick++) {
      // Simulate a tick for a NEW bar (forming candle). The FormingCandleManager
      // pushes a new bar to bars[] before creating the context, so barIndex
      // equals the NEW length (not the old length). This is the same-index
      // for all ticks of the same forming candle.
      const tickCtx: ExecutionContext = {
        barIndex: testBars.length,        // index of the new forming bar
        barCount: testBars.length + 1,
        timestamp: newBarTimestamp,
        open: createSeries('open', [lastBar.close]),
        high: createSeries('high', [lastBar.close * 1.002]),
        low: createSeries('low', [lastBar.close * 0.998]),
        close: createSeries('close', [lastBar.close * (1 + (tick - 10) * 0.0005)]),
        volume: createSeries('volume', [lastBar.volume]),
      };

      engine.setFormingCandle(true);
      const tickResult = engine.computeFormingCandle(tickCtx);

      const tickMsg: ExecMsg = {
        success: tickResult.success,
        overlay: tickResult.overlay,
        outputs: tickResult.diffOutputs as any,
        shapes: tickResult.diffShapes.map((s: any) => ({
          style: s.style, location: s.location, color: s.color,
          time: s.time, text: s.text, overlay: s.overlay ?? true,
        })),
        fills: tickResult.diffFills,
        strategyMarkers: [],
        lines: tickResult.diffLines.map((l: any) => ({
          points: [
            { time: l.xloc === 'bar_index' ? (tickResult.barTimestamps[l.x1] ?? l.x1) : l.x1, price: l.y1 },
            { time: l.xloc === 'bar_index' ? (tickResult.barTimestamps[l.x2] ?? l.x2) : l.x2, price: l.y2 },
          ],
          color: l.color, width: l.width,
          style: l.style === 'style_dotted' ? 'dotted' : l.style === 'style_dashed' ? 'dashed' : 'solid',
        })),
        labels: tickResult.diffLabels.map((l: any) => ({
          time: l.time, price: l.price, text: l.text,
          color: l.color, textColor: l.textcolor, style: l.style, size: l.size,
        })),
        boxes: [],
        barTimestamps: tickResult.barTimestamps,
        barIndex: tickResult.barIndex,
        formingCandle: true,
        alertConditions: [], alertTriggers: [], tables: [],
      };

      mergedResult = mergeDiffIntoResult(mergedResult, tickMsg);
    }

    console.log(`\n=== Phase 2: After ${numTicks} forming candle ticks ===`);
    const trendAfterTicks = mergedResult.plots.find((p: any) => p.title === 'trend line');
    console.log(`Trend line data length: ${trendAfterTicks?.data?.length ?? 'MISSING'}`);
    console.log(`Shapes count: ${mergedResult.shapes.length}`);

    // FIX VERIFIED: the trend line now correctly appends a new bar entry for
    // the forming candle (was 300, now 301). The first tick triggers a new bar
    // via actualBarIndex = context.barIndex → isNewBar = true on frontend.
    expect(trendAfterTicks?.data?.length).toBe(testBars.length + 1);

    // Verify the new bar's timestamp matches the shape timestamps
    const lastTrendPoint = trendAfterTicks.data[trendAfterTicks.data.length - 1];
    console.log(`Last trend line point: time=${lastTrendPoint.time} value=${lastTrendPoint.value}`);

    // Debug: what new shapes got added during ticks?
    const newShapes = mergedResult.shapes.filter(
      (s: any) => !initialResult.shapes.some((is: any) => is.time === s.time && is.type === s.type)
    );
    console.log(`New shapes added during ticks: ${newShapes.length}`);
    for (const ns of newShapes) {
      console.log(`  time=${ns.time} type=${ns.type} text="${ns.text}"`);
      const matchingTrend = trendAfterTicks.data.find((d: any) => d.time === ns.time);
      console.log(`  → matching trend point: ${matchingTrend ? `YES (value=${matchingTrend.value})` : 'NO'}`);
    }

    // Check no shapes lost their trend line neighbor
    const shapeTimesAfter = new Set(mergedResult.shapes.map((s: any) => s.time));
    const trendTimesAfter = new Set(trendAfterTicks.data.map((d: any) => d.time));
    const orphansAfter = mergedResult.shapes.filter((s: any) => !trendTimesAfter.has(s.time));
    console.log(`Shapes at timestamps NOT in trend line: ${orphansAfter.length}`);
    for (const o of orphansAfter) {
      console.log(`  ORPHAN time=${o.time} type=${o.type} text="${o.text}"`);
    }
    expect(orphansAfter.length).toBe(0);

    // --- Phase 3: Indicator WS confirmed bar (mergeDiffIntoResult path) ---
    // The indicator WS handler (lines 621-668) uses mergeDiffIntoResult
    // when formingCandle is false but it's a diff-style message
    const confirmedBar = {
      timestamp: lastBar.timestamp + 300_000,
      open: lastBar.close,
      high: lastBar.close * 1.002,
      low: lastBar.close * 0.998,
      close: lastBar.close * 1.001,
      volume: lastBar.volume,
    };
    const extendedBars = [...testBars, confirmedBar];
    const confirmCtx = buildContexts(extendedBars);

    // Use executeBar for a confirmed bar
    engine.setFormingCandle(false);
    const confirmResult = engine.executeBar(confirmCtx[confirmCtx.length - 1]);

    const confirmOutputs: Record<string, any[]> = {};
    if (confirmResult.outputs) {
      for (const [key, series] of confirmResult.outputs) {
        confirmOutputs[key] = Array.from(series.values);
      }
    }
    const confirmColors: Record<string, (string | null)[]> = {};
    if (confirmResult.plotColors) {
      for (const [key, colors] of confirmResult.plotColors) confirmColors[key] = Array.from(colors);
    }

    // Simulate an indicator WS confirmed bar message
    const confirmMsg: ExecMsg = {
      success: confirmResult.success,
      overlay: confirmResult.overlay,
      indicatorId: 'test',
      outputs: confirmOutputs,
      shapes: (confirmResult.shapes as any[] || []).map((s: any) => ({
        style: s.style, location: s.location, color: s.color,
        time: s.time, text: s.text, overlay: s.overlay,
      })),
      fills: confirmResult.fills || [],
      strategyMarkers: confirmResult.strategyMarkers || [],
      lines: (confirmResult.lines || []).map((l: any) => ({
        points: [
          { time: l.xloc === 'bar_index' ? (confirmResult.barTimestamps?.[l.x1] ?? l.x1) : l.x1, price: l.y1 },
          { time: l.xloc === 'bar_index' ? (confirmResult.barTimestamps?.[l.x2] ?? l.x2) : l.x2, price: l.y2 },
        ],
        color: l.color, width: l.width,
        style: l.style === 'style_dotted' ? 'dotted' : l.style === 'style_dashed' ? 'dashed' : 'solid',
      })),
      labels: (confirmResult.labels || []).map((l: any) => ({
        time: l.time, price: l.price, text: l.text,
        color: l.color, textColor: l.textcolor, style: l.style, size: l.size,
      })),
      boxes: (confirmResult.boxes || []).map((b: any) => ({
        startTime: b.left < (confirmResult.barTimestamps?.length ?? 0) ? (confirmResult.barTimestamps?.[b.left] ?? 0) : 0,
        startPrice: b.top, endTime: b.right < (confirmResult.barTimestamps?.length ?? 0) ? (confirmResult.barTimestamps?.[b.right] ?? 0) : 0,
        endPrice: b.bottom, borderColor: b.border_color, backgroundColor: b.bgcolor,
      })),
      barTimestamps: confirmResult.barTimestamps,
      barIndex: confirmResult.barTimestamps ? confirmResult.barTimestamps.length - 1 : 0,
      formingCandle: false,
      alertConditions: confirmResult.alertConditions || [],
      alertTriggers: confirmResult.alertTriggers || [],
      tables: [],
    };

    // The indicator WS handler checks isDiff via formingCandle flag OR
    // single-value output. Since this is a confirmed bar with full outputs,
    // it would go through buildScriptResult (full replacement).
    // But first let's check what the full replacement produces:
    const confirmedResult = buildScriptResult(
      confirmMsg.overlay, confirmMsg.outputs, confirmMsg.shapes, confirmMsg.fills,
      confirmMsg.strategyMarkers, extendedBars, confirmMsg.bgcolor,
      confirmColors, undefined, confirmMsg.lines, confirmMsg.labels,
      confirmMsg.barTimestamps, confirmMsg.alertConditions, confirmMsg.alertTriggers,
      confirmMsg.boxes, confirmMsg.tables, confirmMsg.hiddenPlotKeys,
    );

    console.log(`\n=== Phase 3a: Confirmed bar full replacement (indicator WS) ===`);
    const trendConfirmed = confirmedResult.plots.find((p: any) => p.title === 'trend line');
    console.log(`Trend line data length: ${trendConfirmed?.data?.length ?? 'MISSING'}`);
    console.log(`Expected length: ${extendedBars.length}`);
    console.log(`Shapes count: ${confirmedResult.shapes.length}`);

    // Full replacement should have ALL bars' data
    expect(trendConfirmed?.data?.length).toBe(extendedBars.length);

    // Check orphans
    const shapeTimesConfirmed = new Set(confirmedResult.shapes.map((s: any) => s.time));
    const trendTimesConfirmed = new Set(trendConfirmed.data.map((d: any) => d.time));
    const orphansConfirmed = confirmedResult.shapes.filter((s: any) => !trendTimesConfirmed.has(s.time));
    console.log(`Shapes at timestamps NOT in trend line: ${orphansConfirmed.length}`);
    if (orphansConfirmed.length > 0) {
      console.log(`  First 5 orphans:`);
      for (const o of orphansConfirmed.slice(0, 5)) {
        console.log(`    time=${o.time} text="${o.text}"`);
        // Find the nearest trend line timestamps
        const nearest = trendConfirmed.data
          .map((d: any) => ({ time: d.time, diff: Math.abs(d.time - o.time) }))
          .sort((a: any, b: any) => a.diff - b.diff)
          .slice(0, 3);
        console.log(`    Nearest trend line timestamps: ${nearest.map((n: any) => `${n.time} (diff=${n.diff})`).join(', ')}`);
      }
    }
    // Currently we expect 0 orphans — this is the invariant the user expects
    expect(orphansConfirmed.length).toBe(0);

    // --- Phase 3b: Now simulate the INDICATOR WS path's actual flow ---
    // The indicator WS code checks: is msg.formingCandle? If false and it's
    // a full-output message, it calls buildScriptResult directly.
    // But a confirmed bar from the FormingCandleManager DOES set isConfirmed
    // and NOT formingCandle. Let's check what the real WS message looks like…

    // Actually, look at FormingCandleManager.confirm():
    //   return this.toOutputs(execResult);
    // And toOutputs() sets:
    //   formingCandle: false,
    //   isConfirmed: true,
    //
    // But the indicator WS handler (line 629) checks:
    //   const isDiff = msg.formingCandle || (sampleKey && ...)
    // Since msg.formingCandle is false for confirmed bar,
    // it goes to buildScriptResult (full replacement) — that's what we
    // tested above.
    //
    // BUT: for the forming candle ticks we DID use mergeDiffIntoResult.
    // Could the problem be that mergeDiffIntoResult's shape dedup on `time`
    // is dropping shapes from the confirmed bar's buildScriptResult
    // when they overlap with shapes already in the merged result?

    // Let's test that specific scenario:
    // 1. Start with initialResult
    // 2. Apply N forming-candle ticks via mergeDiffIntoResult
    // 3. Then apply a full replacement via buildScriptResult
    // 4. Check orphans again
    console.log(`\n=== Scenario: mergeDiff then full replacement ===`);
    
    // Already did ticks above (mergedResult), now apply full replacement
    const fullResult = buildScriptResult(
      confirmMsg.overlay, confirmMsg.outputs, confirmMsg.shapes, confirmMsg.fills,
      confirmMsg.strategyMarkers, extendedBars, confirmMsg.bgcolor,
      confirmColors, undefined, confirmMsg.lines, confirmMsg.labels,
      confirmMsg.barTimestamps, confirmMsg.alertConditions, confirmMsg.alertTriggers,
      confirmMsg.boxes, confirmMsg.tables, confirmMsg.hiddenPlotKeys,
    );

    const trendFull = fullResult.plots.find((p: any) => p.title === 'trend line');
    const shapeTimesFull = new Set(fullResult.shapes.map((s: any) => s.time));
    const trendTimesFull = new Set(trendFull.data.map((d: any) => d.time));
    const orphansFull = fullResult.shapes.filter((s: any) => !trendTimesFull.has(s.time));
    console.log(`Full replacement — trend line length: ${trendFull.data.length}`);
    console.log(`Full replacement — shapes count: ${fullResult.shapes.length}`);
    console.log(`Full replacement — orphans: ${orphansFull.length}`);
    expect(orphansFull.length).toBe(0);
  });
});
