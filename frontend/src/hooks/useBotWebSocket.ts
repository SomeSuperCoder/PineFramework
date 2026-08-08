import { useState, useEffect, useRef, useCallback } from 'react';
import { useAutoSelectProgress } from './useAutoSelectProgress';
import type { TradeRecord } from '../types/trade';
import type { ChaosSignalRecord, ChaosHeartbeatRecord, CandleErrorRecord, ChaosModeSnapshot, FeedStatus, PositionInfo } from '../types';
import type { BotStatusSnapshot, LogEntry } from '../types/bot';

/** Coerce a `bot:position` payload into PositionInfo. Supports the current
 *  flat shape (`{pair, symbol, timeframe, direction, quantity, entryPrice,
 *  entryTime, unrealizedPnl?}`) and the legacy nested shape
 *  (`{type, position: {symbol, side, size, entryPrice, openedAt, ...}}`). */
function toPositionInfo(raw: unknown): PositionInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const isFlatShape =
    typeof r.symbol === 'string' && (r.direction === 'long' || r.direction === 'flat');
  if (isFlatShape) {
    return {
      pair: typeof r.pair === 'string' && r.pair ? r.pair : `${r.symbol}:${r.timeframe ?? ''}`,
      symbol: r.symbol as string,
      timeframe: typeof r.timeframe === 'string' ? r.timeframe : '',
      direction: r.direction as 'long' | 'flat',
      quantity: typeof r.quantity === 'number' ? r.quantity : 0,
      entryPrice: typeof r.entryPrice === 'number' ? r.entryPrice : 0,
      entryTime: typeof r.entryTime === 'number' ? r.entryTime : Date.now(),
      unrealizedPnl: typeof r.unrealizedPnl === 'number' ? r.unrealizedPnl : undefined,
    };
  }
  // Legacy nested shape fallback. Legacy shorts are not representable in the
  // new PositionInfo contract (direction is 'long' | 'flat'), so they are
  // ignored here — the next snapshot reconciles positions from engine truth.
  const inner = (r.position ?? r) as Record<string, unknown> | undefined;
  if (!inner || typeof inner !== 'object' || typeof inner.symbol !== 'string') return null;
  if (inner.side === 'short') return null;
  return {
    pair: `${inner.symbol}:${typeof inner.timeframe === 'string' ? inner.timeframe : ''}`,
    symbol: inner.symbol as string,
    timeframe: typeof inner.timeframe === 'string' ? inner.timeframe : '',
    direction: 'long' as const,
    quantity: typeof inner.size === 'number' ? inner.size : typeof inner.quantity === 'number' ? inner.quantity : 0,
    entryPrice: typeof inner.entryPrice === 'number' ? inner.entryPrice : 0,
    entryTime: typeof inner.openedAt === 'number' ? inner.openedAt : typeof inner.entryTime === 'number' ? inner.entryTime : Date.now(),
    unrealizedPnl: typeof inner.unrealizedPnl === 'number' ? inner.unrealizedPnl : undefined,
  };
}

/** Coerce a `bot:trade` WS payload into a TradeRecord; null when malformed.
 *  Accepts `{ trade }` (backend convention) or the record directly, and never
 *  throws on unexpected shapes (spec: never crash on unexpected API payloads). */
function toTradeRecord(raw: unknown): TradeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.symbol !== 'string') return null;
  return {
    id: r.id,
    botId: typeof r.botId === 'string' ? r.botId : '',
    symbol: r.symbol,
    side: r.side === 'sell' ? 'sell' : 'buy',
    entryPrice: typeof r.entryPrice === 'number' ? r.entryPrice : 0,
    exitPrice: typeof r.exitPrice === 'number' ? r.exitPrice : 0,
    size: typeof r.size === 'number' ? r.size : 0,
    fees: typeof r.fees === 'number' ? r.fees : 0,
    realizedPnl: typeof r.realizedPnl === 'number' ? r.realizedPnl : 0,
    dex: typeof r.dex === 'string' ? r.dex : '',
    transactionSignature:
      typeof r.transactionSignature === 'string' ? r.transactionSignature : undefined,
    openedAt: typeof r.openedAt === 'number' ? r.openedAt : Date.now(),
    closedAt: typeof r.closedAt === 'number' ? r.closedAt : Date.now(),
    strategy: typeof r.strategy === 'string' ? r.strategy : undefined,
    timeframe: typeof r.timeframe === 'string' ? r.timeframe : undefined,
    mode: r.mode === 'chaos' ? 'chaos' : r.mode === 'live' ? 'live' : undefined,
    status:
      r.status === 'unknown' ? 'unknown' : r.status === 'confirmed' ? 'confirmed' : undefined,
  };
}

export function useBotWebSocket(backendUrl: string) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<BotStatusSnapshot | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chaosSignals, setChaosSignals] = useState<ChaosSignalRecord[]>([]);
  const [chaosHeartbeat, setChaosHeartbeat] = useState<ChaosHeartbeatRecord | null>(null);
  const [chaosHeartbeatHistory, setChaosHeartbeatHistory] = useState<ChaosHeartbeatRecord[]>([]);
  const [feedStatus, setFeedStatus] = useState<FeedStatus | null>(null);
  const [totalCandleErrors, setTotalCandleErrors] = useState(0);
  const [lastCandleError, setLastCandleError] = useState<CandleErrorRecord | null>(null);
  const [engineChaosMode, setEngineChaosMode] = useState<ChaosModeSnapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [connectionFailed, setConnectionFailed] = useState(false);
  const connectAttemptsRef = useRef(0);
  // Live trades from `bot:trade` events (bounded ring, newest last) — the
  // Trade History / Statistics tabs merge these in (design D6, task 4.5).
  const [liveTrades, setLiveTrades] = useState<TradeRecord[]>([]);
  // Increments on every successful websocket open — consumers refetch REST
  // data on reconnect so state is never stale (spec: reconnect refreshes data).
  const [connectionEpoch, setConnectionEpoch] = useState(0);

  // Auto-select progress — delegated to shared hook
  const autoSelect = useAutoSelectProgress();

  const connect = useCallback(() => {
    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/bot';
    const ws = new WebSocket(wsUrl);
    connectAttemptsRef.current++;

    ws.onopen = () => {
      setConnected(true);
      setConnectionFailed(false);
      connectAttemptsRef.current = 0;
      setConnectionEpoch((e) => e + 1);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.channel === 'bot:snapshot' && msg.type === 'snapshot') {
          setStatus(msg.data.status);
          setChaosSignals(msg.data.chaosSignals || []);
          setChaosHeartbeat(msg.data.chaosHeartbeat ?? null);
          // Seed heartbeat history with the snapshot's latest record (snapshot
          // replace semantics — the backend always sends full state).
          setChaosHeartbeatHistory(msg.data.chaosHeartbeat ? [msg.data.chaosHeartbeat] : []);
          // Feed state rides on the snapshot (so a fresh page load on a silent
          // feed is not blind) and on `bot:feedStatus` events (live updates).
          setFeedStatus(msg.data.status?.feedState ?? msg.data.feedState ?? null);
          if (typeof msg.data.totalCandleErrors === 'number') {
            setTotalCandleErrors(msg.data.totalCandleErrors);
          }
          setEngineChaosMode(msg.data.chaosMode ?? null);
        } else if (msg.channel === 'bot:state') {
          setStatus((prev) => prev ? { ...prev, state: msg.data.current } : null);
        } else if (msg.channel === 'bot:log') {
          setLogs((prev) => [...prev.slice(-999), msg.data]);
        } else if (msg.channel === 'bot:chaosSignal') {
          setChaosSignals((prev) => [...prev.slice(-199), msg.data]);
        } else if (msg.channel === 'bot:position') {
          setStatus((prev) => {
            if (!prev) return null;
            const data = msg.data as Record<string, unknown> | null | undefined;
            if (!data) return prev;
            const eventType = data.type;
            const pos = toPositionInfo(data);
            if (!pos) return prev;
            if (eventType === 'closed' || pos.direction === 'flat') {
              return { ...prev, positions: prev.positions.filter((p) => p.symbol !== pos.symbol) };
            }
            if (prev.positions.some((p) => p.symbol === pos.symbol)) {
              return {
                ...prev,
                positions: prev.positions.map((p) => p.symbol === pos.symbol ? pos : p),
              };
            }
            return { ...prev, positions: [...prev.positions, pos] };
          });
        } else if (msg.channel === 'bot:metrics') {
          setStatus((prev) => prev ? { ...prev, ...msg.data } : null);
        } else if (msg.channel === 'bot:feedStatus') {
          setFeedStatus(msg.data ?? null);
        } else if (msg.channel === 'bot:chaosHeartbeat') {
          setChaosHeartbeat(msg.data ?? null);
          // Bounded history ring (same bound as chaosSignals) so the mini-chart
          // can render noop/error outcomes as glyphs on the chart.
          if (msg.data) {
            setChaosHeartbeatHistory((prev) => [...prev.slice(-199), msg.data]);
          }
        } else if (msg.channel === 'bot:candleError') {
          const rec = msg.data as CandleErrorRecord | undefined;
          if (rec && typeof rec.message === 'string') {
            setLastCandleError(rec);
            // Snapshot carries the authoritative counter; events keep it live
            // between snapshots.
            setTotalCandleErrors((prev) => prev + 1);
          }
        } else if (msg.channel === 'bot:trade' || msg.type === 'bot:trade') {
          // Live closed-trade event (backend: { channel: 'bot:trade', data: { trade } }).
          // Defensive: also accept { type: 'bot:trade' } or a bare record.
          const trade = toTradeRecord(msg.data?.trade ?? msg.data);
          if (trade) {
            setLiveTrades((prev) =>
              prev.some((t) => t.id === trade.id) ? prev : [...prev.slice(-199), trade],
            );
          }
        } else {
          // Delegate to auto-select hook for other channels
          autoSelect.handleMessage(msg);
        }
      } catch { /* ignore parse errors */ }
    };
    ws.onclose = () => {
      setConnected(false);
      // After 5 failed attempts (~15 seconds), show connection failed
      if (connectAttemptsRef.current >= 5) {
        setConnectionFailed(true);
      }
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [backendUrl, autoSelect.handleMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Reset auto-select state when status changes to non-idle (bot started)
  useEffect(() => {
    if (status?.state === 'Running' || status?.state === 'Starting') {
      autoSelect.reset();
    }
  }, [status?.state, autoSelect.reset]);

  return {
    connected,
    status,
    logs,
    chaosSignals,
    chaosHeartbeat,
    chaosHeartbeatHistory,
    feedStatus,
    totalCandleErrors,
    lastCandleError,
    engineChaosMode,
    autoSelectProgress: autoSelect.progress,
    autoSelectResult: autoSelect.result,
    connectionFailed,
    liveTrades,
    connectionEpoch,
  };
}
