import type { SourceSpan } from './source-location.js';

export class PineError extends Error {
  readonly span?: SourceSpan;

  constructor(message: string, span?: SourceSpan) {
    super(span ? `${message} at line ${span.start.line}, column ${span.start.column}` : message);
    this.name = 'PineError';
    this.span = span;
  }
}

export class ParseError extends PineError {
  constructor(message: string, span?: SourceSpan) {
    super(message, span);
    this.name = 'ParseError';
  }
}

export class CompileError extends PineError {
  constructor(message: string, span?: SourceSpan) {
    super(message, span);
    this.name = 'CompileError';
  }
}

/**
 * RuntimeError — thrown by the executor when invalid runtime state is detected
 * (e.g. unexpected NaN, type mismatch, invariant violation).
 * Extends PineError with an optional barIndex so callers can pinpoint the
 * failing bar.
 */
export class RuntimeError extends PineError {
  readonly barIndex?: number;

  constructor(message: string, barIndex?: number, span?: SourceSpan) {
    const suffix = barIndex !== undefined ? ` at bar ${barIndex}` : '';
    super(`${message}${suffix}`, span);
    this.name = 'RuntimeError';
    this.barIndex = barIndex;
  }
}
