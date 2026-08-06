import { describe, it, expect, vi } from 'vitest';

// vi.mock factories are hoisted ABOVE top-level declarations, so anything they
// close over must live in vi.hoisted (initialized before the mocks run).
const { writtenChunks, destination } = vi.hoisted(() => {
  const writtenChunks: string[] = [];
  const destination = { current: null as { write: (chunk: string) => void } | null };
  return { writtenChunks, destination };
});

// The backend logger always writes structured NDJSON to a file via
// createLevelTransform -> createWriteStream. Mock createWriteStream to a
// recording Writable so the transform's numeric→string level conversion is
// exercised deterministically (no real logs/ dir writes).
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const { Writable } = await import('node:stream');
  return {
    ...actual,
    createWriteStream: vi.fn(
      () =>
        new Writable({
          write(chunk: Buffer, _enc: unknown, cb: () => void) {
            writtenChunks.push(chunk.toString());
            cb();
          },
        }),
    ),
  };
});

vi.mock('pino', () => {
  const pinoMock = vi.fn(
    (_opts: unknown, dest?: { write: (chunk: string) => void }) => {
      // The FIRST pino call is the file logger — its destination is the
      // level-transform stream, so real writes flow into writtenChunks.
      // The pretty stdout logger (no dest) must NOT write to the file.
      const isFileLogger = !!dest;
      if (dest) destination.current = dest;
      return {
        info: vi.fn((record: Record<string, unknown>, event: string) => {
          if (isFileLogger) destination.current?.write(JSON.stringify({ ...record, level: 30, message: event }) + '\n');
        }),
        warn: vi.fn((record: Record<string, unknown>, event: string) => {
          if (isFileLogger) destination.current?.write(JSON.stringify({ ...record, level: 40, message: event }) + '\n');
        }),
        error: vi.fn((record: Record<string, unknown>, event: string) => {
          if (isFileLogger) destination.current?.write(JSON.stringify({ ...record, level: 50, message: event }) + '\n');
        }),
        debug: vi.fn((record: Record<string, unknown>, event: string) => {
          if (isFileLogger) destination.current?.write(JSON.stringify({ ...record, level: 20, message: event }) + '\n');
        }),
        child: vi.fn(() => ({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        })),
      };
    },
  );
  // The real level transform maps numeric pino levels via pino.levels.labels —
  // the mock must expose them or createLevelTransform throws at write time.
  pinoMock.levels = {
    labels: { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' },
  };
  return { __esModule: true, default: pinoMock };
});

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

  describe('file logging — always-on NDJSON (dev mode)', () => {
    it('writes every log line to the file transport as NDJSON with STRING level names', async () => {
      writtenChunks.length = 0;
      const backendLogger = createBackendLogger('test-cat', 'test-sub');

      backendLogger.info('hello world', { key: 'value' });
      backendLogger.warn('careful now', { n: 1 });

      await vi.waitFor(() => expect(writtenChunks.length).toBe(2));

      const all = writtenChunks.join('');
      expect(all).toContain('"level":"info"');
      expect(all).toContain('"message":"hello world"');
      expect(all).toContain('"key":"value"');
      expect(all).toContain('"category":"test-cat"');
      expect(all).toContain('"subcategory":"test-sub"');
      expect(all).toContain('"level":"warn"');
      expect(all).toContain('"message":"careful now"');
      // Spec: level is a string NAME, never the numeric pino code (30/40).
      expect(all).not.toContain('"level":30');
      expect(all).not.toContain('"level":40');
    });

    it('uses messageKey "message" and ISO-8601 timestamps (not epoch ms)', () => {
      const pinoOptions = pino.mock.calls[0][0] as {
        messageKey?: string;
        timestamp?: () => string;
      };
      expect(pinoOptions.messageKey).toBe('message');

      const ts = pinoOptions.timestamp!();
      expect(ts).toMatch(/"timestamp":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('creates the file transport ALWAYS and the pretty stdout transport only in dev', () => {
      const fileCall = pino.mock.calls[0]!;
      // The file logger always gets a destination stream (the level transform).
      expect(fileCall[1]).toBeDefined();
      expect(typeof (fileCall[1] as { write?: unknown }).write).toBe('function');

      const prettyCalls = pino.mock.calls.filter(
        (c) => (c[0] as { transport?: unknown } | undefined)?.transport,
      );
      if (process.env.NODE_ENV === 'production') {
        // Production is file-only for aggregator ingestion.
        expect(prettyCalls).toHaveLength(0);
      } else {
        expect(prettyCalls.length).toBeGreaterThan(0);
        expect(
          (prettyCalls[0]![0] as { transport: { target: string } }).transport.target,
        ).toBe('pino-pretty');
      }
    });
  });
});
