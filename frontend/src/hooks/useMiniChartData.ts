import { useState, useEffect, useRef, useCallback } from 'react';
import type { CandlestickData } from '../chart';
import type { ScriptResult } from '../types';
import { buildScriptResult } from './chart-data-transform';

const DEFAULT_DISPLAY_COUNT = 12;
const FETCH_LIMIT = 200; // enough for lookback periods

interface MiniChartDataResult {
  displayCandles: CandlestickData[];
  displayScriptResult: ScriptResult | null;
  dataVersion: number;
  loading: boolean;
}

/**
 * Fetches OHLCV data and executes the Pine Script to produce candle + indicator
 * data for a mini chart. Subscribes to the main WebSocket for real-time kline
 * updates. Slices the last N candles for display while keeping the full dataset
 * for lookback satisfaction.
 */
export function useBotMiniChartData(
  backendUrl: string,
  symbol: string | null,
  interval: string | null,
  strategySource: string | null,
  displayCount: number = DEFAULT_DISPLAY_COUNT,
): MiniChartDataResult {
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const candlesRef = useRef<CandlestickData[]>([]);
  const strategyRef = useRef<string | null>(null);
  const symbolRef = useRef<string | null>(null);
  const intervalRef = useRef<string | null>(null);

  // Keep refs in sync
  candlesRef.current = candles;
  strategyRef.current = strategySource;
  symbolRef.current = symbol;
  intervalRef.current = interval;

  // Execute script against current candles
  const executeScript = useCallback(
    async (src: string, bars: CandlestickData[]) => {
      console.log('[MiniData] executeScript called', { srcLen: src?.length, barsLen: bars?.length });
      if (!src || bars.length === 0) {
        console.log('[MiniData] executeScript SKIPPED', { src: !!src, barsLen: bars?.length });
        return null;
      }
      try {
        const response = await fetch(`${backendUrl}/api/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: src,
            bars: bars.map((b) => ({
              timestamp: b.time * 1000,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
              volume: b.volume,
            })),
          }),
        });
        if (!response.ok) {
          console.log('[MiniData] executeScript HTTP error', response.status);
          return null;
        }
        const execResult = await response.json();
        console.log('[MiniData] executeScript result', {
          success: execResult.success,
          error: execResult.error,
          overlay: execResult.overlay,
          outputKeys: Object.keys(execResult.outputs || {}),
          outputCounts: Object.entries(execResult.outputs || {}).map(([k, v]) => [k, (v as any[])?.length]),
          shapesCount: (execResult.shapes || []).length,
          fillsCount: (execResult.fills || []).length,
          strategyMarkersCount: (execResult.strategyMarkers || []).length,
        });
        const result = buildScriptResult(
          true, // overlay
          execResult.outputs || {},
          execResult.shapes || [],
          execResult.fills || [],
          execResult.strategyMarkers || [],
          bars.map((b) => ({ timestamp: b.time * 1000 })),
          execResult.bgcolor,
          execResult.plotColors,
          execResult.fillColorData,
          execResult.lines,
          execResult.labels,
          undefined, // barTimestamps
          execResult.alertConditions,
          execResult.alertTriggers,
          execResult.boxes,
          execResult.tables,
          execResult.hiddenPlotKeys,
          execResult.barColors,
        );
        console.log('[MiniData] buildScriptResult', {
          plotsCount: result.plots.length,
          plotTitles: result.plots.map((p) => p.title),
          plotDataLengths: result.plots.map((p) => p.data.length),
          nonNullPerPlot: result.plots.map((p) => p.data.filter((d) => d.value !== null).length),
        });
        return result;
      } catch (e) {
        console.log('[MiniData] executeScript ERROR', e);
        return null;
      }
    },
    [backendUrl],
  );

  // Fetch initial OHLCV data
  useEffect(() => {
    console.log('[MiniData] fetch effect running', { symbol, interval, strategySource: strategyRef.current?.slice(0, 30) });
    if (!symbol || !interval) return;

    let cancelled = false;

    const fetchAndExecute = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${backendUrl}/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=${FETCH_LIMIT}`,
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled) return;

        const barData: CandlestickData[] = (json.data || []).map((b: any) => ({
          time: Math.floor((b.timestamp || b.time) / 1000),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
        }));

        console.log('[MiniData] OHLCV fetched', { count: barData.length, first: barData[0]?.time, last: barData[barData.length - 1]?.time });
        setCandles(barData);
        setDataVersion((v) => v + 1);

        // Execute script if we have one
        console.log('[MiniData] strategyRef.current at execute time', { hasStrategy: !!strategyRef.current, len: strategyRef.current?.length });
        if (strategyRef.current) {
          const result = await executeScript(strategyRef.current, barData);
          if (!cancelled && result) {
            console.log('[MiniData] setting scriptResult from fetch effect', { plots: result.plots.length });
            setScriptResult(result);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAndExecute();

    return () => {
      cancelled = true;
    };
  }, [symbol, interval, backendUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-execute script when strategy source changes
  useEffect(() => {
    console.log('[MiniData] strategy effect running', { strategySource: strategySource?.slice(0, 30), candlesLen: candles.length });
    if (!strategySource || candles.length === 0) return;
    let cancelled = false;
    executeScript(strategySource, candles).then((result) => {
      if (!cancelled && result) {
        setScriptResult(result);
        setDataVersion((v) => v + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [strategySource]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to WebSocket for real-time kline updates
  useEffect(() => {
    if (!symbol || !interval) return;

    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Subscribe to kline topic
      ws.send(JSON.stringify({ op: 'subscribe', args: [`kline.${interval}.${symbol}`] }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'kline' && msg.data) {
          const k = msg.data;
          const candleTime = Math.floor(k.timestamp / 1000);
          const newCandle: CandlestickData = {
            time: candleTime,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
            volume: k.volume,
          };

          setCandles((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].time === candleTime) {
              // Update existing candle (forming or confirmed)
              const updated = [...prev];
              updated[lastIdx] = newCandle;
              return updated;
            } else {
              // New candle — append and trim to keep last FETCH_LIMIT
              const updated = [...prev, newCandle];
              if (updated.length > FETCH_LIMIT) {
                return updated.slice(-FETCH_LIMIT);
              }
              return updated;
            }
          });
          setDataVersion((v) => v + 1);
        }
      } catch {
        /* ignore parse errors */
      }
    };

    ws.onerror = () => ws.close();
    ws.onclose = () => {
      // Reconnect after delay
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 3000);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [symbol, interval, backendUrl]);

  // Re-execute script when candles or strategy change (debounced)
  useEffect(() => {
    if (!strategyRef.current || candles.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await executeScript(strategyRef.current!, candles);
      if (!cancelled && result) {
        setScriptResult(result);
      }
    }, 100); // debounce 100ms for rapid candle updates
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candles, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Slice for display
  const sliceStart = Math.max(0, candles.length - displayCount);
  const displayCandles = candles.slice(sliceStart);

  let displayScriptResult: ScriptResult | null = null;
  if (scriptResult) {
    const visibleTimes = new Set(displayCandles.map((c) => c.time));
    displayScriptResult = {
      ...scriptResult,
      plots: scriptResult.plots.map((plot) => ({
        ...plot,
        data: plot.data.filter((d) => visibleTimes.has(d.time)),
      })),
      shapes: (scriptResult.shapes || []).filter((s) => visibleTimes.has(s.time)),
      bgcolor: (scriptResult.bgcolor || []).filter((b) => visibleTimes.has(b.time)),
      barColors: (scriptResult.barColors || []).filter((bc) =>
        visibleTimes.has(Math.floor(bc.time / 1000)),
      ),
      labels: (scriptResult.labels || []).filter((l) => visibleTimes.has(l.time)),
    };
  }

  return { displayCandles, displayScriptResult, dataVersion, loading };
}
