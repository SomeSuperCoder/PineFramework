import { CompileError } from '../../common/errors.js';
import type { SourceSpan } from '../../common/source-location.js';
import {
  ANY_TYPE,
  BOOL_TYPE,
  COLOR_TYPE,
  FLOAT_TYPE,
  INT_TYPE,
  NA_TYPE,
  STRING_TYPE,
  type PineType,
  type PinePrimitiveKind,
} from './pine-types.js';
import { isNa, type PineValue } from './na.js';

export interface CoercionResult {
  value: PineValue;
  type: PineType;
}

export function getCommonType(left: PineType, right: PineType): PineType {
  if (left.equals(right)) {
    return left;
  }

  if (left.kind === 'na' || right.kind === 'na') {
    return left.kind === 'na' ? right : left;
  }

  if (left.kind === 'any' || right.kind === 'any') {
    return ANY_TYPE;
  }

  const leftBase = unwrapSeries(left);
  const rightBase = unwrapSeries(right);

  if (isNumeric(leftBase) && isNumeric(rightBase)) {
    const result = promoteNumeric(leftBase, rightBase);
    return left.isSeries || right.isSeries ? withSeries(result) : result;
  }

  if (leftBase.name === rightBase.name) {
    return left.isSeries || right.isSeries ? withSeries(leftBase) : leftBase;
  }

  throw new CompileError(`Cannot find common type between ${left.toString()} and ${right.toString()}`);
}

export function coerce(value: PineValue, targetType: PineType, span?: SourceSpan): CoercionResult {
  if (isNa(value)) {
    return { value, type: NA_TYPE };
  }

  const baseType = unwrapSeries(targetType);

  switch (baseType.name) {
    case 'int':
      return coerceToInt(value, span);
    case 'float':
      return coerceToFloat(value, span);
    case 'bool':
      return coerceToBool(value);
    case 'string':
      return coerceToString(value);
    case 'color':
      return coerceToColor(value, span);
    default:
      return { value, type: targetType };
  }
}

export function coerceBinaryOperands(
  leftValue: PineValue,
  rightValue: PineValue,
  leftType: PineType,
  rightType: PineType,
  operator: string,
  span?: SourceSpan,
): { left: CoercionResult; right: CoercionResult; resultType: PineType } {
  if (operator === '+' && (leftType.name === 'string' || rightType.name === 'string')) {
    const left = coerceToString(leftValue);
    const right = coerceToString(rightValue);
    return { left, right, resultType: STRING_TYPE };
  }

  const commonType = getCommonType(leftType, rightType);
  const left = coerce(leftValue, commonType, span);
  const right = coerce(rightValue, commonType, span);

  return { left, right, resultType: commonType };
}

function coerceToInt(value: PineValue, span?: SourceSpan): CoercionResult {
  if (typeof value === 'number') {
    return { value: Math.trunc(value), type: INT_TYPE };
  }
  if (typeof value === 'boolean') {
    return { value: value ? 1 : 0, type: INT_TYPE };
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      throw new CompileError(`Cannot convert string "${value}" to int`, span);
    }
    return { value: parsed, type: INT_TYPE };
  }
  throw new CompileError(`Cannot convert value to int`, span);
}

function coerceToFloat(value: PineValue, span?: SourceSpan): CoercionResult {
  if (typeof value === 'number') {
    return { value, type: FLOAT_TYPE };
  }
  if (typeof value === 'boolean') {
    return { value: value ? 1.0 : 0.0, type: FLOAT_TYPE };
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) {
      throw new CompileError(`Cannot convert string "${value}" to float`, span);
    }
    return { value: parsed, type: FLOAT_TYPE };
  }
  throw new CompileError(`Cannot convert value to float`, span);
}

function coerceToBool(value: PineValue): CoercionResult {
  if (typeof value === 'boolean') {
    return { value, type: BOOL_TYPE };
  }
  if (typeof value === 'number') {
    return { value: value !== 0, type: BOOL_TYPE };
  }
  if (typeof value === 'string') {
    return { value: value.length > 0, type: BOOL_TYPE };
  }
  return { value: false, type: BOOL_TYPE };
}

function coerceToString(value: PineValue): CoercionResult {
  if (typeof value === 'string') {
    return { value, type: STRING_TYPE };
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { value: String(value), type: STRING_TYPE };
  }
  return { value: '', type: STRING_TYPE };
}

function coerceToColor(value: PineValue, span?: SourceSpan): CoercionResult {
  if (typeof value === 'string' && value.startsWith('#')) {
    return { value, type: COLOR_TYPE };
  }
  throw new CompileError('Invalid color value', span);
}

function isNumeric(type: PineType): boolean {
  return type.name === 'int' || type.name === 'float';
}

function promoteNumeric(left: PineType, right: PineType): PineType {
  if (left.name === 'float' || right.name === 'float') {
    return FLOAT_TYPE;
  }
  return INT_TYPE;
}

function unwrapSeries(type: PineType): PineType {
  if (type.kind === 'series' && 'elementType' in type) {
    return (type as { elementType: PineType }).elementType;
  }
  return type;
}

function withSeries(type: PineType): PineType {
  if (type.isSeries) {
    return type;
  }
  return {
    ...type,
    isSeries: true,
    toString: () => `series<${type.name}>`,
    equals: (other: PineType) => type.equals(other) && type.isSeries === other.isSeries,
  } as PineType;
}

export function inferLiteralType(value: PineValue, isFloat = false): PineType {
  if (isNa(value)) {
    return NA_TYPE;
  }
  if (typeof value === 'number') {
    return isFloat ? FLOAT_TYPE : INT_TYPE;
  }
  if (typeof value === 'boolean') {
    return BOOL_TYPE;
  }
  if (typeof value === 'string') {
    return value.startsWith('#') ? COLOR_TYPE : STRING_TYPE;
  }
  return ANY_TYPE;
}

export function isAssignable(source: PineType, target: PineType): boolean {
  if (target.kind === 'any') {
    return true;
  }
  if (source.kind === 'na') {
    return true;
  }
  if (source.equals(target)) {
    return true;
  }

  const sourceBase = unwrapSeries(source);
  const targetBase = unwrapSeries(target);

  if (isNumeric(sourceBase) && isNumeric(targetBase)) {
    if (targetBase.name === 'float') {
      return true;
    }
    return sourceBase.name === 'int' && targetBase.name === 'int';
  }

  return false;
}

export function parsePrimitiveKind(name: string): PinePrimitiveKind | null {
  const kinds: PinePrimitiveKind[] = ['int', 'float', 'bool', 'string', 'color'];
  return kinds.includes(name as PinePrimitiveKind) ? (name as PinePrimitiveKind) : null;
}
