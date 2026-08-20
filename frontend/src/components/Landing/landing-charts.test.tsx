import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BotBarChart, EquityAreaChart, HeroAreaChart } from './landing-charts';
import { botActivity } from './demo-data';

/**
 * Chart render smoke (landing v2 — DESIGN §2.2/§2.4/§2.5):
 * each interactive shadcn chart must render with the deterministic demo data
 * without crashing. The render must NOT consume Math.random — data comes from
 * demo-data.ts module-level constants.
 *
 * jsdom quirk: recharts' ResponsiveContainer reads the container's
 * getBoundingClientRect() on mount and OVERWRITES its initialDimension with
 * whatever it measures — jsdom always reports 0×0, so the chart would render
 * nothing. We stub the rect to a real size (test-only, restored after).
 */
beforeAll(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 200,
        width: 320,
        height: 200,
        toJSON: () => ({}),
      }) as DOMRect,
  );
});

afterAll(() => {
  vi.restoreAllMocks();
});

function expectChartRendered(container: HTMLElement) {
  // shadcn ChartContainer marks the chart root with data-slot="chart".
  expect(container.querySelector('[data-slot="chart"]')).not.toBeNull();
  // recharts mounts a wrapper + surface inside the ResponsiveContainer.
  expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
  expect(container.querySelector('.recharts-surface')).not.toBeNull();
}

describe('landing charts (render smoke)', () => {
  it('HeroAreaChart renders with the hero demo data', () => {
    const { container } = render(<HeroAreaChart />);
    expectChartRendered(container);
    // The Area series layer + its monotone curve only mount when data exists.
    expect(container.querySelector('.recharts-area')).not.toBeNull();
    expect(container.querySelector('.recharts-curve')).not.toBeNull();
  });

  it('EquityAreaChart renders with the equity demo data', () => {
    const { container } = render(<EquityAreaChart />);
    expectChartRendered(container);
    expect(container.querySelector('.recharts-area')).not.toBeNull();
    expect(container.querySelector('.recharts-curve')).not.toBeNull();
  });

  it('BotBarChart renders with the bot activity demo data — one bar per point', () => {
    const { container } = render(<BotBarChart />);
    expectChartRendered(container);
    // One rectangle per non-zero bar — the 12-point series contains 2 zero
    // values, and a zero-height bar renders no rectangle.
    const nonZeroBars = botActivity.filter((p) => p.value > 0).length;
    expect(nonZeroBars).toBe(10);
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(nonZeroBars);
  });
});