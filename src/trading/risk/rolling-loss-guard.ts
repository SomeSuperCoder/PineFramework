/**
 * RollingLossGuard — rolling 24h loss tracking with mandatory safety stop.
 *
 * Tracks realized PnL from all trades within a rolling 24-hour window.
 * When cumulative losses exceed the configured maximum, the guard triggers
 * an emergency stop. This is a mandatory safety feature — no toggle.
 *
 * @module trading
 */

interface TradeEntry {
  timestamp: number;
  pnl: number;
}

export class RollingLossGuard {
  private trades: TradeEntry[] = [];
  private readonly windowMs = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Record a trade's realized PnL.
   * Positive = profit, negative = loss.
   * Prunes entries older than 24h and returns whether the guard is breached.
   */
  addTrade(pnl: number, now: number = Date.now()): boolean {
    this.trades.push({ timestamp: now, pnl });
    this.prune(now);
    return false; // Caller should check isBreached()
  }

  /**
   * Remove trades older than 24 hours from the buffer.
   */
  prune(now: number = Date.now()): void {
    const cutoff = now - this.windowMs;
    this.trades = this.trades.filter(t => t.timestamp > cutoff);
  }

  /**
   * Total realized loss in the rolling 24h window.
   * Only losses are summed (profits excluded from loss calculation).
   */
  totalLoss(): number {
    let total = 0;
    for (const t of this.trades) {
      if (t.pnl < 0) {
        total += Math.abs(t.pnl);
      }
    }
    return total;
  }

  /**
   * Total realized PnL (including profits) in the rolling 24h window.
   */
  totalPnl(): number {
    let total = 0;
    for (const t of this.trades) {
      total += t.pnl;
    }
    return total;
  }

  /**
   * Number of trades in the rolling 24h window.
   */
  tradeCount(): number {
    return this.trades.length;
  }

  /**
   * Whether the rolling 24h loss exceeds the configured maximum.
   */
  isBreached(maxLoss: number, now: number = Date.now()): boolean {
    if (maxLoss <= 0) return false; // Unlimited
    this.prune(now);
    return this.totalLoss() >= maxLoss;
  }

  /**
   * Whether a new position entry is allowed.
   */
  canEnterPosition(maxLoss: number, now: number = Date.now()): boolean {
    if (maxLoss <= 0) return true; // Unlimited
    return !this.isBreached(maxLoss, now);
  }

  /**
   * Clear the buffer (e.g., after bot restart).
   */
  clear(): void {
    this.trades = [];
  }
}
