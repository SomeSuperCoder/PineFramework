import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChaosSignalGenerator } from '../../../src/trading/chaos-signal-generator.js';
import type { BotLogger } from '../../../src/trading/bot-engine.js';

function createMockLogger(): BotLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe('ChaosSignalGenerator', () => {
  let generator: ChaosSignalGenerator;
  let logger: BotLogger;

  beforeEach(() => {
    logger = createMockLogger();
    generator = new ChaosSignalGenerator(logger);
  });

  it('should generate a signal with valid action', () => {
    const signal = generator.generate(10_000_000, Date.now());
    expect(['long', 'short', 'exit']).toContain(signal.action);
  });

  it('should always use 10% size fraction', () => {
    for (let i = 0; i < 50; i++) {
      const signal = generator.generate(10_000_000, Date.now());
      expect(signal.sizeFraction).toBe(0.1);
    }
  });

  it('should pass through equity and timestamp', () => {
    const equity = 5_000_000;
    const timestamp = 1700000000000;
    const signal = generator.generate(equity, timestamp);
    expect(signal.equity).toBe(equity);
    expect(signal.timestamp).toBe(timestamp);
  });

  it('should log each signal', () => {
    generator.generate(10_000_000, Date.now());
    expect(logger.info).toHaveBeenCalledWith(
      'chaos.signal',
      expect.objectContaining({
        action: expect.any(String),
        equity: expect.any(Number),
        sizeFraction: 0.1,
      }),
    );
  });

  it('should track signal count', () => {
    expect(generator.getSignalCount()).toBe(0);
    generator.generate(10_000_000, Date.now());
    generator.generate(10_000_000, Date.now());
    expect(generator.getSignalCount()).toBe(2);
  });

  it('should produce roughly equal distribution over many runs', () => {
    const counts = { long: 0, short: 0, exit: 0 };
    const runs = 3000;

    for (let i = 0; i < runs; i++) {
      const signal = generator.generate(10_000_000, Date.now());
      counts[signal.action]++;
    }

    // Each action should be ~33.3% ± 5% tolerance
    const expected = runs / 3;
    const tolerance = runs * 0.05;

    expect(counts.long).toBeGreaterThan(expected - tolerance);
    expect(counts.long).toBeLessThan(expected + tolerance);
    expect(counts.short).toBeGreaterThan(expected - tolerance);
    expect(counts.short).toBeLessThan(expected + tolerance);
    expect(counts.exit).toBeGreaterThan(expected - tolerance);
    expect(counts.exit).toBeLessThan(expected + tolerance);
  });
});
