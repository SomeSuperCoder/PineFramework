import { describe, it, expect } from 'vitest';
import type {
  LogLevel,
  LogCategory,
  LogMeta,
  LogEntry,
  PineLogger,
  CreateLogger,
} from '../../../src/utils/logger/types.js';

describe('shared logger types', () => {
  describe('LogLevel', () => {
    it('is a union of the four allowed levels', () => {
      const levels: LogLevel[] = ['info', 'warn', 'error', 'debug'];
      levels.forEach((l) => {
        expect(['info', 'warn', 'error', 'debug']).toContain(l);
      });
    });
  });

  describe('LogCategory', () => {
    it('is a union of the three allowed categories', () => {
      const categories: LogCategory[] = ['frontend', 'backend', 'bot'];
      categories.forEach((c) => {
        expect(['frontend', 'backend', 'bot']).toContain(c);
      });
    });
  });

  describe('LogMeta', () => {
    it('requires category and subcategory', () => {
      const meta: LogMeta = {
        category: 'frontend',
        subcategory: 'ui',
      };
      expect(meta.category).toBe('frontend');
      expect(meta.subcategory).toBe('ui');
    });

    it('allows optional timestamp', () => {
      const meta: LogMeta = {
        category: 'backend',
        subcategory: 'api',
        timestamp: '2024-01-01T00:00:00Z',
      };
      expect(meta.timestamp).toBe('2024-01-01T00:00:00Z');
    });

    it('allows arbitrary extra fields via index signature', () => {
      const meta: LogMeta = {
        category: 'bot',
        subcategory: 'execution',
        pair: 'BTCUSDT',
        side: 'buy',
      };
      expect(meta.pair).toBe('BTCUSDT');
      expect(meta.side).toBe('buy');
    });
  });

  describe('LogEntry', () => {
    it('has all required fields', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T00:00:00Z',
        level: 'info',
        category: 'frontend',
        subcategory: 'ui',
        message: 'render complete',
      };
      expect(entry.timestamp).toBe('2024-01-01T00:00:00Z');
      expect(entry.level).toBe('info');
      expect(entry.category).toBe('frontend');
      expect(entry.subcategory).toBe('ui');
      expect(entry.message).toBe('render complete');
    });

    it('has optional meta field', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T00:00:00Z',
        level: 'warn',
        category: 'backend',
        subcategory: 'api',
        message: 'slow query',
        meta: { category: 'backend', subcategory: 'api', durationMs: 1200 },
      };
      expect(entry.meta).toEqual({ category: 'backend', subcategory: 'api', durationMs: 1200 });
    });

    it('meta is optional', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T00:00:00Z',
        level: 'debug',
        category: 'bot',
        subcategory: 'strategy',
        message: 'tick',
      };
      expect(entry.meta).toBeUndefined();
    });
  });

  describe('PineLogger interface', () => {
    it('defines info, warn, error, debug methods', () => {
      const logger: PineLogger = {
        info: (event: string, meta?: LogMeta) => {},
        warn: (event: string, meta?: LogMeta) => {},
        error: (event: string, meta?: LogMeta) => {},
        debug: (event: string, meta?: LogMeta) => {},
      };
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('info accepts event string and optional meta', () => {
      const logger: PineLogger = {
        info: (event: string, meta?: LogMeta) => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      };
      logger.info('cache.hit', { category: 'backend', subcategory: 'cache' });
      logger.info('cache.hit');
    });
  });

  describe('CreateLogger factory', () => {
    it('is a function type that takes category and subcategory and returns PineLogger', () => {
      const factory: CreateLogger = (category: string, subcategory: string) => ({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      });
      const logger = factory('frontend', 'ui');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });
});
