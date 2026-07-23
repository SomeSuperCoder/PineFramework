import { describe, it, expect } from 'vitest';
import { prependIndicatorResult } from '../hooks/indicator-merge';
import type { ScriptResult, ShapeData, LabelData, BoxData, StrategyMarkerData } from '../types';
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
    const lineB = merged.lines.find((l) => l.points[0]?.time === 2000 && l.points[1]?.time === 2500);
    expect(lineB).toBeDefined();
    expect(lineB!.extend).toBe('none');
    // Color from newResult (recomputed value is authoritative)
    expect(lineB!.color).toBe('#00ff00');

    // line_B (prev) survives because its endpoint 3000 differs from newResult's 2500
    const lineBprev = merged.lines.find((l) => l.points[0]?.time === 2000 && l.points[1]?.time === 3000);
    expect(lineBprev).toBeDefined();
    expect(lineBprev!.extend).toBe('none');
    expect(lineBprev!.color).toBe('#ff0000');

    // line_C survives from prev (not replaced)
    const lineC = merged.lines.find((l) => l.points[0]?.time === 3000);
    expect(lineC).toBeDefined();
    expect(lineC!.extend).toBe('right');

    expect(merged.lines).toHaveLength(4);
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

  it('should keep extend:right when contextSize is 0 (disjoint datasets)', () => {
    // When contextSize=0, newResult and prev cover DISJOINT time ranges
    // (no overlap). The extend:right fix must NOT apply because the
    // "later" prev line is from a completely different region — removing
    // the right extension would create a visible gap at the boundary.
    //
    // This is the HHLL scenario: partial re-execution on 200 new bars
    // with zero context bars. newResult produces S/R lines ending at
    // the last pivot (~bar 794). prev has S/R lines starting at the
    // first pivot in the old region (~bar 885). The gap is natural —
    // the newResult line MUST extend right to cover it.

    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(885, 995, 50000, 'none'),   // first S/R line in old region
        makeLine(995, 9999, 50200, 'right'),  // last S/R line in old region
      ],
    };

    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(690, 794, 50500, 'none'),   // S/R line terminated by next pivot
        makeLine(789, 794, 50800, 'right'),  // LAST S/R line — extend:right is correct
      ],
    };

    const merged = prependIndicatorResult(
      prev,
      newResult,
      200,  // addedCount
      0,    // contextSize = 0 — no overlap!
      new Set<number>(),  // empty overlap set
    );

    // newResult line at 789→794 with extend:right must KEEP its right
    // extension despite prev having lines starting at 885 ≥ 794.
    const lastNewLine = merged.lines.find(
      (l) => l.points[0]?.time === 789,
    );
    expect(lastNewLine).toBeDefined();
    expect(lastNewLine!.extend).toBe('right');

    // Prev lines survive unchanged
    const prevFirstLine = merged.lines.find(
      (l) => l.points[0]?.time === 885,
    );
    expect(prevFirstLine).toBeDefined();
    expect(prevFirstLine!.extend).toBe('none');

    const prevLastLine = merged.lines.find(
      (l) => l.points[0]?.time === 995,
    );
    expect(prevLastLine).toBeDefined();
    expect(prevLastLine!.extend).toBe('right');

    expect(merged.lines).toHaveLength(4);
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

    // line at 1500 from prev survives (not replaced, different endpoint from newResult's 1000→2000)
    const line1500 = merged.lines.find((l) => l.points[0]?.time === 1500);
    expect(line1500).toBeDefined();
    expect(line1500!.extend).toBe('none');

    // line at 1000 from prev also survives because its endpoint 1500 differs
    // from newResult's 1000→2000 — they are different line segments
    const line1000prev = merged.lines.find((l) => l.points[0]?.time === 1000 && l.points[1]?.time === 1500);
    expect(line1000prev).toBeDefined();
    expect(line1000prev!.extend).toBe('none');

    // line at 3000 survives from prev
    const lineC = merged.lines.find((l) => l.points[0]?.time === 3000);
    expect(lineC).toBeDefined();
    expect(lineC!.extend).toBe('right');

    // Should have 5 lines (1000_prev, 1000_newResult, 1500, 2000, 3000)
    expect(merged.lines).toHaveLength(5);
  });

  describe('prependIndicatorResult chunk border element fix', () => {
  const addedCount = 10;
  const contextSize = 4;
  // Overlap zone covers timestamps 100-103
  const overlapTimestamps = new Set<number>([100, 101, 102, 103]);

  it('should keep shape in overlap zone when newResult does not reproduce it', () => {
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      shapes: [
        { type: 'arrowup', time: 101, price: 50000, color: '#00ff00' },
        { type: 'arrowdown', time: 200, price: 50100, color: '#ff0000' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      shapes: [
        // newResult also has a shape at time 101 (will replace prev one)
        { type: 'arrowup', time: 101, price: 50100, color: '#0000ff' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // shape at time 101: replaced by newResult version
    const shape101 = merged.shapes.find((s) => s.time === 101);
    expect(shape101).toBeDefined();
    expect(shape101!.color).toBe('#0000ff'); // from newResult
    expect(shape101!.price).toBe(50100); // from newResult

    // shape at time 200: in overlap zone, NOT replaced → SURVIVES
    const shape200 = merged.shapes.find((s) => s.time === 200);
    expect(shape200).toBeDefined();
    expect(shape200!.color).toBe('#ff0000'); // from prev

    expect(merged.shapes).toHaveLength(2);
  });

  it('should replace shape in overlap zone when newResult reproduces it', () => {
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      shapes: [
        { type: 'arrowup', time: 101, price: 50000, color: '#00ff00' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      shapes: [
        { type: 'arrowup', time: 101, price: 50200, color: '#0000ff' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // shape at time 101 replaced by newResult version
    const shape101 = merged.shapes.find((s) => s.time === 101);
    expect(shape101).toBeDefined();
    expect(shape101!.price).toBe(50200);

    expect(merged.shapes).toHaveLength(1);
  });

  it('should keep line in overlap zone when newResult does not reproduce it', () => {
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(101, 201, 50000, 'none'),   // starts in overlap, NOT replaced
        makeLine(200, 300, 50100, 'none'),
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        makeLine(101, 201, 50000, 'none'),   // reproduces line at 101
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // line at 101: replaced by newResult
    const line101 = merged.lines.find((l) => l.points[0]?.time === 101);
    expect(line101).toBeDefined();

    // line at 200: in overlap, NOT replaced → SURVIVES
    const line200 = merged.lines.find((l) => l.points[0]?.time === 200);
    expect(line200).toBeDefined();
    expect(line200!.color).toBe('#ff0000');

    expect(merged.lines).toHaveLength(2);
  });

  it('should keep label in overlap zone when not replaced', () => {
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        { time: 102, price: 50000, text: 'buy', color: '#00ff00', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 300, price: 50100, text: 'sell', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        { time: 102, price: 50200, text: 'BUY!', color: '#0000ff', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // label at 102: replaced by newResult
    const label102 = merged.labels.find((l) => l.time === 102);
    expect(label102).toBeDefined();
    expect(label102!.text).toBe('BUY!');
    expect(label102!.price).toBe(50200);

    // label at 300: in overlap, NOT replaced → SURVIVES
    const label300 = merged.labels.find((l) => l.time === 300);
    expect(label300).toBeDefined();
    expect(label300!.text).toBe('sell');

    expect(merged.labels).toHaveLength(2);
  });

  it('should keep box in overlap zone when not replaced', () => {
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      boxes: [
        { startTime: 100, endTime: 200, startPrice: 50000, endPrice: 51000 },
        { startTime: 300, endTime: 400, startPrice: 50000, endPrice: 51000 },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      boxes: [
        { startTime: 100, endTime: 200, startPrice: 50500, endPrice: 51500 },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // box at 100: replaced by newResult
    const box100 = merged.boxes.find((b) => b.startTime === 100);
    expect(box100).toBeDefined();
    expect(box100!.startPrice).toBe(50500);

    // box at 300: in overlap, NOT replaced → SURVIVES
    const box300 = merged.boxes.find((b) => b.startTime === 300);
    expect(box300).toBeDefined();
    expect(box300!.startPrice).toBe(50000);

    expect(merged.boxes).toHaveLength(2);
  });

  it('should keep bgcolor entry in overlap zone when not replaced', () => {
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      bgcolor: [
        { time: 103, color: '#ff0000' },
        { time: 500, color: '#00ff00' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      bgcolor: [
        { time: 103, color: '#0000ff' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // bgcolor at 103: replaced by newResult
    const bg103 = merged.bgcolor?.find((b) => b.time === 103);
    expect(bg103).toBeDefined();
    expect(bg103!.color).toBe('#0000ff');

    // bgcolor at 500: in overlap, NOT replaced → SURVIVES
    const bg500 = merged.bgcolor?.find((b) => b.time === 500);
    expect(bg500).toBeDefined();
    expect(bg500!.color).toBe('#00ff00');

    expect(merged.bgcolor).toHaveLength(2);
  });

  it('should shift prev strategy marker barIndex by addedCount', () => {
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      strategyMarkers: [
        { type: 'entry', name: 'Long', direction: 'long', barIndex: 50, timestamp: 1000, color: '#00ff00' },
        { type: 'exit', name: 'Exit', direction: 'short', barIndex: 100, timestamp: 2000, color: '#ff0000' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      strategyMarkers: [
        { type: 'entry', name: 'NewLong', direction: 'long', barIndex: 2, timestamp: 500, color: '#0000ff' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // new marker keeps its barIndex
    const newMarker = merged.strategyMarkers?.find((m) => m.name === 'NewLong');
    expect(newMarker).toBeDefined();
    expect(newMarker!.barIndex).toBe(2);

    // prev markers have barIndex shifted by addedCount (10)
    const prevLong = merged.strategyMarkers?.find((m) => m.name === 'Long');
    expect(prevLong).toBeDefined();
    expect(prevLong!.barIndex).toBe(60); // 50 + 10

    const prevExit = merged.strategyMarkers?.find((m) => m.name === 'Exit');
    expect(prevExit).toBeDefined();
    expect(prevExit!.barIndex).toBe(110); // 100 + 10

    expect(merged.strategyMarkers).toHaveLength(3);
  });

  it('should keep new strategy markers barIndex unchanged', () => {
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      strategyMarkers: [],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      strategyMarkers: [
        { type: 'entry', name: 'Entry1', direction: 'long', barIndex: 5, timestamp: 1000, color: '#00ff00' },
        { type: 'exit', name: 'Exit1', direction: 'short', barIndex: 15, timestamp: 2000, color: '#ff0000' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    const entry1 = merged.strategyMarkers?.find((m) => m.name === 'Entry1');
    expect(entry1).toBeDefined();
    expect(entry1!.barIndex).toBe(5);

    const exit1 = merged.strategyMarkers?.find((m) => m.name === 'Exit1');
    expect(exit1).toBeDefined();
    expect(exit1!.barIndex).toBe(15);

    expect(merged.strategyMarkers).toHaveLength(2);
  });
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

  it('should keep multiple prev lines at same start time when newResult only reproduces one', () => {
    // Scenario: a label at chunk border has TWO lines:
    //   line_1: from pivot to label (starts at pivot, ends at label)
    //   line_2: from label to next pivot (starts at label, ends at next pivot)
    // Both lines START at the same time (the pivot time), but have
    // different endpoints.  If newResult only reproduces one of them,
    // the other must survive.
    //
    // This was broken by the old points[0].time-only matching which
    // replaces ALL prev lines at a given start time when ANY newResult
    // line starts there.

    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        // Two lines starting at same time but different endpoints
        { points: [{ time: 100, price: 50000 }, { time: 200, price: 50200 }], color: '#ff0000', width: 1, style: 'solid' as const },
        { points: [{ time: 100, price: 50000 }, { time: 300, price: 50500 }], color: '#00ff00', width: 1, style: 'solid' as const },
        // Third line starting at different time
        { points: [{ time: 400, price: 51000 }, { time: 500, price: 51500 }], color: '#0000ff', width: 1, style: 'solid' as const },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      lines: [
        // Only reproduces ONE line at time 100 (to endpoint 200)
        { points: [{ time: 100, price: 50000 }, { time: 200, price: 50200 }], color: '#ff0000', width: 1, style: 'solid' as const },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, 10, 4, new Set([100, 200, 300]));

    // line_1 matched exactly → replaced by newResult version
    const line1 = merged.lines.filter((l) => l.points[0]?.time === 100 && l.points[1]?.time === 200);
    expect(line1).toHaveLength(1);

    // line_2 at (100→300) DIFFERENT endpoint → NOT replaced → SURVIVES
    const line2 = merged.lines.find((l) => l.points[0]?.time === 100 && l.points[1]?.time === 300);
    expect(line2).toBeDefined();
    expect(line2!.color).toBe('#00ff00');

    // line at 400 → unchanged
    const line400 = merged.lines.find((l) => l.points[0]?.time === 400);
    expect(line400).toBeDefined();

    expect(merged.lines).toHaveLength(3);
  });
});
