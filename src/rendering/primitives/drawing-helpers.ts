/**
 * Shared helper functions for drawing object management.
 */
import { isNa, type PineValue } from '../../language/types/na.js';
import { cleanNumber } from '../../language/utils/number-format.js';

export function isNaOrNull(value: PineValue): boolean {
  return isNa(value) || value === null || value === undefined;
}

export function toNumber(value: PineValue, defaultValue: number = 0): number {
  if (isNaOrNull(value)) return defaultValue;
  return value as number;
}

/**
 * Convert a PineValue to a string for display.
 * Numbers are formatted through cleanNumber() to avoid IEEE 754 artifacts.
 * This function is used by table cells, labels, and boxes.
 */
export function toString(value: PineValue, defaultValue: string = ''): string {
  if (isNaOrNull(value)) return defaultValue;
  if (typeof value === 'number') return cleanNumber(value);
  return String(value);
}

let drawingIdCounter = 0;

export function generateDrawingId(): string {
  return `drawing_${++drawingIdCounter}`;
}

export function resetDrawingIdCounter(): void {
  drawingIdCounter = 0;
}
