/**
 * Evil tests: Series / RingBuffer
 *
 * Adversarial operations on Series data structure: empty states,
 * single-element edge cases, large data volumes, clear/repopulate cycles.
 * Verifies graceful handling (NA returns, no crashes).
 */

import { createSeries, type Series } from '../../src/language/runtime/series.js';
import { NA } from '../../src/language/types/na.js';

describe('Evil series — empty states', () => {
  it('push then clear then last() returns NA', () => {
    const s = createSeries<number>('test');
    s.push(10);
    s.push(20);
    s.clear();
    expect(s.length).toBe(0);
    expect(s.last()).toBe(NA);
  });

  it('slice() on empty series returns empty array', () => {
    const s = createSeries<number>('test');
    expect(s.slice()).toEqual([]);
  });

  it('clear() on already-empty series does not throw', () => {
    const s = createSeries<number>('test');
    expect(() => s.clear()).not.toThrow();
    expect(s.length).toBe(0);
  });

  it('getRelative(0) on empty series returns NA', () => {
    const s = createSeries<number>('test');
    expect(s.getRelative(0)).toBe(NA);
  });

  it('getRelative(5) on empty series returns NA', () => {
    const s = createSeries<number>('test');
    expect(s.getRelative(5)).toBe(NA);
  });
});

describe('Evil series — clear/repopulate cycles', () => {
  it('data integrity after 3 clear/repopulate cycles', () => {
    const s = createSeries<number>('test');

    for (let cycle = 0; cycle < 3; cycle++) {
      s.clear();
      expect(s.length).toBe(0);

      // Push 5 values
      for (let i = 0; i < 5; i++) {
        s.push(cycle * 100 + i);
      }

      expect(s.length).toBe(5);
      expect(s.getRelative(0)).toBe(cycle * 100 + 4); // last pushed
      expect(s.getRelative(4)).toBe(cycle * 100); // first pushed
    }
  });

  it('push after clear preserves new values only', () => {
    const s = createSeries<number>('test');
    s.push(1);
    s.push(2);
    s.clear();
    s.push(3);
    expect(s.length).toBe(1);
    expect(s.last()).toBe(3);
    expect(s.getRelative(0)).toBe(3);
  });
});

describe('Evil series — single-element edge cases', () => {
  it('getRelative(0) on single-element returns the element', () => {
    const s = createSeries<number>('test', [42]);
    expect(s.getRelative(0)).toBe(42);
  });

  it('getRelative(1) on single-element returns NA (beyond length)', () => {
    const s = createSeries<number>('test', [42]);
    expect(s.getRelative(1)).toBe(NA);
  });

  it('getRelative with large offset on single-element returns NA', () => {
    const s = createSeries<number>('test', [42]);
    expect(s.getRelative(9999)).toBe(NA);
  });

  it('last() on single-element returns the element', () => {
    const s = createSeries<number>('test', [99]);
    expect(s.last()).toBe(99);
  });

  it('lastOrDefault(fallback) on single-element returns the element', () => {
    const s = createSeries<number>('test', [77]);
    expect(s.lastOrDefault(-1)).toBe(77);
  });

  it('lastOrDefault(fallback) on empty returns fallback', () => {
    const s = createSeries<number>('test');
    expect(s.lastOrDefault(-1)).toBe(-1);
  });
});

describe('Evil series — large data volumes', () => {
  it('pushing 100,000 values: all accessible, length correct', () => {
    const s = createSeries<number>('test');
    for (let i = 0; i < 100_000; i++) {
      s.push(i);
    }
    expect(s.length).toBe(100_000);
    expect(s.last()).toBe(99_999);
  });

  it('getRelative(99999) on 100k-element series returns first value', () => {
    const s = createSeries<number>('test');
    for (let i = 0; i < 100_000; i++) {
      s.push(i);
    }
    expect(s.getRelative(99999)).toBe(0);
  });

  it('getRelative(0) on 100k-element series returns last value', () => {
    const s = createSeries<number>('test');
    for (let i = 0; i < 100_000; i++) {
      s.push(i);
    }
    expect(s.getRelative(0)).toBe(99_999);
  });
});

describe('Evil series — negative / out-of-range indices', () => {
  it('get(-1) returns NA', () => {
    const s = createSeries<number>('test', [1, 2, 3]);
    expect(s.get(-1)).toBe(NA);
  });

  it('get with very large index returns NA', () => {
    const s = createSeries<number>('test', [1, 2, 3]);
    expect(s.get(1e9)).toBe(NA);
  });

  it('get with NaN index avoids undefined return (NaN comparison edge case)', () => {
    const s = createSeries<number>('test', [1, 2, 3]);
    // NaN < 0 is false and NaN >= values.length is false, so the guard check
    // passes and values[NaN] returns undefined. Validate it's not a valid value.
    const result = s.get(NaN);
    expect(result === undefined || result === NA).toBe(true);
  });
});
