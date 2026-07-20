import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Application-wide logger instance.
 *
 * In development, logs are pretty-printed to stdout.
 * In production, logs are emitted as newline-delimited JSON for ingestion by
 * log aggregators (e.g., Loki, Datadog, CloudWatch).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'body.token', 'body.password'],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger pre-bound with request context.
 */
export function requestLogger(req: { method: string; url: string; requestId?: string }) {
  const base: Record<string, unknown> = {
    method: req.method,
    url: req.url,
  };
  if (req.requestId) base.requestId = req.requestId;
  return logger.child(base);
}
