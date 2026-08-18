import { useState, useEffect, useCallback, useRef } from 'react';
import type { CandlestickData, ScriptResult, PineScriptError } from '../types';
import type { ExecuteResponse, ExecutionResultMessage } from './chart-data-transform';
import { buildScriptResult } from './chart-data-transform';
import { prependIndicatorResult, mergeDiffIntoResult } from './indicator-merge';

/**
 * Normalizes a raw execute error into a render-safe string.
 * The REST route sends the EngineError OBJECT {message, barIndex, span, stack}
 * (backend/src/routes/execute.ts:178) despite the string-typed API — mirror the
 * backend's toErrorMessage (src/rendering/FormingCandleManager.ts:390-392) at the
 * storage boundary so ErrorConsole never renders a plain object as a React child.
 */
function toErrorMessage(err: unknown): string {
  return typeof err === 'string'
    ? err
    : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message
      : 'Execution failed';
}

export interface ChunkBorder {
  /** Bar index (0-based) where this chunk boundary falls in the current dataset. */
  barIndex: number;
  /** Number of bars in the prepended chunk. */
  addedCount: number;
  /** Timestamp (seconds) at the boundary. */
  timestamp: number;
}

export function useChartData(
  onIndicatorResult?: (indicatorId: string, result: ScriptResult) => void,
) {
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null);
  const [errors, setErrors] = useState<PineScriptError[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [chunkBorders, setChunkBorders] = useState<ChunkBorder[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedTopicRef = useRef<string | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const lastKlineTimestampRef = useRef<number>(0);
  const ohlcvDataRef = useRef<
    Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>
  >([]);
  const prependCountRef = useRef(0);
  const oldestFetchedTsRef = useRef(0); // Guard against interleaved fetchOlderOHLCV calls
  const pendingExecuteRef = useRef<
    Map<
      string,
      {
        source: string;
        symbol: string;
        interval: string;
        bars?: Array<{
          timestamp: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }>;
      }
    >
  >(new Map());
  const onIndicatorRemovedRef = useRef<((indicatorIds: string[]) => void) | null>(null);
  const indicatorSourcesRef = useRef<
    Map<string, { source: string; symbol: string; interval: string; maxLookback: number }>
  >(new Map());
  /** Incremented each time an indicator is removed, used to discard stale HTTP results. */
  const indicatorGenerationRef = useRef<Map<string, number>>(new Map());
  const historicalDataLoadedRef = useRef(false);
  const executeScriptRef = useRef<
    | ((
        code: string,
        symbol: string,
        interval: string,
        existingBars?: Array<{
          timestamp: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }>,
        versionRef?: React.MutableRefObject<number>,
        version?: number,
        indicatorId?: string,
      ) => Promise<void>)
    | null
  >(null);

  const toCandleData = useCallback(
    (
      bars: Array<{
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>,
    ): CandlestickData[] => {
      const data: CandlestickData[] = bars
        .map((bar) => ({
          time: Math.floor(bar.timestamp / 1000),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        }))
        .filter(
          (d) =>
            d.time > 0 &&
            isFinite(d.open) &&
            isFinite(d.high) &&
            isFinite(d.low) &&
            isFinite(d.close),
        );
      data.sort((a, b) => a.time - b.time);
      return data;
    },
    [],
  );

  const fetchOHLCV = useCallback(
    async (symbol: string, interval: string, limit = 1000) => {
      setIsLoading(true);
      setCandles([]);
      setScriptResult(null);
      indicatorResultsRef.current.clear();
      ohlcvDataRef.current = [];
      historicalDataLoadedRef.current = false;
      prependCountRef.current = 0;
      setChunkBorders([]);
      lastKlineTimestampRef.current = 0; // Reset watermark on new data load
      oldestFetchedTsRef.current = 0; // Reset fetch guard on new data load
      try {
        const response = await fetch(
          `/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.statusText}`);
        }
        const json = await response.json();
        ohlcvDataRef.current = json.data;
        historicalDataLoadedRef.current = true;
        // Diagnostic: log REST data boundaries
        if (json.data && json.data.length > 0) {
          const first = json.data[0];
          const last = json.data[json.data.length - 1];
          console.log(`[DIAG] REST loaded ${json.data.length} bars for ${symbol} ${interval}`);
          console.log(
            `[DIAG] REST first bar — ts=${first.timestamp} o=${first.open} h=${first.high} l=${first.low} c=${first.close}`,
          );
          console.log(
            `[DIAG] REST last bar  — ts=${last.timestamp} o=${last.open} h=${last.high} l=${last.low} c=${last.close} v=${last.volume}`,
          );
        }
        setCandles(toCandleData(json.data));
      } catch (err) {
        console.error('Failed to fetch OHLCV:', err);
        setErrors((prev) => [
          ...prev,
          {
            type: 'error',
            message: `Failed to load chart data: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [toCandleData],
  );

  const fetchOlderOHLCV = useCallback(
    async (symbol: string, interval: string): Promise<number> => {
      try {
        const oldest = ohlcvDataRef.current[0];
        if (!oldest || !oldest.timestamp) {
          return 0;
        }
        // Guard: if we already fetched from this exact timestamp, skip to
        // prevent interleaved/duplicate fetches during rapid scrolling.
        if (oldest.timestamp === oldestFetchedTsRef.current) {
          return 0;
        }
        oldestFetchedTsRef.current = oldest.timestamp;
        const end = oldest.timestamp - 1;
        // Use a small chunk (200 bars) so the next scroll-back triggers after
        // ~400px of panning (~1/3 viewport width) instead of ~2000px with 1000-bar chunks.
        const response = await fetch(
          `/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=200&end=${end}`,
        );
        if (!response.ok) return 0;
        const json = await response.json();
        if (!json.data || json.data.length === 0) {
          return 0;
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
          // Always fetch at least as many context bars as the chunk size (200)
          // to ensure the boundary region is outside the warmup zone, even if
          // the stored maxLookback is stale (from before the engine fix).
          const contextSize = Math.max(maxLookback, newBars.length);
          const contextBars = oldBars.slice(0, contextSize);
          const actualContextSize = contextBars.length;
          const execBars = [...newBars, ...contextBars];

          try {
            const execResponse = await fetch('/api/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source: ind.source, bars: execBars, offset: 0 }),
              // Bound the per-indicator re-execution so a hung request cannot freeze
              // the batch state update below (setCandles + indicatorUpdates). The
              // catch below skips the failed indicator and the batch still applies.
              signal: AbortSignal.timeout(15000),
            });
            if (!execResponse.ok) continue;
            const execResult: ExecuteResponse = await execResponse.json();
            if (!execResult.success || execResult.error) continue;

            // Update maxLookback from the re-execution result — the engine may
            // report a higher lookback than the stored value (e.g. after the
            // getMaxLookback() fix for ta.highest/ta.lowest/runtimeSeriesLookback).
            // This ensures subsequent chunk loads fetch enough context bars.
            if (execResult.maxLookback && execResult.maxLookback > ind.maxLookback) {
              ind.maxLookback = execResult.maxLookback;
            }

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
              { ticker: ind.symbol, interval: ind.interval },
              execResult.linefills,
              execResult.plotOverlayKeys,
            );

            const prev = indicatorResultsRef.current.get(indId);
            const overlapTimestamps = new Set<number>();
            for (const bar of contextBars) {
              overlapTimestamps.add(Math.floor(bar.timestamp / 1000));
            }
            const merged = prev
              ? prependIndicatorResult(
                  prev,
                  newResult,
                  addedCount,
                  actualContextSize,
                  overlapTimestamps,
                )
              : newResult;
            indicatorUpdates.push({ id: indId, result: merged });

            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: 'execute',
                  data: {
                    source: ind.source,
                    symbol: ind.symbol,
                    interval: ind.interval,
                    bars: ohlcvDataRef.current,
                    indicatorId: indId,
                  },
                }),
              );
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
    },
    [toCandleData, onIndicatorResult],
  );

  const indicatorResultsRef = useRef<Map<string, ScriptResult>>(new Map());
  // Buffer a forming-candle DIFF that arrives before the full REST result has set
  // `prev`, so it is not silently dropped (cold-start label loss for seed indicators).
  const pendingDiffRef = useRef<Map<string, ExecutionResultMessage>>(new Map());

  const handleExecutionResult = useCallback(
    (msg: ExecutionResultMessage) => {
      const ohlcvData = ohlcvDataRef.current;

      // Route indicator-specific results to the callback
      if (msg.indicatorId && msg.indicatorId !== 'default' && onIndicatorResult) {
        if (!indicatorSourcesRef.current.has(msg.indicatorId)) return;
        if (msg.success && msg.outputs) {
          const sampleKey = Object.keys(msg.outputs)[0];
          const isDiff =
            msg.formingCandle ||
            (sampleKey &&
              msg.outputs[sampleKey].length === 1 &&
              msg.barTimestamps &&
              msg.barTimestamps.length > 1);
          const prev = indicatorResultsRef.current.get(msg.indicatorId);
          if (isDiff) {
            if (!prev) {
              // Forming-candle DIFF arrived before the full REST result set `prev`.
              // Buffer it so the subsequent full result can flush it instead of dropping it.
              pendingDiffRef.current.set(msg.indicatorId, msg);
              return;
            }
            const merged = mergeDiffIntoResult(prev, msg);
            indicatorResultsRef.current.set(msg.indicatorId, merged);
            onIndicatorResult(msg.indicatorId, merged);
            return;
          }
          const indicatorSrc = indicatorSourcesRef.current.get(msg.indicatorId);
          // STALE-DATASET GUARD: a WS full-dataset execution_result is computed over the
          // bar snapshot the backend ScriptSession was seeded with at SEND time
          // (fetchOlderOHLCV sends ohlcvDataRef.current) and is re-executed on every live
          // Bybit tick over that SNAPSHOT (gateway.ts reexecuteForTopic), NOT the
          // frontend's current dataset. If chunks were prepended after the snapshot, the
          // result is missing the newest chunk and its unconditional set below would
          // REPLACE the freshly-merged prepend result, collapsing label counts
          // (chunk-boundary e2e: 88 -> 86 -> 87 -> 59 — PROVEN root cause). Two checks:
          //  1) LENGTH (legacy v3): fewer bars than the dataset = smaller snapshot.
          //  2) DATASET-IDENTITY (new): the executed bar range must START at the current
          //     dataset's first bar (after skipping any seed-context bars, which precede
          //     it). Live ticks can make a stale session's LENGTH match the dataset, so
          //     length alone cannot catch same-length different-dataset results — but a
          //     stale snapshot is always missing the prepended chunk, so its range starts
          //     LATER than the current first bar. Drop it; the merged prepend result is
          //     authoritative. The v2 seed-trim below covers the (> dataset) case.
          if (ohlcvData.length > 0 && msg.barTimestamps && msg.barTimestamps.length > 0) {
            const curLen = ohlcvData.length;
            const curFirst = ohlcvData[0].timestamp;
            const execLen = msg.barTimestamps.length;
            const execFirst = msg.barTimestamps[0];
            if (execLen < curLen) {
              console.warn(
                `Execution result dropped: stale WS result (${execLen} bars) < dataset (${curLen}) for ${msg.indicatorId}`,
              );
              return;
            }
            // Executed range must begin at the current dataset's first bar. Seed-context
            // executions prepend seed bars BEFORE the dataset, so skip ahead to the first
            // executed bar at-or-after the current first bar and require it to BE the
            // current first bar, with enough bars left to cover the whole dataset.
            const startIdx = msg.barTimestamps.findIndex((ts) => ts >= curFirst);
            if (
              startIdx < 0 ||
              msg.barTimestamps[startIdx] !== curFirst ||
              execLen - startIdx < curLen
            ) {
              console.warn(
                `Execution result dropped: stale dataset identity (exec ${execLen} bars from ts=${execFirst}, dataset ${curLen} bars from ts=${curFirst}) for ${msg.indicatorId}`,
              );
              return;
            }
          }
          // The seed-path WS execute sends the full (seed + dataset) bar execution.
          // Trim seed-context shapes to the dataset window exactly like the REST
          // seed path — otherwise the seed-window leak re-enters the indicator
          // result and later chunk merges can never add those labels (label counts
          // stall — chunk-boundary e2e). Detect seed bars by comparing the executed
          // bar count against the dataset: seed bars are present iff the execution
          // ran strictly more bars than the current dataset.
          if (
            ohlcvData.length > 0 &&
            msg.barTimestamps &&
            msg.barTimestamps.length > ohlcvData.length
          ) {
            // Compute how many seed/context bars precede the dataset
            const seedCount = msg.barTimestamps.findIndex(
              (ts) => ts >= ohlcvData[0].timestamp,
            );
            if (seedCount > 0) {
              // --- Trim array-indexed plot data (the critical fix) ---
              // Slice barTimestamps to start at the dataset's first bar
              msg.barTimestamps = msg.barTimestamps.slice(seedCount);
              // Slice every output series to remove seed-bar values
              for (const key of Object.keys(msg.outputs)) {
                msg.outputs[key] = msg.outputs[key].slice(seedCount);
              }
              // Slice per-plot color arrays
              if (msg.plotColors) {
                for (const key of Object.keys(msg.plotColors)) {
                  msg.plotColors[key] = msg.plotColors[key].slice(seedCount);
                }
              }
              // Slice per-plot fill-color arrays
              if (msg.fillColorData) {
                for (const key of Object.keys(msg.fillColorData)) {
                  msg.fillColorData[key] = msg.fillColorData[key].slice(seedCount);
                }
              }
              // Slice bar color overrides (body/wick/border colors per bar)
              if (msg.barColors) {
                msg.barColors = msg.barColors.slice(seedCount);
              }
              // Slice bgcolor color data
              if (msg.bgcolor) {
                msg.bgcolor = msg.bgcolor.slice(seedCount);
              }
              // --- Trim time-indexed drawing data (existing logic, kept) ---
              const datasetStartSec = Math.floor(ohlcvData[0].timestamp / 1000);
              msg.labels = (msg.labels || []).filter((l) => l.time >= datasetStartSec);
              msg.lines = (msg.lines || []).filter((ln) =>
                ln.points.some((p) => p.time >= datasetStartSec),
              );
              msg.boxes = (msg.boxes || []).filter(
                (b) => b.startTime >= datasetStartSec || b.endTime >= datasetStartSec,
              );
              msg.shapes = (msg.shapes || []).filter(
                (s) => s.time >= datasetStartSec,
              );
              // --- Adjust barIndex-based data (subtract seedCount) ---
              if (msg.strategyMarkers) {
                msg.strategyMarkers = msg.strategyMarkers.map((m) => ({
                  ...m,
                  barIndex: m.barIndex - seedCount,
                }));
              }
              if (msg.alertTriggers) {
                msg.alertTriggers = msg.alertTriggers.map((t) => ({
                  ...t,
                  barIndex: t.barIndex - seedCount,
                }));
              }
              // Linefills carry RAW engine bar indexes (line1.x1/x2, line2.x1/x2)
              // — the same seed+dataset space as strategyMarkers/alertTriggers.
              // Subtract seedCount from their x coordinates so fills align with
              // the skeleton lines (which ARE trimmed to the dataset window);
              // otherwise fills drift seedCount bars right of the skeleton.
              if (msg.linefills) {
                msg.linefills = msg.linefills.map((lf) => ({
                  ...lf,
                  line1: {
                    ...lf.line1,
                    x1: lf.line1.x1 - seedCount,
                    x2: lf.line1.x2 - seedCount,
                  },
                  line2: {
                    ...lf.line2,
                    x1: lf.line2.x1 - seedCount,
                    x2: lf.line2.x2 - seedCount,
                  },
                }));
              }
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
            msg.barTimestamps,
            msg.alertConditions,
            msg.alertTriggers,
            msg.boxes,
            msg.tables,
            msg.hiddenPlotKeys,
            msg.barColors,
            indicatorSrc
              ? { ticker: indicatorSrc.symbol, interval: indicatorSrc.interval }
              : undefined,
            msg.linefills,
            msg.plotOverlayKeys,
          );
          indicatorResultsRef.current.set(msg.indicatorId, result);
          onIndicatorResult(msg.indicatorId, result);
          // Flush a forming-candle DIFF that was buffered because it arrived before this
          // full result set `prev` (keeps cold-start labels from being lost).
          const pendingDiff = pendingDiffRef.current.get(msg.indicatorId);
          if (pendingDiff) {
            pendingDiffRef.current.delete(msg.indicatorId);
            const merged = mergeDiffIntoResult(result, pendingDiff);
            indicatorResultsRef.current.set(msg.indicatorId, merged);
            onIndicatorResult(msg.indicatorId, merged);
          }
        }
        if (msg.error) {
          setErrors((prev) => [
            ...prev,
            {
              type: 'error',
              message: toErrorMessage(msg.error),
            },
          ]);
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
            console.warn(
              `Execution result dropped: outputLen (${outputLen}) !== barTimestamps.length (${barTimestamps.length})`,
            );
            return;
          }
          if (Math.abs(outputLen - ohlcvData.length) > 1) {
            console.warn(
              `Execution result dropped: outputLen (${outputLen}) vs ohlcvData.length (${ohlcvData.length})`,
            );
            return;
          }
        }
        const formatCtx = msg.indicatorId
          ? (() => {
              const src = indicatorSourcesRef.current.get(msg.indicatorId);
              return src ? { ticker: src.symbol, interval: src.interval } : undefined;
            })()
          : undefined;
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
          formatCtx,
          msg.linefills,
          msg.plotOverlayKeys,
        );
        setScriptResult(result);
      }
      if (msg.error) {
        setErrors((prev) => [
          ...prev,
          {
            type: 'error',
            message: toErrorMessage(msg.error),
          },
        ]);
      }
    },
    [onIndicatorResult],
  );

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
            ws.send(
              JSON.stringify({
                type: 'execute',
                data: { ...data, bars: data.bars || ohlcvDataRef.current, indicatorId: indId },
              }),
            );
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'kline' && data.data) {
            const k = data.data;
            // Diagnostic: log raw WS kline data
            console.log(`[DIAG] WS kline raw`, {
              symbol: k.symbol,
              interval: k.interval,
              ts: k.timestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
              confirmed: k.confirmed,
              volume: k.volume,
            });
            // Also log as flat string for text-only log captures
            console.log(
              `[DIAG] WS kline flat — symbol=${k.symbol} interval=${k.interval} ts=${k.timestamp} o=${k.open} h=${k.high} l=${k.low} c=${k.close} v=${k.volume} confirmed=${k.confirmed}`,
            );
            const topic = `kline.${k.interval}.${k.symbol}`;
            if (topic !== subscribedTopicRef.current) {
              return;
            }
            if (!k.timestamp) return;
            const time = Math.floor(k.timestamp / 1000);
            if (!time || time <= 0) return;

            // Belt-and-suspenders: reject NaN/Infinity at frontend entry
            if (!isFinite(k.open) || !isFinite(k.high) || !isFinite(k.low) || !isFinite(k.close)) {
              console.warn('[WS] Rejected kline with non-finite prices', k);
              return;
            }

            // Reject stale klines (older than last seen timestamp)
            if (k.timestamp < lastKlineTimestampRef.current) {
              console.debug('[WS] Stale kline skipped', {
                timestamp: k.timestamp,
                lastTimestamp: lastKlineTimestampRef.current,
                interval: k.interval,
                symbol: k.symbol,
              });
              return;
            }

            // Same timestamp: allow confirmed ticks (candle close) to pass through,
            // but skip duplicate forming ticks. This is critical because both forming
            // and confirmed ticks share the same Bybit start timestamp.
            if (k.timestamp === lastKlineTimestampRef.current && !k.confirmed) {
              return;
            }

            // Advance watermark only on confirmed ticks (final candle close).
            // Forming ticks update the candle in-place without advancing, so
            // the confirmed tick for the same period can still pass through.
            if (k.confirmed) {
              lastKlineTimestampRef.current = k.timestamp;
            }

            // Instrumentation: log price delta vs last candle
            setCandles((prev) => {
              const lastCandle = prev[prev.length - 1];
              if (lastCandle) {
                const deltaPct = (((k.close - lastCandle.close) / lastCandle.close) * 100).toFixed(
                  2,
                );
                console.warn(
                  `[DIAG] WS vs REST merge: symbol=${k.symbol} interval=${k.interval} ` +
                    `histClose=${lastCandle.close} wsClose=${k.close} Δ=${deltaPct}% ` +
                    `histOpen=${lastCandle.open} wsOpen=${k.open} ` +
                    `histTime=${lastCandle.time} wsTime=${Math.floor(k.timestamp / 1000)}`,
                );
              }
              return prev; // read-only inspection, no mutation
            });

            const candle: CandlestickData = {
              time,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
              volume: k.volume,
            };
            // Diagnostic: compare WS data to ohlcvDataRef (canonical source)
            {
              const lastOhlcv = ohlcvDataRef.current[ohlcvDataRef.current.length - 1];
              if (lastOhlcv) {
                const lastOhlcvTime = Math.floor(lastOhlcv.timestamp / 1000);
                console.log(
                  `[DIAG] WS vs ohlcvRef — candleTime=${candle.time} ohlcvTime=${lastOhlcvTime} ` +
                    `candleClose=${candle.close} ohlcvClose=${lastOhlcv.close} ` +
                    `candleOpen=${candle.open} ohlcvOpen=${lastOhlcv.open} ` +
                    `match=${candle.time === lastOhlcvTime ? 'YES (REPLACE)' : 'PUSH new candle'}`,
                );
              }
            }
            setCandles((prev) => {
              if (!historicalDataLoadedRef.current) return prev;
              const newCandles = [...prev];
              const last = newCandles[newCandles.length - 1];
              const action = last && last.time === candle.time ? 'REPLACE' : 'PUSH';
              if (action === 'REPLACE') {
                newCandles[newCandles.length - 1] = candle;
              } else {
                newCandles.push(candle);
              }
              // Diagnostic: log candle update result
              const lastNew = newCandles[newCandles.length - 1];
              console.log(`[DIAG] Candle ${action}`, {
                candleTime: candle.time,
                lastTime: last?.time,
                open: lastNew.open,
                high: lastNew.high,
                low: lastNew.low,
                close: lastNew.close,
                totalCandles: newCandles.length,
                watermark: lastKlineTimestampRef.current,
              });
              console.log(
                `[DIAG] Candle flat — action=${action} candleTime=${candle.time} ` +
                  `o=${candle.open} h=${candle.high} l=${candle.low} c=${candle.close} v=${candle.volume} ` +
                  `totalCandles=${newCandles.length}`,
              );
              return newCandles;
            });
            if (k.timestamp) {
              const ohlcvBar = {
                timestamp: k.timestamp,
                open: k.open,
                high: k.high,
                low: k.low,
                close: k.close,
                volume: k.volume,
              };
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
            setErrors((prev) => [
              ...prev,
              {
                type: 'error',
                message: data.data.message || 'WebSocket error',
              },
            ]);
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

  const fetchSeedBars = useCallback(
    async (
      symbol: string,
      interval: string,
      count: number,
    ): Promise<
      Array<{
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>
    > => {
      if (count <= 0) return [];
      const oldest = ohlcvDataRef.current[0];
      if (!oldest) return [];
      const before = oldest.timestamp;
      const response = await fetch(
        `/api/bars?symbol=${symbol}&interval=${interval}&count=${count}&before=${before}`,
      );
      if (!response.ok) return [];
      const json = await response.json();
      return json.data || [];
    },
    [],
  );

  const executeScript = useCallback(
    async (
      code: string,
      symbol: string,
      interval: string,
      existingBars?: Array<{
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>,
      versionRef?: React.MutableRefObject<number>,
      version?: number,
      indicatorId?: string,
    ) => {
      setErrors([]);
      // Capture generation at start to detect indicator removal during async execution
      const capturedGen = indicatorId ? indicatorGenerationRef.current.get(indicatorId) : undefined;
      const isStale = () => {
        if (!indicatorId) return false;
        return indicatorGenerationRef.current.get(indicatorId) !== capturedGen;
      };

      if (indicatorId) {
        indicatorSourcesRef.current.set(indicatorId, {
          source: code,
          symbol,
          interval,
          maxLookback: 0,
        });
      } else {
        lastCodeRef.current = code;
      }
      try {
        let barsToExecute = existingBars;
        if (!barsToExecute) {
          if (ohlcvDataRef.current.length > 0) {
            barsToExecute = ohlcvDataRef.current;
          } else {
            const ohlcvResponse = await fetch(
              `/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=1000`,
            );
            if (!ohlcvResponse.ok) throw new Error('Failed to fetch bars for execution');
            const ohlcvJson = await ohlcvResponse.json();
            ohlcvDataRef.current = ohlcvJson.data;
            barsToExecute = ohlcvJson.data;
          }
        } else {
          ohlcvDataRef.current = existingBars!;
        }
        if (!barsToExecute) throw new Error('No bars available for execution');
        if (isStale()) return;

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
        if (isStale()) return;

        if (!result.success || result.error) {
          if (versionRef && version !== undefined && version !== versionRef.current) return;
          setErrors([
            {
              type: 'error',
              message: toErrorMessage(result.error),
            },
          ]);
          return;
        }

        const maxLookback = result.maxLookback ?? 0;

        if (indicatorId) {
          const prev = indicatorSourcesRef.current.get(indicatorId);
          if (prev) prev.maxLookback = maxLookback;
        }

        if (maxLookback > 0) {
          if (isStale()) return;
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
              if (isStale()) return;
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
                  { ticker: symbol, interval },
                  seedResult.linefills,
                  seedResult.plotOverlayKeys,
                );

                // Trim seed bar data from plot results
                const seedCount = seedBars.length;
                for (const plot of seedScriptRes.plots) {
                  plot.data = plot.data.slice(seedCount);
                }
                if (seedScriptRes.fillColorData) {
                  for (const key of Object.keys(seedScriptRes.fillColorData)) {
                    seedScriptRes.fillColorData[key] =
                      seedScriptRes.fillColorData[key].slice(seedCount);
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
                  seedScriptRes.alertTriggers =
                    seedScriptRes.alertTriggers
                      .filter((t) => t.barIndex >= seedCount)
                      .map((t) => ({ ...t, barIndex: t.barIndex - seedCount }));
                }

                // Trim seed bar linefills — they carry RAW engine bar indexes
                // (line1.x1/x2, line2.x1/x2) in the same seed+dataset space as
                // strategyMarkers/alertTriggers, so subtract seedCount from their
                // x coordinates to align fills with the trimmed skeleton lines.
                if (seedScriptRes.linefills) {
                  seedScriptRes.linefills = seedScriptRes.linefills.map((lf) => ({
                    ...lf,
                    line1: {
                      ...lf.line1,
                      x1: lf.line1.x1 - seedCount,
                      x2: lf.line1.x2 - seedCount,
                    },
                    line2: {
                      ...lf.line2,
                      x1: lf.line2.x1 - seedCount,
                      x2: lf.line2.x2 - seedCount,
                    },
                  }));
                }

                // Trim seed bar labels/lines/boxes to the original dataset boundary.
                // Seed bars exist only to warm up indicator state; their shapes must
                // NOT leak into the initial result — a leaked label can never be
                // re-added by later chunk merges, stalling label counts
                // (chunk-boundary e2e timeout). The cut is anchored to the FIRST
                // DATASET BAR (originalBars[0]) — the true boundary between seed
                // context and the visible dataset — which keeps exactly the dataset
                // window's shapes regardless of how many/which seed bars were
                // fetched. buildScriptResult normalizes all shape times to SECONDS,
                // while bar timestamps are ms — compare in seconds.
                const datasetStartSec = Math.floor(originalBars[0].timestamp / 1000);
                seedScriptRes.labels = seedScriptRes.labels.filter(
                  (l) => l.time >= datasetStartSec,
                );
                seedScriptRes.lines = seedScriptRes.lines.filter((ln) =>
                  ln.points.some((p) => p.time >= datasetStartSec),
                );
                seedScriptRes.boxes = seedScriptRes.boxes.filter(
                  (b) => b.startTime >= datasetStartSec || b.endTime >= datasetStartSec,
                );
                // Tables carry no bar-time anchor (position is a screen-corner constant),
                // so they cannot be trimmed to the dataset boundary — left untrimmed.

                if (versionRef && version !== undefined && version !== versionRef.current) return;
                if (isStale()) return;

                const seedHasLabels = (seedScriptRes.labels?.length ?? 0) > 0;
                const nonSeedHasLabels = (result.labels?.length ?? 0) > 0;
                // On cold start the seed execution can come back with 0 labels while the
                // earlier non-seed result already has labels. Don't discard the good
                // result — fall through to the standard (non-seed) path so the indicator
                // keeps its labels.
                const useSeed = !nonSeedHasLabels || seedHasLabels;

                if (useSeed) {
                  if (indicatorId) {
                    onIndicatorResult?.(indicatorId, seedScriptRes);
                    const nextMap = new Map(indicatorResultsRef.current);
                    nextMap.set(indicatorId, seedScriptRes);
                    indicatorResultsRef.current = nextMap;
                  } else {
                    setCandles(toCandleData(originalBars));
                    setScriptResult(seedScriptRes);
                  }

                  pendingExecuteRef.current.set(indicatorId || 'default', {
                    source: code,
                    symbol,
                    interval,
                    bars: barsToExecute,
                  });
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                      JSON.stringify({
                        type: 'execute',
                        data: {
                          source: code,
                          symbol,
                          interval,
                          bars: barsToExecute,
                          indicatorId: indicatorId || 'default',
                        },
                      }),
                    );
                  }
                  return;
                }

                // Seed provided no labels but the non-seed result has some: keep the
                // labels by restoring bars to what `result` was computed on and let the
                // standard result path below deliver it.
                barsToExecute = originalBars;
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
          { ticker: symbol, interval },
          result.linefills,
          result.plotOverlayKeys,
        );

        if (versionRef && version !== undefined && version !== versionRef.current) return;
        if (isStale()) return;

        if (indicatorId) {
          onIndicatorResult?.(indicatorId, scriptRes);
          const nextMap = new Map(indicatorResultsRef.current);
          nextMap.set(indicatorId, scriptRes);
          indicatorResultsRef.current = nextMap;
        } else {
          setCandles(toCandleData(barsToExecute));
          setScriptResult(scriptRes);
        }

        pendingExecuteRef.current.set(indicatorId || 'default', {
          source: code,
          symbol,
          interval,
          bars: barsToExecute,
        });
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'execute',
              data: {
                source: code,
                symbol,
                interval,
                bars: barsToExecute,
                indicatorId: indicatorId || 'default',
              },
            }),
          );
        }
      } catch (error) {
        if (versionRef && version !== undefined && version !== versionRef.current) return;
        if (isStale()) return;
        setErrors([
          {
            type: 'error',
            message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ]);
      }
    },
    [toCandleData, onIndicatorResult, fetchSeedBars],
  );

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

      const json = (await response.json()) as { success: boolean; path: string };
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
      // Increment generation to invalidate any in-flight HTTP execution for this indicator
      const gen = (indicatorGenerationRef.current.get(indicatorId) ?? 0) + 1;
      indicatorGenerationRef.current.set(indicatorId, gen);
      indicatorResultsRef.current.delete(indicatorId);
      indicatorSourcesRef.current.delete(indicatorId);
      pendingExecuteRef.current.delete(indicatorId);
    }, []),
    indicatorSourcesRef,
    wsRef,
    exportChartData,
  };
}
