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
  it('should fix newResult line with extend:right when surviving prev line starts after its endpoint', () => {
    // prev (full dataset) correctly has:
    //   line_A: terminated (extend:none)          points[0]=1000
    //   line_B: terminated (extend:none)          points[0]=2000 (will be replaced)
    //   line_C: active (extend:right)             points[0]=3000
    //
    // newResult (partial re-execution on smaller dataset) has:
    //   line_A': same                          points[0]=1000, extend:none
    //   line_B': extend:right!                 points[0]=2000, endpoint=2500
    //
    // line_B' has extend:right because no later pivot in the small dataset.
    // But survivingPrevLines contains line_C (points[0]=3000 >= endpoint=2500).
    // → line_B' should be fixed to extend:none.

    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),    // line_A
        makeLine(2000, 3000, 50200, 'none'),    // line_B — terminated by later pivot
        makeLine(3000, 9999, 50500, 'right'),   // line_C — active, extends right
      ],
    };

    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),             // line_A' — same
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

    // line_A replaced by line_A' with same extend:none
    const lineA = merged.lines.find((l) => l.points[0]?.time === 1000);
    expect(lineA).toBeDefined();
    expect(lineA!.extend).toBe('none');

    // line_B' should have extend:none because survivingPrev line_C starts at 3000 >= endpoint 2500
    const lineB = merged.lines.find((l) => l.points[0]?.time === 2000);
    expect(lineB).toBeDefined();
    expect(lineB!.extend).toBe('none');
    // Color from newResult (recomputed value is authoritative)
    expect(lineB!.color).toBe('#00ff00');

    // line_C survives from prev (not replaced, not in overlap)
    const lineC = merged.lines.find((l) => l.points[0]?.time === 3000);
    expect(lineC).toBeDefined();
    expect(lineC!.extend).toBe('right');

    expect(merged.lines).toHaveLength(3);
  });

  it('should keep extend:right when no surviving prev line starts after endpoint (genuinely last)', () => {
    // If no surviving prev line exists, the newResult line really is the
    // last active line and extend:right is correct.

    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),
        makeLine(2000, 9999, 50200, 'right'),  // last line, no subsequent pivot
      ],
    };

    // Both prev lines are replaced by newResult lines. No surviving prev lines.
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),
        makeLine(2000, 2500, 50200, 'right'),  // genuinely last — keep right
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

  it('should fix even when newResult line is unmatched in prev (different pivot detection)', () => {
    // This scenario simulates what happens when the HHLL indicator's
    // findprevious() function produces different S/R levels on the
    // truncated dataset vs the full dataset. The newResult lines at the
    // boundary have DIFFERENT points[0].time than any prev line —
    // so the old matching-based fix wouldn't catch them.
    //
    // But the new fix checks all newResult lines with extend:right
    // against surviving prev lines — so it still works.

    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 1500, 50000, 'none'),    // pivot at 1000
        makeLine(1500, 3000, 50200, 'none'),    // pivot at 1500, terminated by later
        makeLine(3000, 9999, 50500, 'right'),   // active pivot at 3000
      ],
    };

    // newResult found a different S/R structure in the overlap zone:
    // no pivot at 1500 (different findprevious results), so the last
    // line starts at 2000 and extends right incorrectly.
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),         // same first line
        makeLine(2000, 2500, 50400, 'right', '#00cc00'), // DIFFERENT: starts at 2000, no prev match
      ],
    };

    const addedCount = 10;
    const contextSize = 5;
    // overlap covers bars 1500-2500
    const overlapTimestamps = new Set<number>([1500, 2000, 2500]);

    const merged = prependIndicatorResult(
      prev,
      newResult,
      addedCount,
      contextSize,
      overlapTimestamps,
    );

    // line at 1000 replaced by new version
    const lineA = merged.lines.find((l) => l.points[0]?.time === 1000);
    expect(lineA).toBeDefined();
    expect(lineA!.extend).toBe('none');

    // line at 2000 from newResult has extend:right, but surviving prev
    // line at 3000 starts after its endpoint (2500) → should be fixed
    const lineUnmatched = merged.lines.find((l) => l.points[0]?.time === 2000);
    expect(lineUnmatched).toBeDefined();
    expect(lineUnmatched!.extend).toBe('none');  // FIXED by surviving prev line
    expect(lineUnmatched!.color).toBe('#00cc00');

    // line at 1500 from prev was in overlap and NOT replaced (newResult has
    // no line with points[0]=1500) → dropped entirely
    const line1500 = merged.lines.find((l) => l.points[0]?.time === 1500);
    expect(line1500).toBeUndefined();

    // line at 3000 survives from prev
    const lineC = merged.lines.find((l) => l.points[0]?.time === 3000);
    expect(lineC).toBeDefined();
    expect(lineC!.extend).toBe('right');

    // Should have 3 lines
    expect(merged.lines).toHaveLength(3);
  });

  it('should handle border-of-chunk: multiple lines with extend:right in newResult, all fixed by surviving prev', () => {
    // When the truncated re-execution produces MANY lines (more S/R
    // level changes than the original), the last line correctly has
    // extend:right, but earlier lines in the batch also had it set
    // temporarily during execution. The backend only reports the FINAL
    // state of each line, so only the last line has extend:right.
    // But if the original had even more changes beyond the dataset,
    // the last newResult line still needs fixing.
    //
    // This test verifies the simple case: one newResult line with
    // extend:right, fixed by surviving prev.

    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),
        makeLine(2000, 9999, 50200, 'right'),  // last in full data
      ],
    };

    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(1000, 2000, 50000, 'none'),
        makeLine(2000, 2500, 50200, 'right'),  // last in partial data
      ],
    };

    const merged = prependIndicatorResult(
      prev,
      newResult,
      10,
      5,
      new Set<number>([2000, 2500]),
    );

    // Both prev lines are replaced (all in overlap or matched).
    // No surviving prev lines. So line at 2000 keeps extend:right.
    const lineB = merged.lines.find((l) => l.points[0]?.time === 2000);
    expect(lineB).toBeDefined();
    expect(lineB!.extend).toBe('right');
  });
});
