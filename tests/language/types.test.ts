import {
  INT_TYPE,
  FLOAT_TYPE,
  BOOL_TYPE,
  STRING_TYPE,
  COLOR_TYPE,
  VOID_TYPE,
  ANY_TYPE,
  NA_TYPE,
  seriesOf,
  arrayOf,
  mapOf,
  primitiveType,
  typeFromAnnotation,
} from '../../src/language/types/pine-types.js';
import {
  NA,
  isNa,
  na,
  naOr,
  pineTruthy,
  isValidNumber,
  propagateNa,
} from '../../src/language/types/na.js';
import {
  coerce,
  coerceBinaryOperands,
  getCommonType,
  isAssignable,
  inferLiteralType,
} from '../../src/language/types/coercion.js';
import { CompileError } from '../../src/common/errors.js';

describe('Pine type system', () => {
  describe('type definitions', () => {
    it('creates primitive types', () => {
      expect(INT_TYPE.name).toBe('int');
      expect(FLOAT_TYPE.name).toBe('float');
    });

    it('creates bool type', () => {
      expect(BOOL_TYPE.name).toBe('bool');
      expect(BOOL_TYPE.kind).toBe('primitive');
    });

    it('creates string type', () => {
      expect(STRING_TYPE.name).toBe('string');
      expect(STRING_TYPE.kind).toBe('primitive');
    });

    it('creates color type', () => {
      expect(COLOR_TYPE.name).toBe('color');
      expect(COLOR_TYPE.kind).toBe('primitive');
    });

    it('creates void type', () => {
      expect(VOID_TYPE.name).toBe('void');
      expect(VOID_TYPE.kind).toBe('void');
    });

    it('creates any type', () => {
      expect(ANY_TYPE.name).toBe('any');
      expect(ANY_TYPE.kind).toBe('any');
    });

    it('creates na type', () => {
      expect(NA_TYPE.name).toBe('na');
      expect(NA_TYPE.kind).toBe('na');
    });

    it('creates series types', () => {
      const s = seriesOf(FLOAT_TYPE);
      expect(s.isSeries).toBe(true);
      expect(s.toString()).toBe('series<float>');
    });

    it('creates array types', () => {
      const arr = arrayOf(INT_TYPE);
      expect(arr.kind).toBe('array');
      expect(arr.name).toBe('array<int>');
      expect(arr.elementType).toBe(INT_TYPE);
    });

    it('creates map types', () => {
      const m = mapOf(STRING_TYPE, INT_TYPE);
      expect(m.kind).toBe('map');
      expect(m.name).toBe('map<string, int>');
      expect(m.keyType).toBe(STRING_TYPE);
      expect(m.valueType).toBe(INT_TYPE);
    });

    it('creates user types', () => {
      const t = typeFromAnnotation('MyType', {});
      expect(t.kind).toBe('user');
      expect(t.name).toBe('MyType');
    });

    it('parses type annotations', () => {
      const t = typeFromAnnotation('int', { isSeries: true });
      expect(t.isSeries).toBe(true);
      expect(t.toString()).toBe('series<int>');
    });

    it('parses array type annotations', () => {
      const t = typeFromAnnotation('array', { typeArguments: [INT_TYPE] });
      expect(t.kind).toBe('array');
    });

    it('parses map type annotations', () => {
      const t = typeFromAnnotation('map', { typeArguments: [STRING_TYPE, INT_TYPE] });
      expect(t.kind).toBe('map');
    });

    it('parses array annotation with isArray flag', () => {
      const t = typeFromAnnotation('int', { isArray: true });
      expect(t.kind).toBe('array');
    });

    it('parses map annotation with isMap flag', () => {
      const t = typeFromAnnotation('int', { isMap: true });
      expect(t.kind).toBe('map');
    });
  });

  describe('type equality', () => {
    it('primitive types are equal to themselves', () => {
      expect(INT_TYPE.equals(INT_TYPE)).toBe(true);
      expect(FLOAT_TYPE.equals(FLOAT_TYPE)).toBe(true);
      expect(BOOL_TYPE.equals(BOOL_TYPE)).toBe(true);
    });

    it('different primitive types are not equal', () => {
      expect(INT_TYPE.equals(FLOAT_TYPE)).toBe(false);
      expect(INT_TYPE.equals(BOOL_TYPE)).toBe(false);
      expect(FLOAT_TYPE.equals(STRING_TYPE)).toBe(false);
    });

    it('series types are equal when element types match', () => {
      const s1 = seriesOf(INT_TYPE);
      const s2 = seriesOf(INT_TYPE);
      expect(s1.equals(s2)).toBe(true);
    });

    it('series types are not equal when element types differ', () => {
      const s1 = seriesOf(INT_TYPE);
      const s2 = seriesOf(FLOAT_TYPE);
      expect(s1.equals(s2)).toBe(false);
    });

    it('series types are not equal to non-series types', () => {
      const s = seriesOf(INT_TYPE);
      expect(s.equals(INT_TYPE)).toBe(false);
    });

    it('array types are equal when element types match', () => {
      const a1 = arrayOf(INT_TYPE);
      const a2 = arrayOf(INT_TYPE);
      expect(a1.equals(a2)).toBe(true);
    });

    it('array types are not equal when element types differ', () => {
      const a1 = arrayOf(INT_TYPE);
      const a2 = arrayOf(FLOAT_TYPE);
      expect(a1.equals(a2)).toBe(false);
    });

    it('map types are equal when key and value types match', () => {
      const m1 = mapOf(STRING_TYPE, INT_TYPE);
      const m2 = mapOf(STRING_TYPE, INT_TYPE);
      expect(m1.equals(m2)).toBe(true);
    });

    it('map types are not equal when types differ', () => {
      const m1 = mapOf(STRING_TYPE, INT_TYPE);
      const m2 = mapOf(STRING_TYPE, FLOAT_TYPE);
      expect(m1.equals(m2)).toBe(false);
    });

    it('void types are equal', () => {
      expect(VOID_TYPE.equals(VOID_TYPE)).toBe(true);
    });

    it('any types are equal', () => {
      expect(ANY_TYPE.equals(ANY_TYPE)).toBe(true);
    });

    it('na types are equal', () => {
      expect(NA_TYPE.equals(NA_TYPE)).toBe(true);
    });
  });

  describe('type toString', () => {
    it('primitive types have correct string representation', () => {
      expect(INT_TYPE.toString()).toBe('int');
      expect(FLOAT_TYPE.toString()).toBe('float');
      expect(BOOL_TYPE.toString()).toBe('bool');
      expect(STRING_TYPE.toString()).toBe('string');
      expect(COLOR_TYPE.toString()).toBe('color');
    });

    it('series types have correct string representation', () => {
      expect(seriesOf(INT_TYPE).toString()).toBe('series<int>');
      expect(seriesOf(FLOAT_TYPE).toString()).toBe('series<float>');
    });

    it('array types have correct string representation', () => {
      expect(arrayOf(INT_TYPE).toString()).toBe('array<int>');
    });

    it('map types have correct string representation', () => {
      expect(mapOf(STRING_TYPE, INT_TYPE).toString()).toBe('map<string, int>');
    });

    it('void type has correct string representation', () => {
      expect(VOID_TYPE.toString()).toBe('void');
    });

    it('any type has correct string representation', () => {
      expect(ANY_TYPE.toString()).toBe('any');
    });

    it('na type has correct string representation', () => {
      expect(NA_TYPE.toString()).toBe('na');
    });

    it('series of array has correct string representation', () => {
      const s = seriesOf(arrayOf(INT_TYPE));
      expect(s.toString()).toBe('series<array<int>>');
    });

    it('series of map has correct string representation', () => {
      const s = seriesOf(mapOf(STRING_TYPE, INT_TYPE));
      expect(s.toString()).toBe('series<map<string, int>>');
    });
  });

  describe('primitiveType factory', () => {
    it('creates int type', () => {
      expect(primitiveType('int')).toBe(INT_TYPE);
    });

    it('creates float type', () => {
      expect(primitiveType('float')).toBe(FLOAT_TYPE);
    });

    it('creates bool type', () => {
      expect(primitiveType('bool')).toBe(BOOL_TYPE);
    });

    it('creates string type', () => {
      expect(primitiveType('string')).toBe(STRING_TYPE);
    });

    it('creates color type', () => {
      expect(primitiveType('color')).toBe(COLOR_TYPE);
    });
  });

  describe('na semantics', () => {
    it('identifies na values', () => {
      expect(isNa(NA)).toBe(true);
      expect(isNa(42)).toBe(false);
      expect(isNa('hello')).toBe(false);
      expect(isNa(true)).toBe(false);
      expect(isNa(null)).toBe(false);
    });

    it('returns na with na()', () => {
      expect(na()).toBe(NA);
    });

    it('provides fallback with naOr', () => {
      expect(naOr(NA, 10)).toBe(10);
      expect(naOr(5, 10)).toBe(5);
      expect(naOr(NA, 'default')).toBe('default');
      expect(naOr('value', 'default')).toBe('value');
      expect(naOr(NA, true)).toBe(true);
      expect(naOr(false, true)).toBe(false);
    });

    it('validates numbers', () => {
      expect(isValidNumber(42)).toBe(true);
      expect(isValidNumber(3.14)).toBe(true);
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(-1)).toBe(true);
      expect(isValidNumber(NA)).toBe(false);
      expect(isValidNumber('42')).toBe(false);
      expect(isValidNumber(true)).toBe(false);
    });

    it('propagates na', () => {
      expect(propagateNa(1, 2, 3)).toBe(false);
      expect(propagateNa(1, NA, 3)).toBe(true);
      expect(propagateNa(NA)).toBe(true);
    });

    it('evaluates pineTruthy', () => {
      expect(pineTruthy(NA)).toBe(false);
      expect(pineTruthy(0)).toBe(false);
      expect(pineTruthy(1)).toBe(true);
      expect(pineTruthy(-1)).toBe(true);
      expect(pineTruthy(true)).toBe(true);
      expect(pineTruthy(false)).toBe(false);
      expect(pineTruthy('')).toBe(false);
      expect(pineTruthy('hello')).toBe(true);
      expect(pineTruthy(null)).toBe(false);
    });
  });

  describe('type coercion', () => {
    it('coerces int to float', () => {
      const result = coerce(42, FLOAT_TYPE);
      expect(result.value).toBe(42);
      expect(result.type).toBe(FLOAT_TYPE);
    });

    it('coerces bool to int', () => {
      const result = coerce(true, INT_TYPE);
      expect(result.value).toBe(1);
    });

    it('coerces bool to float', () => {
      const result = coerce(true, FLOAT_TYPE);
      expect(result.value).toBe(1.0);
      expect(result.type).toBe(FLOAT_TYPE);
    });

    it('coerces false to int', () => {
      const result = coerce(false, INT_TYPE);
      expect(result.value).toBe(0);
    });

    it('coerces false to float', () => {
      const result = coerce(false, FLOAT_TYPE);
      expect(result.value).toBe(0.0);
      expect(result.type).toBe(FLOAT_TYPE);
    });

    it('coerces string to int', () => {
      const result = coerce('42', INT_TYPE);
      expect(result.value).toBe(42);
      expect(result.type).toBe(INT_TYPE);
    });

    it('coerces string to float', () => {
      const result = coerce('3.14', FLOAT_TYPE);
      expect(result.value).toBe(3.14);
      expect(result.type).toBe(FLOAT_TYPE);
    });

    it('coerces number to string', () => {
      const result = coerce(42, STRING_TYPE);
      expect(result.value).toBe('42');
      expect(result.type).toBe(STRING_TYPE);
    });

    it('coerces bool to string', () => {
      const result = coerce(true, STRING_TYPE);
      expect(result.value).toBe('true');
      expect(result.type).toBe(STRING_TYPE);
    });

    it('coerces na to any type', () => {
      const result = coerce(NA, INT_TYPE);
      expect(isNa(result.value)).toBe(true);
    });

    it('throws on invalid string to int', () => {
      expect(() => coerce('hello', INT_TYPE)).toThrow(CompileError);
    });

    it('throws on invalid string to float', () => {
      expect(() => coerce('hello', FLOAT_TYPE)).toThrow(CompileError);
    });

    it('throws on invalid color', () => {
      expect(() => coerce('red', COLOR_TYPE)).toThrow(CompileError);
    });

    it('coerces valid hex color', () => {
      const result = coerce('#FF0000', COLOR_TYPE);
      expect(result.value).toBe('#FF0000');
      expect(result.type).toBe(COLOR_TYPE);
    });
  });

  describe('getCommonType', () => {
    it('finds common numeric type', () => {
      const common = getCommonType(INT_TYPE, FLOAT_TYPE);
      expect(common.name).toBe('float');
    });

    it('returns same type when both are same', () => {
      const common = getCommonType(INT_TYPE, INT_TYPE);
      expect(common.name).toBe('int');
    });

    it('returns float when both are float', () => {
      const common = getCommonType(FLOAT_TYPE, FLOAT_TYPE);
      expect(common.name).toBe('float');
    });

    it('handles na type', () => {
      const common = getCommonType(NA_TYPE, INT_TYPE);
      expect(common.name).toBe('int');
    });

    it('handles any type', () => {
      const common = getCommonType(ANY_TYPE, INT_TYPE);
      expect(common.name).toBe('any');
    });

    it('throws on incompatible types', () => {
      expect(() => getCommonType(INT_TYPE, STRING_TYPE)).toThrow(CompileError);
    });

    it('preserves series when one operand is series', () => {
      const s = seriesOf(INT_TYPE);
      const common = getCommonType(s, FLOAT_TYPE);
      expect(common.isSeries).toBe(true);
    });
  });

  describe('coerceBinaryOperands', () => {
    it('handles string concatenation', () => {
      const result = coerceBinaryOperands('hello', ' world', STRING_TYPE, STRING_TYPE, '+');
      expect(result.resultType.name).toBe('string');
      expect(result.left.value).toBe('hello');
      expect(result.right.value).toBe(' world');
    });

    it('handles numeric operations', () => {
      const result = coerceBinaryOperands(1, 2.0, INT_TYPE, FLOAT_TYPE, '+');
      expect(result.resultType.name).toBe('float');
    });
  });

  describe('type assignability', () => {
    it('allows int to float assignment', () => {
      expect(isAssignable(INT_TYPE, FLOAT_TYPE)).toBe(true);
    });

    it('disallows float to int assignment', () => {
      expect(isAssignable(FLOAT_TYPE, INT_TYPE)).toBe(false);
    });

    it('allows na to any type', () => {
      expect(
        isAssignable(
          { kind: 'na', name: 'na', isSeries: false, equals: () => false, toString: () => 'na' },
          INT_TYPE,
        ),
      ).toBe(true);
    });

    it('allows anything to any type', () => {
      expect(isAssignable(INT_TYPE, ANY_TYPE)).toBe(true);
      expect(isAssignable(STRING_TYPE, ANY_TYPE)).toBe(true);
      expect(isAssignable(BOOL_TYPE, ANY_TYPE)).toBe(true);
    });

    it('allows same type assignment', () => {
      expect(isAssignable(INT_TYPE, INT_TYPE)).toBe(true);
      expect(isAssignable(FLOAT_TYPE, FLOAT_TYPE)).toBe(true);
      expect(isAssignable(BOOL_TYPE, BOOL_TYPE)).toBe(true);
      expect(isAssignable(STRING_TYPE, STRING_TYPE)).toBe(true);
    });

    it('disallows cross-type assignment', () => {
      expect(isAssignable(STRING_TYPE, INT_TYPE)).toBe(false);
      expect(isAssignable(BOOL_TYPE, INT_TYPE)).toBe(false);
      expect(isAssignable(COLOR_TYPE, INT_TYPE)).toBe(false);
    });

    it('allows int to float in series', () => {
      const s = seriesOf(FLOAT_TYPE);
      expect(isAssignable(INT_TYPE, s)).toBe(true);
    });
  });

  describe('inferLiteralType', () => {
    it('infers int type', () => {
      expect(inferLiteralType(42).name).toBe('int');
    });

    it('infers float type', () => {
      expect(inferLiteralType(3.14, true).name).toBe('float');
    });

    it('infers bool type', () => {
      expect(inferLiteralType(true).name).toBe('bool');
      expect(inferLiteralType(false).name).toBe('bool');
    });

    it('infers string type', () => {
      expect(inferLiteralType('hello').name).toBe('string');
    });

    it('infers color type', () => {
      expect(inferLiteralType('#FF0000').name).toBe('color');
    });

    it('infers na type', () => {
      expect(inferLiteralType(NA).name).toBe('na');
    });

    it('infers any type for null', () => {
      expect(inferLiteralType(null).name).toBe('any');
    });
  });
});
