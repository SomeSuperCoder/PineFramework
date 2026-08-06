/**
 * BybitWebSocketService — live candle streaming via Bybit WebSocket.
 *
 * Connects to Bybit's public WebSocket API for real-time kline (candlestick) data.
 * Handles connection management, subscription, reconnection, and candle processing.
 *
 * @module trading
 */

import WebSocket from 'ws';
import { ClosedCandle, PairId, pairIdToString } from './scheduler.js';
import type { PineLogger } from '../utils/logger/types.js';

// ---- Types ----

export interface BybitWebSocketConfig {
  /** WebSocket endpoint URL. */
  wsUrl?: string;
  /** REST API endpoint for historical candles. */
  restUrl?: string;
  /** Maximum reconnection attempts. */
  maxReconnectAttempts?: number;
  /** Base delay for exponential backoff (ms). */
  reconnectBaseDelay?: number;
  /** Maximum delay for exponential backoff (ms). */
  reconnectMaxDelay?: number;
  /** Historical candle fetch limit per pair. */
  historicalCandleLimit?: number;
  /** Structured logger for feed lifecycle/tick observability (liveness
   *  suite). Falls back to a silent no-op logger when omitted. */
  logger?: PineLogger;
}

export interface BybitKlineMessage {
  topic: string;
  type: string;
  ts: number;
  // Bybit v5 WS delivers `data` as an ARRAY of kline objects (one per
  // subscription event), e.g. [{start, end, interval, open, high, low, close,
  // volume, confirm, timestamp}]. The handler normalizes to data[0] — mirroring
  // gateway.ts — before reading any field.
  data: {
    start: number;
    end: number;
    interval: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    confirm: boolean;
    timestamp: number;
  }[];
}

export type CandleCallback = (candle: ClosedCandle) => void;
export type ConnectionCallback = (connected: boolean) => void;
export type ErrorCallback = (error: Error) => void;
/** A raw kline message tick (liveness suite) — every kline message the feed
 *  delivers, confirmed or not. Drives observability (debug logging + liveness
 *  telemetry) WITHOUT touching execution semantics: the engine only ever sees
 *  confirmed candles via CandleCallback. */
export interface BybitTick {
  /** Pair symbol (e.g. "ETHUSDT"). */
  symbol: string;
  /** Pair timeframe (e.g. "1", "60"). */
  timeframe: string;
  /** Wall-clock arrival time (ms epoch) — when the feed proved itself alive. */
  timestamp: number;
  /** Candle close price as delivered by the exchange. */
  close: number;
  /** Whether this message confirms a closed candle. */
  confirm: boolean;
}
/** Liveness telemetry callback (liveness suite) — invoked for EVERY kline
 *  message, confirmed or not, before the confirmed-only gate. Telemetry only:
 *  it must never feed the strategy engine. */
export type TickCallback = (tick: BybitTick) => void;

// ---- Constants ----

const DEFAULT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';
const DEFAULT_REST_URL = 'https://api.bybit.com';
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;
const DEFAULT_HISTORICAL_CANDLE_LIMIT = 200;

/** Connect timeout (liveness suite): a socket stuck CONNECTING for this long
 *  is treated as failed — logged, surfaced to the engine (marks the feed
 *  state failed), and reconnected, instead of hanging silently. Approved
 *  design range: 10-15s. */
const CONNECT_TIMEOUT_MS = 12_000;

/** Long-timeframe warning threshold (liveness suite): a confirmed candle more
 *  than this many minutes out means a chaos/strategy run waits a long time
 *  with zero engine ticks — warn loudly so it is never mistaken for a dead
 *  feed. Exported so bot-engine's telemetry uses the same threshold (SSOT). */
export const LONG_TIMEFRAME_WARN_MINUTES = 10;

/** No-op logger fallback so the service keeps working without a logger (the
 *  engine passes its PineLogger; standalone/test usage may omit it). */
const silentLogger: PineLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/** Parse a Bybit kline interval into minutes for next-confirm ETA math
 *  (liveness suite): "1"→1, "60"→60, "D"→1440, "W"→10080, "M"→43200 (≈30d).
 *  Returns 0 for unknown intervals — callers treat 0 as "cannot compute". */
export function timeframeToMinutes(timeframe: string): number {
  const numeric = Number(timeframe);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  const unit = timeframe.toUpperCase();
  if (unit === 'D') return 1440;
  if (unit === 'W') return 10080;
  if (unit === 'M') return 43_200;
  return 0;
}

/** Compute the next candle-boundary timestamp STRICTLY greater than `now` (ms
 *  epoch) for a candle of duration `durationMs` — the earliest instant a NEW
 *  confirmed candle for that interval can exist. SSOT for next-confirm ETA
 *  math shared with bot-engine (liveness suite, review #3). Boundary case:
 *  when `now` lands exactly on a boundary, Math.ceil returns `now` itself
 *  (ETA == now, which is not "next") — return one full duration later. */
export function nextBoundaryAfter(now: number, durationMs: number): number {
  const boundary = Math.ceil(now / durationMs) * durationMs;
  return boundary > now ? boundary : boundary + durationMs;
}

// ---- BybitWebSocketService ----

/**
 * Live candle streaming service using Bybit WebSocket.
 *
 * Features:
 * - Automatic connection management with reconnection
 * - Subscription to multiple Symbol × Timeframe pairs
 * - Candle confirmation filtering (only confirmed candles)
 * - Historical candle fetch on startup
 * - Exponential backoff for reconnection
 */
export class BybitWebSocketService {
  private ws: WebSocket | null = null;
  /** Required config minus the logger — logger is a dependency, not a config
   *  value, so Required<> must not force it. */
  private config: Omit<Required<BybitWebSocketConfig>, 'logger'>;
  private subscriptions = new Map<string, PairId>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private isStopped = false;
  private readonly logger: PineLogger;

  // Callbacks
  private onCandle: CandleCallback | null = null;
  private onConnectionChange: ConnectionCallback | null = null;
  private onError: ErrorCallback | null = null;
  private onTick: TickCallback | null = null;

  constructor(config?: BybitWebSocketConfig) {
    this.config = {
      wsUrl: config?.wsUrl ?? DEFAULT_WS_URL,
      restUrl: config?.restUrl ?? DEFAULT_REST_URL,
      maxReconnectAttempts: config?.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
      reconnectBaseDelay: config?.reconnectBaseDelay ?? DEFAULT_RECONNECT_BASE_DELAY_MS,
      reconnectMaxDelay: config?.reconnectMaxDelay ?? DEFAULT_RECONNECT_MAX_DELAY_MS,
      historicalCandleLimit: config?.historicalCandleLimit ?? DEFAULT_HISTORICAL_CANDLE_LIMIT,
    };
    this.logger = config?.logger ?? silentLogger;
  }

  /**
   * Set callback for processed candles.
   */
  setCandleCallback(callback: CandleCallback): void {
    this.onCandle = callback;
  }

  /**
   * Set callback for connection state changes.
   */
  setConnectionCallback(callback: ConnectionCallback): void {
    this.onConnectionChange = callback;
  }

  /**
   * Set callback for errors.
   */
  setErrorCallback(callback: ErrorCallback): void {
    this.onError = callback;
  }

  /**
   * Set callback for feed-liveness telemetry (liveness suite) — invoked for
   * every kline message (confirmed or not), before the confirmed-only gate.
   */
  setTickCallback(callback: TickCallback): void {
    this.onTick = callback;
  }

  /**
   * Connect to Bybit WebSocket.
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // A fresh explicit connect supersedes any pending scheduled reconnect —
    // clear both timers so nothing stale fires (single-flight, liveness
    // suite).
    this.clearReconnectTimer();
    this.clearConnectTimeout();

    this.isConnecting = true;
    this.isStopped = false;

    try {
      // Identity guard (review #1 — CRITICAL): every per-socket handler
      // captures the socket it was bound to and the FIRST line checks that
      // `this.ws` still IS that socket. A stale socket's delayed close/error
      // (e.g. the connect timeout aborted socket A AFTER a reconnect created
      // socket B and assigned `this.ws = B`) must never mutate the NEWER
      // socket's state — otherwise it clears B's connect timeout (B hangs
      // forever), flips isConnecting mid-handshake, lies to telemetry, and
      // schedules a SECOND reconnect (single-flight sees isConnecting=false +
      // B not OPEN) → two live sockets → duplicate kline streams → duplicate
      // confirmed candles → duplicate order signals. The abort inside the
      // timeout callback stays — it kills the stuck handshake directly.
      const socket = new WebSocket(this.config.wsUrl);
      this.ws = socket;
      this.armConnectTimeout();

      socket.on('open', () => {
        if (this.ws !== socket) return;
        this.clearConnectTimeout();
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.logger.info('Bybit feed socket open', { at: new Date().toISOString() });
        this.onConnectionChange?.(true);
        // Bybit WS sessions do not persist — every (re)connect must send a
        // FRESH subscription payload (resubscribeAll sends them again).
        this.resubscribeAll();
      });

      socket.on('message', (data: Buffer) => {
        // Same identity guard as open/close/error: a stale socket's queued
        // klines must not reach the engine after a newer socket exists.
        if (this.ws !== socket) return;
        this.handleMessage(data.toString());
      });

      socket.on('close', (code: number, reason: Buffer) => {
        if (this.ws !== socket) return;
        this.clearConnectTimeout();
        this.isConnecting = false;
        this.logger.info('Bybit feed socket closed', {
          at: new Date().toISOString(),
          code,
          reason: reason.toString() || undefined,
        });
        this.onConnectionChange?.(false);
        if (!this.isStopped) {
          this.scheduleReconnect();
        }
      });

      socket.on('error', (error: Error) => {
        if (this.ws !== socket) return;
        this.clearConnectTimeout();
        this.isConnecting = false;
        this.logger.error('Bybit feed socket error', {
          at: new Date().toISOString(),
          error: error.message,
        });
        this.onError?.(error);
        // error often fires immediately before close — scheduleReconnect is
        // single-flight (timer guard), so both events yield ONE reconnect.
        if (!this.isStopped) {
          this.scheduleReconnect();
        }
      });
    } catch (error) {
      this.isConnecting = false;
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from Bybit WebSocket.
   */
  disconnect(): void {
    this.isStopped = true;
    this.clearReconnectTimer();
    this.clearConnectTimeout();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.onConnectionChange?.(false);
  }

  /**
   * Subscribe to kline channel for a pair.
   */
  subscribe(pair: PairId): void {
    const key = pairIdToString(pair);
    this.subscriptions.set(key, pair);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(pair);
    }
  }

  /**
   * Unsubscribe from kline channel for a pair.
   */
  unsubscribe(pair: PairId): void {
    const key = pairIdToString(pair);
    this.subscriptions.delete(key);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe(pair);
    }
  }

  /**
   * Fetch historical candles for a pair.
   */
  async fetchHistoricalCandles(pair: PairId): Promise<ClosedCandle[]> {
    const url = `${this.config.restUrl}/v5/market/kline?category=linear&symbol=${pair.symbol}&interval=${pair.timeframe}&limit=${this.config.historicalCandleLimit}`;

    const response = await fetch(url);
    const json = (await response.json()) as {
      retCode: number;
      retMsg: string;
      result: { list: string[][] };
    };

    if (json.retCode !== 0) {
      throw new Error(`Bybit API error: ${json.retMsg}`);
    }

    return json.result.list
      .map((row) => ({
        symbol: pair.symbol,
        timeframe: pair.timeframe,
        timestamp: parseInt(row[0], 10),
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
      }))
      .reverse();
  }

  /**
   * Check if connected.
   */
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get active subscriptions.
   */
  get activeSubscriptions(): PairId[] {
    return Array.from(this.subscriptions.values());
  }

  // ---- Private Methods ----

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as BybitWebSocketResponse;

      // Handle subscription confirmation
      if (message.success !== undefined) {
        return; // Ignore subscription confirmations
      }

      // Handle kline messages
      if (message.topic?.startsWith('kline.')) {
        this.handleKlineMessage(message as BybitKlineMessage);
      }
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleKlineMessage(message: BybitKlineMessage): void {
    // Drop messages after disconnect
    if (this.isStopped) return;

    // Parse topic to get symbol and timeframe
    // Topic format: kline.{interval}.{symbol}
    const parts = message.topic.split('.');
    if (parts.length < 3) {
      return;
    }

    const timeframe = parts[1];
    const symbol = parts[2];

    // Bybit v5 sends `data` as an ARRAY of kline objects — normalize to the
    // first element before reading any field (same shape handling as the
    // gateway socket, backend/src/ws/gateway.ts).
    const d = Array.isArray(message.data) ? message.data[0] : message.data;
    const confirm = d.confirm;

    // Tick debug logging (liveness suite): every kline message, confirmed or
    // not — a live feed with no confirm yet must still be observable. Uses
    // `ts` (Bybit's own field name) because LogMeta declares `timestamp` as
    // an ISO string and the exchange value is a numeric epoch.
    this.logger.debug('Bybit kline tick', {
      symbol,
      timeframe,
      ts: d.timestamp,
      close: d.close,
      confirm,
    });

    // Feed-liveness telemetry (liveness suite): advance the tick counters on
    // EVERY kline message so feed-state.json / bot:feedStatus prove the feed
    // is alive before the first confirmed candle. Telemetry only — this
    // callback deliberately never feeds the strategy engine (see the gate
    // below; one engine updateBar per CLOSED candle).
    this.onTick?.({
      symbol,
      timeframe,
      timestamp: Date.now(),
      close: parseFloat(d.close),
      confirm,
    });

    // Execution semantics (UNCHANGED): only confirmed candles reach the
    // engine. Feeding unconfirmed ticks into the strategy/chaos path would
    // re-run logic up to 60x per candle and create false/duplicate orders.
    if (!confirm) {
      return;
    }

    const candle: ClosedCandle = {
      symbol,
      timeframe,
      timestamp: d.start,
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      volume: parseFloat(d.volume),
    };

    this.onCandle?.(candle);
  }

  private sendSubscribe(pair: PairId): void {
    const message = {
      op: 'subscribe',
      args: [`kline.${pair.timeframe}.${pair.symbol}`],
    };
    this.ws?.send(JSON.stringify(message));
    this.warnIfLongTimeframe(pair);
  }

  private sendUnsubscribe(pair: PairId): void {
    const message = {
      op: 'unsubscribe',
      args: [`kline.${pair.timeframe}.${pair.symbol}`],
    };
    this.ws?.send(JSON.stringify(message));
  }

  private resubscribeAll(): void {
    for (const pair of this.subscriptions.values()) {
      this.sendSubscribe(pair);
    }
  }

  /** Schedule a single reconnect (liveness suite). Idempotent/single-flight:
   *  a live timer means one is already scheduled, so the error→close double
   *  event (and any other caller) can never spawn two sockets. Exponential
   *  backoff with equal jitter (bounded minimum + randomization, avoids
   *  synchronized retry storms), capped at reconnectMaxDelay, reset on
   *  successful open (see the open handler). A stopped feed never schedules —
   *  no reconnect loop after stop. */
  private scheduleReconnect(): void {
    if (this.isStopped) {
      return; // Shutdown guard: never reconnect after stop/restart.
    }
    if (this.reconnectTimer !== null) {
      return; // Single-flight: a reconnect is already scheduled.
    }
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error('Bybit feed reconnect attempts exhausted', {
        attempts: this.reconnectAttempts,
        at: new Date().toISOString(),
      });
      return;
    }

    const cap = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxDelay,
    );
    // Equal jitter: delay in [cap/2, cap] — keeps a minimum backoff so the
    // first retry is still ~base (1s), while randomizing to avoid a
    // synchronized retry with other clients.
    const delay = cap / 2 + Math.floor(Math.random() * (cap / 2));

    this.logger.warn('Bybit feed reconnect scheduled', {
      attempt: this.reconnectAttempts + 1,
      delayMs: delay,
      at: new Date().toISOString(),
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Arm the connect timeout (liveness suite): if the socket does not reach
   *  OPEN within CONNECT_TIMEOUT_MS, treat it as failed — log with timestamp,
   *  surface to the engine (marks the feed state failed via onError), and
   *  schedule a reconnect. Cleared by open/close/error so it never fires on a
   *  socket that already transitioned, and guarded against firing after OPEN. */
  private armConnectTimeout(): void {
    this.clearConnectTimeout();
    this.connectTimeoutTimer = setTimeout(() => {
      this.connectTimeoutTimer = null;
      // Guard: never fire after the socket is already open (or already gone).
      if (!this.ws || this.ws.readyState === WebSocket.OPEN) {
        return;
      }
      this.isConnecting = false;
      this.logger.error('Bybit feed connect timeout', {
        at: new Date().toISOString(),
        timeoutMs: CONNECT_TIMEOUT_MS,
      });
      this.onError?.(new Error(`Bybit feed connect timeout after ${CONNECT_TIMEOUT_MS}ms`));
      // Abort the stuck socket so a late (slow-network) open can never fire its
      // stale handler against a newer socket's state — close() on CONNECTING
      // aborts the handshake and the socket goes CLOSED instead of OPEN.
      this.ws?.close();
      this.scheduleReconnect();
    }, CONNECT_TIMEOUT_MS);
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
  }

  /** Long-timeframe warning (liveness suite): when the configured timeframe's
   *  next CONFIRMED candle is > LONG_TIMEFRAME_WARN_MINUTES away, log the ETA
   *  loudly so "waiting for the next confirm" is never mistaken for a dead
   *  feed. Fires per subscribe — and thus per fresh reconnect subscription. */
  private warnIfLongTimeframe(pair: PairId): void {
    const minutes = timeframeToMinutes(pair.timeframe);
    if (minutes <= LONG_TIMEFRAME_WARN_MINUTES) {
      return;
    }
    const durationMs = minutes * 60_000;
    const now = Date.now();
    const nextBoundary = nextBoundaryAfter(now, durationMs);
    this.logger.warn('Long timeframe feed — no confirmed candle yet', {
      symbol: pair.symbol,
      timeframe: pair.timeframe,
      minutes,
      nextConfirmEta: new Date(nextBoundary).toISOString(),
      eta: new Date(nextBoundary).toLocaleTimeString(),
      at: new Date().toISOString(),
    });
  }
}

// ---- Response Types ----

interface BybitWebSocketResponse {
  success?: boolean;
  ret_msg?: string;
  op?: string;
  conn_id?: string;
  topic?: string;
  type?: string;
  ts?: number;
  data?: unknown;
}
