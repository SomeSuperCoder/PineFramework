import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PineChart, createChart } from '../chart';
import type { CandlestickData, PlotSeriesData, ShapeMarkerData, StrategyMarkerData, FillData, DrawingLineData, LabelData, ChunkBorderData } from '../chart';
import type { ScriptResult } from '../types';

interface IndicatorLabel {
  id: string;
  name: string;
  overlay: boolean;
}

interface ChartComponentProps {
  data: CandlestickData[];
  scriptResult: ScriptResult | null;
  dataVersion: number;
  symbol: string;
  interval: string;
  fetchOlderOHLCV: (symbol: string, interval: string) => Promise<number>;
  indicatorLabels?: IndicatorLabel[];
  indicatorResults?: Map<string, ScriptResult>;
  computingIndicators?: Set<string>;
  onRemoveIndicator?: (indicatorId: string) => void;
  onEditIndicator?: (indicatorId: string) => void;
  forceAutoScale?: boolean;
  debugMode?: boolean;
  chunkBorders?: ChunkBorderData[];
}

export interface ChartComponentHandle {
  scrollToDate: (timestampSeconds: number) => void;
  setTeleportLine: (timeSeconds: number, options?: { color?: string; width?: number; style?: 'solid' | 'dotted' | 'dashed' }) => void;
  clearTeleportLine: () => void;
}

export const ChartComponent = forwardRef<ChartComponentHandle, ChartComponentProps>(function ChartComponent({ data, scriptResult, dataVersion, symbol, interval, fetchOlderOHLCV, indicatorLabels = [], indicatorResults = new Map(), computingIndicators = new Set(), onRemoveIndicator, onEditIndicator, forceAutoScale = false, debugMode = false, chunkBorders = [] }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<PineChart | null>(null);
  const seriesNamesRef = useRef<Set<string>>(new Set());
  const shouldFitRef = useRef(true);
  const prevDataVersionRef = useRef(dataVersion);

  if (dataVersion !== prevDataVersionRef.current) {
    prevDataVersionRef.current = dataVersion;
    shouldFitRef.current = true;
  }

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      background: '#0d0d18',
      textColor: '#e0e0e0',
      gridColor: '#181830',
      borderColor: '#111128',
      barSpacing: 8,
    });

    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setForceAutoScale(forceAutoScale);
  }, [forceAutoScale]);

  useEffect(() => {
    chartRef.current?.setDebugMode(debugMode);
  }, [debugMode]);

  useEffect(() => {
    chartRef.current?.setChunkBorders(chunkBorders);
  }, [chunkBorders]);

  // Test data bridge for Playwright e2e tests
  useEffect(() => {
    if (!debugMode) {
      // Production safety: clear any stale bridge data
      if (typeof window !== 'undefined') {
        if ((window as any).__pineTestData) {
          delete (window as any).__pineTestData;
        }
        if ((window as any).__pineChart) {
          delete (window as any).__pineChart;
        }
      }
      return;
    }
    // Expose chart instance and helpers for test programmatic operations
    (window as any).__pineChart = chartRef.current;
    (window as any).__pineFetchOlder = fetchOlderOHLCV;
    const indicators: Array<{
      id: string;
      name: string;
      labels: Array<{ time: number; price: number; text?: string }>;
      lines: Array<{ points: Array<{ time: number; price: number }> }>;
    }> = [];
    if (indicatorResults) {
      for (const [id, res] of indicatorResults) {
        indicators.push({
          id,
          name: id,
          labels: res.labels || [],
          lines: res.lines || [],
        });
      }
    }
    (window as any).__pineTestData = {
      indicators,
      chunkBorders,
      labelCount: indicators.reduce((sum, ind) => sum + ind.labels.length, 0),
      lineCount: indicators.reduce((sum, ind) => sum + ind.lines.length, 0),
    };
  }, [debugMode, indicatorResults, chunkBorders]);

  const isLoadingHistoryRef = useRef(false);
  const fetchRef = useRef(fetchOlderOHLCV);
  fetchRef.current = fetchOlderOHLCV;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const prevFirstTimeRef = useRef<number | undefined>(undefined);
  const wasPrependedRef = useRef(false);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const onRangeChange = async () => {
      if (isLoadingHistoryRef.current) return;
      const chart = chartRef.current;
      if (!chart) return;
      const range = chart.timeScale().getVisibleRange();
      // range.start is the first bar index visible on screen.
      // Only trigger scroll-back when the user is within 50 bars of
      // the oldest loaded data (i.e. they've scrolled nearly to the
      // left edge of the chart).
      if (range.start > 50) return;
      isLoadingHistoryRef.current = true;
      const sy = symbolRef.current;
      const iv = intervalRef.current;
      try {
        await fetchRef.current(sy, iv);
        // Note: we do NOT set shouldFitRef here. fetchOlderOHLCV already
        // manages hasMoreHistoryRef internally. Calling fitContent() when
        // scroll-back reaches the end would teleport the user from the
        // oldest bars back to the newest — the opposite of what they want.
        //
        // The chart's prepend handling in setCandles + adjustForPrepend
        // correctly maintains the viewport position after new bars arrive.
      } finally {
        isLoadingHistoryRef.current = false;
      }
    };

    chart.on('onVisibleRangeChange', onRangeChange);
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    const allResults: Array<{ result: ScriptResult }> = [];
    if (scriptResult) allResults.push({ result: scriptResult });
    if (indicatorResults) {
      for (const [, res] of indicatorResults) {
        allResults.push({ result: res });
      }
    }

    chart.beginUpdate();

    if (data.length > 0) {
      // Detect prepend: new data starts with an older bar than before
      wasPrependedRef.current =
        prevFirstTimeRef.current !== undefined &&
        data[0]?.time !== undefined &&
        data[0].time < prevFirstTimeRef.current;
      prevFirstTimeRef.current = data[0]?.time;

      chart.setCandles(data);

      // If data was prepended (scroll-back), NEVER fitContent — that would
      // teleport the user from the oldest bars back to the newest ones.
      if (shouldFitRef.current && !wasPrependedRef.current) {
        chart.timeScale().fitContent();
        shouldFitRef.current = false;
      } else {
        // Clear the flag even if we skipped fitContent so it doesn't
        // trigger on a future non-prepended update (e.g. timeframe switch).
        shouldFitRef.current = false;
      }
    }

    const COLORS = ['#2196f3', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];

    const currentTitles = new Set<string>();
    let colorIndex = 0;
    let nonOverlayPaneIndex = 0;

    for (const { result } of allResults) {
      const paneIndex = result.overlay ? undefined : nonOverlayPaneIndex++;
      for (const plot of result.plots) {
        let title = plot.title || `Plot ${colorIndex + 1}`;
        let plotColor = plot.color || COLORS[colorIndex % COLORS.length];
        colorIndex++;
        currentTitles.add(title);

        const seriesData: PlotSeriesData[] = [];

        for (const d of plot.data) {
          if (d.value !== null && d.value !== undefined && typeof d.value === 'number') {
            seriesData.push({ time: d.time, value: d.value, color: d.color });
          } else {
            seriesData.push({ time: d.time, value: null, color: d.color });
          }
        }

        if (data.length > seriesData.length && seriesData.length > 0) {
          // Pad with null instead of repeating last value to avoid showing
          // incorrect data for bars before the indicator started computing
          for (let j = seriesData.length; j < data.length; j++) {
            seriesData.push({
              time: data[j].time,
              value: null,
              color: undefined,
            });
          }
        }

        if (!seriesNamesRef.current.has(title)) {
          chart.addPlotSeries(title, {
            color: plotColor,
            lineWidth: (plot.lineWidth as 1 | 2 | 3 | 4) || 1,
            style: (plot.type as any) || 'line',
          }, result.overlay, paneIndex);
        }
        seriesNamesRef.current.add(title);
        chart.setPlotData(title, seriesData);
      }
    }

    for (const name of seriesNamesRef.current) {
      if (!currentTitles.has(name)) {
        chart.removeSeries(name);
      }
    }
    seriesNamesRef.current.clear();
    for (const title of currentTitles) {
      seriesNamesRef.current.add(title);
    }

    // Collect hidden plot titles from all results and mark them in PineChart
    // so they don't render as visible lines (display=display.none fill references).
    const allHiddenTitles: string[] = [];
    for (const { result } of allResults) {
      if (result.hiddenPlotTitles) {
        for (const t of result.hiddenPlotTitles) {
          allHiddenTitles.push(t);
        }
      }
    }
    chart.setHiddenPlots(allHiddenTitles);

    const allStrategyMarkers: StrategyMarkerData[] = [];
    const allFills: FillData[] = [];
    let allFillColorData: Record<string, (string | null)[]> = {};
    const allDrawingLines: DrawingLineData[] = [];
    const allChartLabels: LabelData[] = [];
    const allAlertTriggers: import('../types').AlertTriggerData[] = [];
    const allBoxes: import('../types').BoxData[] = [];
    const allTables: import('../types').TableData[] = [];

    for (const { result } of allResults) {
      for (const m of (result.strategyMarkers || [])) {
        allStrategyMarkers.push({
          type: m.type, name: m.name, direction: m.direction,
          timestamp: m.timestamp, color: m.color, comment: m.comment, barIndex: m.barIndex,
        });
      }
      for (const f of (result.fills || [])) {
        allFills.push({ from: f.from, to: f.to, color: f.color });
      }
      if (result.fillColorData) {
        allFillColorData = { ...allFillColorData, ...result.fillColorData };
      }
      for (const l of (result.lines || [])) {
        allDrawingLines.push({
          points: l.points, color: l.color || '#2196f3',
          width: l.width || 1, style: l.style || 'dotted',
          extend: l.extend || 'none',
        });
      }
      for (const l of (result.labels || [])) {
        allChartLabels.push({
          time: l.time, price: l.price, text: l.text,
          color: l.color || '#2196f3', textColor: l.textColor || '#ffffff',
          style: l.style, size: l.size,
        });
      }
      // Resolve Pine Script alert template placeholders
      const resolveAlertMsg = (msg: string, barIdx: number): string => {
        const candle = barIdx >= 0 && barIdx < data.length ? data[barIdx] : undefined;
        return msg
          .replace(/\{\{ticker\}\}/g, symbol ?? '')
          .replace(/\{\{interval\}\}/g, interval ?? '')
          .replace(/\{\{tickerid\}\}/g, symbol ?? '')
          .replace(/\{\{exchange\}\}/g, '')
          .replace(/\{\{close\}\}/g, candle ? candle.close.toFixed(2) : '')
          .replace(/\{\{open\}\}/g, candle ? candle.open.toFixed(2) : '')
          .replace(/\{\{high\}\}/g, candle ? candle.high.toFixed(2) : '')
          .replace(/\{\{low\}\}/g, candle ? candle.low.toFixed(2) : '')
          .replace(/\{\{volume\}\}/g, candle ? candle.volume.toFixed(0) : '')
          .replace(/\{\{time\}\}/g, candle ? new Date(candle.time * 1000).toISOString() : '');
      };
      // Enrich alertTriggers with title/message from alertConditions, resolving placeholders
      const condMap = new Map<string, import('../types').AlertConditionData>();
      for (const c of (result.alertConditions || [])) {
        condMap.set(c.id, c);
      }
      for (const t of (result.alertTriggers || [])) {
        const cond = condMap.get(t.alertId);
        const rawMsg = cond?.message ?? t.message ?? '';
        allAlertTriggers.push({
          alertId: t.alertId,
          barIndex: t.barIndex,
          timestamp: t.timestamp,
          title: cond?.title ?? t.title,
          message: resolveAlertMsg(rawMsg, t.barIndex),
        });
      }
      for (const b of (result.boxes || [])) {
        allBoxes.push(b);
      }
      for (const t of (result.tables || [])) {
        allTables.push(t);
      }
    }

    const allShapeMarkers: ShapeMarkerData[] = [];
    const allBgColorsMap = new Map<number, string>();
    const ohlcvMap = new Map<number, CandlestickData>();
    for (let i = 0; i < data.length; i++) {
      ohlcvMap.set(data[i].time, data[i]);
    }

    for (const { result } of allResults) {
      // Find the pane index for this result
      const resultPaneIndex = Array.from(indicatorResults.entries()).findIndex(([, v]) => v === result);
      const paneIndex = resultPaneIndex >= 0 ? resultPaneIndex : 0;
      
      for (const s of (result.shapes || [])) {
        const candle = ohlcvMap.get(s.time);
        let barIdx = -1;
        if (candle) {
          for (let i = 0; i < data.length; i++) {
            if (data[i] === candle) { barIdx = i; break; }
          }
        }
        allShapeMarkers.push({
          time: s.time,
          position: (s.location || 'abovebar') as ShapeMarkerData['position'],
          shape: s.style || s.type,
          color: s.color || '#2196f3',
          text: s.text || undefined,
          textcolor: s.textcolor,
          barIndex: barIdx >= 0 ? barIdx : undefined,
          price: s.price,
          overlay: s.overlay,
          paneIndex,
        });
      }
      for (const b of (result.bgcolor || [])) {
        const candle = ohlcvMap.get(b.time);
        if (candle) {
          for (let i = 0; i < data.length; i++) {
            if (data[i] === candle) {
              allBgColorsMap.set(i, b.color);
              break;
            }
          }
        }
      }
    }

    chart.setStrategyMarkers(allStrategyMarkers);
    chart.setAlertTriggers(allAlertTriggers);
    chart.setFills(allFills);
    if (Object.keys(allFillColorData).length > 0) {
      chart.setFillColorData(allFillColorData);
    }
    chart.setDrawingLines(allDrawingLines);
    chart.setLabels(allChartLabels);
    chart.setBoxes(allBoxes);
    chart.setTables(allTables);
    chart.setMarkers(allShapeMarkers);
    chart.setBgColors(allBgColorsMap);
    chart.setHLines([]);
    // Convert ScriptResult.barColors (time-keyed array with body/wick/border/offset) to
    // Map<number, CandleColorData> keyed by bar index for the chart renderer.
    const barColorsMap = new Map<number, { body?: string; wick?: string; border?: string }>();
    const timeToIndex = new Map<number, number>();
    for (let i = 0; i < data.length; i++) {
      timeToIndex.set(data[i].time, i);
    }
    for (const { result } of allResults) {
      if (!result.barColors) continue;
      for (const bc of result.barColors) {
        // bc.time is in milliseconds (from engine), data[i].time is in seconds (from toCandleData)
        const timeSec = Math.floor(bc.time / 1000);
        const barIdx = timeToIndex.get(timeSec);
        if (barIdx === undefined) continue;
        const targetIdx = bc.offset !== undefined ? Math.min(Math.max(0, barIdx + bc.offset), data.length - 1) : barIdx;
        barColorsMap.set(targetIdx, { body: bc.body, wick: bc.wick, border: bc.border });
      }
    }
    chart.setBarColors(barColorsMap);

    chart.endUpdate();
  }, [data, scriptResult, indicatorResults]);

  useImperativeHandle(ref, () => ({
    scrollToDate: (timestampSeconds: number) => {
      const chart = chartRef.current;
      if (!chart) return;
      let lo = 0;
      let hi = data.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (data[mid].time < timestampSeconds) lo = mid + 1;
        else if (data[mid].time > timestampSeconds) hi = mid - 1;
        else { lo = mid; break; }
      }
      const idx = Math.min(Math.max(lo, 0), data.length - 1);
      chart.timeScale().scrollTo(idx);
    },
    setTeleportLine: (timeSeconds: number, options?: { color?: string; width?: number; style?: 'solid' | 'dotted' | 'dashed'; label?: string }) => {
      const chart = chartRef.current;
      if (!chart) return;
      chart.timeScale().setTeleportLine(timeSeconds, options);
    },
    clearTeleportLine: () => {
      const chart = chartRef.current;
      if (!chart) return;
      chart.timeScale().clearTeleportLine();
    },
  }), [data]);

  const handleRemoveIndicator = useCallback((indicatorId: string) => {
    onRemoveIndicator?.(indicatorId);
  }, [onRemoveIndicator]);

  const handleEditIndicator = useCallback((indicatorId: string) => {
    onEditIndicator?.(indicatorId);
  }, [onEditIndicator]);

  const labelButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#aaa',
    cursor: 'pointer',
    padding: '2px 4px',
    fontSize: '13px',
    lineHeight: 1,
    borderRadius: '3px',
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
  };

  return (
    <div className="chart-panel" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {indicatorLabels.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          zIndex: 10,
          pointerEvents: 'auto',
        }}>
          {indicatorLabels.map((label) => (
            <div
              key={label.id}
              title={label.name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                background: 'rgba(12, 15, 30, 0.9)',
                border: `1px solid ${label.overlay ? '#2196f3' : '#ff9800'}`,
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                color: '#e0e0e0',
                cursor: 'default',
                whiteSpace: 'nowrap',
                pointerEvents: 'auto',
              }}
            >
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: label.overlay ? '#2196f3' : '#ff9800',
                flexShrink: 0,
              }} />
              <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label.name}
              </span>
              {computingIndicators.has(label.id) ? (
                <span title="Computing..." style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '14px', height: '14px', fontSize: '10px', flexShrink: 0,
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="6" cy="6" r="4" fill="none" stroke="#ffa726" strokeWidth="1.5"
                      strokeDasharray="18.85 6.28" strokeLinecap="round" />
                  </svg>
                </span>
              ) : (
                <span title="Ready" style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '14px', height: '14px', fontSize: '8px', flexShrink: 0,
                  color: '#4caf50',
                }}>✓</span>
              )}
              <button
                onClick={() => handleEditIndicator(label.id)}
                style={labelButtonStyle}
                title="Edit script"
                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.background = 'none'; }}
              >
                &#9998;
              </button>
              <button
                onClick={() => handleRemoveIndicator(label.id)}
                style={labelButtonStyle}
                title="Remove indicator"
                onMouseEnter={(e) => { e.currentTarget.style.color = '#e94560'; e.currentTarget.style.background = 'rgba(233,69,96,0.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.background = 'none'; }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
