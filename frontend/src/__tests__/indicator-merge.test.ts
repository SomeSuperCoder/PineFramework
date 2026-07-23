import { describe, it, expect } from 'vitest';
import { prependIndicatorResult } from '../hooks/indicator-merge';
import type { ScriptResult } from '../types';
import type { LineData } from '../types';

const EMPTY_RESULT: ScriptResult = {
  overlay: true,
  plots: [],
  shapes: [],
  lines: [],
  boxes: [],
  labels: [],
  tables: [],
};

function makeLine(
  time1: number,
  time2: number,
  price: number,
  extend: 'none' | 'right' = 'none',
  color = '#ff0000',
): LineData {
  return {
    points: [
      { time: time1, price },
      { time: time2, price },
    ],
    color,
    width: 1,
    style: 'dotted',
    extend,
  };
}

describe('prependIndicatorResult line extend fix', () => {
  it('should keep extend:none from prev when newResult incorrectly has extend:right', () => {
    // Simulate HHLL S/R lines after scroll-back prepend.
    //
    // prev (full dataset) correctly has:
    //   line_A: terminated (extend:none)
    //   line_B: terminated (extend:none)  -- replaced in overlap
    //   line_C: active (extend:right)
    //
    // newResult (partial re-execution on smaller dataset) has:
    //   line_A': same as original (extend:none)
    //   line_B': extend:right! (last line in partial data, no subsequent pivot)
    //
    // After merge, line_B' should stay extend:none because prev had
    // the full-context knowledge that it was terminated.

    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),    // line_A
        makeLine(2000, 3000, 50200, 'none'),    // line_B — terminated by later pivot
        makeLine(3000, 9999, 50500, 'right'),   // line_C — active, extends right
      ],
    };

    // Re-execution on small dataset only covers up to time 2500
    // (newBars + contextBars). No subsequent pivot after 2000 exists.
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),         // line_A' — same
        makeLine(2000, 2500, 50200, 'right', '#00ff00'), // line_B' — WRONG: extend:right
      ],
    };

    const addedCount = 5;
    const contextSize = 5;
    const overlapTimestamps = new Set<number>([2000, 2500]);

    const merged = prependIndicatorResult(
      prev,
      newResult,
      addedCount,
      contextSize,
      overlapTimestamps,
    );

    // line_A should be replaced by line_A' with same extend:none
    const lineA = merged.lines.find((l) => l.points[0]?.time === 1000);
    expect(lineA).toBeDefined();
    expect(lineA!.extend).toBe('none');

    // line_B' should have extend:none, NOT extend:right
    // because prev had it as none (terminated by later pivot at 3000)
    const lineB = merged.lines.find((l) => l.points[0]?.time === 2000);
    expect(lineB).toBeDefined();
    expect(lineB!.extend).toBe('none');
    // The color should be from newResult (the recomputed value is authoritative)
    expect(lineB!.color).toBe('#00ff00');

    // line_C should still be present from prev (not replaced, not in overlap)
    const lineC = merged.lines.find((l) => l.points[0]?.time === 3000);
    expect(lineC).toBeDefined();
    expect(lineC!.extend).toBe('right');

    // Should have exactly 3 lines
    expect(merged.lines).toHaveLength(3);
  });

  it('should keep extend:right when prev also had extend:right (genuinely last line)', () => {
    // If the line from prev was actually the last active line (extend:right),
    // then the newResult's extend:right is correct — no fix needed.

    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),
        makeLine(2000, 9999, 50200, 'right'),  // last line, no subsequent pivot
      ],
    };

    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),
        makeLine(2000, 2500, 50200, 'right'),  // correctly extend:right
      ],
    };

    const merged = prependIndicatorResult(
      prev,
      newResult,
      5,
      5,
      new Set<number>([2000]),
    );

    const lineB = merged.lines.find((l) => l.points[0]?.time === 2000);
    expect(lineB).toBeDefined();
    expect(lineB!.extend).toBe('right');
  });

  it('should handle case where newResult has no matching prev line (new pivot)', () => {
    // If a line from newResult has no match in prev, it's a genuinely new
    // pivot not seen before. Its extend should be kept as-is.

    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),
        makeLine(2000, 9999, 50200, 'right'),
      ],
    };

    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),
        makeLine(2000, 2500, 50200, 'right'),
        makeLine(2500, 2600, 50300, 'right'),  // brand new line, no prev match
      ],
    };

    const merged = prependIndicatorResult(
      prev,
      newResult,
      10,
      5,
      new Set<number>([2000, 2500]),
    );

    const lineC = merged.lines.find((l) => l.points[0]?.time === 2500);
    expect(lineC).toBeDefined();
    expect(lineC!.extend).toBe('right');  // no prev to correct it
  });
});
