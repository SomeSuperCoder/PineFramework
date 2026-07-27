/**
 * Dashboard WebSocket service — provides real-time streaming of bot state,
 * metrics, positions, logs, and trade data to connected clients.
 *
 * Design (Decision 6):
 * - Snapshot + delta pattern: full state on connect, deltas thereafter
 * - Channels: bot:state, bot:metrics, bot:position, bot:log, bot:trade
 * - Auto-reconnect support via unique client IDs
 *
 * @module trading
 */

import type { BotState, BotStatusSnapshot, PositionSummary, TradeRecord } from './types.js';

// ---- Types ----

export interface WsClient {
  id: string;
  send: (data: string) => void;
  close: () => void;
}

export interface DashboardMessage {
  channel: 'bot:state' | 'bot:metrics' | 'bot:position' | 'bot:log' | 'bot:trade' | 'bot:snapshot';
  type: 'snapshot' | 'delta';
  data: unknown;
  timestamp: number;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  meta?: Record<string, unknown>;
}

export interface MetricsSnapshot {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  totalPnl: number;
  totalFees: number;
  averageWin: number;
  averageLoss: number;
  maxDrawdown: number;
  swapCount: number;
  executionLatencyMs: number;
}

// ---- Dashboard WebSocket Service ----

export class DashboardWsService {
  private clients: Map<string, WsClient> = new Map();
  private logBuffer: LogEntry[] = [];
  private readonly maxLogBuffer = 1000;

  /** Register a new WebSocket client. */
  registerClient(client: WsClient): void {
    this.clients.set(client.id, client);
  }

  /** Remove a disconnected client. */
  unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  /** Get number of connected clients. */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Send a full state snapshot to a specific client.
   * Called when a client first connects.
   */
  sendSnapshot(clientId: string, snapshot: BotStatusSnapshot, metrics: MetricsSnapshot): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const message: DashboardMessage = {
      channel: 'bot:snapshot',
      type: 'snapshot',
      data: { status: snapshot, metrics },
      timestamp: Date.now(),
    };
    client.send(JSON.stringify(message));
  }

  /**
   * Broadcast a state change to all connected clients.
   */
  broadcastStateChange(
    previous: BotState,
    current: BotState,
    reason: string,
  ): void {
    this.broadcast({
      channel: 'bot:state',
      type: 'delta',
      data: { previous, current, reason },
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast metrics update to all connected clients.
   */
  broadcastMetrics(metrics: Partial<MetricsSnapshot>): void {
    this.broadcast({
      channel: 'bot:metrics',
      type: 'delta',
      data: metrics,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast a position update (open, close, or update).
   */
  broadcastPositionUpdate(
    type: 'opened' | 'closed' | 'updated',
    position: PositionSummary,
  ): void {
    this.broadcast({
      channel: 'bot:position',
      type: 'delta',
      data: { type, position },
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast a log entry.
   */
  broadcastLog(entry: LogEntry): void {
    // Buffer for reconnecting clients
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxLogBuffer) {
      this.logBuffer.splice(0, this.logBuffer.length - this.maxLogBuffer);
    }

    this.broadcast({
      channel: 'bot:log',
      type: 'delta',
      data: entry,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast a new trade record.
   */
  broadcastTrade(trade: TradeRecord): void {
    this.broadcast({
      channel: 'bot:trade',
      type: 'delta',
      data: trade,
      timestamp: Date.now(),
    });
  }

  /** Get buffered log entries for reconnecting clients. */
  getBufferedLogs(count?: number): LogEntry[] {
    if (count && count < this.logBuffer.length) {
      return this.logBuffer.slice(-count);
    }
    return [...this.logBuffer];
  }

  // ---- Private ----

  private broadcast(message: DashboardMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients.values()) {
      try {
        client.send(data);
      } catch {
        // Client may have disconnected — will be cleaned up on next unregister
      }
    }
  }
}
