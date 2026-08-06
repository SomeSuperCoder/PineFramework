import { createBackendLogger } from './logger.js';
import type { LogLevel } from 'pine-framework/utils/logger/types';

/**
 * Bot logger specialization — pre-binds category "bot" and a trading
 * subcategory, and optionally broadcasts every log entry to the
 * `bot:log` WebSocket channel so the frontend dashboard receives
 * log events in real time.
 *
 * Supported subcategories: execution, risk, telegram, scheduler,
 * wallet, strategy.
 *
 * The broadcast callback receives the same structured data that
 * pino writes to the log file, so the WebSocket payload and the
 * on-disk log entry are consistent.
 */
export function createBotLogger(
  subcategory: string,
  broadcast?: (entry: {
    timestamp: string;
    level: LogLevel;
    category: string;
    subcategory: string;
    message: string;
    meta?: Record<string, unknown>;
  }) => void,
) {
  const baseLogger = createBackendLogger('bot', subcategory);

  return {
    info: (event: string, meta?: Record<string, unknown>) => {
      baseLogger.info(event, meta);
      broadcast?.({
        timestamp: new Date().toISOString(),
        level: 'info',
        category: 'bot',
        subcategory,
        message: event,
        meta,
      });
    },
    warn: (event: string, meta?: Record<string, unknown>) => {
      baseLogger.warn(event, meta);
      broadcast?.({
        timestamp: new Date().toISOString(),
        level: 'warn',
        category: 'bot',
        subcategory,
        message: event,
        meta,
      });
    },
    error: (event: string, meta?: Record<string, unknown>) => {
      baseLogger.error(event, meta);
      broadcast?.({
        timestamp: new Date().toISOString(),
        level: 'error',
        category: 'bot',
        subcategory,
        message: event,
        meta,
      });
    },
    debug: (event: string, meta?: Record<string, unknown>) => {
      baseLogger.debug(event, meta);
      broadcast?.({
        timestamp: new Date().toISOString(),
        level: 'debug',
        category: 'bot',
        subcategory,
        message: event,
        meta,
      });
    },
  };
}
