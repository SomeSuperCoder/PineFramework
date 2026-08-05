import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFrontendLogger } from '../../utils/logger/index.js';

describe('createFrontendLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('log methods', () => {
    it('info creates an entry with level "info"', () => {
      const logger = createFrontendLogger('frontend', 'ui');
      logger.info('chart.render', { chartType: 'candlestick' });

      const entries = logger.flush();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('info');
      expect(entries[0].message).toBe('chart.render');
    });

    it('warn creates an entry with level "warn"', () => {
      const logger = createFrontendLogger('frontend', 'ui');
      logger.warn('ws.slow', { latencyMs: 500 });

      const entries = logger.flush();
      expect(entries[0].level).toBe('warn');
      expect(entries[0].message).toBe('ws.slow');
    });

    it('error creates an entry with level "error"', () => {
      const logger = createFrontendLogger('frontend', 'ws');
      logger.error('ws.connection-lost', { retryCount: 3 });

      const entries = logger.flush();
      expect(entries[0].level).toBe('error');
      expect(entries[0].message).toBe('ws.connection-lost');
    });

    it('debug creates an entry with level "debug"', () => {
      const logger = createFrontendLogger('frontend', 'chart');
      logger.debug('render.tick', { frame: 42 });

      const entries = logger.flush();
      expect(entries[0].level).toBe('debug');
      expect(entries[0].message).toBe('render.tick');
    });

    it('includes category and subcategory in every entry', () => {
      const logger = createFrontendLogger('frontend', 'ui');
      logger.info('click', { x: 100, y: 200 });

      const entries = logger.flush();
      expect(entries[0].category).toBe('frontend');
      expect(entries[0].subcategory).toBe('ui');
    });

    it('includes meta when provided', () => {
      const logger = createFrontendLogger('frontend', 'chart');
      logger.info('render', { chartType: 'candlestick', symbol: 'BTCUSDT' });

      const entries = logger.flush();
      expect(entries[0].meta).toEqual({
        chartType: 'candlestick',
        symbol: 'BTCUSDT',
      });
    });

    it('does not include meta when not provided', () => {
      const logger = createFrontendLogger('frontend', 'ui');
      logger.info('page.load');

      const entries = logger.flush();
      expect(entries[0].meta).toBeUndefined();
    });

    it('timestamp is a number (Date.now())', () => {
      const logger = createFrontendLogger('frontend', 'ui');
      const before = Date.now();
      logger.info('test');
      const after = Date.now();

      const entries = logger.flush();
      expect(entries[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(entries[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('flush', () => {
    it('returns all buffered entries and clears the buffer', () => {
      const logger = createFrontendLogger('frontend', 'ui');
      logger.info('event-1');
      logger.info('event-2');

      const flushed = logger.flush();
      expect(flushed).toHaveLength(2);
    });

    it('returns an empty array when buffer is empty', () => {
      const logger = createFrontendLogger('frontend', 'ui');
      const flushed = logger.flush();
      expect(flushed).toEqual([]);
    });

    it('clears the buffer after flush', () => {
      const logger = createFrontendLogger('frontend', 'ui');
      logger.info('event-1');
      logger.flush();

      // After flush, buffer should be empty
      const entries = logger.flush();
      expect(entries).toEqual([]);
    });
  });

  describe('subcategory support', () => {
    it('accepts "ui" subcategory', () => {
      const logger = createFrontendLogger('frontend', 'ui');
      logger.info('click');
      const entries = logger.flush();
      expect(entries[0].subcategory).toBe('ui');
    });

    it('accepts "chart" subcategory', () => {
      const logger = createFrontendLogger('frontend', 'chart');
      logger.info('render');
      const entries = logger.flush();
      expect(entries[0].subcategory).toBe('chart');
    });

    it('accepts "ws" subcategory', () => {
      const logger = createFrontendLogger('frontend', 'ws');
      logger.info('connected');
      const entries = logger.flush();
      expect(entries[0].subcategory).toBe('ws');
    });
  });
});
