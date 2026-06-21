import { useState, useEffect, useCallback, useRef } from 'react';
import type { CandlestickData, ScriptResult, PineScriptError } from '../types';

const MOCK_CANDLES: CandlestickData[] = generateMockData(1000);

function generateMockData(count: number): CandlestickData[] {
  const data: CandlestickData[] = [];
  let price = 100;
  const baseTime = Math.floor(Date.now() / 1000) - count * 60;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 10;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 5;
    const low = Math.min(open, close) - Math.random() * 5;
    const volume = Math.floor(Math.random() * 10000) + 1000;

    data.push({
      time: baseTime + i * 60,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });

    price = close;
  }

  return data;
}

export function useChartData() {
  const [candles, setCandles] = useState<CandlestickData[]>(MOCK_CANDLES);
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null);
  const [errors, setErrors] = useState<PineScriptError[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connectWebSocket = useCallback(() => {
    try {
      const ws = new WebSocket(`ws://${window.location.hostname}:8080/ws`);

      ws.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'candle') {
            setCandles((prev) => {
              const newCandles = [...prev];
              const lastCandle = newCandles[newCandles.length - 1];
              if (lastCandle && lastCandle.time === data.candle.time) {
                newCandles[newCandles.length - 1] = data.candle;
              } else {
                newCandles.push(data.candle);
                if (newCandles.length > 1000) {
                  newCandles.shift();
                }
              }
              return newCandles;
            });
          } else if (data.type === 'result') {
            setScriptResult(data.result);
          } else if (data.type === 'error') {
            setErrors((prev) => [...prev, data.error]);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, []);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket]);

  const executeScript = useCallback(async (code: string) => {
    setErrors([]);
    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, candles }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setErrors([{
          type: 'error',
          message: errorData.message || 'Failed to execute script',
          line: errorData.line,
          column: errorData.column,
        }]);
        return;
      }

      const result = await response.json();
      setScriptResult(result);
    } catch (error) {
      setErrors([{
        type: 'error',
        message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }]);
    }
  }, [candles]);

  const addError = useCallback((error: PineScriptError) => {
    setErrors((prev) => [...prev, error]);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return {
    candles,
    scriptResult,
    errors,
    isConnected,
    executeScript,
    addError,
    clearErrors,
  };
}
