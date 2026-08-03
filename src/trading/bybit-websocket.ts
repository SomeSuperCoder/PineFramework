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
}

export interface BybitKlineMessage {
  topic: string;
  type: string;
  ts: number;
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
  };
}

export type CandleCallback = (candle: ClosedCandle) => void;
export type ConnectionCallback = (connected: boolean) => void;
export type ErrorCallback = (error: Error) => void;

// ---- Constants ----

const DEFAULT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';
const DEFAULT_REST_URL = 'https://api.bybit.com';
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;
const DEFAULT_HISTORICAL_CANDLE_LIMIT = 200;

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
  private config: Required<BybitWebSocketConfig>;
  private subscriptions = new Map<string, PairId>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private isStopped = false;

  // Callbacks
  private onCandle: CandleCallback | null = null;
  private onConnectionChange: ConnectionCallback | null = null;
  private onError: ErrorCallback | null = null;

  constructor(config?: BybitWebSocketConfig) {
    this.config = {
      wsUrl: config?.wsUrl ?? DEFAULT_WS_URL,
      restUrl: config?.restUrl ?? DEFAULT_REST_URL,
      maxReconnectAttempts: config?.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
      reconnectBaseDelay: config?.reconnectBaseDelay ?? DEFAULT_RECONNECT_BASE_DELAY_MS,
      reconnectMaxDelay: config?.reconnectMaxDelay ?? DEFAULT_RECONNECT_MAX_DELAY_MS,
      historicalCandleLimit: config?.historicalCandleLimit ?? DEFAULT_HISTORICAL_CANDLE_LIMIT,
    };
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
   * Connect to Bybit WebSocket.
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;
    this.isStopped = false;

    try {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.on('open', () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.onConnectionChange?.(true);
        this.resubscribeAll();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        this.isConnecting = false;
        this.onConnectionChange?.(false);
        if (!this.isStopped) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error: Error) => {
        this.isConnecting = false;
        this.onError?.(error);
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
    const json = await response.json() as {
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
    // Only process confirmed candles
    if (!message.data.confirm) {
      return;
    }

    // Parse topic to get symbol and timeframe
    // Topic format: kline.{interval}.{symbol}
    const parts = message.topic.split('.');
    if (parts.length < 3) {
      return;
    }

    const timeframe = parts[1];
    const symbol = parts[2];

    const candle: ClosedCandle = {
      symbol,
      timeframe,
      timestamp: message.data.start,
      open: parseFloat(message.data.open),
      high: parseFloat(message.data.high),
      low: parseFloat(message.data.low),
      close: parseFloat(message.data.close),
      volume: parseFloat(message.data.volume),
    };

    this.onCandle?.(candle);
  }

  private sendSubscribe(pair: PairId): void {
    const message = {
      op: 'subscribe',
      args: [`kline.${pair.timeframe}.${pair.symbol}`],
    };
    this.ws?.send(JSON.stringify(message));
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

  private scheduleReconnect(): void {
    if (this.isStopped || this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return;
    }

    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxDelay,
    );

    this.reconnectTimer = setTimeout(() => {
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
