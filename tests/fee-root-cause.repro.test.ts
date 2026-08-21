/**
 * ROOT-CAUSE REPRO — jupiter-fee-fetcher live-fetched DEX fee anomaly.
 * Observed: dexFeeBps = 0.25 instead of the intended 25 bps (100x undercharge).
 *
 * This throwaway repro (bug-hunter evidence, NOT a production test) proves the
 * weighted-average block in `callJupiterApi` divides by 100 TWICE:
 *   - line 313: `totalBps += stepBps * (weight / 100)`   ← normalizes weight to fraction
 *   - line 323: `Math.round((totalBps / totalWeight) * 100) / 100`  ← then divides by
 *     totalWeight, which is STILL IN PERCENT units (e.g. 100 for a single 100% step)
 *
 * For a single 100%-weight step at 25 bps: 25 * (100/100) = 25; then
 * round((25 / 100) * 100) / 100 = 0.25. Exactly the observed anomaly.
 *
 * Run: pnpm vitest run fee-root-cause.repro.test.ts
 */
import { describe, it, expect } from 'vitest';
import { fetchDexFeeBps } from '../src/strategy/jupiter-fee-fetcher.js';

// ---------------------------------------------------------------------------
// Verbatim replication of src/strategy/jupiter-fee-fetcher.ts
// ---------------------------------------------------------------------------

// KNOWN_DEX_FEES (lines 68-101) — abridged replica with the labels used here
const KNOWN_DEX_FEES_REPLICA: Record<string, number> = {
  Raydium: 25,
  'Raydium CPMM': 25,
  'Raydium CLMM': 20,
  Orca: 20,
  'Orca V2': 20,
  'Orca Whirlpool': 20,
  'Meteora DLMM': 10,
  'Meteora Pools': 10,
  DEFAULT: 25,
};

// getKnownFeeBps (lines 214-225) — verbatim logic
function getKnownFeeBps(label: string): number {
  const exact = KNOWN_DEX_FEES_REPLICA[label];
  if (exact !== undefined) return exact;
  for (const [key, fee] of Object.entries(KNOWN_DEX_FEES_REPLICA)) {
    if (label.toLowerCase().includes(key.toLowerCase())) {
      return fee;
    }
  }
  return KNOWN_DEX_FEES_REPLICA.DEFAULT;
}

// computeStepBps Strategy 2 (lines 269-274) — known DEX fee by label.
// NOTE: 'Quantum', 'GoonFi V2', 'Aquifer', 'AlphaQ', 'Manifest' are NOT in the
// real KNOWN_DEX_FEES table either → they all fall back to DEFAULT (25 bps).
function computeStepBps(step: { swapInfo: { label?: string } }): number {
  if (step.swapInfo.label) return getKnownFeeBps(step.swapInfo.label);
  return 0;
}

// The EXACT weighted-average block from callJupiterApi (lines 304-324), verbatim.
function weightedAverageBuggy(
  routePlan: Array<{ percent?: number; swapInfo: { label?: string } }>,
): number {
  const labels = new Set<string>();
  let totalBps = 0;
  let totalWeight = 0;

  for (const step of routePlan) {
    const stepBps = computeStepBps(step);
    const weight = step.percent ?? 100;
    totalBps += stepBps * (weight / 100); // <-- LINE 313 (bug half 1)
    totalWeight += weight; // <-- LINE 314
    if (step.swapInfo.label) {
      labels.add(step.swapInfo.label);
    }
  }

  const dexFeeBps =
    totalBps > 0 && totalWeight > 0
      ? Math.round((totalBps / totalWeight) * 100) / 100 // <-- LINE 323 (bug half 2)
      : KNOWN_DEX_FEES_REPLICA.DEFAULT;

  return dexFeeBps;
}

// The MINIMAL-FIX variant: line 313 drops the `(weight / 100)` normalization —
// a standard weighted average (Σ stepBps*weight / Σ weight).
function weightedAverageFixed(
  routePlan: Array<{ percent?: number; swapInfo: { label?: string } }>,
): number {
  const labels = new Set<string>();
  let totalBps = 0;
  let totalWeight = 0;

  for (const step of routePlan) {
    const stepBps = computeStepBps(step);
    const weight = step.percent ?? 100;
    totalBps += stepBps * weight; // <-- FIX: no /100
    totalWeight += weight;
    if (step.swapInfo.label) {
      labels.add(step.swapInfo.label);
    }
  }

  const dexFeeBps =
    totalBps > 0 && totalWeight > 0
      ? Math.round((totalBps / totalWeight) * 100) / 100
      : KNOWN_DEX_FEES_REPLICA.DEFAULT;

  return dexFeeBps;
}

// A routePlan step shaped exactly like the real Jupiter Quote API response:
//   { percent, swapInfo: { label, inAmount, outAmount, feeAmount?, feeMint? } }
// Jupiter's `percent` is a percentage 0-100; a single-step route is percent=100.

const SINGLE_QUANTUM_STEP = [{ percent: 100, swapInfo: { label: 'Quantum' } }]; // cached SOLUSDT route

describe('root cause: callJupiterApi weighted average divides by 100 twice', () => {
  it('SOLUSDT-equivalent: single Quantum step (→ DEFAULT 25 bps) yields 0.25, not 25', () => {
    const buggy = weightedAverageBuggy(SINGLE_QUANTUM_STEP);
    const fixed = weightedAverageFixed(SINGLE_QUANTUM_STEP);
    console.log(
      `[REPRO] single step label=Quantum percent=100 → computeStepBps=25 → ` +
        `BUGGY dexFeeBps=${buggy} (observed) | FIXED=${fixed} (intended)`,
    );
    expect(buggy).toBe(0.25); // ← the anomaly, reproduced
    expect(fixed).toBe(25); // ← the intended value
  });

  it('multi-step route also 100x too small (0.16 vs 16 for 25/40% + 10/60%)', async () => {
    const twoStep = [
      { percent: 40, swapInfo: { label: 'Raydium' } }, // 25 bps
      { percent: 60, swapInfo: { label: 'Meteora DLMM' } }, // 10 bps
    ];
    const buggy = weightedAverageBuggy(twoStep);
    const fixed = weightedAverageFixed(twoStep);
    console.log(`[REPRO] two steps 40%/60% (25+10 bps) → BUGGY=${buggy} | FIXED=${fixed}`);
    expect(buggy).toBe(0.16); // wrong: (25*0.4 + 10*0.6) / 100 = 0.16
    expect(fixed).toBe(16); // correct weighted average
  });

  it('live probe: real fetchDexFeeBps("SOLUSDT") returns a sane fee (fix verified, was 0.25)', async () => {
    const result = await fetchDexFeeBps('SOLUSDT');
    console.log(`[REPRO] real fetchDexFeeBps('SOLUSDT') → ${JSON.stringify(result)}`);
    // FIX VERIFIED: the weighted-average no longer divides by 100 twice, so a
    // live single-step route returns the real fee (≥1 bps), not the old
    // corrupted 0.25 artifact. Live value may vary by route — the floor is 1 bps.
    expect(result.dexFeeBps).toBeGreaterThanOrEqual(1);
    expect(['cache', 'api']).toContain(result.source);
  });
});
