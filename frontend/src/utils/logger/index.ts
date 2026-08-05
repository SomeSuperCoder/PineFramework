import { RingBuffer } from './ring-buffer.js';
import { getForwarder } from './websocket-forwarder.js';
import type { FrontendLogEntry, LogLevel, LogSubcategory, PineLogger } from './types.js';

const RING_BUFFER_SIZE = 500;

const ringBuffer = new RingBuffer<FrontendLogEntry>(RING_BUFFER_SIZE);

function createEntry(
  level: LogLevel,
  message: string,
  category: 'frontend',
  subcategory: LogSubcategory,
  meta?: Record<string, unknown>,
): FrontendLogEntry {
  return {
    timestamp: Date.now(),
    level,
    message,
    category,
    subcategory,
    meta,
  };
}

export function createFrontendLogger(
  category: 'frontend',
  subcategory: LogSubcategory,
): PineLogger {
  const forwarder = getForwarder(ringBuffer);

  const log = (level: LogLevel, message: string, meta?: Record<string, unknown>): void => {
    const entry = createEntry(level, message, category, subcategory, meta);
    forwarder.forward(entry);
  };

  return {
    info: (message: string, meta?: Record<string, unknown>): void => {
      log('info', message, meta);
    },
    warn: (message: string, meta?: Record<string, unknown>): void => {
      log('warn', message, meta);
    },
    error: (message: string, meta?: Record<string, unknown>): void => {
      log('error', message, meta);
    },
    debug: (message: string, meta?: Record<string, unknown>): void => {
      log('debug', message, meta);
    },
    flush: (): FrontendLogEntry[] => {
      const entries = ringBuffer.toArray();
      ringBuffer.clear();
      return entries;
    },
  };
}
