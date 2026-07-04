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
  indicatorLabels?: IndicatorLabel[];
  indicatorResults?: Map<string, ScriptResult>;
  onRemoveIndicator?: (indicatorId: string) => void;
}

export function ChartComponent({ data, scriptResult, dataVersion, symbol, interval, fetchOlderOHLCV, indicatorLabels = [], indicatorResults = new Map(), onRemoveIndicator }: ChartComponentProps) {
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
  const fetchRef = useRef(fetchOlderOHLCV);
  fetchRef.current = fetchOlderOHLCV;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const onRangeChange = async (start: number) => {
      if (start > 50 || isLoadingHistoryRef.current) return;
      isLoadingHistoryRef.current = true;
      const sy = symbolRef.current;
      const iv = intervalRef.current;
      try {
        await fetchRef.current(sy, iv);
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
  const prevIndicatorResultsRef = useRef<Map<string, ScriptResult>>(new Map());
  useEffect(() => {
    if (!chartRef.current) return;
    if (scriptResult === prevScriptResultRef.current && indicatorResults === prevIndicatorResultsRef.current) return;
    prevScriptResultRef.current = scriptResult;
    prevIndicatorResultsRef.current = indicatorResults;
    const chart = chartRef.current;
    chart.beginUpdate();

    const COLORS = ['#2196f3', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];

    const allResults: Array<{ result: ScriptResult; key: string }> = [];
    if (scriptResult) allResults.push({ result: scriptResult, key: 'main' });
    if (indicatorResults) {
      for (const [id, res] of indicatorResults) {
        allResults.push({ result: res, key: id });
      }
    }

    const currentTitles = new Set<string>();
    let colorIndex = 0;

    for (const { result } of allResults) {
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

        chart.addPlotSeries(title, {
          color: plotColor,
          lineWidth: (plot.lineWidth as 1 | 2 | 3 | 4) || 1,
          style: (plot.type as any) || 'line',
        }, result.overlay);
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

    const allStrategyMarkers: StrategyMarkerData[] = [];
    const allFills: FillData[] = [];
    let allFillColorData: Record<string, (string | null)[]> = {};
    const allDrawingLines: DrawingLineData[] = [];
    const allChartLabels: LabelData[] = [];
    const allAlertTriggers: import('../types').AlertTriggerData[] = [];

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
        });
      }
      for (const l of (result.labels || [])) {
        allChartLabels.push({
          time: l.time, price: l.price, text: l.text,
          color: l.color || '#2196f3', textColor: l.textColor || '#ffffff',
          style: l.style, size: l.size,
        });
      }
      for (const t of (result.alertTriggers || [])) {
        allAlertTriggers.push(t);
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

    chart.setHLines([]);
    chart.setBarColors(new Map());
    chart.endUpdate();
  }, [scriptResult, indicatorResults]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    const allResults: Array<{ result: ScriptResult; key: string }> = [];
    if (scriptResult) allResults.push({ result: scriptResult, key: 'main' });
    if (indicatorResults) {
      for (const [id, res] of indicatorResults) {
        allResults.push({ result: res, key: id });
      }
    }
    if (allResults.length === 0) return;

    const ohlcvMap = new Map<number, CandlestickData>();
    for (const c of data) {
      ohlcvMap.set(c.time, c);
    }

    chart.beginUpdate();

    const allShapeMarkers: ShapeMarkerData[] = [];
    const allBgColorsMap = new Map<number, string>();

    for (const { result } of allResults) {
      for (const s of (result.shapes || [])) {
        const candle = ohlcvMap.get(s.time);
        const barIdx = candle ? data.indexOf(candle) : -1;
        allShapeMarkers.push({
          time: s.time,
          position: (s.location || 'abovebar') as ShapeMarkerData['position'],
          shape: s.type,
          color: s.color || '#2196f3',
          text: s.text || undefined,
          barIndex: barIdx >= 0 ? barIdx : undefined,
          price: s.price,
          overlay: s.overlay,
        });
      }
      for (const b of (result.bgcolor || [])) {
        const candle = ohlcvMap.get(b.time);
        if (candle) {
          const barIdx = data.indexOf(candle);
          if (barIdx >= 0) {
            allBgColorsMap.set(barIdx, b.color);
          }
        }
      }
    }

    chart.setMarkers(allShapeMarkers);
    chart.setBgColors(allBgColorsMap);

    chart.endUpdate();
  }, [scriptResult, indicatorResults, data]);

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
