/**
 * BybitWebSocketService — live candle streaming via Bybit WebSocket.
 *
 * Connects to Bybit's public WebSocket API for real-time kline (candlestick) data.
 * Handles connection management, subscription, reconnection, and candle processing.
 *
 * @module trading
 */

import WebSocket from 'ws';
import { ClosedCandle, PairId } from './scheduler.js';
import { getBybitCategory, getBybitSymbol } from './token-registry.js';
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
/** Spot WebSocket endpoint — used for the 3 mapped spot instruments
 *  (GOLDUSDC/TSLAXUSDC/AAPLXUSDC). Not config-overridable: the `wsUrl` config
 *  remains the legacy linear endpoint override. */
const BYBIT_SPOT_WS_URL = 'wss://stream.bybit.com/v5/public/spot';
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
  /** Per-category WebSocket connections. 'linear' is created up-front by
   *  connect() (back-compat — every legacy pair streams linear); 'spot' is
   *  created lazily on the first spot-instrument subscribe and closed when
   *  its last subscription drops. */
  private sockets = new Map<'linear' | 'spot', WebSocket>();
  /** Required config minus the logger — logger is a dependency, not a config
   *  value, so Required<> must not force it. */
  private config: Omit<Required<BybitWebSocketConfig>, 'logger'>;
  /** Active subscriptions keyed by the BYBIT topic string
   *  ('kline.<timeframe>.<bybitSymbol>'). The 7 legacy pairs' keys are
   *  character-identical to the previous 'kline.<tf>.<pairSymbol>' scheme
   *  (their bybitSymbol IS their pairSymbol) — zero behavior change. */
  private subscriptions = new Map<string, { pairId: PairId; category: 'linear' | 'spot' }>();
  /** Per-socket reconnect/connect state — each category reconnects
   *  independently (a spot outage must not back off the linear feed). */
  private reconnectState: Record<
    'linear' | 'spot',
    {
      attempts: number;
      timer: ReturnType<typeof setTimeout> | null;
      timeoutTimer: ReturnType<typeof setTimeout> | null;
      connecting: boolean;
    }
  > = {
    linear: { attempts: 0, timer: null, timeoutTimer: null, connecting: false },
    spot: { attempts: 0, timer: null, timeoutTimer: null, connecting: false },
  };
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
   * Connect to the Bybit WebSocket for a category. Defaults to 'linear'
   * (back-compat: the engine's single connect() call opens the legacy feed).
   * The spot socket is also created lazily by subscribe() on the first
   * spot-instrument pair.
   */
  async connect(category: 'linear' | 'spot' = 'linear'): Promise<void> {
    const state = this.reconnectState[category];
    const existing = this.sockets.get(category);
    if (state.connecting || existing?.readyState === WebSocket.OPEN) {
      return;
    }

    // A fresh explicit connect supersedes any pending scheduled reconnect —
    // clear both timers so nothing stale fires (single-flight, liveness
    // suite).
    this.clearReconnectTimer(category);
    this.clearConnectTimeout(category);

    state.connecting = true;
    this.isStopped = false;

    try {
      // Identity guard (review #1 — CRITICAL): every per-socket handler
      // captures the socket it was bound to and the FIRST line checks that
      // this category's socket STILL IS that socket. A stale socket's delayed
      // close/error (e.g. the connect timeout aborted socket A AFTER a
      // reconnect created socket B and assigned this category to B) must
      // never mutate the NEWER socket's state — otherwise it clears B's
      // connect timeout (B hangs forever), flips connecting mid-handshake,
      // lies to telemetry, and schedules a SECOND reconnect (single-flight
      // sees connecting=false + B not OPEN) → two live sockets → duplicate
      // kline streams → duplicate confirmed candles → duplicate order
      // signals. The abort inside the timeout callback stays — it kills the
      // stuck handshake directly.
      const socket = new WebSocket(category === 'linear' ? this.config.wsUrl : BYBIT_SPOT_WS_URL);
      this.sockets.set(category, socket);
      this.armConnectTimeout(category, socket);

      socket.on('open', () => {
        if (this.sockets.get(category) !== socket) return;
        this.clearConnectTimeout(category);
        state.connecting = false;
        state.attempts = 0;
        // Meta key is `socket` (not `category`): LogMeta.category is a
        // reserved domain field ('frontend'|'backend'|'bot').
        this.logger.info('Bybit feed socket open', {
          socket: category,
          at: new Date().toISOString(),
        });
        this.onConnectionChange?.(true);
        // Bybit WS sessions do not persist — every (re)connect must send a
        // FRESH subscription payload (resubscribeAll sends them again).
        this.resubscribeAll(category);
      });

      socket.on('message', (data: Buffer) => {
        // Same identity guard as open/close/error: a stale socket's queued
        // klines must not reach the engine after a newer socket exists.
        if (this.sockets.get(category) !== socket) return;
        this.handleMessage(data.toString());
      });

      socket.on('close', (code: number, reason: Buffer) => {
        if (this.sockets.get(category) !== socket) return;
        this.clearConnectTimeout(category);
        state.connecting = false;
        this.logger.info('Bybit feed socket closed', {
          socket: category,
          at: new Date().toISOString(),
          code,
          reason: reason.toString() || undefined,
        });
        this.onConnectionChange?.(false);
        if (!this.isStopped) {
          this.scheduleReconnect(category);
        }
      });

      socket.on('error', (error: Error) => {
        if (this.sockets.get(category) !== socket) return;
        this.clearConnectTimeout(category);
        state.connecting = false;
        this.logger.error('Bybit feed socket error', {
          socket: category,
          at: new Date().toISOString(),
          error: error.message,
        });
        this.onError?.(error);
        // error often fires immediately before close — scheduleReconnect is
        // single-flight (timer guard), so both events yield ONE reconnect.
        if (!this.isStopped) {
          this.scheduleReconnect(category);
        }
      });
    } catch (error) {
      state.connecting = false;
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      this.scheduleReconnect(category);
    }
  }

  /**
   * Disconnect from Bybit WebSocket.
   */
  disconnect(): void {
    this.isStopped = true;
    for (const category of ['linear', 'spot'] as const) {
      this.clearReconnectTimer(category);
      this.clearConnectTimeout(category);
      const socket = this.sockets.get(category);
      if (socket) {
        socket.close();
        this.sockets.delete(category);
      }
    }

    this.onConnectionChange?.(false);
  }

  /**
   * Subscribe to kline channel for a pair.
   */
  subscribe(pair: PairId): void {
    const category = getBybitCategory(pair.symbol);
    const bybitTopic = this.bybitTopicFor(pair);
    this.subscriptions.set(bybitTopic, { pairId: pair, category });

    if (category === 'spot') {
      // The spot socket is created lazily on the first spot-instrument
      // subscribe; the linear socket is created up-front by connect().
      void this.connect('spot');
    }
    const socket = this.sockets.get(category);
    if (socket?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(pair, category);
    }
  }

  /**
   * Unsubscribe from kline channel for a pair.
   */
  unsubscribe(pair: PairId): void {
    const category = getBybitCategory(pair.symbol);
    const bybitTopic = this.bybitTopicFor(pair);
    this.subscriptions.delete(bybitTopic);

    const socket = this.sockets.get(category);
    if (socket?.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe(pair, category);
    }

    // Close the lazily-opened spot socket once its last subscription drops;
    // linear stays open as today.
    if (category === 'spot' && !this.hasSpotSubscriptions()) {
      this.closeSpotSocket();
    }
  }

  /**
   * Fetch historical candles for a pair.
   */
  async fetchHistoricalCandles(pair: PairId): Promise<ClosedCandle[]> {
    // REST kline is instrument-scoped: request with the mapped Bybit
    // symbol/category (the spot pairs would 404 on linear). The rows below
    // are mapped back to the ORIGINAL pair symbol — the engine only ever
    // sees PairId data.
    const category = getBybitCategory(pair.symbol);
    const bybitSymbol = getBybitSymbol(pair.symbol);
    const url = `${this.config.restUrl}/v5/market/kline?category=${category}&symbol=${bybitSymbol}&interval=${pair.timeframe}&limit=${this.config.historicalCandleLimit}`;

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
   * Check if connected. Back-compat: reflects the 'linear' socket — the
   * engine's primary feed, opened by connect(). The lazy spot socket's state
   * is not part of the legacy connected signal.
   */
  get connected(): boolean {
    return this.sockets.get('linear')?.readyState === WebSocket.OPEN;
  }

  /**
   * Get active subscriptions.
   */
  get activeSubscriptions(): PairId[] {
    return Array.from(this.subscriptions.values()).map((s) => s.pairId);
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

    // Resolve the PairId from the subscriptions map BY THE INCOMING TOPIC —
    // which is the BYBIT topic ('kline.<tf>.<bybitSymbol>'). Never parse the
    // pair symbol out of the raw topic string: for mapped pairs
    // (GOLDUSDC→XAUTUSDT) the topic symbol is the BYBIT instrument, not the
    // pair the engine trades. Legacy pairs resolve identically (their bybit
    // symbol IS their pair symbol), so the engine's data structures are
    // byte-identical to before. A message for a topic we never subscribed to
    // is dropped (defensive — Bybit only pushes subscribed topics).
    const entry = this.subscriptions.get(message.topic);
    if (!entry) {
      return;
    }
    const { pairId } = entry;
    const symbol = pairId.symbol;
    const timeframe = pairId.timeframe;

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

  private sendSubscribe(pair: PairId, category: 'linear' | 'spot'): void {
    const message = {
      op: 'subscribe',
      args: [this.bybitTopicFor(pair)],
    };
    this.sockets.get(category)?.send(JSON.stringify(message));
    this.warnIfLongTimeframe(pair);
  }

  private sendUnsubscribe(pair: PairId, category: 'linear' | 'spot'): void {
    const message = {
      op: 'unsubscribe',
      args: [this.bybitTopicFor(pair)],
    };
    this.sockets.get(category)?.send(JSON.stringify(message));
  }

  /** Bybit topic for a pair — uses the mapped bybitSymbol; identity for the
   *  7 legacy pairs (their bybitSymbol === pairSymbol). */
  private bybitTopicFor(pair: PairId): string {
    return `kline.${pair.timeframe}.${getBybitSymbol(pair.symbol)}`;
  }

  /** True while any spot-category subscription remains. */
  private hasSpotSubscriptions(): boolean {
    return Array.from(this.subscriptions.values()).some((s) => s.category === 'spot');
  }

  /** Close the lazily-opened spot socket and reset its reconnect state so a
   *  later spot subscribe starts from a clean slate. */
  private closeSpotSocket(): void {
    const state = this.reconnectState.spot;
    this.clearReconnectTimer('spot');
    this.clearConnectTimeout('spot');
    state.connecting = false;
    state.attempts = 0;
    const socket = this.sockets.get('spot');
    if (socket) {
      socket.close();
      this.sockets.delete('spot');
    }
  }

  /** Re-send every subscription of a category on that category's socket
   *  (called on connect/reconnect — Bybit sessions do not persist). Legacy
   *  per-pair subscribe messages are preserved exactly. */
  private resubscribeAll(category: 'linear' | 'spot'): void {
    for (const entry of this.subscriptions.values()) {
      if (entry.category !== category) continue;
      this.sendSubscribe(entry.pairId, category);
    }
  }

  /** Schedule a single reconnect (liveness suite). Idempotent/single-flight
   *  PER CATEGORY: a live timer for a category means one is already
   *  scheduled, so the error→close double event (and any other caller) can
   *  never spawn two sockets. Exponential backoff with equal jitter (bounded
   *  minimum + randomization, avoids synchronized retry storms), capped at
   *  reconnectMaxDelay, reset on successful open (see the open handler). A
   *  stopped feed never schedules — no reconnect loop after stop. Sockets
   *  reconnect independently: a spot outage never backs off the linear feed. */
  private scheduleReconnect(category: 'linear' | 'spot'): void {
    if (this.isStopped) {
      return; // Shutdown guard: never reconnect after stop/restart.
    }
    const state = this.reconnectState[category];
    if (state.timer !== null) {
      return; // Single-flight: a reconnect is already scheduled.
    }
    if (state.attempts >= this.config.maxReconnectAttempts) {
      this.logger.error('Bybit feed reconnect attempts exhausted', {
        socket: category,
        attempts: state.attempts,
        at: new Date().toISOString(),
      });
      return;
    }

    const cap = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, state.attempts),
      this.config.reconnectMaxDelay,
    );
    // Equal jitter: delay in [cap/2, cap] — keeps a minimum backoff so the
    // first retry is still ~base (1s), while randomizing to avoid a
    // synchronized retry with other clients.
    const delay = cap / 2 + Math.floor(Math.random() * (cap / 2));

    this.logger.warn('Bybit feed reconnect scheduled', {
      socket: category,
      attempt: state.attempts + 1,
      delayMs: delay,
      at: new Date().toISOString(),
    });

    state.timer = setTimeout(() => {
      state.timer = null;
      state.attempts++;
      void this.connect(category);
    }, delay);
  }

  private clearReconnectTimer(category: 'linear' | 'spot'): void {
    const state = this.reconnectState[category];
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  /** Arm the connect timeout (liveness suite): if the socket does not reach
   *  OPEN within CONNECT_TIMEOUT_MS, treat it as failed — log with timestamp,
   *  surface to the engine (marks the feed state failed via onError), and
   *  schedule a reconnect. Cleared by open/close/error so it never fires on a
   *  socket that already transitioned, and guarded against firing after OPEN
   *  or against a stale socket (identity guard). */
  private armConnectTimeout(category: 'linear' | 'spot', socket: WebSocket): void {
    const state = this.reconnectState[category];
    this.clearConnectTimeout(category);
    state.timeoutTimer = setTimeout(() => {
      state.timeoutTimer = null;
      // Guard: never fire after the socket is already open (or already gone).
      if (this.sockets.get(category) !== socket || socket.readyState === WebSocket.OPEN) {
        return;
      }
      state.connecting = false;
      this.logger.error('Bybit feed connect timeout', {
        socket: category,
        at: new Date().toISOString(),
        timeoutMs: CONNECT_TIMEOUT_MS,
      });
      this.onError?.(new Error(`Bybit feed connect timeout after ${CONNECT_TIMEOUT_MS}ms`));
      // Abort the stuck socket so a late (slow-network) open can never fire its
      // stale handler against a newer socket's state — close() on CONNECTING
      // aborts the handshake and the socket goes CLOSED instead of OPEN.
      socket.close();
      this.scheduleReconnect(category);
    }, CONNECT_TIMEOUT_MS);
  }

  private clearConnectTimeout(category: 'linear' | 'spot'): void {
    const state = this.reconnectState[category];
    if (state.timeoutTimer) {
      clearTimeout(state.timeoutTimer);
      state.timeoutTimer = null;
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
