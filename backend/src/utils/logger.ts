import pino from 'pino';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, createWriteStream } from 'node:fs';
import { Transform, type TransformCallback } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root logs directory — gitignored, directly readable by AI agents. */
const LOGS_DIR = join(__dirname, '..', '..', '..', 'logs');

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Application-wide logger instance.
 *
 * In development, logs are pretty-printed to stdout.
 * In production, logs are emitted as newline-delimited JSON for ingestion by
 * log aggregators (e.g., Loki, Datadog, CloudWatch).
 *
 * Backward-compatible export — other files import `{ logger }` from here.
 */
export const logger = createBackendLogger('backend', 'app');

/**
 * Create a Transform stream that converts pino's numeric `level` field
 * to its string name (e.g. 30 → "info") so log files match the spec.
 *
 * pino outputs `level` as a number (20=debug, 30=info, 40=warn, 50=error).
 * The spec requires string level names in the on-disk NDJSON format.
 */
function createLevelTransform(logFile: string): Transform {
  const fileStream = createWriteStream(logFile, { flags: 'a' });

  const transform = new Transform({
    transform(chunk: Buffer, _encoding: string, callback: TransformCallback) {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          // Convert numeric pino level to string name per spec
          entry.level = pino.levels.labels[entry.level] ?? entry.level;
          this.push(JSON.stringify(entry) + '\n');
        } catch {
          // Pass through non-JSON lines unchanged
          this.push(line + '\n');
        }
      }
      callback();
    },
  });

  transform.pipe(fileStream);
  return transform;
}

/**
 * Create a backend logger that writes structured JSON to `logs/{category}/{subcategory}.log`.
 *
 * In development mode, uses pino-pretty stdout instead of file transport.
 * Respects the `LOG_LEVEL` environment variable for controlling the minimum log level.
 * Auto-creates the log directory if it does not exist.
 *
 * Log format (per spec):
 * - `timestamp` — ISO 8601 string (not epoch ms)
 * - `level` — string name ("info"/"warn"/"error"/"debug"), not numeric
 * - `message` — the log message (not `msg`)
 * - `category` / `subcategory` — caller-supplied fields
 */
export function createBackendLogger(category: string, subcategory: string) {
  const logDir = join(LOGS_DIR, category);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const logFile = join(logDir, `${subcategory}.log`);

  const pinoOptions = {
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    messageKey: 'message',
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'body.token', 'body.password'],
      censor: '[REDACTED]',
    },
  };

  const baseLogger = isDev
    ? pino({
        ...pinoOptions,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      })
    : pino(pinoOptions, createLevelTransform(logFile));

  /**
   * PineLogger-compatible wrapper.
   *
   * The `PineLogger` interface expects `(event: string, meta?: LogMeta): void`
   * where `LogMeta` includes `category` and `subcategory`. We auto-fill these
   * from the pre-bound values so callers don't need to repeat them.
   *
   * Using `Record<string, unknown>` for meta keeps the wrapper compatible
   * with both `PineLogger` (runtime) and the existing `BotLogger` interface.
   */
  return {
    info: (event: string, meta?: Record<string, unknown>) => {
      baseLogger.info({ ...meta, category, subcategory }, event);
    },
    warn: (event: string, meta?: Record<string, unknown>) => {
      baseLogger.warn({ ...meta, category, subcategory }, event);
    },
    error: (event: string, meta?: Record<string, unknown>) => {
      baseLogger.error({ ...meta, category, subcategory }, event);
    },
    debug: (event: string, meta?: Record<string, unknown>) => {
      baseLogger.debug({ ...meta, category, subcategory }, event);
    },
  };
}


