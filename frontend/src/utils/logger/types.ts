export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export type LogCategory = 'frontend';

export type LogSubcategory = 'ui' | 'chart' | 'ws';

export interface FrontendLogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  category: LogCategory;
  subcategory: LogSubcategory;
  meta?: Record<string, unknown>;
}

export interface PineLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  flush: () => FrontendLogEntry[];
}
