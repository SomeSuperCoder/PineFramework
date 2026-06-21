import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import type { CandlestickData, ScriptResult } from '../types';

interface ChartComponentProps {
  data: CandlestickData[];
  scriptResult: ScriptResult | null;
  dataVersion: number;
}

export function ChartComponent({ data, scriptResult, dataVersion }: ChartComponentProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const seriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#1a1a2e' },
        textColor: '#e0e0e0',
      },
      grid: {
        vertLines: { color: '#2a2a4e' },
        horzLines: { color: '#2a2a4e' },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: '#0f3460',
      },
      timeScale: {
        borderColor: '#0f3460',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#4caf50',
      downColor: '#e94560',
      borderUpColor: '#4caf50',
      borderDownColor: '#e94560',
      wickUpColor: '#4caf50',
      wickDownColor: '#e94560',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candlestickRef.current = candlestickSeries;
    volumeRef.current = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!candlestickRef.current || !volumeRef.current) return;

    const validData = data.filter((d) => d.time > 0 && isFinite(d.open) && isFinite(d.high) && isFinite(d.low) && isFinite(d.close));

    const candleData = validData.map((d) => ({
      time: d.time as unknown as import('lightweight-charts').Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumeData = validData.map((d) => ({
      time: d.time as unknown as import('lightweight-charts').Time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(76, 175, 80, 0.5)' : 'rgba(233, 69, 96, 0.5)',
    }));

    candlestickRef.current.setData(candleData);
    volumeRef.current.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
  }, [data, dataVersion]);

  useEffect(() => {
    if (!chartRef.current || !scriptResult) return;

    seriesRefs.current.forEach((series) => {
      chartRef.current?.removeSeries(series);
    });
    seriesRefs.current.clear();

    scriptResult.plots.forEach((plot, index) => {
      const series = chartRef.current?.addLineSeries({
        color: plot.color || '#2196f3',
        lineWidth: (plot.lineWidth as 1 | 2 | 3 | 4) || 1,
        title: plot.title || `Plot ${index + 1}`,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      if (series) {
        const lineData = plot.data
          .filter((d): d is { time: number; value: number } => d.value !== null)
          .map((d) => ({
            time: d.time as unknown as import('lightweight-charts').Time,
            value: d.value,
          }));
        series.setData(lineData);
        seriesRefs.current.set(`plot_${index}`, series);
      }
    });

    // Merge shapes and strategy markers into a single markers array
    const allMarkers: Array<{
      time: import('lightweight-charts').Time;
      position: import('lightweight-charts').SeriesMarkerPosition;
      shape: import('lightweight-charts').SeriesMarkerShape;
      color: string;
      text?: string;
    }> = [];

    if (scriptResult.shapes && scriptResult.shapes.length > 0) {
      const shapeMap: Record<string, string> = {
        triangleup: 'arrowUp',
        triangledown: 'arrowDown',
        circle: 'circle',
        square: 'square',
        diamond: 'circle',
        arrowup: 'arrowUp',
        arrowdown: 'arrowDown',
      };
      for (const s of scriptResult.shapes) {
        allMarkers.push({
          time: s.time as unknown as import('lightweight-charts').Time,
          position: (s.location === 'belowbar' ? 'belowBar' : 'aboveBar') as import('lightweight-charts').SeriesMarkerPosition,
          shape: (shapeMap[s.type] || 'circle') as import('lightweight-charts').SeriesMarkerShape,
          color: s.color || '#2196f3',
          text: s.text || undefined,
        });
      }
    }

    if (scriptResult.strategyMarkers && scriptResult.strategyMarkers.length > 0) {
      for (const m of scriptResult.strategyMarkers) {
        if (m.type === 'cancel' || m.type === 'cancel_all') continue;
        const isLong = m.direction === 'long';
        const isEntry = m.type === 'entry';
        allMarkers.push({
          time: Math.floor(m.timestamp / 1000) as unknown as import('lightweight-charts').Time,
          position: (isEntry ? 'belowBar' : 'aboveBar') as import('lightweight-charts').SeriesMarkerPosition,
          shape: ((isLong ? 'arrowUp' : 'arrowDown')) as import('lightweight-charts').SeriesMarkerShape,
          color: m.color || (isLong ? '#4caf50' : '#e91e63'),
          text: m.name || undefined,
        });
      }
    }

    if (allMarkers.length > 0) {
      const markerSeries = seriesRefs.current.values().next().value;
      if (markerSeries) {
        allMarkers.sort((a, b) => (a.time as number) - (b.time as number));
        markerSeries.setMarkers(allMarkers);
      }
    }

    if (scriptResult.fills && scriptResult.fills.length > 0) {
      const plotMap = new Map<string, Map<number, number>>();
      scriptResult.plots.forEach((plot) => {
        const tsMap = new Map<number, number>();
        plot.data.forEach((d) => {
          if (d.value !== null) tsMap.set(d.time, d.value);
        });
        plotMap.set(plot.title || '', tsMap);
      });
      scriptResult.fills.forEach((fill, index) => {
        const fromData = plotMap.get(fill.from);
        const toData = plotMap.get(fill.to);
        if (fromData && toData) {
          const allTimes = new Set([...fromData.keys(), ...toData.keys()]);
          const fillData = [...allTimes]
            .sort((a, b) => a - b)
            .map((time) => {
              const v1 = fromData.get(time);
              const v2 = toData.get(time);
              if (v1 !== undefined && v2 !== undefined) {
                return {
                  time: time as unknown as import('lightweight-charts').Time,
                  value: Math.max(v1, v2),
                };
              }
              return null;
            })
            .filter((d): d is { time: import('lightweight-charts').Time; value: number } => d !== null);
          if (fillData.length > 0) {
            const areaSeries = chartRef.current?.addAreaSeries({
              lineColor: fill.color,
              topColor: fill.color,
              bottomColor: 'transparent',
              lineWidth: 1,
              priceLineVisible: false,
              lastValueVisible: false,
              title: `Fill ${index + 1}`,
            });
            if (areaSeries) {
              areaSeries.setData(fillData);
              seriesRefs.current.set(`fill_${index}`, areaSeries as any);
            }
          }
        }
      });
    }

    if (scriptResult.lines) {
      scriptResult.lines.forEach((line, index) => {
        const series = chartRef.current?.addLineSeries({
          color: line.color || '#ffc107',
          lineWidth: (line.width as 1 | 2 | 3 | 4) || 1,
          lineStyle: line.style === 'dotted' ? 1 : line.style === 'dashed' ? 2 : 0,
          title: `Line ${index + 1}`,
          priceLineVisible: false,
          lastValueVisible: false,
        });

        if (series) {
          const lineData = line.points.map((p) => ({
            time: p.time as unknown as import('lightweight-charts').Time,
            value: p.price,
          }));
          series.setData(lineData);
          seriesRefs.current.set(`line_${index}`, series);
        }
      });
    }
  }, [scriptResult]);

  return (
    <div className="chart-panel">
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
