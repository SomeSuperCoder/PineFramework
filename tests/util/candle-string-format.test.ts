import { describe, it, expect } from 'vitest';
import { formatCandleString } from '../../src/util/candle-string-format.js';

describe('formatCandleString', () => {
  it('should substitute basic variables', () => {
    const result = formatCandleString('{{ticker}} {{close}} {{interval}}', {
      ticker: 'SOLUSDT',
      close: 150.5,
      interval: '5',
    });
    expect(result).toBe('SOLUSDT 150.5 5');
  });

  it('should substitute all supported variables', () => {
    const result = formatCandleString(
      '{{ticker}} {{interval}} {{open}} {{high}} {{low}} {{close}} {{volume}} {{time}} {{bar_index}} {{timestamp}}',
      {
        ticker: 'BTCUSDT',
        interval: '15',
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 123.45,
        time: 1700000000000,
        bar_index: 42,
        timestamp: 1700000000,
      },
    );
    expect(result).toBe(
      'BTCUSDT 15 50000 51000 49000 50500 123.45 2023-11-14T22:13:20.000Z 42 1700000000',
    );
  });

  it('should handle single-curly fallback for time', () => {
    const result = formatCandleString('Time: {time}, Bar: {bar_index}, TS: {timestamp}', {
      time: 1700000000000,
      bar_index: 5,
      timestamp: 1700000000,
    });
    expect(result).toContain('Time: 2023-11-14T22:13:20.000Z');
    expect(result).toContain('Bar: 5');
    expect(result).toContain('TS: 1700000000');
  });

  it('should leave unresolved variables as-is when context field is missing', () => {
    const result = formatCandleString('{{ticker}} {{close}}', { ticker: 'ETHUSDT' });
    expect(result).toBe('ETHUSDT {{close}}');
  });

  it('should return template unchanged when no variables present', () => {
    const result = formatCandleString('Simple alert message', { ticker: 'BTC' });
    expect(result).toBe('Simple alert message');
  });

  it('should handle partial template with mixed resolved and unresolved', () => {
    const result = formatCandleString('{{ticker}} at {{close}} on {{interval}}', {
      ticker: 'SOLUSDT',
      interval: '5',
    });
    expect(result).toBe('SOLUSDT at {{close}} on 5');
  });

  it('should not fail on empty template', () => {
    const result = formatCandleString('', { ticker: 'BTC' });
    expect(result).toBe('');
  });

  it('should format time as ISO string', () => {
    const result = formatCandleString('{{time}}', { time: 1609459200000 });
    expect(result).toBe('2021-01-01T00:00:00.000Z');
  });

  it('should format single-curly time as ISO string', () => {
    const result = formatCandleString('{time}', { time: 1609459200000 });
    expect(result).toBe('2021-01-01T00:00:00.000Z');
  });
});
