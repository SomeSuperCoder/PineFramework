import { useEffect, useRef, forwardRef } from 'react';
import { PineChart, createChart } from '../chart';
import type {
  CandlestickData,
  PlotSeriesData,
  ShapeMarkerData,
  FillData,
  LabelData,
  BoxData,
  StrategyMarkerData,
} from '../chart';
import type { ScriptResult } from '../types';

const COLORS = [
  '#2196f3',
  '#ff9800',
  '#4caf50',
  '#e91e63',
  '#9c27b0',
  '#00bcd4',
  '#ff5722',
  '#607d8b',
];

interface MiniChartProps {
  data: CandlestickData[];
  scriptResult: ScriptResult | null;
  dataVersion: number;
  height?: number;
}

export const MiniChart = forwardRef<HTMLDivElement, MiniChartProps>(function MiniChart(
  { data, scriptResult, dataVersion, height = 180 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<PineChart | null>(null);
  const seriesNamesRef = useRef<Set<string>>(new Set());

  // Create chart on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      background: '#0d0d18',
      textColor: '#c8c8d0',
      gridColor: '#181830',
      borderColor: '#151530',
      barSpacing: 6,
      priceScaleWidth: 0,
      timeScaleHeight: 0,
      interactive: false,
      showGrid: false,
      showAxisLabels: false,
    });

    chartRef.current = chart;
    console.log('[MiniChart] chart created');

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Bridge data to chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const result = scriptResult;
    console.log('[MiniChart] effect running', {
      candlesLen: data.length,
      hasResult: !!result,
      plotsCount: result?.plots?.length ?? 0,
      plotTitles: result?.plots?.map((p) => p.title),
    });

    chart.beginUpdate();

    if (data.length > 0) {
      chart.setCandles(data);
      chart.timeScale().fitContent();
    }

    const currentTitles = new Set<string>();
    let colorIndex = 0;

    if (result) {
      for (const plot of result.plots) {
        const title = plot.title || `Plot ${colorIndex + 1}`;
        const plotColor = plot.color || COLORS[colorIndex % COLORS.length];
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
          for (let j = seriesData.length; j < data.length; j++) {
            seriesData.push({ time: data[j].time, value: null, color: undefined });
          }
        }

        // Always call addPlotSeries — it's idempotent (returns existing handle if present).
        // We cannot rely on seriesNamesRef across remounts (Strict Mode) because the ref
        // survives unmount while the PineChart instance is recreated empty.
        chart.addPlotSeries(
          title,
          {
            color: plotColor,
            lineWidth: (plot.lineWidth as 1 | 2 | 3 | 4) || 1,
            style: (plot.type as any) || 'line',
          },
          result.overlay,
          undefined,
        );
        chart.setPlotData(title, seriesData);
      }

      console.log('[MiniChart] total plots added', { count: currentTitles.size, titles: [...currentTitles] });

      // Remove stale series
      for (const name of seriesNamesRef.current) {
        if (!currentTitles.has(name)) {
          chart.removeSeries(name);
        }
      }
      seriesNamesRef.current = currentTitles;

      // Collect fills
      const allFills: FillData[] = [];
      let allFillColorData: Record<string, (string | null)[]> = {};
      for (const f of result.fills || []) {
        allFills.push({ from: f.from, to: f.to, color: f.color });
      }
      if (result.fillColorData) {
        allFillColorData = result.fillColorData;
      }
      chart.setFills(allFills);
      if (Object.keys(allFillColorData).length > 0) {
        chart.setFillColorData(allFillColorData);
      }

      // Collect shapes
      const allShapeMarkers: ShapeMarkerData[] = [];
      const ohlcvMap = new Map<number, CandlestickData>();
      for (let i = 0; i < data.length; i++) {
        ohlcvMap.set(data[i].time, data[i]);
      }
      for (const s of result.shapes || []) {
        const candle = ohlcvMap.get(s.time);
        let barIdx = -1;
        if (candle) {
          for (let i = 0; i < data.length; i++) {
            if (data[i] === candle) {
              barIdx = i;
              break;
            }
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
          paneIndex: 0,
        });
      }
      chart.setMarkers(allShapeMarkers);

      // Collect drawing lines
      chart.setDrawingLines([]);

      // Collect strategy markers
      const allStrategyMarkers: StrategyMarkerData[] = [];
      for (const m of result.strategyMarkers || []) {
        allStrategyMarkers.push({
          type: m.type,
          name: m.name,
          direction: m.direction,
          timestamp: m.timestamp,
          color: m.color,
          comment: m.comment,
          barIndex: m.barIndex,
        });
      }
      chart.setStrategyMarkers(allStrategyMarkers);

      // Collect labels
      const allLabels: LabelData[] = [];
      for (const l of result.labels || []) {
        allLabels.push({
          time: l.time,
          price: l.price,
          text: l.text,
          color: l.color || '#2196f3',
          textColor: l.textColor || '#ffffff',
          style: l.style,
          size: l.size,
        });
      }
      chart.setLabels(allLabels);

      // Collect boxes
      const allBoxes: BoxData[] = [];
      for (const b of result.boxes || []) {
        allBoxes.push(b);
      }
      chart.setBoxes(allBoxes);

      // Collect bg colors
      const allBgColorsMap = new Map<number, string>();
      for (const b of result.bgcolor || []) {
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
      chart.setBgColors(allBgColorsMap);

      // Collect bar colors
      const barColorsMap = new Map<number, { body?: string; wick?: string; border?: string }>();
      const timeToIndex = new Map<number, number>();
      for (let i = 0; i < data.length; i++) {
        timeToIndex.set(data[i].time, i);
      }
      if (result.barColors) {
        for (const bc of result.barColors) {
          const timeSec = Math.floor(bc.time / 1000);
          const barIdx = timeToIndex.get(timeSec);
          if (barIdx === undefined) continue;
          const targetIdx =
            bc.offset !== undefined
              ? Math.min(Math.max(0, barIdx + bc.offset), data.length - 1)
              : barIdx;
          barColorsMap.set(targetIdx, { body: bc.body, wick: bc.wick, border: bc.border });
        }
      }
      chart.setBarColors(barColorsMap);

      chart.setAlertTriggers([]);
      chart.setTables([]);
    }

    chart.endUpdate();
  }, [data, scriptResult, dataVersion]);

  return (
    <div
      ref={(node) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={{
        width: '100%',
        height: `${height}px`,
        background: '#0d0d18',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    />
  );
});
