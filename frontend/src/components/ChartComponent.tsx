import { useEffect, useRef } from 'react';
import { PineChart, createChart } from '../chart';
import type { CandlestickData, PlotSeriesData, ShapeMarkerData, StrategyMarkerData, FillData } from '../chart';
import type { ScriptResult } from '../types';

interface ChartComponentProps {
  data: CandlestickData[];
  scriptResult: ScriptResult | null;
  dataVersion: number;
}

export function ChartComponent({ data, scriptResult, dataVersion }: ChartComponentProps) {
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

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    const validData = data.filter(
      (d) => d.time > 0 && isFinite(d.open) && isFinite(d.high) && isFinite(d.low) && isFinite(d.close),
    );

    chart.setCandles(validData);

    if (shouldFitRef.current && validData.length > 10) {
      chart.timeScale().scrollTo(validData.length - 1);
      shouldFitRef.current = false;
    }
  }, [data]);

  useEffect(() => {
    if (!chartRef.current || !scriptResult) return;
    const chart = chartRef.current;

    for (const name of seriesNamesRef.current) {
      chart.removeSeries(name);
    }
    seriesNamesRef.current.clear();

    const COLORS = ['#2196f3', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];
    let colorIndex = 0;

    const ohlcvMap = new Map<number, CandlestickData>();
    for (const c of data) {
      ohlcvMap.set(c.time, c);
    }

    const plotKeyToTimeMap = new Map<string, Map<number, number>>();

    for (const plot of scriptResult.plots) {
      let title = plot.title || `Plot ${colorIndex + 1}`;
      let plotColor = plot.color || COLORS[colorIndex % COLORS.length];
      colorIndex++;

      chart.addPlotSeries(title, {
        color: plotColor,
        lineWidth: (plot.lineWidth as 1 | 2 | 3 | 4) || 1,
        style: plot.type as any || 'line',
      });
      seriesNamesRef.current.add(title);

      const seriesData: PlotSeriesData[] = [];
      const tsMap = new Map<number, number>();

      for (const d of plot.data) {
        if (d.value !== null && d.value !== undefined && typeof d.value === 'number') {
          seriesData.push({ time: d.time, value: d.value });
          tsMap.set(d.time, d.value);
        } else {
          seriesData.push({ time: d.time, value: null });
        }
      }

      plotKeyToTimeMap.set(title, tsMap);
      chart.setPlotData(title, seriesData);
    }

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
      };
    });
    chart.setMarkers(shapeMarkers);

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

    const fills: FillData[] = (scriptResult.fills || []).map((f) => ({
      from: f.from,
      to: f.to,
      color: f.color,
    }));
    chart.setFills(fills);

    chart.setHLines([]);

    chart.setBarColors(new Map());
  }, [scriptResult, data]);

  return (
    <div className="chart-panel" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
