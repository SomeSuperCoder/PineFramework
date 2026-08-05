/** Log level values supported by PineLogger. */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/** Log category — the domain the log belongs to. */
export type LogCategory = 'frontend' | 'backend' | 'bot';

/**
 * Structured metadata attached to every log entry.
 *
 * `timestamp` is optional on input — implementations auto-fill it if omitted.
 * The index signature allows arbitrary extra fields (e.g. `key: "BTCUSDT"`).
 */
export interface LogMeta {
  category?: LogCategory;
  subcategory?: string;
  timestamp?: string; // ISO 8601 — implementation fills in if omitted
  [key: string]: unknown;
}

/** A single log entry as stored in log files (NDJSON). */
export interface LogEntry {
  timestamp: string; // ISO 8601
  level: LogLevel;
  category: LogCategory;
  subcategory: string;
  message: string;
  meta?: LogMeta;
}

/**
 * Unified logger interface used across frontend, backend, and bot domains.
 *
 * Implementations MUST be compatible with both Node.js and browser environments
 * — the interface itself has no runtime dependencies.
 */
export interface PineLogger {
  info(event: string, meta?: LogMeta): void;
  warn(event: string, meta?: LogMeta): void;
  error(event: string, meta?: LogMeta): void;
  debug(event: string, meta?: LogMeta): void;
}

/** Factory function signature for creating a PineLogger instance. */
export type CreateLogger = (category: string, subcategory: string) => PineLogger;
