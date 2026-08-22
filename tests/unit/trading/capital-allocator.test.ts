/**
 * Unit tests for CapitalAllocator (OpenSpec change: multi-world-portfolio-trading,
 * design decision D5 / spec world-capital-allocation).
 *
 * Runner: vitest (`pnpm test`). NOTE: the spawn brief said "Jest" but the project's
 * live runner is vitest (jest.config.js is a .bak) — these match the existing suite.
 *
 * Locked property (spec example): worlds +2/+3/+5%, capital 20 -> exactly 4/6/10.
 */
import { describe, it, expect } from 'vitest';
import {
  allocateCapital,
  DefaultCapitalAllocator,
  type WorldWeight,
} from '../../../src/trading/capital-allocator.js';

const sumOf = (m: Map<string, number>): number =>
  [...m.values()].reduce((s, v) => s + v, 0);

describe('allocateCapital — locked spec scenario', () => {
  it('20 USDC across +2/+3/+5% -> exactly 4/6/10', () => {
    const worlds: WorldWeight[] = [
      { id: 'A', pnl: 2 },
      { id: 'B', pnl: 3 },
      { id: 'C', pnl: 5 },
    ];
    const result = allocateCapital(20, worlds);
    expect(result.get('A')).toBe(4);
    expect(result.get('B')).toBe(6);
    expect(result.get('C')).toBe(10);
    expect(sumOf(result)).toBe(20);
  });
});

describe('allocateCapital — sum invariant', () => {
  const cases: Array<[number, WorldWeight[]]> = [
    [100, [{ id: 'A', pnl: 1 }, { id: 'B', pnl: 1 }, { id: 'C', pnl: 1 }]],
    [137, [{ id: 'x', pnl: 7 }, { id: 'y', pnl: 13 }, { id: 'z', pnl: 5 }]],
    [999, [{ id: 'a', pnl: 2.5 }, { id: 'b', pnl: 3.1 }, { id: 'c', pnl: 9.9 }]],
    [7, [{ id: 'p', pnl: 1 }, { id: 'q', pnl: 1000 }]],
  ];
  for (const [total, worlds] of cases) {
    it(`sum of slices === ${total} for ${worlds.map((w) => w.id).join(',')}`, () => {
      const result = allocateCapital(total, worlds);
      expect(sumOf(result)).toBe(total);
    });
  }
});

describe('allocateCapital — fractional dust handling', () => {
  it('100 USDC across equal 1/1/1 -> 34/33/33 (dust to first world, deterministic)', () => {
    const worlds: WorldWeight[] = [
      { id: 'A', pnl: 1 },
      { id: 'B', pnl: 1 },
      { id: 'C', pnl: 1 },
    ];
    const result = allocateCapital(100, worlds);
    expect(result.get('A')).toBe(34);
    expect(result.get('B')).toBe(33);
    expect(result.get('C')).toBe(33);
    expect(sumOf(result)).toBe(100);
  });

  it('dust goes to the world with the largest remainder (10 across 1/2 -> 3/7)', () => {
    const worlds: WorldWeight[] = [
      { id: 'A', pnl: 1 },
      { id: 'B', pnl: 2 },
    ];
    const result = allocateCapital(10, worlds);
    expect(result.get('A')).toBe(3);
    expect(result.get('B')).toBe(7);
    expect(sumOf(result)).toBe(10);
  });

  it('allocates in integer cents when unit=0.01 and still sums exactly', () => {
    const worlds: WorldWeight[] = [
      { id: 'A', pnl: 1 },
      { id: 'B', pnl: 2 },
    ];
    const result = allocateCapital(10.05, worlds, { unit: 0.01 });
    expect(sumOf(result)).toBeCloseTo(10.05, 10);
    // each slice is a whole multiple of 0.01
    for (const v of result.values()) expect(Math.round(v * 100) / 100).toBe(v);
  });
});

describe('allocateCapital — edge cases', () => {
  it('single world -> full capital', () => {
    const result = allocateCapital(42, [{ id: 'only', pnl: 5 }]);
    expect(result.get('only')).toBe(42);
    expect(result.size).toBe(1);
  });

  it('zero-PnL worlds are skipped', () => {
    const worlds: WorldWeight[] = [
      { id: 'A', pnl: 0 },
      { id: 'B', pnl: 3 },
      { id: 'C', pnl: 0 },
      { id: 'D', pnl: 5 },
    ];
    const result = allocateCapital(20, worlds);
    expect(result.has('A')).toBe(false);
    expect(result.has('C')).toBe(false);
    // Allocating only B(3) and D(5) -> 3:5 of 20 = 7.5/12.5. Both worlds have
    // remainder 0.5; the documented tie-break sends the dust unit to the
    // LARGEST weight (D=5), so B=7 and D=13 (not 8/12).
    expect(result.get('B')).toBe(7);
    expect(result.get('D')).toBe(13);
    expect(sumOf(result)).toBe(20);
  });

  it('all zero/negative PnL -> empty map (nothing to allocate)', () => {
    const result = allocateCapital(20, [
      { id: 'A', pnl: 0 },
      { id: 'B', pnl: -2 },
    ]);
    expect(result.size).toBe(0);
  });

  it('zero/negative total -> empty map', () => {
    expect(allocateCapital(0, [{ id: 'A', pnl: 3 }]).size).toBe(0);
    expect(allocateCapital(-5, [{ id: 'A', pnl: 3 }]).size).toBe(0);
  });
});

describe('DefaultCapitalAllocator (DI seam)', () => {
  it('implements CapitalAllocator and matches allocateCapital', () => {
    const allocator = new DefaultCapitalAllocator();
    const worlds: WorldWeight[] = [
      { id: 'A', pnl: 2 },
      { id: 'B', pnl: 3 },
      { id: 'C', pnl: 5 },
    ];
    const result = allocator.allocate(20, worlds);
    expect(result.get('A')).toBe(4);
    expect(result.get('B')).toBe(6);
    expect(result.get('C')).toBe(10);
  });
});
