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
 * Logs are ALWAYS emitted as newline-delimited JSON to
 * `logs/{category}/{subcategory}.log` so AI agents and the operator can
 * diagnose runs post-hoc from disk (and via GET /api/logs). In development
 * they are additionally pretty-printed to stdout for humans; in production
 * they are file-only for aggregator ingestion (e.g., Loki, Datadog, CloudWatch).
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
 * Files are always written — dev and prod — so every run leaves on-disk NDJSON
 * for AI-agent/operator diagnosis. In development, logs are additionally
 * pretty-printed to stdout for humans; in production they are file-only for
 * log aggregators.
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

  // Always write structured NDJSON to disk so AI agents and the operator can
  // diagnose runs post-hoc (logs/{category}/{subcategory}.log, GET /api/logs).
  const fileLogger = pino(pinoOptions, createLevelTransform(logFile));

  // In development, also pretty-print to stdout for humans. Production stays
  // file-only for aggregator ingestion — unchanged from before.
  const prettyLogger = isDev
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
    : null;

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
  const emit =
    (level: 'info' | 'warn' | 'error' | 'debug') =>
    (event: string, meta?: Record<string, unknown>) => {
      const record = { ...meta, category, subcategory };
      fileLogger[level](record, event);
      prettyLogger?.[level](record, event);
    };

  return {
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
    debug: emit('debug'),
  };
}


