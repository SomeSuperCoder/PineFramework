import { useState, useEffect, useCallback, useRef } from 'react';
import type { CandlestickData, ScriptResult, PineScriptError } from '../types';

interface ExecuteResponse {
  success: boolean;
  error?: string;
  outputs: Record<string, (number | string | boolean | null)[]>;
  shapes?: Array<{ style: string; location: string; color: string; time: number; text: string }>;
  fills?: Array<{ from: string; to: string; color: string }>;
  strategyMarkers?: Array<{
    type: string;
    name: string;
    direction: string;
    action: string;
    quantity: number;
    price: number;
    barIndex: number;
    timestamp: number;
    color: string;
    comment?: string;
  }>;
}

interface ExecutionResultMessage {
  success: boolean;
  error?: string;
  outputs: Record<string, (number | string | boolean | null)[]>;
  shapes: Array<{ style: string; location: string; color: string; time: number; text: string }>;
  fills: Array<{ from: string; to: string; color: string }>;
  strategyMarkers: Array<{
    type: string;
    name: string;
    direction: string;
    action: string;
    quantity: number;
    price: number;
    barIndex: number;
    timestamp: number;
    color: string;
    comment?: string;
  }>;
  barIndex: number;
}

const COLORS = ['#2196f3', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];

function buildScriptResult(
  outputs: Record<string, (number | string | boolean | null)[]>,
  shapes: ExecutionResultMessage['shapes'],
  fills: ExecutionResultMessage['fills'],
  strategyMarkers: ExecutionResultMessage['strategyMarkers'],
  ohlcvData: Array<{ timestamp: number }>,
): ScriptResult {
  const plotData: import('../types').PlotData[] = [];
  let colorIndex = 0;
  for (const [key, values] of Object.entries(outputs)) {
    let title = key;
    let plotColor: string | undefined;
    let lineWidth: number | undefined;
    const colorMatch = key.match(/__color:([^_]+)/);
    const lwMatch = key.match(/__lw:(\d+)/);
    if (colorMatch) plotColor = colorMatch[1];
    if (lwMatch) lineWidth = parseInt(lwMatch[1], 10);
    title = key.replace(/__color:[^_]+/, '').replace(/__lw:\d+/, '');
    if (!plotColor) {
      plotColor = COLORS[colorIndex % COLORS.length];
    }
    colorIndex++;
    plotData.push({
      type: 'line',
      data: values
        .map((v, i) => {
          const ts = ohlcvData[i]?.timestamp;
          if (ts === undefined) return null;
          let numValue: number | null;
          if (v === null || v === undefined) {
            numValue = null;
          } else if (typeof v === 'boolean') {
            numValue = v ? 1 : 0;
          } else if (typeof v === 'number') {
            numValue = v;
          } else {
            numValue = null;
          }
          return { time: Math.floor(ts / 1000), value: numValue };
        })
        .filter((d): d is { time: number; value: number | null } => d !== null),
      color: plotColor,
      lineWidth,
      title,
    });
  }

  const shapeData: import('../types').ShapeData[] = (shapes || []).map((s) => ({
    type: s.style as import('../types').ShapeData['type'],
    time: Math.floor(s.time / 1000),
    price: 0,
    color: s.color,
    text: s.text,
    location: s.location as import('../types').ShapeData['location'],
  }));

  return {
    plots: plotData,
    shapes: shapeData,
    lines: [],
    boxes: [],
    labels: [],
    fills: (fills || []).map((f) => ({ from: f.from, to: f.to, color: f.color })),
    strategyMarkers: (strategyMarkers || []).map((m) => ({
      type: m.type,
      name: m.name,
      direction: m.direction,
      action: m.action,
      quantity: m.quantity,
      price: m.price,
      barIndex: m.barIndex,
      timestamp: m.timestamp,
      color: m.color,
      comment: m.comment,
    })),
  };
}

export function useChartData() {
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null);
  const [errors, setErrors] = useState<PineScriptError[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedTopicRef = useRef<string | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const ohlcvDataRef = useRef<Array<{ timestamp: number }>>([]);

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
      ohlcvDataRef.current = json.data;
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

  const handleExecutionResult = useCallback((msg: ExecutionResultMessage) => {
    const ohlcvData = ohlcvDataRef.current;
    if (msg.success && msg.outputs) {
      const result = buildScriptResult(
        msg.outputs,
        msg.shapes || [],
        msg.fills || [],
        msg.strategyMarkers || [],
        ohlcvData,
      );
      setScriptResult(result);
    }
    if (msg.error) {
      setErrors((prev) => [...prev, {
        type: 'error',
        message: msg.error || 'Execution failed',
      }]);
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
            if (k.timestamp) {
              const ohlcvBar = { timestamp: k.timestamp * 1000 };
              ohlcvDataRef.current = [...ohlcvDataRef.current.slice(-999), ohlcvBar];
            }
          } else if (data.type === 'execution_result' && data.data) {
            handleExecutionResult(data.data);
          } else if (data.type === 'error' && data.data) {
            setErrors((prev) => [...prev, {
              type: 'error',
              message: data.data.message || 'WebSocket error',
            }]);
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
  }, [handleExecutionResult]);

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
    lastCodeRef.current = code;
    try {
      const ohlcvResponse = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=1000`);
      if (!ohlcvResponse.ok) throw new Error('Failed to fetch bars for execution');
      const ohlcvJson = await ohlcvResponse.json();
      ohlcvDataRef.current = ohlcvJson.data;

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

      const scriptRes = buildScriptResult(
        result.outputs,
        result.shapes || [],
        result.fills || [],
        result.strategyMarkers || [],
        ohlcvJson.data,
      );
      setScriptResult(scriptRes);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'execute',
          data: { source: code, symbol, interval, bars: ohlcvJson.data },
        }));
      }
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
