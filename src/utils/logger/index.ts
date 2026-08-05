// Re-exports for the shared PineLogger interface and types.
// This module is environment-agnostic — pure TypeScript with no runtime dependencies.
// Backend and frontend packages each provide their own implementation that imports from here.

export type {
  LogLevel,
  LogCategory,
  LogMeta,
  LogEntry,
  PineLogger,
  CreateLogger,
} from './types.js';
