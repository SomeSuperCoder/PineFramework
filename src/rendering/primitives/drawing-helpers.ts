/**
 * Shared helper functions for drawing object management.
 */
import { isNa, type PineValue } from '../../language/types/na.js';

export function isNaOrNull(value: PineValue): boolean {
  return isNa(value) || value === null || value === undefined;
}

export function toNumber(value: PineValue, defaultValue: number = 0): number {
  if (isNaOrNull(value)) return defaultValue;
  return value as number;
}

export function toString(value: PineValue, defaultValue: string = ''): string {
  if (isNaOrNull(value)) return defaultValue;
  return String(value);
}

let drawingIdCounter = 0;

export function generateDrawingId(): string {
  return `drawing_${++drawingIdCounter}`;
}

export function resetDrawingIdCounter(): void {
  drawingIdCounter = 0;
}
