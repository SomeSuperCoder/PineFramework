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
