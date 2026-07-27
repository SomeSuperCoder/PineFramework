/**
 * RiskManager — combines all risk controls for the trading bot.
 *
 * Integrates:
 * - Daily stop loss
 * - Emergency stop
 * - Safe shutdown coordination
 *
 * @module trading
 */

import { DailyStopLoss } from './daily-stop-loss.js';
import type { DailyStopLossConfig } from './daily-stop-loss.js';
import type { BotConfig } from '../types.js';

export interface RiskManagerConfig {
  dailyLoss: DailyStopLossConfig;
  /** Whether emergency stop should close all positions immediately. */
  emergencyClosePositions: boolean;
}

export type RiskEventType =
  | 'daily_loss_breached'
  | 'daily_loss_reset'
  | 'emergency_stop'
  | 'safe_shutdown'
  | 'entry_blocked';

export interface RiskEvent {
  type: RiskEventType;
  timestamp: number;
  message: string;
  data?: Record<string, unknown>;
}

export type RiskEventHandler = (event: RiskEvent) => void;

export class RiskManager {
  private dailyStopLoss: DailyStopLoss;
  private config: RiskManagerConfig;
  private listeners: RiskEventHandler[] = [];
  private _emergencyStopTriggered = false;
  private _shutdownInProgress = false;

  constructor(config: RiskManagerConfig) {
    this.config = config;
    this.dailyStopLoss = new DailyStopLoss(config.dailyLoss);
  }

  /** Whether daily loss has been breached. */
  get isDailyLossBreached(): boolean {
    return this.dailyStopLoss.isBreached;
  }

  /** Current daily realized loss. */
  get dailyLoss(): number {
    return this.dailyStopLoss.currentLoss;
  }

  /** Whether emergency stop has been triggered. */
  get isEmergencyStopTriggered(): boolean {
    return this._emergencyStopTriggered;
  }

  /** Whether safe shutdown is in progress. */
  get isShutdownInProgress(): boolean {
    return this._shutdownInProgress;
  }

  /** Subscribe to risk events. */
  onEvent(handler: RiskEventHandler): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((h) => h !== handler);
    };
  }

  /**
   * Record a trade's realized PnL. Returns whether entries should be blocked.
   */
  recordTrade(pnl: number): boolean {
    const breached = this.dailyStopLoss.recordTrade(pnl);
    if (breached) {
      this.emit({
        type: 'daily_loss_breached',
        timestamp: Date.now(),
        message: `Daily loss limit of ${this.dailyStopLoss.maxLoss} reached (current: ${this.dailyStopLoss.currentLoss})`,
        data: { loss: this.dailyStopLoss.currentLoss, maxLoss: this.dailyStopLoss.maxLoss },
      });
    }

    if (this.dailyStopLoss.currentLoss === 0 && !breached) {
      this.emit({
        type: 'daily_loss_reset',
        timestamp: Date.now(),
        message: 'Daily loss counter has been reset for new trading day',
      });
    }

    return breached;
  }

  /**
   * Check whether a new position entry is allowed.
   */
  canEnterPosition(): boolean {
    const allowed = this.dailyStopLoss.canEnterPosition() && !this._emergencyStopTriggered;

    if (!allowed) {
      this.emit({
        type: 'entry_blocked',
        timestamp: Date.now(),
        message: 'Position entry blocked by risk controls',
        data: {
          dailyLossBreached: this.dailyStopLoss.isBreached,
          emergencyStop: this._emergencyStopTriggered,
        },
      });
    }

    return allowed;
  }

  /**
   * Trigger emergency stop. Returns a list of required actions.
   */
  triggerEmergencyStop(source: string): string[] {
    this._emergencyStopTriggered = true;
    const actions: string[] = [
      'cancel_pending_orders',
      'close_positions',
      'stop_strategy_execution',
    ];

    this.emit({
      type: 'emergency_stop',
      timestamp: Date.now(),
      message: `Emergency stop triggered from ${source}`,
      data: { source, actions },
    });

    return actions;
  }

  /**
   * Begin safe shutdown sequence.
   * Returns a list of steps to execute in order.
   */
  beginSafeShutdown(): string[] {
    this._shutdownInProgress = true;
    const steps = [
      'reject_new_entries',
      'finish_current_processing',
      'close_positions',
      'persist_state',
      'terminate',
    ];

    this.emit({
      type: 'safe_shutdown',
      timestamp: Date.now(),
      message: 'Safe shutdown sequence initiated',
      data: { steps },
    });

    return steps;
  }

  /** Reset emergency stop flag (after user acknowledges). */
  resetEmergencyStop(): void {
    this._emergencyStopTriggered = false;
  }

  /** Update daily stop loss configuration. */
  updateDailyLossConfig(config: Partial<DailyStopLossConfig>): void {
    this.dailyStopLoss.updateConfig(config);
  }

  private emit(event: RiskEvent): void {
    for (const handler of this.listeners) {
      try {
        handler(event);
      } catch {
        // Listener error — swallow to keep the system running
      }
    }
  }
}
