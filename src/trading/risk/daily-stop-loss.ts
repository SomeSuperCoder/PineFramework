/**
 * DailyStopLoss — configurable maximum daily loss tracker.
 *
 * Features:
 * - Configurable loss threshold in quote currency
 * - Timezone-aware daily reset
 * - Tracks cumulative realized losses
 * - Prevents new entries when breached
 * - Optional immediate-close-all mode
 *
 * @module trading
 */

/**
 * Normalize a timezone string to a form Intl.DateTimeFormat can use.
 */
function normalizeTimezone(tz: string): string {
  // Handle common abbreviations and variations
  const tzMap: Record<string, string> = {
    UTC: 'UTC',
    EST: 'America/New_York',
    EDT: 'America/New_York',
    CST: 'America/Chicago',
    CDT: 'America/Chicago',
    MST: 'America/Denver',
    MDT: 'America/Denver',
    PST: 'America/Los_Angeles',
    PDT: 'America/Los_Angeles',
    GMT: 'Europe/London',
    CET: 'Europe/Berlin',
    CEST: 'Europe/Berlin',
    JST: 'Asia/Tokyo',
    AEST: 'Australia/Sydney',
    AEDT: 'Australia/Sydney',
  };

  return tzMap[tz.toUpperCase()] ?? tz;
}

export interface DailyStopLossConfig {
  /** Maximum daily loss in quote currency. 0 = unlimited. */
  maxDailyLoss: number;
  /** Timezone for daily reset (e.g., "America/New_York", "UTC"). */
  timezone: string;
}

/**
 * Get the start of the current trading day in the given timezone.
 */
export function getTradingDayStart(now: number, timezone: string): number {
  const tz = normalizeTimezone(timezone);
  const date = new Date(now);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;

  // Start of trading day in the target timezone
  const dayStartStr = `${year}-${month}-${day}T00:00:00`;
  const dayStartUtc = new Date(dayStartStr + getTimezoneOffsetSuffix(tz, date)).getTime();

  return dayStartUtc;
}

/**
 * Get the UTC offset suffix for a given timezone at a given date.
 */
function getTimezoneOffsetSuffix(tz: string, date: Date): string {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(date);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName');
  if (!offsetPart || offsetPart.value === 'UTC' || offsetPart.value === 'GMT') {
    return '+00:00';
  }
  // Parse offset like "GMT+5:30" or "GMT-4"
  const match = offsetPart.value.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (match) {
    const hours = parseInt(match[1]!, 10);
    const minutes = parseInt(match[2] ?? '0', 10);
    const sign = hours >= 0 ? '+' : '-';
    const absHours = Math.abs(hours);
    return `${sign}${String(absHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return '+00:00';
}

export class DailyStopLoss {
  private config: DailyStopLossConfig;
  private realizedLoss: number = 0;
  private currentDayStart: number = 0;
  private breached: boolean = false;

  constructor(config: DailyStopLossConfig) {
    this.config = config;
    this.resetDay(Date.now());
  }

  /** Whether the daily loss limit has been breached. */
  get isBreached(): boolean {
    return this.breached;
  }

  /** Current realized loss for the day. */
  get currentLoss(): number {
    return this.realizedLoss;
  }

  /** Configured maximum daily loss. 0 = unlimited. */
  get maxLoss(): number {
    return this.config.maxDailyLoss;
  }

  /** Current config. */
  getConfig(): DailyStopLossConfig {
    return { ...this.config };
  }

  /**
   * Update config. Resets the day if timezone changed.
   */
  updateConfig(config: Partial<DailyStopLossConfig>): void {
    const tzChanged = config.timezone && config.timezone !== this.config.timezone;
    this.config = { ...this.config, ...config };
    if (tzChanged) {
      this.resetDay(Date.now());
    }
  }

  /**
   * Record a realized PnL from a trade.
   * Positive = profit, negative = loss.
   * Returns whether the daily loss limit was breached.
   */
  recordTrade(pnl: number): boolean {
    this.checkDayReset();

    if (pnl >= 0) {
      // Profits don't count toward the loss limit
      return this.breached;
    }

    this.realizedLoss += Math.abs(pnl);

    if (this.config.maxDailyLoss > 0 && this.realizedLoss >= this.config.maxDailyLoss) {
      this.breached = true;
    }

    return this.breached;
  }

  /**
   * Check whether a new position entry is allowed.
   * Returns false if daily loss limit has been breached.
   */
  canEnterPosition(): boolean {
    this.checkDayReset();

    if (this.config.maxDailyLoss <= 0) {
      return true; // Unlimited
    }

    return !this.breached;
  }

  /**
   * Reset the daily loss counter (e.g., at the start of a new trading day).
   */
  resetDay(now: number = Date.now()): void {
    this.currentDayStart = getTradingDayStart(now, this.config.timezone);
    this.realizedLoss = 0;
    this.breached = false;
  }

  /**
   * Check if a new trading day has started and reset if so.
   */
  private checkDayReset(): void {
    const now = Date.now();
    const todayStart = getTradingDayStart(now, this.config.timezone);
    if (todayStart > this.currentDayStart) {
      this.resetDay(now);
    }
  }
}
