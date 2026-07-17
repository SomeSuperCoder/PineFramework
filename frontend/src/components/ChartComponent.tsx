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
  onEditIndicator?: (indicatorId: string) => void;
  forceAutoScale?: boolean;
}

export function ChartComponent({ data, scriptResult, dataVersion, symbol, interval, fetchOlderOHLCV, indicatorLabels = [], indicatorResults = new Map(), onRemoveIndicator, onEditIndicator, forceAutoScale = false }: ChartComponentProps) {
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

    const allResults: Array<{ result: ScriptResult }> = [];
    if (scriptResult) allResults.push({ result: scriptResult });
    if (indicatorResults) {
      for (const [, res] of indicatorResults) {
        allResults.push({ result: res });
      }
    }

    chart.beginUpdate();

    if (data.length > 0) {
      chart.setCandles(data);

      if (shouldFitRef.current) {
        chart.timeScale().fitContent();
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
          const lastPoint = seriesData[seriesData.length - 1];
          for (let j = seriesData.length; j < data.length; j++) {
            seriesData.push({
              time: data[j].time,
              value: lastPoint.value,
              color: lastPoint.color,
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

    const allStrategyMarkers: StrategyMarkerData[] = [];
    const allFills: FillData[] = [];
    let allFillColorData: Record<string, (string | null)[]> = {};
    const allDrawingLines: DrawingLineData[] = [];
    const allChartLabels: LabelData[] = [];
    const allAlertTriggers: import('../types').AlertTriggerData[] = [];
    const allBoxes: import('../types').BoxData[] = [];

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
      for (const b of (result.boxes || [])) {
        allBoxes.push(b);
      }
    }

    const allShapeMarkers: ShapeMarkerData[] = [];
    const allBgColorsMap = new Map<number, string>();
    const ohlcvMap = new Map<number, CandlestickData>();
    for (let i = 0; i < data.length; i++) {
      ohlcvMap.set(data[i].time, data[i]);
    }

    for (const { result } of allResults) {
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
          shape: s.type,
          color: s.color || '#2196f3',
          text: s.text || undefined,
          textcolor: s.textcolor,
          barIndex: barIdx >= 0 ? barIdx : undefined,
          price: s.price,
          overlay: s.overlay,
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
    chart.setMarkers(allShapeMarkers);
    chart.setBgColors(allBgColorsMap);
    chart.setHLines([]);
    chart.setBarColors(new Map());

    chart.endUpdate();
  }, [data, scriptResult, indicatorResults]);

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
}
