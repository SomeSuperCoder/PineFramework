import { useState, useEffect, useRef, useCallback } from 'react';
import type { CandlestickData } from '../chart';
import type { ScriptResult, ChaosSignalRecord, ChaosHeartbeatRecord, StrategyMarkerData } from '../types';
import { buildScriptResult } from './chart-data-transform';
import { tokens } from '../theme/tokens';
import { wsSend } from '../utils/wsSend';

const DEFAULT_DISPLAY_COUNT = 12;
const FETCH_LIMIT = 200; // enough for lookback periods

/** Color used to flag chaos markers whose DEX order failed. */
const CHAOS_FAILED_COLOR = '#8a8a8a';

/**
 * Stable empty heartbeats reference for the default parameter. A fresh `[]`
 * literal here would create a new array every render and, being part of the
 * chaos effect's dependency array, retrigger the effect infinitely.
 */
const EMPTY_HEARTBEATS: ChaosHeartbeatRecord[] = [];

/**
 * Stable empty signals reference for the default parameter. A fresh `[]`
 * literal here would create a new array every render and, being part of the
 * chaos effect's dependency array, retrigger the effect infinitely.
 */
const EMPTY_SIGNALS: ChaosSignalRecord[] = [];

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
  chaosMode: boolean = false,
  chaosSignals: ChaosSignalRecord[] = EMPTY_SIGNALS,
  chaosHeartbeats: ChaosHeartbeatRecord[] = EMPTY_HEARTBEATS,
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
  const chaosModeRef = useRef(false);

  // Keep refs in sync
  candlesRef.current = candles;
  strategyRef.current = strategySource;
  symbolRef.current = symbol;
  intervalRef.current = interval;
  chaosModeRef.current = chaosMode;

  // Execute script against current candles
  const executeScript = useCallback(
    async (src: string, bars: CandlestickData[]) => {
      if (!src || bars.length === 0) {
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
          return null;
        }
        const execResult = await response.json();
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
          undefined, // formatContext
          execResult.linefills,
        );
        return result;
      } catch (e) {
        return null;
      }
    },
    [backendUrl],
  );

  // Fetch initial OHLCV data
  useEffect(() => {
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

        setCandles(barData);
        setDataVersion((v) => v + 1);

        // Execute script if we have one (skipped in chaos mode)
        if (strategyRef.current && !chaosModeRef.current) {
          const result = await executeScript(strategyRef.current, barData);
          if (!cancelled && result) {
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

  // Re-execute script when strategy source changes (skipped in chaos mode)
  useEffect(() => {
    if (chaosModeRef.current) return;
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

    const topic = `kline.${interval}.${symbol}`;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Subscribe using gateway format (type/topic, not op/args). Route through
        // wsSend: a stale onopen callback (socket closed by the effect cleanup or
        // reconnect) would otherwise throw "WebSocket is already in CLOSING or
        // CLOSED state" as an uncaught page error.
        wsSend(ws, { type: 'subscribe', topic });
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
        if (cancelled) return;
        wsRef.current = null;
        // Reconnect after delay
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [symbol, interval, backendUrl]);

  // Re-execute script when candles or strategy change (debounced). Skipped in chaos mode.
  useEffect(() => {
    if (chaosModeRef.current) return;
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

  // Chaos mode: build a ScriptResult from broadcast chaos signals — no /api/execute.
  // Markers are resolved against the FULL loaded candle array (barIndex = index
  // into `candles`), then reindexed into the display slice when the display
  // ScriptResult is built below. This is what makes full-window resolution
  // visible: without the reindex, the renderer drops every marker beyond the
  // last `displayCount` bars.
  useEffect(() => {
    if (!chaosMode) return;
    if (candles.length === 0) return;

    const timeToIndex = new Map<number, number>();
    for (let i = 0; i < candles.length; i++) {
      timeToIndex.set(candles[i].time, i);
    }

    const markers: StrategyMarkerData[] = [];
    for (const rec of chaosSignals) {
      // Match the pair/timeframe actually being traded — markers from another
      // pair must not land on this chart.
      if (rec.symbol !== symbol || rec.timeframe !== interval) continue;
      const m = rec.marker;
      const fullIdx = timeToIndex.get(Math.floor(m.timestamp / 1000));
      if (fullIdx === undefined) continue;
      markers.push({
        type: m.type,
        name: m.name,
        direction: m.direction,
        action: m.action,
        quantity: m.quantity,
        price: m.price,
        barIndex: fullIdx,
        timestamp: m.timestamp,
        color: rec.success ? m.color : CHAOS_FAILED_COLOR,
        comment: m.comment,
      });
    }

    // Heartbeat outcomes render as distinct small glyphs so a silent no-op or
    // error is visible rather than indistinguishable from no data. Signal
    // heartbeats are skipped — the order marker above already covers that bar
    // and a second arrow would double-render.
    for (const hb of chaosHeartbeats) {
      if (hb.outcome === 'signal') continue;
      const fullIdx = timeToIndex.get(Math.floor(hb.candleTimestamp / 1000));
      if (fullIdx === undefined) continue;
      markers.push({
        type: 'heartbeat',
        name: hb.outcome === 'error' ? 'Chaos Error' : 'No-op',
        direction: 'flat',
        barIndex: fullIdx,
        timestamp: hb.candleTimestamp,
        color: hb.outcome === 'error' ? tokens.colors.semantic.error : tokens.colors.semantic.warning,
        comment: hb.reason,
        outcome: hb.outcome,
      });
    }

    setScriptResult({
      overlay: true,
      plots: [],
      shapes: [],
      lines: [],
      boxes: [],
      labels: [],
      tables: [],
      strategyMarkers: markers,
    });
    setDataVersion((v) => v + 1);
  }, [chaosMode, chaosSignals, chaosHeartbeats, candles, symbol, interval]);

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
      // Markers carry a full-array barIndex; reindex into the display slice and
      // drop markers whose bar is outside the visible window.
      strategyMarkers: (scriptResult.strategyMarkers || []).flatMap((m) =>
        m.barIndex < sliceStart
          ? []
          : [{ ...m, barIndex: m.barIndex - sliceStart }],
      ),
    };
  }

  return { displayCandles, displayScriptResult, dataVersion, loading };
}
