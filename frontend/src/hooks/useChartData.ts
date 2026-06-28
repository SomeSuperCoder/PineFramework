import { useState, useEffect, useCallback, useRef } from 'react';
import type { CandlestickData, ScriptResult, PineScriptError } from '../types';

interface ExecuteResponse {
  success: boolean;
  error?: string;
  outputs: Record<string, (number | string | boolean | null)[]>;
  plotColors?: Record<string, (string | null)[]>;
  fillColorData?: Record<string, (string | null)[]>;
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
  bgcolor?: Array<{ time: number; color: string }>;
  lines?: Array<{ points: Array<{ time: number; price: number }>; color: string; width?: number; style?: string }>;
  labels?: Array<{ time: number; price: number; text: string; color?: string; textColor?: string; style?: string; size?: string }>;
  barTimestamps?: number[];
}

interface ExecutionResultMessage {
  success: boolean;
  error?: string;
  outputs: Record<string, (number | string | boolean | null)[]>;
  plotColors?: Record<string, (string | null)[]>;
  fillColorData?: Record<string, (string | null)[]>;
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
  bgcolor?: Array<{ time: number; color: string }>;
  lines?: Array<{ points: Array<{ time: number; price: number }>; color: string; width?: number; style?: string }>;
  labels?: Array<{ time: number; price: number; text: string; color?: string; textColor?: string; style?: string; size?: string }>;
  barTimestamps?: number[];
  barIndex: number;
}

const COLORS = ['#2196f3', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];

function buildScriptResult(
  outputs: Record<string, (number | string | boolean | null)[]>,
  shapes: ExecutionResultMessage['shapes'],
  fills: ExecutionResultMessage['fills'],
  strategyMarkers: ExecutionResultMessage['strategyMarkers'],
  ohlcvData: Array<{ timestamp: number }>,
  bgcolor?: ExecutionResultMessage['bgcolor'],
  plotColors?: Record<string, (string | null)[]>,
  fillColorData?: Record<string, (string | null)[]>,
  lines?: ExecutionResultMessage['lines'],
  labels?: ExecutionResultMessage['labels'],
  barTimestamps?: number[],
): ScriptResult {
  const getTimestamp = (i: number): number | undefined => {
    if (barTimestamps && i < barTimestamps.length) return barTimestamps[i]!;
    return ohlcvData[i]?.timestamp;
  };
  const plotData: import('../types').PlotData[] = [];
  let colorIndex = 0;
  for (const [key, values] of Object.entries(outputs)) {
    let plotColor: string | undefined;
    let lineWidth: number | undefined;
    const lwMatch = key.match(/__lw:(\d+)/);
    const styleMatch = key.match(/__style:([^_]+)/);
    if (lwMatch) lineWidth = parseInt(lwMatch[1], 10);
    const plotStyle = (styleMatch ? styleMatch[1] : 'line') as import('../types').PlotData['type'];
    const title = key.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '');
    const perBarColors = plotColors?.[key];
    if (!plotColor) {
      plotColor = COLORS[colorIndex % COLORS.length];
    }
    colorIndex++;
    plotData.push({
      type: plotStyle,
      data: values
        .map((v, i) => {
          const ts = getTimestamp(i);
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
          return { time: Math.floor(ts / 1000), value: numValue, color: perBarColors?.[i] ?? undefined };
        })
        .filter((d): d is { time: number; value: number | null; color?: string } => d !== null),
      color: plotColor,
      lineWidth,
      title,
    });
  }

  const stripMeta = (s: string) => s.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '').trim();
  const transformFillKey = (rawKey: string) => {
    const parts = rawKey.split('::');
    return parts.map(stripMeta).join('::');
  };

  const shapeData: import('../types').ShapeData[] = (shapes || []).map((s) => ({
    type: s.style as import('../types').ShapeData['type'],
    time: Math.floor(s.time / 1000),
    price: 0,
    color: s.color,
    text: s.text,
    location: s.location as import('../types').ShapeData['location'],
  }));

  const transformedFillColorData: Record<string, (string | null)[]> = {};
  if (fillColorData) {
    for (const [key, colors] of Object.entries(fillColorData)) {
      transformedFillColorData[transformFillKey(key)] = colors;
    }
  }

  return {
    plots: plotData,
    shapes: shapeData,
    lines: (lines || []).map((l) => ({
      points: l.points.map((p) => ({ time: Math.floor(p.time / 1000), price: p.price })),
      color: l.color,
      width: l.width,
      style: l.style as 'solid' | 'dotted' | 'dashed' | undefined,
    })),
    boxes: [],
    labels: (labels || []).map((l) => ({
      time: Math.floor(l.time / 1000),
      price: l.price,
      text: l.text,
      color: l.color,
      textColor: l.textColor,
      style: l.style,
      size: l.size,
    })),
    fills: (fills || []).map((f) => ({ from: stripMeta(f.from), to: stripMeta(f.to), color: f.color })),
    fillColorData: transformedFillColorData,
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
    bgcolor: (bgcolor || []).map((b) => ({ time: Math.floor(b.time / 1000), color: b.color })),
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
  const ohlcvDataRef = useRef<Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>>([]);
  const hasMoreHistoryRef = useRef(true);
  const prependCountRef = useRef(0);

  const toCandleData = useCallback((bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>): CandlestickData[] => {
    const data: CandlestickData[] = bars.map((bar) => ({
      time: Math.floor(bar.timestamp / 1000),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })).filter((d) => d.time > 0 && isFinite(d.open) && isFinite(d.high) && isFinite(d.low) && isFinite(d.close));
    data.sort((a, b) => a.time - b.time);
    return data;
  }, []);

  const fetchOHLCV = useCallback(async (symbol: string, interval: string, limit = 1000) => {
    setIsLoading(true);
    setCandles([]);
    ohlcvDataRef.current = [];
    try {
      const response = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }
      const json = await response.json();
      ohlcvDataRef.current = json.data;
      setCandles(toCandleData(json.data));
    } catch (err) {
      console.error('Failed to fetch OHLCV:', err);
      setErrors((prev) => [...prev, {
        type: 'error',
        message: `Failed to load chart data: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [toCandleData]);

  const fetchOlderOHLCV = useCallback(async (symbol: string, interval: string): Promise<number> => {
    if (!hasMoreHistoryRef.current) return 0;
    try {
      const oldest = ohlcvDataRef.current[0];
      if (!oldest || !oldest.timestamp) {
        hasMoreHistoryRef.current = false;
        return 0;
      }
      const end = oldest.timestamp - 1;
      const response = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=1000&end=${end}`);
      if (!response.ok) return 0;
      const json = await response.json();
      if (!json.data || json.data.length === 0) {
        hasMoreHistoryRef.current = false;
        return 0;
      }
      if (json.hasMore === false) {
        hasMoreHistoryRef.current = false;
      }
      const addedCount = json.data.length;
      if (addedCount === 0) return 0;
      prependCountRef.current += addedCount;
      ohlcvDataRef.current = [...json.data, ...ohlcvDataRef.current];
      return addedCount;
    } catch {
      return 0;
    }
  }, []);

  const handleExecutionResult = useCallback((msg: ExecutionResultMessage) => {
    const ohlcvData = ohlcvDataRef.current;
    if (msg.success && msg.outputs) {
      const barTimestamps = msg.barTimestamps;
      const sampleKey = Object.keys(msg.outputs)[0];
      if (sampleKey) {
        const outputLen = msg.outputs[sampleKey].length;
        if (barTimestamps && outputLen !== barTimestamps.length) {
          return;
        }
        if (Math.abs(outputLen - ohlcvData.length) > 1) {
          return;
        }
      }
      const result = buildScriptResult(
        msg.outputs,
        msg.shapes || [],
        msg.fills || [],
        msg.strategyMarkers || [],
        ohlcvData,
        msg.bgcolor,
        msg.plotColors,
        msg.fillColorData,
        msg.lines,
        msg.labels,
        barTimestamps,
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
        if (subscribedTopicRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', topic: subscribedTopicRef.current }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'kline' && data.data) {
            const k = data.data;
            const topic = `kline.${k.interval}.${k.symbol}`;
            if (topic !== subscribedTopicRef.current) {
              return;
            }
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
              }
              return newCandles;
            });
            if (k.timestamp) {
              const ohlcvBar = { timestamp: k.timestamp, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume };
              const lastOhlcv = ohlcvDataRef.current[ohlcvDataRef.current.length - 1];
              if (lastOhlcv && lastOhlcv.timestamp === k.timestamp) {
                ohlcvDataRef.current[ohlcvDataRef.current.length - 1] = ohlcvBar;
              } else {
                ohlcvDataRef.current = [...ohlcvDataRef.current, ohlcvBar];
              }
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
    const prevTopic = subscribedTopicRef.current;
    subscribedTopicRef.current = topic;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (prevTopic) {
        wsRef.current.send(JSON.stringify({ type: 'unsubscribe', topic: prevTopic }));
      }
      wsRef.current.send(JSON.stringify({ type: 'subscribe', topic }));
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWebSocket]);

  const executeScript = useCallback(async (code: string, symbol: string, interval: string, existingBars?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>, versionRef?: React.MutableRefObject<number>, version?: number) => {
    setErrors([]);
    lastCodeRef.current = code;
    try {
      let barsToExecute = existingBars;
      if (!barsToExecute) {
        const ohlcvResponse = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=1000`);
        if (!ohlcvResponse.ok) throw new Error('Failed to fetch bars for execution');
        const ohlcvJson = await ohlcvResponse.json();
        ohlcvDataRef.current = ohlcvJson.data;
        barsToExecute = ohlcvJson.data as typeof barsToExecute;
      }
      if (!barsToExecute) throw new Error('No bars available for execution');

      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: code, bars: barsToExecute }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error (${response.status}): ${text.slice(0, 200)}`);
      }

      const result: ExecuteResponse = await response.json();

      if (!result.success || result.error) {
        if (versionRef && version !== undefined && version !== versionRef.current) return;
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
        barsToExecute,
        result.bgcolor,
        result.plotColors,
        result.fillColorData,
        result.lines,
        result.labels,
        result.barTimestamps,
      );

      if (versionRef && version !== undefined && version !== versionRef.current) return;

      setCandles(toCandleData(barsToExecute));
      setScriptResult(scriptRes);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'execute',
          data: { source: code, symbol, interval, bars: barsToExecute },
        }));
      }
    } catch (error) {
      if (versionRef && version !== undefined && version !== versionRef.current) return;
      setErrors([{
        type: 'error',
        message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }]);
    }
  }, [toCandleData]);

  return {
    candles,
    scriptResult,
    errors,
    isConnected,
    isLoading,
    executeScript,
    fetchOHLCV,
    fetchOlderOHLCV,
    subscribe,
    setErrors,
    lastCodeRef,
    prependCountRef,
    ohlcvDataRef,
  };
}
