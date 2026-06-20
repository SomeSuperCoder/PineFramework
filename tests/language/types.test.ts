import {
  INT_TYPE,
  FLOAT_TYPE,
  seriesOf,
  typeFromAnnotation,
} from '../../src/language/types/pine-types.js';
import { NA, isNa, na, naOr, pineTruthy } from '../../src/language/types/na.js';
import {
  coerce,
  getCommonType,
  isAssignable,
  inferLiteralType,
} from '../../src/language/types/coercion.js';

describe('Pine type system', () => {
  describe('type definitions', () => {
    it('creates primitive types', () => {
      expect(INT_TYPE.name).toBe('int');
      expect(FLOAT_TYPE.name).toBe('float');
    });

    it('creates series types', () => {
      const s = seriesOf(FLOAT_TYPE);
      expect(s.isSeries).toBe(true);
      expect(s.toString()).toBe('series<float>');
    });

    it('parses type annotations', () => {
      const t = typeFromAnnotation('int', { isSeries: true });
      expect(t.isSeries).toBe(true);
      expect(t.toString()).toBe('series<int>');
    });
  });

  describe('na semantics', () => {
    it('identifies na values', () => {
      expect(isNa(NA)).toBe(true);
      expect(isNa(42)).toBe(false);
    });

    it('returns na with na()', () => {
      expect(na()).toBe(NA);
    });

    it('provides fallback with naOr', () => {
      expect(naOr(NA, 10)).toBe(10);
      expect(naOr(5, 10)).toBe(5);
    });

    it('evaluates pineTruthy', () => {
      expect(pineTruthy(NA)).toBe(false);
      expect(pineTruthy(0)).toBe(false);
      expect(pineTruthy(1)).toBe(true);
      expect(pineTruthy(true)).toBe(true);
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

    it('finds common numeric type', () => {
      const common = getCommonType(INT_TYPE, FLOAT_TYPE);
      expect(common.name).toBe('float');
    });

    it('infers literal types', () => {
      expect(inferLiteralType(42).name).toBe('int');
      expect(inferLiteralType(3.14, true).name).toBe('float');
      expect(inferLiteralType(true).name).toBe('bool');
      expect(inferLiteralType('hello').name).toBe('string');
      expect(inferLiteralType('#FF0000').name).toBe('color');
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
      expect(isAssignable({ kind: 'na', name: 'na', isSeries: false, equals: () => false, toString: () => 'na' }, INT_TYPE)).toBe(true);
    });
  });
});
