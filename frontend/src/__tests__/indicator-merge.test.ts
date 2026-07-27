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

  it('should terminate extend:right at first prev pivot when contextSize is 0 (disjoint datasets)', () => {
    // When contextSize=0, newResult and prev cover DISJOINT time ranges
    // (no overlap). The newResult's last S/R line must be terminated at
    // the START of the first prev line — bridging the gap without
    // over-extending past the boundary.
    //
    // This is the HHLL scenario: partial re-execution on 200 new bars
    // with zero context bars. newResult produces S/R line ending at
    // ~bar 794. prev has first S/R line starting at ~bar 885.
    // The newResult line should terminate at 885 (first prev pivot).

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
        makeLine(789, 794, 50800, 'right'),  // LAST S/R line — terminated at first prev pivot
      ],
    };

    const merged = prependIndicatorResult(
      prev,
      newResult,
      200,  // addedCount
      0,    // contextSize = 0 — no overlap!
      new Set<number>(),  // empty overlap set
    );

    // newResult line at 789→794 extended to 789→885 (first prev line start)
    // and extend set to none — bridges the gap without over-extending.
    const lastNewLine = merged.lines.find(
      (l) => l.points[0]?.time === 789,
    );
    expect(lastNewLine).toBeDefined();
    expect(lastNewLine!.extend).toBe('none');
    expect(lastNewLine!.points[1]?.time).toBe(885); // terminated at first prev pivot
    expect(lastNewLine!.points[1]?.price).toBe(50800); // price unchanged

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

  it('should keep label in overlap zone when newResult has different text+price', () => {
    // When re-execution produces labels with different text/price (due to ta.valuewhen state),
    // prev labels in the overlap zone should be KEPT (not dropped) to avoid the "wall" problem.
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        { time: 102, price: 50000, text: 'HL', color: '#00ff00', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 105, price: 50100, text: 'HH', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 300, price: 50200, text: 'LL', color: '#0000ff', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        // newResult produces labels with DIFFERENT text+price (re-execution difference)
        { time: 102, price: 50300, text: 'LH', color: '#0000ff', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 105, price: 50150, text: 'LL', color: '#ff00ff', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // label at 102: prev has "HL", newResult has "LH" (different text) → BOTH kept
    const labels102 = merged.labels.filter((l) => l.time === 102);
    expect(labels102).toHaveLength(2); // both prev and newResult

    // label at 105: prev has "HH", newResult has "LL" (different text) → BOTH kept
    const labels105 = merged.labels.filter((l) => l.time === 105);
    expect(labels105).toHaveLength(2); // both prev and newResult

    // label at 300: outside overlap → survives unchanged
    const label300 = merged.labels.find((l) => l.time === 300);
    expect(label300).toBeDefined();
    expect(label300!.text).toBe('LL');

    expect(merged.labels).toHaveLength(5); // 2+2+1
  });

  it('should replace label in overlap zone when newResult has same text+price', () => {
    // When re-execution produces labels with SAME text+price (but different timestamp),
    // prev labels in the overlap zone are replaced. But prev labels outside the overlap
    // survive even if newResult has a matching (text, price) at a different timestamp —
    // they belong to bars that are only in the prev dataset.
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        { time: 100, price: 50000, text: 'HL', color: '#00ff00', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 200, price: 50100, text: 'HH', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        // newResult produces SAME labels at DIFFERENT timestamps
        { time: 102, price: 50000, text: 'HL', color: '#00ff00', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 202, price: 50100, text: 'HH', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // prev label at 100: in overlap, same text+price as newResult label at 102 → REPLACED
    const prevLabel100 = merged.labels.find((l) => l.time === 100);
    expect(prevLabel100).toBeUndefined(); // dropped because in overlap + same text+price

    // prev label at 200: OUTSIDE overlap, survives even though newResult has same
    // text+price at time 202 — it's at a different bar not in the overlap zone
    const prevLabel200 = merged.labels.find((l) => l.time === 200);
    expect(prevLabel200).toBeDefined(); // kept — outside overlap zone
    expect(prevLabel200!.text).toBe('HH');

    // newResult labels are kept
    const newLabel102 = merged.labels.find((l) => l.time === 102);
    expect(newLabel102).toBeDefined();
    expect(newLabel102!.text).toBe('HL');

    const newLabel202 = merged.labels.find((l) => l.time === 202);
    expect(newLabel202).toBeDefined();
    expect(newLabel202!.text).toBe('HH');

    expect(merged.labels).toHaveLength(3); // newResult(102, 202) + prev(200)
  });

  it('should preserve labels outside overlap zone unchanged', () => {
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        { time: 50, price: 50000, text: 'before', color: '#00ff00', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 102, price: 50100, text: 'overlap-old', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 500, price: 50200, text: 'after', color: '#0000ff', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        { time: 102, price: 50300, text: 'overlap-new', color: '#ff00ff', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // label before overlap: survives unchanged
    const label50 = merged.labels.find((l) => l.time === 50);
    expect(label50).toBeDefined();
    expect(label50!.text).toBe('before');
    expect(label50!.price).toBe(50000);

    // label in overlap: prev has DIFFERENT text+price → both labels survive
    const labels102 = merged.labels.filter((l) => l.time === 102);
    expect(labels102).toHaveLength(2); // both prev and newResult (different text+price)
    const newLabel102 = labels102.find((l) => l.text === 'overlap-new');
    expect(newLabel102).toBeDefined();
    expect(newLabel102!.price).toBe(50300);
    const oldLabel102 = labels102.find((l) => l.text === 'overlap-old');
    expect(oldLabel102).toBeDefined();
    expect(oldLabel102!.price).toBe(50100);

    // label after overlap: survives unchanged
    const label500 = merged.labels.find((l) => l.time === 500);
    expect(label500).toBeDefined();
    expect(label500!.text).toBe('after');
    expect(label500!.price).toBe(50200);

    expect(merged.labels).toHaveLength(4); // prev(50, 102, 500) + newResult(102)
  });

  it('should produce no duplicates when re-execution produces identical labels', () => {
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        { time: 102, price: 50000, text: 'HL', color: '#00ff00', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 200, price: 50100, text: 'HH', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        // Same labels at same timestamps — no duplicates should appear
        { time: 102, price: 50000, text: 'HL', color: '#00ff00', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 200, price: 50100, text: 'HH', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // Should have exactly 2 labels, not 4
    expect(merged.labels).toHaveLength(2);

    const label102 = merged.labels.find((l) => l.time === 102);
    expect(label102).toBeDefined();
    expect(label102!.text).toBe('HL');

    const label200 = merged.labels.find((l) => l.time === 200);
    expect(label200).toBeDefined();
    expect(label200!.text).toBe('HH');
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

  describe('boundary line termination (contextSize=0)', () => {
    it('should terminate at first prev pivot when contextSize=0 and later prev line exists', () => {
      // Simulates HHLL: new chunk ends at bar 794, first prev pivot at 885.
      // The newResult line with extend:right should be terminated at 885.

      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        lines: [
          makeLine(885, 995, 50000, 'none'),
        ],
      };

      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        lines: [
          makeLine(789, 794, 50800, 'right'),
        ],
      };

      const merged = prependIndicatorResult(prev, newResult, 200, 0, new Set());

      const line = merged.lines.find((l) => l.points[0]?.time === 789);
      expect(line).toBeDefined();
      expect(line!.extend).toBe('none');
      expect(line!.points[1]?.time).toBe(885); // terminated at first prev pivot
      expect(line!.points[1]?.price).toBe(50800); // original price preserved
    });

    it('should keep extend:right when contextSize=0 and no later prev line exists', () => {
      // No surviving prev line starts after the newResult line's endpoint.
      // The line is genuinely last — keep extend:right.

      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        lines: [
          makeLine(500, 600, 50000, 'none'),  // ends before newResult line
        ],
      };

      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        lines: [
          makeLine(789, 794, 50800, 'right'),
        ],
      };

      const merged = prependIndicatorResult(prev, newResult, 200, 0, new Set());

      const line = merged.lines.find((l) => l.points[0]?.time === 789);
      expect(line).toBeDefined();
      expect(line!.extend).toBe('right'); // genuinely last — unchanged
    });

    it('should terminate at earliest prev pivot when multiple later prev lines exist', () => {
      // Multiple prev lines start after the newResult line's endpoint.
      // The termination should use the EARLIEST one.

      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        lines: [
          makeLine(885, 995, 50000, 'none'),    // first
          makeLine(995, 9999, 50200, 'right'),  // second
        ],
      };

      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        lines: [
          makeLine(789, 794, 50800, 'right'),
        ],
      };

      const merged = prependIndicatorResult(prev, newResult, 200, 0, new Set());

      const line = merged.lines.find((l) => l.points[0]?.time === 789);
      expect(line).toBeDefined();
      expect(line!.extend).toBe('none');
      expect(line!.points[1]?.time).toBe(885); // earliest, not 995
      expect(line!.points[1]?.price).toBe(50800);
    });

    it('should not modify points when contextSize>0 (existing behavior preserved)', () => {
      // When there IS overlap, the extend:right fix should set extend:none
      // but NOT modify the points (the overlap bars already cover the boundary).

      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        lines: [
          makeLine(1000, 2000, 50000, 'none'),
          makeLine(2000, 3000, 50200, 'none'),
          makeLine(3000, 9999, 50500, 'right'),
        ],
      };

      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        lines: [
          makeLine(1000, 2000, 50000, 'none'),
          makeLine(2000, 2500, 50200, 'right', '#00ff00'),
        ],
      };

      const merged = prependIndicatorResult(
        prev,
        newResult,
        5,  // addedCount
        5,  // contextSize > 0
        new Set([2000, 2500]),
      );

      const lineB = merged.lines.find(
        (l) => l.points[0]?.time === 2000 && l.points[1]?.time === 2500,
      );
      expect(lineB).toBeDefined();
      expect(lineB!.extend).toBe('none');
      // Points are NOT modified — endTime stays as original (2500)
      expect(lineB!.points[1]?.time).toBe(2500);
      expect(lineB!.points[1]?.price).toBe(50200);
      expect(lineB!.points).toHaveLength(2); // no extra points added
    });

    it('should preserve points array integrity when terminating at boundary', () => {
      // The last point's time is updated, but price and other points are unchanged.
      // Color, width, and style are preserved from the original newResult line.

      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        lines: [
          makeLine(885, 995, 50000, 'none'),
        ],
      };

      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        lines: [
          {
            points: [
              { time: 100, price: 51000 },
              { time: 200, price: 52000 },
              { time: 300, price: 53000 },
            ],
            color: '#00cc00',
            width: 3,
            style: 'dashed',
            extend: 'right',
          },
        ],
      };

      const merged = prependIndicatorResult(prev, newResult, 200, 0, new Set());

      const line = merged.lines.find((l) => l.points.length === 3);
      expect(line).toBeDefined();
      expect(line!.extend).toBe('none');
      // First two points unchanged
      expect(line!.points[0]).toEqual({ time: 100, price: 51000 });
      expect(line!.points[1]).toEqual({ time: 200, price: 52000 });
      // Last point: time updated, price preserved
      expect(line!.points[2]?.time).toBe(885);
      expect(line!.points[2]?.price).toBe(53000);
      // Other properties preserved
      expect(line!.color).toBe('#00cc00');
      expect(line!.width).toBe(3);
      expect(line!.style).toBe('dashed');
    });
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

  describe('warmup-aware merge (null-safe overlap)', () => {
    const addedCount = 10;
    const contextSize = 4;

    function makePlot(title: string, data: Array<{ time: number; value: number | null }>, color = '#ff0000') {
      return {
        type: 'line' as const,
        title,
        data,
        color,
      };
    }

    it('2.1 should keep prev value when newResult has null (warmup) in overlap', () => {
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: 0, value: 100 },  // position 0 → overlap zone
            { time: 1, value: 101 },  // position 1 → overlap zone
            { time: 2, value: 102 },  // position 2 → overlap zone
            { time: 3, value: 103 },  // position 3 → overlap zone
            { time: 4, value: 104 },  // position 4 → after overlap
          ]),
        ],
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: -10, value: null },  // new bar (addedCount)
            { time: -9, value: null },   // new bar (addedCount)
            { time: -8, value: null },   // new bar (addedCount)
            { time: -7, value: null },   // new bar (addedCount)
            { time: -6, value: null },   // new bar (addedCount)
            { time: -5, value: null },   // new bar (addedCount)
            { time: -4, value: null },   // new bar (addedCount)
            { time: -3, value: null },   // new bar (addedCount)
            { time: -2, value: null },   // new bar (addedCount)
            { time: -1, value: null },   // new bar (addedCount)
            // overlap zone — all null (warmup)
            { time: 0, value: null },    // overlap[0] = null
            { time: 1, value: null },    // overlap[1] = null
            { time: 2, value: null },    // overlap[2] = null
            { time: 3, value: null },    // overlap[3] = null
          ]),
        ],
      };

      const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize);

      const mergedPlot = merged.plots.find((p) => p.title === 'MA');
      expect(mergedPlot).toBeDefined();
      // New bars → null (warmup)
      expect(mergedPlot!.data[0].value).toBeNull();
      expect(mergedPlot!.data[9].value).toBeNull();
      // Overlap zone → prev values preserved (because newResult has null)
      expect(mergedPlot!.data[10].value).toBe(100); // prev preserved
      expect(mergedPlot!.data[11].value).toBe(101);
      expect(mergedPlot!.data[12].value).toBe(102);
      expect(mergedPlot!.data[13].value).toBe(103);
      // After overlap → prev value preserved
      expect(mergedPlot!.data[14].value).toBe(104);
      // Total length: 10 new + 10 (4 overlap + 6 after overlap from prev with contextSize offset)
      expect(mergedPlot!.data).toHaveLength(15);
    });

    it('2.2 should keep null when both prev and newResult have null', () => {
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: 0, value: null },   // overlap — prev also null
            { time: 1, value: 101 },
          ]),
        ],
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: -1, value: null },   // new bar (addedCount=1)
            { time: 0, value: null },    // overlap[0] = null
          ]),
        ],
      };

      const merged = prependIndicatorResult(prev, newResult, 1, 1);

      const mergedPlot = merged.plots.find((p) => p.title === 'MA');
      expect(mergedPlot).toBeDefined();
      // New bar → null (warmup)
      expect(mergedPlot!.data[0].value).toBeNull();
      // Overlap: both had null → stays null
      expect(mergedPlot!.data[1].value).toBeNull();
      // After overlap → prev value
      expect(mergedPlot!.data[2].value).toBe(101);
    });

    it('2.3 should replace prev value when newResult has non-null in overlap', () => {
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: 0, value: 100 },   // overlap — prev has valid
            { time: 1, value: 101 },
          ]),
        ],
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: -1, value: null },   // new bar (addedCount=1)
            { time: 0, value: 200 },     // overlap[0] = non-null → authoritative
          ]),
        ],
      };

      const merged = prependIndicatorResult(prev, newResult, 1, 1);

      const mergedPlot = merged.plots.find((p) => p.title === 'MA');
      expect(mergedPlot).toBeDefined();
      // New bar → null (warmup)
      expect(mergedPlot!.data[0].value).toBeNull();
      // Overlap: newResult has non-null → replaces prev
      expect(mergedPlot!.data[1].value).toBe(200);
      // After overlap → prev value
      expect(mergedPlot!.data[2].value).toBe(101);
    });

    it('2.4 should heal as context accumulates across multiple prepends', () => {
      // Simulate: chunk1 (added=10, context=4, all warmup nulls)
      // Then chunk2 adds more context, and re-exec produces non-null for overlap

      // Step 1: first prepend with insufficient context — warmup nulls
      const prev1: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: 0, value: 100 },
            { time: 1, value: 101 },
            { time: 2, value: 102 },
            { time: 3, value: 103 },
            { time: 4, value: 104 },
          ]),
        ],
      };
      const newResult1: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: -10, value: null },
            { time: -9, value: null },
            { time: -8, value: null },
            { time: -7, value: null },
            { time: -6, value: null },
            { time: -5, value: null },
            { time: -4, value: null },
            { time: -3, value: null },
            { time: -2, value: null },
            { time: -1, value: null },
            // overlap — all null (warmup)
            { time: 0, value: null },
            { time: 1, value: null },
            { time: 2, value: null },
            { time: 3, value: null },
          ]),
        ],
      };

      const merged1 = prependIndicatorResult(prev1, newResult1, 10, 4);

      // After step 1: new bars = null, overlap = prev preserved
      const ma1 = merged1.plots.find((p) => p.title === 'MA')!;
      expect(ma1.data[10].value).toBe(100); // prev preserved
      expect(ma1.data[11].value).toBe(101);
      expect(ma1.data[12].value).toBe(102);
      expect(ma1.data[13].value).toBe(103);
      expect(ma1.data[14].value).toBe(104); // after overlap

      // Step 2: second prepend with MORE context — non-null for overlap
      const prev2 = merged1;
      const newResult2: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: -20, value: null },
            { time: -19, value: null },
            { time: -18, value: null },
            { time: -17, value: null },
            { time: -16, value: null },
            { time: -15, value: null },
            { time: -14, value: null },
            { time: -13, value: null },
            { time: -12, value: null },
            { time: -11, value: null },
            // overlap — NOW has non-null values (context sufficient)
            { time: -10, value: 999 },
            { time: -9, value: 998 },
            { time: -8, value: 997 },
            { time: -7, value: 996 },
            { time: -6, value: 995 },
            { time: -5, value: 994 },
            { time: -4, value: 993 },
            { time: -3, value: 992 },
            { time: -2, value: 991 },
            { time: -1, value: 990 },
          ]),
        ],
      };

      const merged2 = prependIndicatorResult(prev2, newResult2, 10, 10);

      // After step 2: new bars = null, overlap = NOW replaced with fresh values
      const ma2 = merged2.plots.find((p) => p.title === 'MA')!;
      expect(ma2.data[10].value).toBe(999);  // healed! fresh value from re-exec
      expect(ma2.data[11].value).toBe(998);
      expect(ma2.data[12].value).toBe(997);
      expect(ma2.data[13].value).toBe(996);
      expect(ma2.data[14].value).toBe(995);
      expect(ma2.data[15].value).toBe(994);
      expect(ma2.data[16].value).toBe(993);
      expect(ma2.data[17].value).toBe(992);
      expect(ma2.data[18].value).toBe(991);
      expect(ma2.data[19].value).toBe(990);
      // After overlap (indices 20-24) — prev values from merged1 preserved
      expect(ma2.data[20].value).toBe(100);
    });

    it('2.5 should keep prev plotColor when newResult has null (warmup) in overlap', () => {
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        plotColors: {
          'MA': [null, '#00ff00', '#ff0000', '#0000ff', '#ffff00'],
        },
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        plotColors: {
          'MA': [
            // new bar colors (addedCount = 2)
            null, null,
            // overlap — all null (warmup)
            null, null, null, null,
          ],
        },
      };

      const merged = prependIndicatorResult(prev, newResult, 2, 4);

      // New bars → null (warmup)
      expect(merged.plotColors!['MA'][0]).toBeNull();
      expect(merged.plotColors!['MA'][1]).toBeNull();
      // Overlap zone → prev colors preserved (null-safe)
      // prev[0..3] had [null, '#00ff00', '#ff0000', '#0000ff']
      expect(merged.plotColors!['MA'][2]).toBeNull();     // prev[0] = null (was null too)
      expect(merged.plotColors!['MA'][3]).toBe('#00ff00'); // prev[1] preserved
      expect(merged.plotColors!['MA'][4]).toBe('#ff0000'); // prev[2] preserved
      expect(merged.plotColors!['MA'][5]).toBe('#0000ff'); // prev[3] preserved
      // After overlap → prev[4] = #ffff00
      expect(merged.plotColors!['MA'][6]).toBe('#ffff00');
    });

    it('2.6 should keep prev fillColorData when newResult has null (warmup) in overlap', () => {
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        fillColorData: {
          'fill_up': ['#ff0000', '#00ff00', '#0000ff'],
        },
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        fillColorData: {
          'fill_up': [
            // new bar colors (addedCount = 2)
            null, null,
            // overlap — all null (warmup)
            null, null, null,
          ],
        },
      };

      const merged = prependIndicatorResult(prev, newResult, 2, 3);

      // New bars → null (warmup)
      expect(merged.fillColorData!['fill_up'][0]).toBeNull();
      expect(merged.fillColorData!['fill_up'][1]).toBeNull();
      // Overlap zone → prev colors preserved
      expect(merged.fillColorData!['fill_up'][2]).toBe('#ff0000'); // prev[0] preserved
      expect(merged.fillColorData!['fill_up'][3]).toBe('#00ff00'); // prev[1] preserved
      expect(merged.fillColorData!['fill_up'][4]).toBe('#0000ff'); // prev[2] preserved
    });

    it('2.7 should backfill fillColorData from first valid post-warmup when both prev and new have null in overlap', () => {
      // Scenario: fill warmup (8 bars) > addedCount (2 bars). The new exec
      // has null fill colors for overlap entries 0..5 (warmup extends 6 bars
      // past addedCount). Prev ALSO has nulls at those bars (from a previous
      // prepend with the same warmup issue). The fix should backfill from
      // the first valid post-warmup color.

      // prev has 9 entries: 6 null (overlap zone) + 3 valid (after overlap)
      // prev[0..5] = null (overlap entries, from prior prepend warmup)
      // prev[6..8] = valid (after overlap = prev.slice(contextSize=8) = prev[8..8] = 1 entry)
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        fillColorData: {
          'basis::price': [
            null, null, null, null, null, null,
            '#00ff00', '#ff0000', '#00ff00',
          ],
        },
      };
      // new has 10 entries: 2 new bars + 8 overlap
      // new[0..1] = null (new bars, warmup)
      // new[2..7] = null (overlap, warmup extends 6 bars into overlap)
      // new[8..9] = valid (overlap, past warmup)
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        fillColorData: {
          'basis::price': [
            null, null,
            null, null, null, null, null, null, '#ff0000', '#00ff00',
          ],
        },
      };

      const merged = prependIndicatorResult(prev, newResult, 2, 8);

      // merged = [2 new nulls] + [8 overlap (backfilled)] + [prev.slice(8) = prev[8..8] = 1 entry]
      // Total: 11 entries, indices 0..10

      // New bars → null (warmup)
      expect(merged.fillColorData!['basis::price'][0]).toBeNull();
      expect(merged.fillColorData!['basis::price'][1]).toBeNull();

      // Overlap entries 0..5: both prev and new are null
      // Should be BACKFILLED with first valid color in overlap: '#ff0000' (overlap index 6)
      for (let i = 2; i <= 7; i++) {
        expect(merged.fillColorData!['basis::price'][i]).toBe('#ff0000');
      }

      // Overlap entries 6..7: new is valid → authoritative (replaces prev)
      expect(merged.fillColorData!['basis::price'][8]).toBe('#ff0000');
      expect(merged.fillColorData!['basis::price'][9]).toBe('#00ff00');

      // After overlap → prev value (prev[8] = '#00ff00')
      expect(merged.fillColorData!['basis::price'][10]).toBe('#00ff00');
      expect(merged.fillColorData!['basis::price'].length).toBe(11);
    });

    it('2.8 should backfill plotColors from first valid post-warmup when both prev and new have null in overlap', () => {
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        plotColors: {
          'MA': [
            // All null in overlap zone
            null, null, null,
          ],
        },
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        plotColors: {
          'MA': [
            // new bar colors (addedCount = 1)
            null,
            // overlap — first 2 null (warmup), last 1 valid
            null, null, '#00ff00',
          ],
        },
      };

      const merged = prependIndicatorResult(prev, newResult, 1, 3);

      // New bar → null
      expect(merged.plotColors!['MA'][0]).toBeNull();
      // Overlap 0..1: both null → backfill with '#00ff00' (first valid)
      expect(merged.plotColors!['MA'][1]).toBe('#00ff00'); // backfilled!
      expect(merged.plotColors!['MA'][2]).toBe('#00ff00'); // backfilled!
      // Overlap 2: new has '#00ff00' → authoritative
      expect(merged.plotColors!['MA'][3]).toBe('#00ff00');
    });

    it('2.9 should not backfill when prev has valid colors even if new is null', () => {
      // If prev has valid colors, the null-safe merge should preserve them
      // (no backfill needed). The backfill should only activate when BOTH
      // are null.
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        fillColorData: {
          'fill_up': ['#ff0000', '#00ff00', '#0000ff'],
        },
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        fillColorData: {
          'fill_up': [
            null, null, null,
          ],
        },
      };

      const merged = prependIndicatorResult(prev, newResult, 1, 2);

      // Overlap: prev has valid colors → preserved
      expect(merged.fillColorData!['fill_up'][1]).toBe('#ff0000'); // prev[0] preserved
      expect(merged.fillColorData!['fill_up'][2]).toBe('#00ff00'); // prev[1] preserved
    });

    it('2.10 should not backfill when first valid index is at position 0 (no warmup gap at overlap)', () => {
      // When warmup <= addedCount, the first valid entry in the overlap is
      // at index 0. The backfill should NOT trigger because i < 0 is never true.
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        fillColorData: {
          'fill_up': [null, '#00ff00'],
        },
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        fillColorData: {
          'fill_up': [
            null,
            '#ff0000',  // overlap[0] = valid (warmup satisfied before overlap)
          ],
        },
      };

      const merged = prependIndicatorResult(prev, newResult, 1, 1);

      const data = merged.fillColorData!['fill_up'];
      expect(data[0]).toBeNull();
      // overlap[0] is valid → replaces prev[0]
      expect(data[1]).toBe('#ff0000');
      // After overlap: prev after contextSize (1) → prev[1] = '#00ff00'
      expect(data[2]).toBe('#00ff00');
    });

    it('2.11 should handle empty overlap (no valid colors) without backfill', () => {
      // Edge case: ALL entries in the overlap are null (extremely long warmup).
      // firstValidIdx = -1 → no backfill, keep null.
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        fillColorData: {
          'fill_up': [null, null, null],
        },
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        fillColorData: {
          'fill_up': [
            null,
            null, null, null,  // overlap — all null
          ],
        },
      };

      const merged = prependIndicatorResult(prev, newResult, 1, 3);

      // All null → stays null (no backfill when no valid color exists)
      expect(merged.fillColorData!['fill_up'][0]).toBeNull();
      expect(merged.fillColorData!['fill_up'][1]).toBeNull();
      expect(merged.fillColorData!['fill_up'][2]).toBeNull();
      expect(merged.fillColorData!['fill_up'][3]).toBeNull();
    });

    it('2.12 should backfill plot data values from first valid post-warmup when both prev and new have null in overlap', () => {
      // Scenario: plot warmup (6 bars) > addedCount (2 bars). The new exec
      // has null plot values for overlap entries 0..3 (warmup extends 4 bars
      // past addedCount). Prev ALSO has nulls at those bars. The fix should
      // backfill from the first valid value in the overlap.

      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('Zero Lag Basis', [
            { time: 0, value: null },  // overlap[0] — prev null
            { time: 1, value: null },  // overlap[1] — prev null
            { time: 2, value: null },  // overlap[2] — prev null
            { time: 3, value: null },  // overlap[3] — prev null
            { time: 4, value: null },  // overlap[4] — prev null
            { time: 5, value: 200 },   // overlap[5] — prev valid (but past contextSize=4, so not in overlap)
            { time: 6, value: 201 },   // after overlap
          ]),
        ],
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('Zero Lag Basis', [
            { time: -2, value: null },  // new bar
            { time: -1, value: null },  // new bar
            // overlap — first 4 null (warmup), last 2 valid (past warmup)
            { time: 0, value: null },   // overlap[0] = null
            { time: 1, value: null },   // overlap[1] = null
            { time: 2, value: null },   // overlap[2] = null
            { time: 3, value: null },   // overlap[3] = null
            { time: 4, value: 300 },    // overlap[4] = valid (firstValidIdx)
            { time: 5, value: 301 },    // overlap[5] = valid
          ]),
        ],
      };

      const merged = prependIndicatorResult(prev, newResult, 2, 6);

      // merged = [2 new nulls] + [6 overlap (4 backfilled + 2 valid)] + [prev.slice(6) = prev[6..6] = 1 entry]
      // Total: 9 entries, indices 0..8

      // New bars → null (warmup)
      expect(merged.plots[0].data[0].value).toBeNull();
      expect(merged.plots[0].data[1].value).toBeNull();

      // Overlap entries 0..3: both prev and new are null
      // Should be BACKFILLED with first valid value in overlap: 300 (overlap[4])
      for (let i = 2; i <= 5; i++) {
        expect(merged.plots[0].data[i].value).toBe(300);
      }

      // Overlap entries 4..5: new is valid → authoritative
      expect(merged.plots[0].data[6].value).toBe(300);
      expect(merged.plots[0].data[7].value).toBe(301);

      // After overlap → prev value preserved (prev[6] = 201)
      expect(merged.plots[0].data[8].value).toBe(201);
      expect(merged.plots[0].data).toHaveLength(9);
    });

    it('2.13 should not backfill plot data when first valid index is at position 0 (no warmup gap)', () => {
      // When warmup <= addedCount, the first valid value in the overlap is
      // at index 0. Backfill should NOT trigger because i < 0 is never true.
      const prev: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: 0, value: 100 },  // overlap — prev valid
          ]),
        ],
      };
      const newResult: ScriptResult = {
        ...EMPTY_RESULT,
        plots: [
          makePlot('MA', [
            { time: -1, value: null },  // new bar
            { time: 0, value: 200 },    // overlap[0] = valid
          ]),
        ],
      };

      const merged = prependIndicatorResult(prev, newResult, 1, 1);

      // New bar → null
      expect(merged.plots[0].data[0].value).toBeNull();
      // Overlap[0]: new is valid → replaces prev
      expect(merged.plots[0].data[1].value).toBe(200);
    });
  });
});
