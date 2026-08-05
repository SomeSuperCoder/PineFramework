import { describe, it, expect, vi } from 'vitest';

vi.mock('pino', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  })),
}));

vi.mock('pino-pretty', () => ({
  __esModule: true,
  default: vi.fn(),
}));

vi.mock('pino/file', () => ({
  __esModule: true,
  default: vi.fn(),
}));

import pino from 'pino';
import { logger, createBackendLogger } from '../src/utils/logger.js';

describe('backend logger', () => {
  // Capture the pino instance created during module load
  const pinoInstance = pino.mock.results[0].value;

  describe('logger instance', () => {
    it('has info, warn, error, debug methods (PineLogger-compatible)', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('auto-fills category and subcategory in log calls', () => {
      logger.info('cache.hit', { key: 'BTCUSDT' });

      const infoCall = pinoInstance.info.mock.calls[0];
      const meta = infoCall[0];
      const event = infoCall[1];

      expect(meta.category).toBe('backend');
      expect(meta.subcategory).toBe('app');
      expect(event).toBe('cache.hit');
      expect(meta.key).toBe('BTCUSDT');
    });
  });

  describe('createBackendLogger factory', () => {
    it('is a function export from the module', () => {
      expect(typeof createBackendLogger).toBe('function');
    });

    it('returns a PineLogger-compatible instance', () => {
      const backendLogger = createBackendLogger('backend', 'api');

      expect(typeof backendLogger.info).toBe('function');
      expect(typeof backendLogger.warn).toBe('function');
      expect(typeof backendLogger.error).toBe('function');
      expect(typeof backendLogger.debug).toBe('function');
    });
  });

  describe('redaction config', () => {
    it('configures pino redact for sensitive fields', () => {
      const pinoConfig = pino.mock.calls[0][0];
      expect(pinoConfig.redact).toBeDefined();
      expect(pinoConfig.redact.paths).toContain('req.headers.authorization');
      expect(pinoConfig.redact.paths).toContain('req.headers.cookie');
      expect(pinoConfig.redact.paths).toContain('body.token');
      expect(pinoConfig.redact.paths).toContain('body.password');
    });
  });
});
