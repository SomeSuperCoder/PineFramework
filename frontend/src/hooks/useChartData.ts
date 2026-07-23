import { useState, useEffect, useCallback, useRef } from 'react';
import type { CandlestickData, ScriptResult, PineScriptError } from '../types';
import type { ExecuteResponse, ExecutionResultMessage } from './chart-data-transform';
import { buildScriptResult } from './chart-data-transform';
import { prependIndicatorResult, mergeDiffIntoResult } from './indicator-merge';

export interface ChunkBorder {
  /** Bar index (0-based) where this chunk boundary falls in the current dataset. */
  barIndex: number;
  /** Number of bars in the prepended chunk. */
  addedCount: number;
  /** Timestamp (seconds) at the boundary. */
  timestamp: number;
}

export function useChartData(onIndicatorResult?: (indicatorId: string, result: ScriptResult) => void) {
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null);
  const [errors, setErrors] = useState<PineScriptError[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [chunkBorders, setChunkBorders] = useState<ChunkBorder[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedTopicRef = useRef<string | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const ohlcvDataRef = useRef<Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>>([]);
  const hasMoreHistoryRef = useRef(true);
  const prependCountRef = useRef(0);
  const pendingExecuteRef = useRef<Map<string, { source: string; symbol: string; interval: string; bars?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> }>>(new Map());
  const onIndicatorRemovedRef = useRef<((indicatorIds: string[]) => void) | null>(null);
  const indicatorSourcesRef = useRef<Map<string, { source: string; symbol: string; interval: string; maxLookback: number }>>(new Map());
  const historicalDataLoadedRef = useRef(false);
  const executeScriptRef = useRef<((code: string, symbol: string, interval: string, existingBars?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>, versionRef?: React.MutableRefObject<number>, version?: number, indicatorId?: string) => Promise<void>) | null>(null);

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
    setScriptResult(null);
    indicatorResultsRef.current.clear();
    ohlcvDataRef.current = [];
    historicalDataLoadedRef.current = false;
    prependCountRef.current = 0;
    setChunkBorders([]);
    try {
      const response = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }
      const json = await response.json();
      ohlcvDataRef.current = json.data;
      historicalDataLoadedRef.current = true;
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
      // Use a small chunk (200 bars) so the next scroll-back triggers after
      // ~400px of panning (~1/3 viewport width) instead of ~2000px with 1000-bar chunks.
      const response = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=200&end=${end}`);
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

      // Record chunk border (always tracked — used by export and debug visualization)
      // Existing borders' barIndexes must be shifted right by addedCount
      // since the new bars are prepended before them.
      const boundaryTimestamp = ohlcvDataRef.current[0]?.timestamp ?? 0;
      setChunkBorders((prev) => [
        ...prev.map((b) => ({ ...b, barIndex: b.barIndex + addedCount })),
        { barIndex: addedCount, addedCount, timestamp: Math.floor(boundaryTimestamp / 1000) },
      ]);

      const oldBars = ohlcvDataRef.current;
      const newBars = json.data as typeof ohlcvDataRef.current;
      ohlcvDataRef.current = [...newBars, ...oldBars];

      // Execute all indicators FIRST — compute everything before touching
      // any React state. This prevents intermediate renders where candles
      // are updated but indicator data is stale (causes Y-axis jumping).
      const indicatorUpdates: Array<{ id: string; result: ScriptResult }> = [];

      for (const [indId, ind] of indicatorSourcesRef.current) {
        const maxLookback = ind.maxLookback || 0;
        const contextBars = oldBars.slice(0, maxLookback);
        const actualContextSize = contextBars.length;
        const execBars = [...newBars, ...contextBars];

        try {
          const execResponse = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: ind.source, bars: execBars, offset: 0 }),
          });
          if (!execResponse.ok) continue;
          const execResult: ExecuteResponse = await execResponse.json();
          if (!execResult.success || execResult.error) continue;

          const newResult = buildScriptResult(
            execResult.overlay,
            execResult.outputs,
            execResult.shapes || [],
            execResult.fills || [],
            execResult.strategyMarkers || [],
            execBars,
            execResult.bgcolor,
            execResult.plotColors,
            execResult.fillColorData,
            execResult.lines,
            execResult.labels,
            execResult.barTimestamps,
            execResult.alertConditions,
            execResult.alertTriggers,
            execResult.boxes,
            execResult.tables,
            execResult.hiddenPlotKeys,
            execResult.barColors,
          );

          const prev = indicatorResultsRef.current.get(indId);
          const overlapTimestamps = new Set<number>();
          for (const bar of contextBars) {
            overlapTimestamps.add(Math.floor(bar.timestamp / 1000));
          }
          const merged = prev ? prependIndicatorResult(prev, newResult, addedCount, actualContextSize, overlapTimestamps) : newResult;
          indicatorUpdates.push({ id: indId, result: merged });

          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'execute',
              data: { source: ind.source, symbol: ind.symbol, interval: ind.interval, bars: ohlcvDataRef.current, indicatorId: indId },
            }));
          }
        } catch {
          // Skip failed indicators
        }
      }

      // Now update ALL React state in one synchronous batch
      setCandles(toCandleData(ohlcvDataRef.current));
      for (const { id, result } of indicatorUpdates) {
        indicatorResultsRef.current.set(id, result);
        onIndicatorResult?.(id, result);
      }

      return addedCount;
    } catch {
      return 0;
    }
  }, [toCandleData, onIndicatorResult]);

  const indicatorResultsRef = useRef<Map<string, ScriptResult>>(new Map());

  const handleExecutionResult = useCallback((msg: ExecutionResultMessage) => {
    const ohlcvData = ohlcvDataRef.current;

    // Route indicator-specific results to the callback
    if (msg.indicatorId && msg.indicatorId !== 'default' && onIndicatorResult) {
      if (!indicatorSourcesRef.current.has(msg.indicatorId)) return;
      if (msg.success && msg.outputs) {
        const sampleKey = Object.keys(msg.outputs)[0];
        const isDiff = msg.formingCandle || (sampleKey && msg.outputs[sampleKey].length === 1 && msg.barTimestamps && msg.barTimestamps.length > 1);
        const prev = indicatorResultsRef.current.get(msg.indicatorId);
        if (isDiff) {
          if (!prev) return;
          const merged = mergeDiffIntoResult(prev, msg);
          indicatorResultsRef.current.set(msg.indicatorId, merged);
          onIndicatorResult(msg.indicatorId, merged);
          return;
        }
        const result = buildScriptResult(
          msg.overlay,
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
          msg.barTimestamps,
          msg.alertConditions,
          msg.alertTriggers,
          msg.boxes,
          msg.tables,
          msg.hiddenPlotKeys,
          msg.barColors,
        );
        indicatorResultsRef.current.set(msg.indicatorId, result);
        onIndicatorResult(msg.indicatorId, result);
      }
      if (msg.error) {
        setErrors((prev) => [...prev, {
          type: 'error',
          message: msg.error || 'Execution failed',
        }]);
      }
      return;
    }

    if (msg.success && msg.outputs) {
      if (msg.formingCandle) {
        setScriptResult((prev) => {
          if (!prev) return prev;
          return mergeDiffIntoResult(prev, msg);
        });
        return;
      }

      const barTimestamps = msg.barTimestamps;
      const sampleKey = Object.keys(msg.outputs)[0];
      if (sampleKey) {
        const outputLen = msg.outputs[sampleKey].length;
        if (barTimestamps && outputLen !== barTimestamps.length) {
          console.warn(`Execution result dropped: outputLen (${outputLen}) !== barTimestamps.length (${barTimestamps.length})`);
          return;
        }
        if (Math.abs(outputLen - ohlcvData.length) > 1) {
          console.warn(`Execution result dropped: outputLen (${outputLen}) vs ohlcvData.length (${ohlcvData.length})`);
          return;
        }
      }
      const result = buildScriptResult(
        msg.overlay,
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
        msg.alertConditions,
        msg.alertTriggers,
        msg.boxes,
        msg.tables,
        msg.hiddenPlotKeys,
        msg.barColors,
      );
      setScriptResult(result);
    }
    if (msg.error) {
      setErrors((prev) => [...prev, {
        type: 'error',
        message: msg.error || 'Execution failed',
      }]);
    }
  }, [onIndicatorResult]);

  const connectWebSocket = useCallback(() => {
    try {
      const ws = new WebSocket(`ws://${window.location.hostname}:8081/ws`);

      ws.onopen = () => {
        setIsConnected(true);
        if (subscribedTopicRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', topic: subscribedTopicRef.current }));
        }
        if (pendingExecuteRef.current.size > 0) {
          for (const [indId, data] of pendingExecuteRef.current) {
            ws.send(JSON.stringify({
              type: 'execute',
              data: { ...data, bars: data.bars || ohlcvDataRef.current, indicatorId: indId },
            }));
          }
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
              if (!historicalDataLoadedRef.current) return prev;
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
            handleExecutionResult({ ...data.data, indicatorId: data.indicatorId });
          } else if (data.type === 'indicator_removed' && data.data) {
            const removedIds = data.data.indicatorIds as string[] | undefined;
            if (removedIds) {
              for (const id of removedIds) {
                indicatorSourcesRef.current.delete(id);
                indicatorResultsRef.current.delete(id);
                pendingExecuteRef.current.delete(id);
              }
              if (onIndicatorRemovedRef.current) {
                onIndicatorRemovedRef.current(removedIds);
              }
            }
          } else if (data.type === 'indicator_stopped' && data.data) {
            const stoppedId = data.data.indicatorId as string | undefined;
            if (stoppedId) {
              indicatorSourcesRef.current.delete(stoppedId);
              indicatorResultsRef.current.delete(stoppedId);
              pendingExecuteRef.current.delete(stoppedId);
            }
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

  const fetchSeedBars = useCallback(async (symbol: string, interval: string, count: number): Promise<Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>> => {
    if (count <= 0) return [];
    const oldest = ohlcvDataRef.current[0];
    if (!oldest) return [];
    const before = oldest.timestamp;
    const response = await fetch(`/api/bars?symbol=${symbol}&interval=${interval}&count=${count}&before=${before}`);
    if (!response.ok) return [];
    const json = await response.json();
    return json.data || [];
  }, []);

  const executeScript = useCallback(async (code: string, symbol: string, interval: string, existingBars?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>, versionRef?: React.MutableRefObject<number>, version?: number, indicatorId?: string) => {
    setErrors([]);
    if (indicatorId) {
      indicatorSourcesRef.current.set(indicatorId, { source: code, symbol, interval, maxLookback: 0 });
    } else {
      lastCodeRef.current = code;
    }
    try {
      let barsToExecute = existingBars;
      if (!barsToExecute) {
        if (ohlcvDataRef.current.length > 0) {
          barsToExecute = ohlcvDataRef.current as typeof barsToExecute;
        } else {
          const ohlcvResponse = await fetch(`/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=1000`);
          if (!ohlcvResponse.ok) throw new Error('Failed to fetch bars for execution');
          const ohlcvJson = await ohlcvResponse.json();
          ohlcvDataRef.current = ohlcvJson.data;
          barsToExecute = ohlcvJson.data as typeof barsToExecute;
        }
      } else {
        ohlcvDataRef.current = existingBars;
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

      const maxLookback = result.maxLookback ?? 0;

      if (indicatorId) {
        const prev = indicatorSourcesRef.current.get(indicatorId);
        if (prev) prev.maxLookback = maxLookback;
      }

      if (maxLookback > 0) {
        const neededSeed = maxLookback;
        const seedBars = await fetchSeedBars(symbol, interval, neededSeed);
        if (seedBars.length > 0) {
          const originalBars = barsToExecute;
          barsToExecute = [...seedBars, ...barsToExecute];

          const seedResponse = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: code, bars: barsToExecute }),
          });

          if (seedResponse.ok) {
            const seedResult: ExecuteResponse = await seedResponse.json();
            if (seedResult.success && !seedResult.error) {
              const seedScriptRes = buildScriptResult(
                seedResult.overlay,
                seedResult.outputs,
                seedResult.shapes || [],
                seedResult.fills || [],
                seedResult.strategyMarkers || [],
                barsToExecute,
                seedResult.bgcolor,
                seedResult.plotColors,
                seedResult.fillColorData,
                seedResult.lines,
                seedResult.labels,
                seedResult.barTimestamps,
                seedResult.alertConditions,
                seedResult.alertTriggers,
                seedResult.boxes,
                seedResult.tables,
                seedResult.hiddenPlotKeys,
                seedResult.barColors,
              );

              // Trim seed bar data from plot results
              const seedCount = seedBars.length;
              for (const plot of seedScriptRes.plots) {
                plot.data = plot.data.slice(seedCount);
              }
              if (seedScriptRes.fillColorData) {
                for (const key of Object.keys(seedScriptRes.fillColorData)) {
                  seedScriptRes.fillColorData[key] = seedScriptRes.fillColorData[key].slice(seedCount);
                }
              }

              // Trim seed bar strategy markers
              if (seedScriptRes.strategyMarkers) {
                seedScriptRes.strategyMarkers = seedScriptRes.strategyMarkers
                  .filter((m) => m.barIndex >= seedCount)
                  .map((m) => ({ ...m, barIndex: m.barIndex - seedCount }));
              }

              // Trim seed bar alert triggers
              if (seedScriptRes.alertTriggers) {
                seedScriptRes.alertTriggers = seedScriptRes.alertTriggers
                  .filter((t) => t.barIndex >= seedCount)
                  .map((t) => ({ ...t, barIndex: t.barIndex - seedCount }));
              }

              if (versionRef && version !== undefined && version !== versionRef.current) return;

              if (indicatorId) {
                onIndicatorResult?.(indicatorId, seedScriptRes);
                const nextMap = new Map(indicatorResultsRef.current);
                nextMap.set(indicatorId, seedScriptRes);
                indicatorResultsRef.current = nextMap;
              } else {
                setCandles(toCandleData(originalBars));
                setScriptResult(seedScriptRes);
              }

              pendingExecuteRef.current.set(indicatorId || 'default', { source: code, symbol, interval, bars: barsToExecute });
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'execute',
                  data: { source: code, symbol, interval, bars: barsToExecute, indicatorId: indicatorId || 'default' },
                }));
              }
              return;
            }
          }
        }
      }

      const scriptRes = buildScriptResult(
        result.overlay,
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
        result.alertConditions,
        result.alertTriggers,
        result.boxes,
        result.tables,
        result.hiddenPlotKeys,
        result.barColors,
      );

      if (versionRef && version !== undefined && version !== versionRef.current) return;

      if (indicatorId) {
        onIndicatorResult?.(indicatorId, scriptRes);
        const nextMap = new Map(indicatorResultsRef.current);
        nextMap.set(indicatorId, scriptRes);
        indicatorResultsRef.current = nextMap;
      } else {
        setCandles(toCandleData(barsToExecute));
        setScriptResult(scriptRes);
      }

      pendingExecuteRef.current.set(indicatorId || 'default', { source: code, symbol, interval, bars: barsToExecute });
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'execute',
          data: { source: code, symbol, interval, bars: barsToExecute, indicatorId: indicatorId || 'default' },
        }));
      }
    } catch (error) {
      if (versionRef && version !== undefined && version !== versionRef.current) return;
      setErrors([{
        type: 'error',
        message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }]);
    }
  }, [toCandleData, onIndicatorResult, fetchSeedBars]);

  executeScriptRef.current = executeScript;

  const exportChartData = useCallback(async (): Promise<string | null> => {
    try {
      const indicators: Array<{
        indicatorId: string;
        source: string;
        symbol: string;
        interval: string;
        result: import('../types').ScriptResult;
      }> = [];

      for (const [indId, result] of indicatorResultsRef.current) {
        const sourceInfo = indicatorSourcesRef.current.get(indId);
        indicators.push({
          indicatorId: indId,
          source: sourceInfo?.source || '',
          symbol: sourceInfo?.symbol || '',
          interval: sourceInfo?.interval || '',
          result,
        });
      }

      const payload = {
        exportedAt: Date.now(),
        candles,
        indicators,
        chunkBorders,
      };

      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const json = await response.json() as { success: boolean; path: string };
      return json.path;
    } catch (err) {
      console.error('[Export] Error:', err);
      return null;
    }
  }, [candles, chunkBorders]);

  return {
    candles,
    chunkBorders,
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
    indicatorResultsRef,
    registerOnIndicatorRemoved: useCallback((cb: (indicatorIds: string[]) => void) => {
      onIndicatorRemovedRef.current = cb;
    }, []),
    removeIndicatorData: useCallback((indicatorId: string) => {
      indicatorResultsRef.current.delete(indicatorId);
      indicatorSourcesRef.current.delete(indicatorId);
      pendingExecuteRef.current.delete(indicatorId);
    }, []),
    indicatorSourcesRef,
    wsRef,
    exportChartData,
  };
}
