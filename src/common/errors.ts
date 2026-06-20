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

export class TypeError extends PineError {
  constructor(message: string, span?: SourceSpan) {
    super(message, span);
    this.name = 'TypeError';
  }
}
