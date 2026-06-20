export const NA = Symbol.for('pine.na');

export type PineValue =
  | number
  | boolean
  | string
  | typeof NA
  | PineValue[]
  | Map<string, PineValue>
  | null;

export function isNa(value: PineValue): value is typeof NA {
  return value === NA;
}

export function na<T extends PineValue = typeof NA>(): T {
  return NA as T;
}

export function naOr<T extends PineValue>(value: T | typeof NA, fallback: T): T {
  return isNa(value) ? fallback : value;
}

export function isValidNumber(value: PineValue): value is number {
  return typeof value === 'number' && !isNa(value);
}

export function propagateNa(...values: PineValue[]): boolean {
  return values.some(isNa);
}

export function pineTruthy(value: PineValue): boolean {
  if (isNa(value)) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return value.length > 0;
  }
  return value !== null;
}
