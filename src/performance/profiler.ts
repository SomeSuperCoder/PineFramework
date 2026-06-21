export interface ProfileEntry {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface ProfileStats {
  totalCalls: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  callRate: number;
}

export class Profiler {
  private entries: Map<string, ProfileEntry[]>;
  private activeTimers: Map<string, number>;
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.entries = new Map();
    this.activeTimers = new Map();
    this.enabled = enabled;
  }

  start(name: string, metadata?: Record<string, unknown>): void {
    if (!this.enabled) return;

    const entry: ProfileEntry = {
      name,
      startTime: performance.now(),
      metadata,
    };

    this.activeTimers.set(name, entry.startTime);

    if (!this.entries.has(name)) {
      this.entries.set(name, []);
    }
    this.entries.get(name)!.push(entry);
  }

  end(name: string): number | undefined {
    if (!this.enabled) return undefined;

    const startTime = this.activeTimers.get(name);
    if (startTime === undefined) return undefined;

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.activeTimers.delete(name);

    const entries = this.entries.get(name);
    if (entries && entries.length > 0) {
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        lastEntry.endTime = endTime;
        lastEntry.duration = duration;
      }
    }

    return duration;
  }

  measure<T>(name: string, fn: () => T, metadata?: Record<string, unknown>): T {
    this.start(name, metadata);
    try {
      return fn();
    } finally {
      this.end(name);
    }
  }

  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    this.start(name, metadata);
    try {
      return await fn();
    } finally {
      this.end(name);
    }
  }

  getStats(name: string): ProfileStats | undefined {
    const entries = this.entries.get(name);
    if (!entries || entries.length === 0) return undefined;

    const completedEntries = entries.filter((e) => e.duration !== undefined);
    if (completedEntries.length === 0) return undefined;

    const durations = completedEntries.map((e) => e.duration!);
    const totalDuration = durations.reduce((a, b) => a + b, 0);

    return {
      totalCalls: completedEntries.length,
      totalDuration,
      averageDuration: totalDuration / completedEntries.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      callRate: totalDuration > 0 ? (completedEntries.length / totalDuration) * 1000 : 0,
    };
  }

  getAllStats(): Map<string, ProfileStats> {
    const allStats = new Map<string, ProfileStats>();

    for (const name of this.entries.keys()) {
      const stats = this.getStats(name);
      if (stats) {
        allStats.set(name, stats);
      }
    }

    return allStats;
  }

  getEntries(name: string): ProfileEntry[] {
    return this.entries.get(name) ?? [];
  }

  clear(): void {
    this.entries.clear();
    this.activeTimers.clear();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  formatReport(): string {
    const lines: string[] = [];
    lines.push('=== Performance Profile Report ===');
    lines.push('');

    const allStats = this.getAllStats();
    const sortedStats = Array.from(allStats.entries()).sort(
      (a, b) => b[1].totalDuration - a[1].totalDuration,
    );

    for (const [name, stats] of sortedStats) {
      lines.push(`${name}:`);
      lines.push(`  Calls: ${stats.totalCalls}`);
      lines.push(`  Total: ${stats.totalDuration.toFixed(2)}ms`);
      lines.push(`  Avg: ${stats.averageDuration.toFixed(2)}ms`);
      lines.push(`  Min: ${stats.minDuration.toFixed(2)}ms`);
      lines.push(`  Max: ${stats.maxDuration.toFixed(2)}ms`);
      lines.push(`  Rate: ${stats.callRate.toFixed(1)} calls/sec`);
      lines.push('');
    }

    return lines.join('\n');
  }
}

export class ExecutionProfiler {
  private profiler: Profiler;
  private barTimings: number[];
  private maxBarTimings: number;

  constructor(enabled: boolean = true, maxBarTimings: number = 1000) {
    this.profiler = new Profiler(enabled);
    this.barTimings = [];
    this.maxBarTimings = maxBarTimings;
  }

  startBar(barIndex: number): void {
    this.profiler.start('bar_execution', { barIndex });
  }

  endBar(): number | undefined {
    const duration = this.profiler.end('bar_execution');
    if (duration !== undefined) {
      this.barTimings.push(duration);
      if (this.barTimings.length > this.maxBarTimings) {
        this.barTimings.shift();
      }
    }
    return duration;
  }

  getBarStats(): {
    averageMs: number;
    minMs: number;
    maxMs: number;
    p95Ms: number;
    p99Ms: number;
    totalBars: number;
  } {
    if (this.barTimings.length === 0) {
      return { averageMs: 0, minMs: 0, maxMs: 0, p95Ms: 0, p99Ms: 0, totalBars: 0 };
    }

    const sorted = [...this.barTimings].sort((a, b) => a - b);
    const total = sorted.reduce((a, b) => a + b, 0);

    return {
      averageMs: total / sorted.length,
      minMs: sorted[0]!,
      maxMs: sorted[sorted.length - 1]!,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)]!,
      p99Ms: sorted[Math.floor(sorted.length * 0.99)]!,
      totalBars: sorted.length,
    };
  }

  getProfiler(): Profiler {
    return this.profiler;
  }

  clear(): void {
    this.profiler.clear();
    this.barTimings = [];
  }
}
