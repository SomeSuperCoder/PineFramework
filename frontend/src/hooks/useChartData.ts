import { useState, useEffect, useCallback, useRef } from 'react';
import type { CandlestickData, ScriptResult, PineScriptError } from '../types';

interface ExecuteResponse {
  success: boolean;
  error?: string;
  outputs: Record<string, (number | string | boolean | null)[]>;
}

export function useChartData() {
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null);
  const [errors, setErrors] = useState<PineScriptError[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedTopicRef = useRef<string | null>(null);

  const fetchOHLCV = useCallback(async (symbol: string, interval: string, limit = 1000) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }
      const json = await response.json();
      const data: CandlestickData[] = json.data.map((bar: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }) => ({
        time: Math.floor(bar.timestamp / 1000),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      })).filter((d: CandlestickData) => d.time > 0 && isFinite(d.open) && isFinite(d.high) && isFinite(d.low) && isFinite(d.close));
      data.sort((a: CandlestickData, b: CandlestickData) => a.time - b.time);
      setCandles(data);
    } catch (err) {
      console.error('Failed to fetch OHLCV:', err);
      setErrors((prev) => [...prev, {
        type: 'error',
        message: `Failed to load chart data: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    try {
      const ws = new WebSocket(`ws://${window.location.hostname}:8080/ws`);

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'kline' && data.data) {
            const k = data.data;
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
              const newCandles = [...prev];
              const last = newCandles[newCandles.length - 1];
              if (last && last.time === candle.time) {
                newCandles[newCandles.length - 1] = candle;
              } else {
                newCandles.push(candle);
                if (newCandles.length > 1000) newCandles.shift();
              }
              return newCandles;
            });
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
  }, []);

  const subscribe = useCallback((symbol: string, interval: string) => {
    const topic = `kline.${interval}.${symbol}`;
    if (subscribedTopicRef.current === topic) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (subscribedTopicRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'unsubscribe', topic: subscribedTopicRef.current }));
      }
      wsRef.current.send(JSON.stringify({ type: 'subscribe', topic }));
      subscribedTopicRef.current = topic;
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWebSocket]);

  const executeScript = useCallback(async (code: string, symbol: string, interval: string) => {
    setErrors([]);
    try {
      const ohlcvResponse = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=1000`);
      if (!ohlcvResponse.ok) throw new Error('Failed to fetch bars for execution');
      const ohlcvJson = await ohlcvResponse.json();

      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: code, bars: ohlcvJson.data }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error (${response.status}): ${text.slice(0, 200)}`);
      }

      const result: ExecuteResponse = await response.json();

      if (!result.success || result.error) {
        setErrors([{
          type: 'error',
          message: result.error || 'Execution failed',
        }]);
        return;
      }

      const plotData: import('../types').PlotData[] = [];
      for (const [key, values] of Object.entries(result.outputs)) {
        plotData.push({
          type: 'line',
          data: values
            .map((v, i) => ({
              time: Math.floor(ohlcvJson.data[i]?.timestamp / 1000 || 0),
              value: typeof v === 'number' ? v : 0,
            }))
            .filter((d) => d.value !== 0),
          title: key,
        });
      }

      setScriptResult({ plots: plotData, shapes: [], lines: [], boxes: [], labels: [] });
    } catch (error) {
      setErrors([{
        type: 'error',
        message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }]);
    }
  }, []);

  return {
    candles,
    scriptResult,
    errors,
    isConnected,
    isLoading,
    executeScript,
    fetchOHLCV,
    subscribe,
    setErrors,
  };
}
