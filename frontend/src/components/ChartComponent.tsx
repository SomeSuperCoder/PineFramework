import { useEffect, useRef, useCallback } from 'react';
import { PineChart, createChart } from '../chart';
import type { CandlestickData, PlotSeriesData, ShapeMarkerData, StrategyMarkerData, FillData, DrawingLineData, LabelData } from '../chart';
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
  executeScript: (code: string, symbol: string, interval: string, existingBars?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>, versionRef?: React.MutableRefObject<number>, version?: number, indicatorId?: string) => Promise<void>;
  lastCodeRef: React.MutableRefObject<string | null>;
  ohlcvDataRef: React.MutableRefObject<Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>>;
  indicatorLabels?: IndicatorLabel[];
  onRemoveIndicator?: (indicatorId: string) => void;
}

export function ChartComponent({ data, scriptResult, dataVersion, symbol, interval, fetchOlderOHLCV, executeScript, lastCodeRef, ohlcvDataRef, indicatorLabels = [], onRemoveIndicator }: ChartComponentProps) {
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
      background: '#1a1a2e',
      textColor: '#e0e0e0',
      gridColor: '#2a2a4e',
      borderColor: '#0f3460',
      barSpacing: 8,
    });

    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  const isLoadingHistoryRef = useRef(false);
  const executeVersionRef = useRef(0);
  const fetchRef = useRef(fetchOlderOHLCV);
  fetchRef.current = fetchOlderOHLCV;
  const execRef = useRef(executeScript);
  execRef.current = executeScript;
  const codeRef = useRef(lastCodeRef);
  codeRef.current = lastCodeRef;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const ohlcvRef = useRef(ohlcvDataRef);
  ohlcvRef.current = ohlcvDataRef;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const onRangeChange = async (start: number) => {
      if (start > 50 || isLoadingHistoryRef.current) return;
      isLoadingHistoryRef.current = true;
      const sy = symbolRef.current;
      const iv = intervalRef.current;
      try {
        const added = await fetchRef.current(sy, iv);
        if (added > 0 && codeRef.current.current) {
          const version = ++executeVersionRef.current;
          await execRef.current(codeRef.current.current, sy, iv, ohlcvRef.current.current as unknown as Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>, executeVersionRef, version);
        }
      } finally {
        if (!isLoadingHistoryRef.current) return;
        isLoadingHistoryRef.current = false;
      }
    };

    chart.on('onVisibleRangeChange', onRangeChange);
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    const validData = data.filter(
      (d) => d.time > 0 && isFinite(d.open) && isFinite(d.high) && isFinite(d.low) && isFinite(d.close),
    );

    if (validData.length === 0) return;

    chart.setCandles(validData);

    if (shouldFitRef.current) {
      chart.timeScale().fitContent();
      shouldFitRef.current = false;
    }
  }, [data]);

  const prevScriptResultRef = useRef<ScriptResult | null>(null);
  useEffect(() => {
    if (!chartRef.current || !scriptResult) return;
    if (scriptResult === prevScriptResultRef.current) return;
    prevScriptResultRef.current = scriptResult;
    const chart = chartRef.current;
    chart.beginUpdate();

    const COLORS = ['#2196f3', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];
    let colorIndex = 0;

    const currentTitles = new Set<string>();

    for (const plot of scriptResult.plots) {
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

      chart.addPlotSeries(title, {
        color: plotColor,
        lineWidth: (plot.lineWidth as 1 | 2 | 3 | 4) || 1,
        style: (plot.type as any) || 'line',
      }, scriptResult.overlay);
      seriesNamesRef.current.add(title);
      chart.setPlotData(title, seriesData);
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

    const stratMarkers: StrategyMarkerData[] = (scriptResult.strategyMarkers || []).map((m) => ({
      type: m.type,
      name: m.name,
      direction: m.direction,
      timestamp: m.timestamp,
      color: m.color,
      comment: m.comment,
      barIndex: m.barIndex,
    }));
    chart.setStrategyMarkers(stratMarkers);

    chart.setAlertTriggers(scriptResult.alertTriggers || []);

    const fills: FillData[] = (scriptResult.fills || []).map((f) => ({
      from: f.from,
      to: f.to,
      color: f.color,
    }));
    chart.setFills(fills);
    if (scriptResult.fillColorData) {
      chart.setFillColorData(scriptResult.fillColorData);
    }

    const drawingLines: DrawingLineData[] = (scriptResult.lines || []).map((l) => ({
      points: l.points,
      color: l.color || '#2196f3',
      width: l.width || 1,
      style: l.style || 'dotted',
    }));
    chart.setDrawingLines(drawingLines);

    const chartLabels: LabelData[] = (scriptResult.labels || []).map((l) => ({
      time: l.time,
      price: l.price,
      text: l.text,
      color: l.color || '#2196f3',
      textColor: l.textColor || '#ffffff',
      style: l.style,
      size: l.size,
    }));
    chart.setLabels(chartLabels);

    chart.setHLines([]);
    chart.setBarColors(new Map());
    chart.endUpdate();
  }, [scriptResult]);

  useEffect(() => {
    if (!chartRef.current || !scriptResult) return;
    const chart = chartRef.current;

    const ohlcvMap = new Map<number, CandlestickData>();
    for (const c of data) {
      ohlcvMap.set(c.time, c);
    }

    chart.beginUpdate();

    const shapeMarkers: ShapeMarkerData[] = (scriptResult.shapes || []).map((s) => {
      const candle = ohlcvMap.get(s.time);
      const barIdx = candle ? data.indexOf(candle) : -1;
      return {
        time: s.time,
        position: (s.location || 'abovebar') as ShapeMarkerData['position'],
        shape: s.type,
        color: s.color || '#2196f3',
        text: s.text || undefined,
        barIndex: barIdx >= 0 ? barIdx : undefined,
        price: s.price,
        overlay: s.overlay,
      };
    });
    chart.setMarkers(shapeMarkers);

    const bgColorsMap = new Map<number, string>();
    for (const b of (scriptResult.bgcolor || [])) {
      const candle = ohlcvMap.get(b.time);
      if (candle) {
        const barIdx = data.indexOf(candle);
        if (barIdx >= 0) {
          bgColorsMap.set(barIdx, b.color);
        }
      }
    }
    chart.setBgColors(bgColorsMap);

    chart.endUpdate();
  }, [scriptResult, data]);

  const handleRemoveIndicator = useCallback((indicatorId: string) => {
    onRemoveIndicator?.(indicatorId);
  }, [onRemoveIndicator]);

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
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                background: 'rgba(30, 30, 46, 0.85)',
                border: `1px solid ${label.overlay ? '#2196f3' : '#ff9800'}`,
                borderRadius: '4px',
                fontSize: '11px',
                color: '#e0e0e0',
                cursor: 'default',
                whiteSpace: 'nowrap',
                pointerEvents: 'auto',
              }}
            >
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: label.overlay ? '#2196f3' : '#ff9800',
                flexShrink: 0,
              }} />
              <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label.name}
              </span>
              <button
                onClick={() => handleRemoveIndicator(label.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontSize: '12px',
                  lineHeight: 1,
                  pointerEvents: 'auto',
                }}
                title="Remove indicator"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
