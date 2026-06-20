export type PinePrimitiveKind = 'int' | 'float' | 'bool' | 'string' | 'color';

export interface PineType {
  readonly kind: PineTypeKind;
  readonly name: string;
  isSeries: boolean;
  equals(other: PineType): boolean;
  toString(): string;
}

export type PineTypeKind =
  | 'primitive'
  | 'series'
  | 'array'
  | 'map'
  | 'user'
  | 'void'
  | 'any'
  | 'na';

export class PrimitiveType implements PineType {
  readonly kind: PineTypeKind = 'primitive';
  readonly name: PinePrimitiveKind;
  isSeries = false;

  constructor(name: PinePrimitiveKind) {
    this.name = name;
  }

  equals(other: PineType): boolean {
    return this.kind === other.kind && this.name === other.name && this.isSeries === other.isSeries;
  }

  toString(): string {
    return this.isSeries ? `series<${this.name}>` : this.name;
  }
}

export class SeriesType implements PineType {
  readonly kind: PineTypeKind = 'series';
  readonly name: string;
  isSeries = true;
  readonly elementType: PineType;

  constructor(elementType: PineType) {
    this.elementType = elementType;
    this.name = `series<${elementType.name}>`;
  }

  equals(other: PineType): boolean {
    return (
      other.kind === 'series' &&
      other instanceof SeriesType &&
      this.elementType.equals(other.elementType)
    );
  }

  toString(): string {
    return this.name;
  }
}

export class ArrayType implements PineType {
  readonly kind: PineTypeKind = 'array';
  readonly name: string;
  isSeries = false;
  readonly elementType: PineType;

  constructor(elementType: PineType) {
    this.elementType = elementType;
    this.name = `array<${elementType.name}>`;
  }

  equals(other: PineType): boolean {
    return (
      other.kind === 'array' &&
      other instanceof ArrayType &&
      this.elementType.equals(other.elementType)
    );
  }

  toString(): string {
    return this.isSeries ? `series<${this.name}>` : this.name;
  }
}

export class MapType implements PineType {
  readonly kind: PineTypeKind = 'map';
  readonly name: string;
  isSeries = false;
  readonly keyType: PineType;
  readonly valueType: PineType;

  constructor(keyType: PineType, valueType: PineType) {
    this.keyType = keyType;
    this.valueType = valueType;
    this.name = `map<${keyType.name}, ${valueType.name}>`;
  }

  equals(other: PineType): boolean {
    return (
      other.kind === 'map' &&
      other instanceof MapType &&
      this.keyType.equals(other.keyType) &&
      this.valueType.equals(other.valueType)
    );
  }

  toString(): string {
    return this.isSeries ? `series<${this.name}>` : this.name;
  }
}

export class UserType implements PineType {
  readonly kind: PineTypeKind = 'user';
  readonly name: string;
  isSeries = false;

  constructor(name: string) {
    this.name = name;
  }

  equals(other: PineType): boolean {
    return other.kind === 'user' && this.name === other.name && this.isSeries === other.isSeries;
  }

  toString(): string {
    return this.isSeries ? `series<${this.name}>` : this.name;
  }
}

export class VoidType implements PineType {
  readonly kind: PineTypeKind = 'void';
  readonly name = 'void';
  isSeries = false;

  equals(other: PineType): boolean {
    return other.kind === 'void';
  }

  toString(): string {
    return 'void';
  }
}

export class AnyType implements PineType {
  readonly kind: PineTypeKind = 'any';
  readonly name = 'any';
  isSeries = false;

  equals(other: PineType): boolean {
    return other.kind === 'any';
  }

  toString(): string {
    return 'any';
  }
}

export class NaType implements PineType {
  readonly kind: PineTypeKind = 'na';
  readonly name = 'na';
  isSeries = false;

  equals(other: PineType): boolean {
    return other.kind === 'na';
  }

  toString(): string {
    return 'na';
  }
}

export const INT_TYPE = new PrimitiveType('int');
export const FLOAT_TYPE = new PrimitiveType('float');
export const BOOL_TYPE = new PrimitiveType('bool');
export const STRING_TYPE = new PrimitiveType('string');
export const COLOR_TYPE = new PrimitiveType('color');
export const VOID_TYPE = new VoidType();
export const ANY_TYPE = new AnyType();
export const NA_TYPE = new NaType();

export function seriesOf(elementType: PineType): SeriesType {
  return new SeriesType(elementType);
}

export function arrayOf(elementType: PineType): ArrayType {
  return new ArrayType(elementType);
}

export function mapOf(keyType: PineType, valueType: PineType): MapType {
  return new MapType(keyType, valueType);
}

export function primitiveType(name: PinePrimitiveKind): PrimitiveType {
  switch (name) {
    case 'int':
      return INT_TYPE;
    case 'float':
      return FLOAT_TYPE;
    case 'bool':
      return BOOL_TYPE;
    case 'string':
      return STRING_TYPE;
    case 'color':
      return COLOR_TYPE;
  }
}

export function typeFromAnnotation(name: string, options: {
  isSeries?: boolean;
  isArray?: boolean;
  isMap?: boolean;
  typeArguments?: PineType[];
}): PineType {
  let base: PineType;

  switch (name) {
    case 'int':
      base = INT_TYPE;
      break;
    case 'float':
      base = FLOAT_TYPE;
      break;
    case 'bool':
      base = BOOL_TYPE;
      break;
    case 'string':
      base = STRING_TYPE;
      break;
    case 'color':
      base = COLOR_TYPE;
      break;
    case 'array':
      base = arrayOf(options.typeArguments?.[0] ?? ANY_TYPE);
      break;
    case 'map':
      base = mapOf(
        options.typeArguments?.[0] ?? STRING_TYPE,
        options.typeArguments?.[1] ?? ANY_TYPE,
      );
      break;
    default:
      base = new UserType(name);
  }

  if (options.isArray && base.kind !== 'array') {
    base = arrayOf(base);
  }

  if (options.isSeries) {
    return seriesOf(base);
  }

  if (options.isMap && base.kind !== 'map') {
    return mapOf(STRING_TYPE, base);
  }

  return base;
}
