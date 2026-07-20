import { NA, type PineValue } from '../types/na.js';

export type SeriesValue = PineValue;

export interface Series<T extends SeriesValue = SeriesValue> {
  readonly name: string;
  values: T[];
  readonly length: number;
  push(value: T): void;
  get(index: number): T;
  getRelative(offset: number): T;
  last(): T;
  lastOrDefault(defaultValue: T): T;
  slice(start?: number, end?: number): T[];
  clear(): void;
}

export function createSeries<T extends SeriesValue = SeriesValue>(
  name: string,
  initialValues?: T[],
): Series<T> {
  const values: T[] = initialValues ? [...initialValues] : [];

  return {
    name,
    values,
    get length() {
      return values.length;
    },

    push(value: T): void {
      values.push(value);
    },

    get(index: number): T {
      if (index < 0 || index >= values.length) {
        return NA as T;
      }
      return values[index]!;
    },

    getRelative(offset: number): T {
      if (values.length === 0) {
        // Empty series have no data — return NA for any offset.
        // Callers should ensure series are never empty (e.g., barsToContext
        // creates each series with [bar.open] so getRelative(0) always works).
        return NA as T;
      }
      const currentIndex = values.length - 1;
      const targetIndex = currentIndex - offset;

      if (targetIndex < 0 || targetIndex >= values.length) {
        return NA as T;
      }
      return values[targetIndex]!;
    },

    last(): T {
      if (values.length === 0) {
        return NA as T;
      }
      return values[values.length - 1]!;
    },

    lastOrDefault(defaultValue: T): T {
      if (values.length === 0) {
        return defaultValue;
      }
      return values[values.length - 1]!;
    },

    slice(start?: number, end?: number): T[] {
      return values.slice(start, end);
    },

    clear(): void {
      values.length = 0;
    },
  };
}

export function createEmptySeries<T extends SeriesValue = SeriesValue>(name: string): Series<T> {
  return createSeries<T>(name);
}
