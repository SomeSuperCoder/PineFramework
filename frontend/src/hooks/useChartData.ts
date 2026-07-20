import { useState, useEffect, useCallback, useRef } from 'react';
import type { CandlestickData, ScriptResult, PineScriptError } from '../types';

interface ExecuteResponse {
  success: boolean;
  error?: string;
  overlay: boolean;
  outputs: Record<string, (number | string | boolean | null)[]>;
  plotColors?: Record<string, (string | null)[]>;
  fillColorData?: Record<string, (string | null)[]>;
  shapes?: Array<{ style: string; location: string; color: string; time: number; text: string; price?: number; overlay?: boolean }>;
  fills?: Array<{ from: string; to: string; color: string }>;
  strategyMarkers?: Array<{
    type: string;
    name: string;
    direction: string;
    action: string;
    quantity: number;
    price: number;
    barIndex: number;
    timestamp: number;
    color: string;
    comment?: string;
  }>;
  bgcolor?: Array<{ time: number; color: string }>;
  lines?: Array<{ points: Array<{ time: number; price: number }>; color: string; width?: number; style?: string }>;
  labels?: Array<{ time: number; price: number; text: string; color?: string; textColor?: string; style?: string; size?: string }>;
  boxes?: Array<{ startTime: number; startPrice: number; endTime: number; endPrice: number; borderColor?: string; backgroundColor?: string }>;
  barTimestamps?: number[];
  maxLookback?: number;
  alertConditions?: Array<{ id: string; title: string; message: string }>;
  alertTriggers?: Array<{ alertId: string; barIndex: number; timestamp: number }>;
  tables?: import('../types').TableData[];
  hiddenPlotKeys?: string[];
}

interface ExecutionResultMessage {
  success: boolean;
  error?: string;
  overlay: boolean;
  indicatorId?: string;
  outputs: Record<string, (number | string | boolean | null)[]>;
  plotColors?: Record<string, (string | null)[]>;
  fillColorData?: Record<string, (string | null)[]>;
  shapes: Array<{ style: string; location: string; color: string; time: number; text: string; price?: number; overlay?: boolean }>;
  fills: Array<{ from: string; to: string; color: string }>;
  strategyMarkers: Array<{
    type: string;
    name: string;
    direction: string;
    action: string;
    quantity: number;
    price: number;
    barIndex: number;
    timestamp: number;
    color: string;
    comment?: string;
  }>;
  bgcolor?: Array<{ time: number; color: string }>;
  lines?: Array<{ points: Array<{ time: number; price: number }>; color: string; width?: number; style?: string }>;
  labels?: Array<{ time: number; price: number; text: string; color?: string; textColor?: string; style?: string; size?: string }>;
  boxes?: Array<{ startTime: number; startPrice: number; endTime: number; endPrice: number; borderColor?: string; backgroundColor?: string }>;
  barTimestamps?: number[];
  formingCandle?: boolean;
  alertConditions?: Array<{ id: string; title: string; message: string }>;
  alertTriggers?: Array<{ alertId: string; barIndex: number; timestamp: number }>;
  barIndex: number;
  tables?: import('../types').TableData[];
  hiddenPlotKeys?: string[];
}

const COLORS = ['#2196f3', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];

function buildScriptResult(
  overlay: boolean,
  outputs: Record<string, (number | string | boolean | null)[]>,
  shapes: ExecutionResultMessage['shapes'],
  fills: ExecutionResultMessage['fills'],
  strategyMarkers: ExecutionResultMessage['strategyMarkers'],
  ohlcvData: Array<{ timestamp: number }>,
  bgcolor?: ExecutionResultMessage['bgcolor'],
  plotColors?: Record<string, (string | null)[]>,
  fillColorData?: Record<string, (string | null)[]>,
  lines?: ExecutionResultMessage['lines'],
  labels?: ExecutionResultMessage['labels'],
  barTimestamps?: number[],
  alertConditions?: Array<{ id: string; title: string; message: string }>,
  alertTriggers?: Array<{ alertId: string; barIndex: number; timestamp: number }>,
  boxes?: ExecutionResultMessage['boxes'],
  tables?: import('../types').TableData[],
  hiddenPlotKeys?: string[],
): ScriptResult {
  const getTimestamp = (i: number): number | undefined => {
    if (barTimestamps && i < barTimestamps.length) return barTimestamps[i]!;
    return ohlcvData[i]?.timestamp;
  };
  const plotData: import('../types').PlotData[] = [];
  let colorIndex = 0;
  for (const [key, values] of Object.entries(outputs)) {
    let plotColor: string | undefined;
    let lineWidth: number | undefined;
    const lwMatch = key.match(/__lw:(\d+)/);
    const styleMatch = key.match(/__style:([^_]+)/);
    if (lwMatch) lineWidth = parseInt(lwMatch[1], 10);
    const plotStyle = (styleMatch ? styleMatch[1] : 'line') as import('../types').PlotData['type'];
    const title = key.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '');
    const perBarColors = plotColors?.[key];
    if (!plotColor) {
      plotColor = COLORS[colorIndex % COLORS.length];
    }
    colorIndex++;
    const mappedData: Array<{ time: number; value: number | null; color: string | undefined } | null> = values
      .map((v, i) => {
        const ts = getTimestamp(i);
        if (ts === undefined) return null;
        let numValue: number | null;
        if (v === null || v === undefined) {
          numValue = null;
        } else if (typeof v === 'boolean') {
          numValue = v ? 1 : 0;
        } else if (typeof v === 'number') {
          numValue = v;
        } else {
          numValue = null;
        }
        return { time: Math.floor(ts / 1000), value: numValue, color: perBarColors?.[i] ?? undefined };
      });
    plotData.push({
      type: plotStyle,
      data: mappedData.filter((d): d is { time: number; value: number | null; color: string | undefined } => d !== null),
      color: plotColor,
      lineWidth,
      title,
    });
  }

  const stripMeta = (s: string) => s.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '').trim();
  // Hidden plot titles — plots with display=display.none (fill-only references
  // that must not render as visible lines). Strip metadata from raw keys.
  const hiddenPlotTitles: string[] = (hiddenPlotKeys || []).map((key) => stripMeta(key));
  const transformFillKey = (rawKey: string) => {
    const parts = rawKey.split('::');
    return parts.map(stripMeta).join('::');
  };

  const shapeData: import('../types').ShapeData[] = (shapes || []).map((s) => ({
    type: s.style as import('../types').ShapeData['type'],
    time: Math.floor(s.time / 1000),
    price: s.price ?? 0,
    color: s.color,
    text: s.text,
    textcolor: s.textcolor,
    location: s.location as import('../types').ShapeData['location'],
    overlay: s.overlay,
  }));

  const transformedFillColorData: Record<string, (string | null)[]> = {};
  if (fillColorData) {
    for (const [key, colors] of Object.entries(fillColorData)) {
      transformedFillColorData[transformFillKey(key)] = colors;
    }
  }

  return {
    overlay,
    plots: plotData,
    shapes: shapeData,
    lines: (lines || []).map((l) => ({
      points: l.points.map((p) => ({ time: Math.floor(p.time / 1000), price: p.price })),
      color: l.color,
      width: l.width,
      style: l.style as 'solid' | 'dotted' | 'dashed' | undefined,
    })),
    boxes: (boxes || []).map((b) => ({
      startTime: Math.floor(b.startTime / 1000),
      startPrice: b.startPrice,
      endTime: Math.floor(b.endTime / 1000),
      endPrice: b.endPrice,
      borderColor: b.borderColor,
      backgroundColor: b.backgroundColor,
    })),
    labels: (labels || []).map((l) => ({
      time: Math.floor(l.time / 1000),
      price: l.price,
      text: l.text,
      color: l.color,
      textColor: l.textColor,
      style: l.style,
      size: l.size,
    })),
    fills: (fills || []).map((f) => ({ from: stripMeta(f.from), to: stripMeta(f.to), color: f.color })),
    fillColorData: transformedFillColorData,
    plotColors: plotColors || {},
    strategyMarkers: (strategyMarkers || []).map((m) => ({
      type: m.type,
      name: m.name,
      direction: m.direction,
      action: m.action,
      quantity: m.quantity,
      price: m.price,
      barIndex: m.barIndex,
      timestamp: m.timestamp,
      color: m.color,
      comment: m.comment,
    })),
    bgcolor: (bgcolor || []).map((b) => ({ time: Math.floor(b.time / 1000), color: b.color })),
    alertConditions: (alertConditions || []).map((a) => ({ id: a.id, title: a.title, message: a.message })),
    alertTriggers: (alertTriggers || []).map((t) => ({ alertId: t.alertId, barIndex: t.barIndex, timestamp: t.timestamp })),
    tables: tables || [],
    hiddenPlotTitles: hiddenPlotTitles.length > 0 ? hiddenPlotTitles : undefined,
  };
}

export function useChartData(onIndicatorResult?: (indicatorId: string, result: ScriptResult) => void) {
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null);
  const [errors, setErrors] = useState<PineScriptError[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedTopicRef = useRef<string | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const ohlcvDataRef = useRef<Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>>([]);
  const hasMoreHistoryRef = useRef(true);
  const prependCountRef = useRef(0);
  const pendingExecuteRef = useRef<Map<string, { source: string; symbol: string; interval: string; bars?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> }>>(new Map());
  const onIndicatorRemovedRef = useRef<((indicatorIds: string[]) => void) | null>(null);
  const indicatorSourcesRef = useRef<Map<string, { source: string; symbol: string; interval: string; maxLookback: number }>>(new Map());
  const historicalDataLoadedRef = useRef(false);
  const executeScriptRef = useRef<((code: string, symbol: string, interval: string, existingBars?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>, versionRef?: React.MutableRefObject<number>, version?: number, indicatorId?: string) => Promise<void>) | null>(null);

  const toCandleData = useCallback((bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>): CandlestickData[] => {
    const data: CandlestickData[] = bars.map((bar) => ({
      time: Math.floor(bar.timestamp / 1000),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })).filter((d) => d.time > 0 && isFinite(d.open) && isFinite(d.high) && isFinite(d.low) && isFinite(d.close));
    data.sort((a, b) => a.time - b.time);
    return data;
  }, []);

  const fetchOHLCV = useCallback(async (symbol: string, interval: string, limit = 1000) => {
    setIsLoading(true);
    setCandles([]);
    setScriptResult(null);
    indicatorResultsRef.current.clear();
    ohlcvDataRef.current = [];
    historicalDataLoadedRef.current = false;
    try {
      const response = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }
      const json = await response.json();
      ohlcvDataRef.current = json.data;
      historicalDataLoadedRef.current = true;
      setCandles(toCandleData(json.data));
    } catch (err) {
      console.error('Failed to fetch OHLCV:', err);
      setErrors((prev) => [...prev, {
        type: 'error',
        message: `Failed to load chart data: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [toCandleData]);

  const fetchOlderOHLCV = useCallback(async (symbol: string, interval: string): Promise<number> => {
    if (!hasMoreHistoryRef.current) return 0;
    try {
      const oldest = ohlcvDataRef.current[0];
      if (!oldest || !oldest.timestamp) {
        hasMoreHistoryRef.current = false;
        return 0;
      }
      const end = oldest.timestamp - 1;
      const response = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=1000&end=${end}`);
      if (!response.ok) return 0;
      const json = await response.json();
      if (!json.data || json.data.length === 0) {
        hasMoreHistoryRef.current = false;
        return 0;
      }
      if (json.hasMore === false) {
        hasMoreHistoryRef.current = false;
      }
      const addedCount = json.data.length;
      if (addedCount === 0) return 0;
      prependCountRef.current += addedCount;

      const oldBars = ohlcvDataRef.current;
      const newBars = json.data as typeof ohlcvDataRef.current;
      ohlcvDataRef.current = [...newBars, ...oldBars];

      // Execute all indicators FIRST — compute everything before touching
      // any React state. This prevents intermediate renders where candles
      // are updated but indicator data is stale (causes Y-axis jumping
      // on lines which are array-index positioned).
      const indicatorUpdates: Array<{ id: string; result: ScriptResult }> = [];

      for (const [indId, ind] of indicatorSourcesRef.current) {
        const maxLookback = ind.maxLookback || 0;
        const contextBars = oldBars.slice(0, maxLookback);
        const actualContextSize = contextBars.length;
        // Bars must be in chronological order: newBars (older) first,
        // contextBars (newer) last. The engine processes sequentially,
        // so newBars get history from preceding bars in the array.
        // The contextBars at the end provide lookback for newBars that
        // need more history than available within newBars alone.
        const execBars = [...newBars, ...contextBars];

        try {
          const execResponse = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: ind.source, bars: execBars, offset: 0 }),
          });
          if (!execResponse.ok) continue;
          const execResult: ExecuteResponse = await execResponse.json();
          if (!execResult.success || execResult.error) continue;

          const newResult = buildScriptResult(
            execResult.overlay,
            execResult.outputs,
            execResult.shapes || [],
            execResult.fills || [],
            execResult.strategyMarkers || [],
            execBars,
            execResult.bgcolor,
            execResult.plotColors,
            execResult.fillColorData,
            execResult.lines,
            execResult.labels,
            execResult.barTimestamps,
            execResult.alertConditions,
            execResult.alertTriggers,
            execResult.boxes,
            execResult.tables,
            execResult.hiddenPlotKeys,
          );

          const prev = indicatorResultsRef.current.get(indId);
          const merged = prev ? prependIndicatorResult(prev, newResult, addedCount, actualContextSize) : newResult;
          indicatorUpdates.push({ id: indId, result: merged });

          // Create WS session with full bar set for real-time updates
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'execute',
              data: { source: ind.source, symbol: ind.symbol, interval: ind.interval, bars: ohlcvDataRef.current, indicatorId: indId },
            }));
          }
        } catch {
          // Skip failed indicators
        }
      }

      // Now update ALL React state in one synchronous batch — candles and
      // indicator results together so the chart never renders with mismatched data.
      setCandles(toCandleData(ohlcvDataRef.current));
      for (const { id, result } of indicatorUpdates) {
        indicatorResultsRef.current.set(id, result);
        onIndicatorResult?.(id, result);
      }

      return addedCount;
    } catch {
      return 0;
    }
  }, [toCandleData, onIndicatorResult]);

  const indicatorResultsRef = useRef<Map<string, ScriptResult>>(new Map());

  const prependIndicatorResult = useCallback((prev: ScriptResult, newResult: ScriptResult, addedCount: number, contextSize: number): ScriptResult => {
    // The execution result contains entries for BOTH newBars and contextBars.
    // - First addedCount entries: newBars (some may have null warmup)
    // - Last contextSize entries: contextBars recomputed with newBars as history
    //
    // We prepend the newBar entries and REPLACE the first contextSize entries
    // of the previous result with the recomputed boundary values. This fixes
    // the "hill" discontinuity: previously, the first maxLookback bars of each
    // batch had null warmup values that were never updated when older data
    // arrived. Now they get properly recomputed.
    const mergedPlots = prev.plots.map((plot) => {
      const newPlot = newResult.plots.find((p) => p.title === plot.title);
      if (newPlot) {
        const newBarData = newPlot.data.slice(0, addedCount);
        const boundaryData = newPlot.data.slice(addedCount, addedCount + contextSize);
        // Replace the first contextSize entries of prev with recomputed boundary
        const replacedPrev = [...boundaryData, ...plot.data.slice(contextSize)];
        return { ...plot, data: [...newBarData, ...replacedPrev] };
      }
      return plot;
    });
    // Add any entirely new plots from newResult
    for (const newPlot of newResult.plots) {
      if (!mergedPlots.find((p) => p.title === newPlot.title)) {
        mergedPlots.push(newPlot);
      }
    }

    const mergedShapes = [...newResult.shapes, ...prev.shapes];
    const mergedFills = [...(newResult.fills || []), ...(prev.fills || [])];
    const mergedLines = [...newResult.lines, ...prev.lines];
    const mergedLabels = [...newResult.labels, ...prev.labels];
    const mergedStrategyMarkers = [...(newResult.strategyMarkers || []), ...(prev.strategyMarkers || [])];

    // Prepend fillColorData entries and recompute boundary
    const mergedFillColorData: Record<string, (string | null)[]> = {};
    const allFillKeys = new Set([...Object.keys(prev.fillColorData || {}), ...Object.keys(newResult.fillColorData || {})]);
    for (const key of allFillKeys) {
      const newColors = newResult.fillColorData?.[key] || [];
      const prevColors = prev.fillColorData?.[key] || [];
      const boundaryColors = newColors.slice(addedCount, addedCount + contextSize);
      mergedFillColorData[key] = [...newColors.slice(0, addedCount), ...boundaryColors, ...prevColors.slice(contextSize)];
    }

    // Prepend plotColors entries and recompute boundary
    const mergedPlotColors: Record<string, (string | null)[]> = {};
    const allColorKeys = new Set([...Object.keys(prev.plotColors || {}), ...Object.keys(newResult.plotColors || {})]);
    for (const key of allColorKeys) {
      const newColors = newResult.plotColors?.[key] || [];
      const prevColors = prev.plotColors?.[key] || [];
      const boundaryColors = newColors.slice(addedCount, addedCount + contextSize);
      mergedPlotColors[key] = [...newColors.slice(0, addedCount), ...boundaryColors, ...prevColors.slice(contextSize)];
    }

    const mergedBgcolor = [...(newResult.bgcolor || []), ...(prev.bgcolor || [])];
    const mergedBoxes = [...(newResult.boxes || []), ...(prev.boxes || [])];
    // Tables are static dashboard state — use the latest
    const mergedTables = newResult.tables.length > 0 ? newResult.tables : prev.tables;

    return {
      ...prev,
      plots: mergedPlots,
      shapes: mergedShapes,
      fills: mergedFills,
      lines: mergedLines,
      labels: mergedLabels,
      strategyMarkers: mergedStrategyMarkers,
      fillColorData: mergedFillColorData,
      plotColors: mergedPlotColors,
      bgcolor: mergedBgcolor,
      boxes: mergedBoxes,
      tables: mergedTables,
    };
  }, []);

  const mergeDiffIntoResult = useCallback((prev: ScriptResult, msg: ExecutionResultMessage): ScriptResult => {
    const mergedPlots = prev.plots.map((plot) => {
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
          return {
            ...plot,
            data: [...plot.data, { time: newTime, value: numValue, color }],
          };
        }
        const lastEntry = plot.data[plot.data.length - 1];
        if (lastEntry) {
          return {
            ...plot,
            data: [...plot.data.slice(0, -1), { ...lastEntry, value: numValue, color }],
          };
        }
      } else if ((msg.barIndex ?? 0) >= plot.data.length && plot.data.length > 0) {
        const lastEntry = plot.data[plot.data.length - 1];
        const rawTime = msg.barTimestamps?.[msg.barIndex] ?? (lastEntry?.time ?? 0);
        const newTime = Math.floor(rawTime / 1000);
        return {
          ...plot,
          data: [...plot.data, { time: newTime, value: lastEntry?.value ?? null, color: lastEntry?.color }],
        };
      }
      return plot;
    });

    const stripMeta = (s: string) => s.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '').trim();
    const diffShapes = (msg.shapes || []).map((s) => ({
      type: s.style as import('../types').ShapeData['type'],
      time: Math.floor(s.time / 1000),
      price: 0,
      color: s.color,
      text: s.text,
      location: s.location as import('../types').ShapeData['location'],
    }));
    const mergedShapes = diffShapes.length > 0
      ? [...prev.shapes.slice(0, -diffShapes.length || undefined), ...diffShapes]
      : prev.shapes;

    const diffFills = (msg.fills || []).map((f) => ({
      from: stripMeta(f.from),
      to: stripMeta(f.to),
      color: f.color,
    }));
    const mergedFills = diffFills.length > 0
      ? [...(prev.fills || []).slice(0, -diffFills.length || undefined), ...diffFills]
      : (prev.fills || []);

    const diffLines = (msg.lines || []).map((l) => ({
      points: l.points.map((p) => ({ time: Math.floor(p.time / 1000), price: p.price })),
      color: l.color,
      width: l.width,
      style: l.style as 'solid' | 'dotted' | 'dashed' | undefined,
    }));
    const mergedLines = diffLines.length > 0
      ? [...prev.lines.slice(0, -diffLines.length || undefined), ...diffLines]
      : prev.lines;

    const diffLabels = (msg.labels || []).map((l) => ({
      time: Math.floor(l.time / 1000),
      price: l.price,
      text: l.text,
      color: l.color,
      textColor: l.textColor,
      style: l.style,
      size: l.size,
    }));
    const mergedLabels = diffLabels.length > 0
      ? [...prev.labels.slice(0, -diffLabels.length || undefined), ...diffLabels]
      : prev.labels;

    const diffStrategyMarkers = (msg.strategyMarkers || []).map((m) => ({
      type: m.type,
      name: m.name,
      direction: m.direction,
      action: m.action,
      quantity: m.quantity,
      price: m.price,
      barIndex: m.barIndex,
      timestamp: m.timestamp,
      color: m.color,
      comment: m.comment,
    }));
    const mergedStrategyMarkers = [...(prev.strategyMarkers || []), ...diffStrategyMarkers];

    const mergedPlotColors = msg.plotColors
      ? Object.entries(msg.plotColors).reduce((acc, [key, colors]) => {
          const prevColors = prev.plotColors?.[key];
          if (prevColors) {
            acc[key] = [...prevColors.slice(0, -colors.length || undefined), ...colors];
          } else {
            acc[key] = colors;
          }
          return acc;
        }, {} as Record<string, (string | null)[]>)
      : prev.plotColors;

    const mergedFillColorData = msg.fillColorData
      ? Object.entries(msg.fillColorData).reduce((acc, [key, colors]) => {
          const prevColors = prev.fillColorData?.[key];
          if (prevColors) {
            acc[key] = [...prevColors.slice(0, -colors.length || undefined), ...colors];
          } else {
            acc[key] = colors;
          }
          return acc;
        }, {} as Record<string, (string | null)[]>)
      : prev.fillColorData;

    const mergedBgcolor = msg.bgcolor
      ? [...(prev.bgcolor || []).slice(0, -msg.bgcolor.length || undefined), ...msg.bgcolor.map((b) => ({ time: Math.floor(b.time / 1000), color: b.color }))]
      : prev.bgcolor;

    const diffBoxes = (msg.boxes || []).map((b) => ({
      startTime: Math.floor(b.startTime / 1000),
      startPrice: b.startPrice,
      endTime: Math.floor(b.endTime / 1000),
      endPrice: b.endPrice,
      borderColor: b.borderColor,
      backgroundColor: b.backgroundColor,
    }));
    const mergedBoxes = diffBoxes.length > 0
      ? [...(prev.boxes || []).slice(0, -diffBoxes.length || undefined), ...diffBoxes]
      : (prev.boxes || []);

    return {
      ...prev,
      plots: mergedPlots,
      shapes: mergedShapes,
      fills: mergedFills,
      lines: mergedLines,
      labels: mergedLabels,
      strategyMarkers: mergedStrategyMarkers,
      plotColors: mergedPlotColors,
      fillColorData: mergedFillColorData,
      bgcolor: mergedBgcolor,
      boxes: mergedBoxes,
      // Tables are static dashboard state — replace on any update
      tables: msg.tables || prev.tables,
    };
  }, []);

  const handleExecutionResult = useCallback((msg: ExecutionResultMessage) => {
    const ohlcvData = ohlcvDataRef.current;

    // Route indicator-specific results to the callback
    if (msg.indicatorId && msg.indicatorId !== 'default' && onIndicatorResult) {
      // If the indicator was already removed, discard stale results
      if (!indicatorSourcesRef.current.has(msg.indicatorId)) return;
      if (msg.success && msg.outputs) {
        // Real-time updates (both forming and confirmed candles) carry diff
        // outputs (single value per key). Merge them into the existing result
        // instead of replacing it entirely, which would destroy the plot data.
        const sampleKey = Object.keys(msg.outputs)[0];
        const isDiff = msg.formingCandle || (sampleKey && msg.outputs[sampleKey].length === 1 && msg.barTimestamps && msg.barTimestamps.length > 1);
        const prev = indicatorResultsRef.current.get(msg.indicatorId);
        if (isDiff) {
          // If prev doesn't exist yet (WS update arrived before HTTP result),
          // skip the update — the HTTP result will provide the full data.
          if (!prev) return;
          const merged = mergeDiffIntoResult(prev, msg);
          indicatorResultsRef.current.set(msg.indicatorId, merged);
          onIndicatorResult(msg.indicatorId, merged);
          return;
        }
        const result = buildScriptResult(
          msg.overlay,
          msg.outputs,
          msg.shapes || [],
          msg.fills || [],
          msg.strategyMarkers || [],
          ohlcvData,
          msg.bgcolor,
          msg.plotColors,
          msg.fillColorData,
          msg.lines,
          msg.labels,
          msg.barTimestamps,
          msg.alertConditions,
          msg.alertTriggers,
          msg.boxes,
          msg.tables,
          msg.hiddenPlotKeys,
        );
        indicatorResultsRef.current.set(msg.indicatorId, result);
        onIndicatorResult(msg.indicatorId, result);
      }
      if (msg.error) {
        setErrors((prev) => [...prev, {
          type: 'error',
          message: msg.error || 'Execution failed',
        }]);
      }
      return;
    }

    if (msg.success && msg.outputs) {
      if (msg.formingCandle) {
        setScriptResult((prev) => {
          if (!prev) return prev;
          return mergeDiffIntoResult(prev, msg);
        });
        return;
      }

      const barTimestamps = msg.barTimestamps;
      const sampleKey = Object.keys(msg.outputs)[0];
      if (sampleKey) {
        const outputLen = msg.outputs[sampleKey].length;
        if (barTimestamps && outputLen !== barTimestamps.length) {
          console.warn(`Execution result dropped: outputLen (${outputLen}) !== barTimestamps.length (${barTimestamps.length})`);
          return;
        }
        if (Math.abs(outputLen - ohlcvData.length) > 1) {
          console.warn(`Execution result dropped: outputLen (${outputLen}) vs ohlcvData.length (${ohlcvData.length})`);
          return;
        }
      }
      const result = buildScriptResult(
        msg.overlay,
        msg.outputs,
        msg.shapes || [],
        msg.fills || [],
        msg.strategyMarkers || [],
        ohlcvData,
        msg.bgcolor,
        msg.plotColors,
        msg.fillColorData,
        msg.lines,
        msg.labels,
        barTimestamps,
        msg.alertConditions,
        msg.alertTriggers,
        msg.boxes,
        msg.tables,
        msg.hiddenPlotKeys,
      );
      setScriptResult(result);
    }
    if (msg.error) {
      setErrors((prev) => [...prev, {
        type: 'error',
        message: msg.error || 'Execution failed',
      }]);
    }
  }, [onIndicatorResult, mergeDiffIntoResult]);

  const connectWebSocket = useCallback(() => {
    try {
      const ws = new WebSocket(`ws://${window.location.hostname}:8081/ws`);

      ws.onopen = () => {
        setIsConnected(true);
        if (subscribedTopicRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', topic: subscribedTopicRef.current }));
        }
        if (pendingExecuteRef.current.size > 0) {
          for (const [indId, data] of pendingExecuteRef.current) {
            ws.send(JSON.stringify({
              type: 'execute',
              data: { ...data, bars: data.bars || ohlcvDataRef.current, indicatorId: indId },
            }));
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'kline' && data.data) {
            const k = data.data;
            const topic = `kline.${k.interval}.${k.symbol}`;
            if (topic !== subscribedTopicRef.current) {
              return;
            }
            const time = Math.floor(k.timestamp / 1000);
            if (!time || time <= 0) return;
            const candle: CandlestickData = {
              time,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
              volume: k.volume,
            };
            setCandles((prev) => {
              if (!historicalDataLoadedRef.current) return prev;
              const newCandles = [...prev];
              const last = newCandles[newCandles.length - 1];
              if (last && last.time === candle.time) {
                newCandles[newCandles.length - 1] = candle;
              } else {
                newCandles.push(candle);
              }
              return newCandles;
            });
            if (k.timestamp) {
              const ohlcvBar = { timestamp: k.timestamp, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume };
              const lastOhlcv = ohlcvDataRef.current[ohlcvDataRef.current.length - 1];
              if (lastOhlcv && lastOhlcv.timestamp === k.timestamp) {
                ohlcvDataRef.current[ohlcvDataRef.current.length - 1] = ohlcvBar;
              } else {
                ohlcvDataRef.current = [...ohlcvDataRef.current, ohlcvBar];
              }
            }
          } else if (data.type === 'execution_result' && data.data) {
            handleExecutionResult({ ...data.data, indicatorId: data.indicatorId });
          } else if (data.type === 'indicator_removed' && data.data) {
            // Indicator removed by backend cascade (script deleted)
            const removedIds = data.data.indicatorIds as string[] | undefined;
            if (removedIds) {
              for (const id of removedIds) {
                indicatorSourcesRef.current.delete(id);
                indicatorResultsRef.current.delete(id);
                pendingExecuteRef.current.delete(id);
              }
              if (onIndicatorRemovedRef.current) {
                onIndicatorRemovedRef.current(removedIds);
              }
            }
          } else if (data.type === 'indicator_stopped' && data.data) {
            const stoppedId = data.data.indicatorId as string | undefined;
            if (stoppedId) {
              indicatorSourcesRef.current.delete(stoppedId);
              indicatorResultsRef.current.delete(stoppedId);
              pendingExecuteRef.current.delete(stoppedId);
            }
          } else if (data.type === 'error' && data.data) {
            setErrors((prev) => [...prev, {
              type: 'error',
              message: data.data.message || 'WebSocket error',
            }]);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      wsRef.current = ws;
    } catch {
      // retry
    }
  }, [handleExecutionResult]);

  const subscribe = useCallback((symbol: string, interval: string) => {
    const topic = `kline.${interval}.${symbol}`;
    if (subscribedTopicRef.current === topic) return;
    const prevTopic = subscribedTopicRef.current;
    subscribedTopicRef.current = topic;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (prevTopic) {
        wsRef.current.send(JSON.stringify({ type: 'unsubscribe', topic: prevTopic }));
      }
      wsRef.current.send(JSON.stringify({ type: 'subscribe', topic }));
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWebSocket]);

  const fetchSeedBars = useCallback(async (symbol: string, interval: string, count: number): Promise<Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>> => {
    if (count <= 0) return [];
    const oldest = ohlcvDataRef.current[0];
    if (!oldest) return [];
    const before = oldest.timestamp;
    const response = await fetch(`/api/bars?symbol=${symbol}&interval=${interval}&count=${count}&before=${before}`);
    if (!response.ok) return [];
    const json = await response.json();
    return json.data || [];
  }, []);

  const executeScript = useCallback(async (code: string, symbol: string, interval: string, existingBars?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>, versionRef?: React.MutableRefObject<number>, version?: number, indicatorId?: string) => {
    setErrors([]);
    if (indicatorId) {
      indicatorSourcesRef.current.set(indicatorId, { source: code, symbol, interval, maxLookback: 0 });
    } else {
      lastCodeRef.current = code;
    }
    try {
      let barsToExecute = existingBars;
      if (!barsToExecute) {
        if (ohlcvDataRef.current.length > 0) {
          barsToExecute = ohlcvDataRef.current as typeof barsToExecute;
        } else {
          const ohlcvResponse = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=1000`);
          if (!ohlcvResponse.ok) throw new Error('Failed to fetch bars for execution');
          const ohlcvJson = await ohlcvResponse.json();
          ohlcvDataRef.current = ohlcvJson.data;
          barsToExecute = ohlcvJson.data as typeof barsToExecute;
        }
      } else {
        ohlcvDataRef.current = existingBars;
      }
      if (!barsToExecute) throw new Error('No bars available for execution');

      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: code, bars: barsToExecute }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error (${response.status}): ${text.slice(0, 200)}`);
      }

      const result: ExecuteResponse = await response.json();

      if (!result.success || result.error) {
        if (versionRef && version !== undefined && version !== versionRef.current) return;
        setErrors([{
          type: 'error',
          message: result.error || 'Execution failed',
        }]);
        return;
      }

      const maxLookback = result.maxLookback ?? 0;

      if (indicatorId) {
        const prev = indicatorSourcesRef.current.get(indicatorId);
        if (prev) prev.maxLookback = maxLookback;
      }

      if (maxLookback > 0) {
        const neededSeed = maxLookback;
        const seedBars = await fetchSeedBars(symbol, interval, neededSeed);
        if (seedBars.length > 0) {
          const originalBars = barsToExecute;
          barsToExecute = [...seedBars, ...barsToExecute];
          // NOTE: ohlcvDataRef.current is NOT updated here.
          // Seed bars are only needed for engine lookback computation.
          // Keeping them out of ohlcvDataRef ensures candle state stays
          // in sync with plot data (which has seed entries trimmed).

          const seedResponse = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: code, bars: barsToExecute }),
          });

          if (seedResponse.ok) {
            const seedResult: ExecuteResponse = await seedResponse.json();
            if (seedResult.success && !seedResult.error) {
              const seedScriptRes = buildScriptResult(
                seedResult.overlay,
                seedResult.outputs,
                seedResult.shapes || [],
                seedResult.fills || [],
                seedResult.strategyMarkers || [],
                barsToExecute,
                seedResult.bgcolor,
                seedResult.plotColors,
                seedResult.fillColorData,
                seedResult.lines,
                seedResult.labels,
                seedResult.barTimestamps,
                seedResult.alertConditions,
                seedResult.alertTriggers,
                seedResult.boxes,
                seedResult.tables,
                seedResult.hiddenPlotKeys,
              );

              // Trim seed bar data from plot results — seed bars are not in
              // ohlcvDataRef (and thus not in candles), so their plot entries
              // would have no matching candles and break the line renderer.
              const seedCount = seedBars.length;
              for (const plot of seedScriptRes.plots) {
                plot.data = plot.data.slice(seedCount);
              }
              if (seedScriptRes.fillColorData) {
                for (const key of Object.keys(seedScriptRes.fillColorData)) {
                  seedScriptRes.fillColorData[key] = seedScriptRes.fillColorData[key].slice(seedCount);
                }
              }

              // Trim seed bar strategy markers — their barIndex is relative to
              // the combined [seedBars, ...originalBars] array, so offset by
              // seedCount and drop any that fall within the seed range.
              if (seedScriptRes.strategyMarkers) {
                seedScriptRes.strategyMarkers = seedScriptRes.strategyMarkers
                  .filter((m) => m.barIndex >= seedCount)
                  .map((m) => ({ ...m, barIndex: m.barIndex - seedCount }));
              }

              if (versionRef && version !== undefined && version !== versionRef.current) return;

              if (indicatorId) {
                onIndicatorResult?.(indicatorId, seedScriptRes);
                const nextMap = new Map(indicatorResultsRef.current);
                nextMap.set(indicatorId, seedScriptRes);
                indicatorResultsRef.current = nextMap;
              } else {
                setCandles(toCandleData(originalBars));
                setScriptResult(seedScriptRes);
              }

              pendingExecuteRef.current.set(indicatorId || 'default', { source: code, symbol, interval, bars: barsToExecute });
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'execute',
                  data: { source: code, symbol, interval, bars: barsToExecute, indicatorId: indicatorId || 'default' },
                }));
              }
              return;
            }
          }
        }
      }

      const scriptRes = buildScriptResult(
        result.overlay,
        result.outputs,
        result.shapes || [],
        result.fills || [],
        result.strategyMarkers || [],
        barsToExecute,
        result.bgcolor,
        result.plotColors,
        result.fillColorData,
        result.lines,
        result.labels,
        result.barTimestamps,
        result.alertConditions,
        result.alertTriggers,
        result.boxes,
        result.tables,
        result.hiddenPlotKeys,
      );

      if (versionRef && version !== undefined && version !== versionRef.current) return;

      if (indicatorId) {
        onIndicatorResult?.(indicatorId, scriptRes);
        const nextMap = new Map(indicatorResultsRef.current);
        nextMap.set(indicatorId, scriptRes);
        indicatorResultsRef.current = nextMap;
      } else {
        setCandles(toCandleData(barsToExecute));
        setScriptResult(scriptRes);
      }

      pendingExecuteRef.current.set(indicatorId || 'default', { source: code, symbol, interval, bars: barsToExecute });
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'execute',
          data: { source: code, symbol, interval, bars: barsToExecute, indicatorId: indicatorId || 'default' },
        }));
      }
    } catch (error) {
      if (versionRef && version !== undefined && version !== versionRef.current) return;
      setErrors([{
        type: 'error',
        message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }]);
    }
  }, [toCandleData, onIndicatorResult, fetchSeedBars]);

  executeScriptRef.current = executeScript;

  return {
    candles,
    scriptResult,
    errors,
    isConnected,
    isLoading,
    executeScript,
    fetchOHLCV,
    fetchOlderOHLCV,
    subscribe,
    setErrors,
    lastCodeRef,
    prependCountRef,
    ohlcvDataRef,
    indicatorResultsRef,
    registerOnIndicatorRemoved: useCallback((cb: (indicatorIds: string[]) => void) => {
      onIndicatorRemovedRef.current = cb;
    }, []),
    removeIndicatorData: useCallback((indicatorId: string) => {
      indicatorResultsRef.current.delete(indicatorId);
      indicatorSourcesRef.current.delete(indicatorId);
      pendingExecuteRef.current.delete(indicatorId);
    }, []),
    indicatorSourcesRef,
    wsRef,
  };
}
