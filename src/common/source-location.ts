export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export interface SourceSpan {
  start: SourceLocation;
  end: SourceLocation;
}

export function createLocation(line: number, column: number, offset: number): SourceLocation {
  return { line, column, offset };
}

export function spanBetween(start: SourceLocation, end: SourceLocation): SourceSpan {
  return { start, end };
}
