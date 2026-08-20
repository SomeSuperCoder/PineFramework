/**
 * Deterministic synthetic demo series for the landing's chart panels
 * (DESIGN §2.2 / §2.4 / §2.5 — all demo data stays labeled SYNTHETIC DEMO).
 *
 * The series are generated ONCE at module load from a fixed seed — never
 * Math.random at render — so every visit and every test sees identical data.
 */

export interface SeriesPoint {
  /** Category label (week / month / hour) — hidden axis, tooltip label source. */
  step: string;
  /** Value at that step. */
  value: number;
}

/** Tiny seeded PRNG (mulberry32) — deterministic, zero dependencies. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rising trend with bounded noise; the final point is pinned exactly to `end`
 *  so the chart's last value matches the panel's stat tile. */
function buildRisingSeries(
  count: number,
  start: number,
  end: number,
  seed: number,
  noise: number,
): number[] {
  const rnd = mulberry32(seed);
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    const trend = start + (end - start) * progress;
    const wobble = (rnd() - 0.5) * noise;
    values.push(Math.round((trend + wobble) * 10) / 10);
  }
  values[count - 1] = end;
  return values;
}

/** Hero mini-chart — 16 weekly points, +12.4% over the run (matches the stat tile). */
export const heroSeries: SeriesPoint[] = buildRisingSeries(16, 100, 112.4, 0x5eed, 1.4).map(
  (value, i) => ({ step: `W${i + 1}`, value }),
);

/** Backtest equity curve — 24 monthly points, +18.7% over the run (matches the stat tile). */
export const equitySeries: SeriesPoint[] = buildRisingSeries(24, 100, 118.7, 0x9e9, 2.2).map(
  (value, i) => ({ step: `M${i + 1}`, value }),
);

/** Bot activity sparkline — 12 hourly bars, small trade counts. */
export const botActivity: SeriesPoint[] = (() => {
  const rnd = mulberry32(0xb07);
  return Array.from({ length: 12 }, (_, i) => ({
    step: `${String(i + 1).padStart(2, '0')}:00`,
    value: Math.floor(rnd() * 4) + (i % 3 === 0 ? 1 : 0),
  }));
})();
