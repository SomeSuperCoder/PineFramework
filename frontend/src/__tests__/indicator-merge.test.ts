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

  it('should replace prev label in overlap zone even when text differs (e.g. HL→LL)', () => {
    // When re-execution changes pivot classification (different text) at the same bar,
    // the prev label is dropped and only the new label survives.  The re-execution is
    // authoritative for the overlap zone — it has more context, so its pivot detection
    // is correct even when it differs from the initial execution.
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
        // newResult produces DIFFERENT classification at same timestamps
        { time: 102, price: 50300, text: 'LH', color: '#0000ff', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 105, price: 50150, text: 'LL', color: '#ff00ff', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // label at 102: prev "HL" is dropped (in overlap). Only "LH" survives.
    const labels102 = merged.labels.filter((l) => l.time === 102);
    expect(labels102).toHaveLength(1);
    expect(labels102[0]!.text).toBe('LH');

    // label at 105: OUTSIDE overlap → prev "HH" survives alongside new "LL".
    // Non-overlap bars keep labels from both results — no stacking risk since
    // they're at different bars (different timestamps).
    const labels105 = merged.labels.filter((l) => l.time === 105);
    expect(labels105).toHaveLength(2);

    // label at 300: outside overlap → survives unchanged
    const label300 = merged.labels.find((l) => l.time === 300);
    expect(label300).toBeDefined();
    expect(label300!.text).toBe('LL');

    expect(merged.labels).toHaveLength(4); // newResult(102, 105) + prev(105, 300)
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

  it('should drop prev label in overlap zone and keep outside-overlap labels', () => {
    // Prev labels in the overlap zone are dropped even if newResult doesn't
    // reproduce them — the re-execution, having MORE context, may determine
    // that a bar is no longer a pivot.  Only labels outside the overlap zone
    // survive from prev; overlap-zone labels come entirely from newResult.
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

    // label in overlap: prev label dropped (only newResult label survives)
    const labels102 = merged.labels.filter((l) => l.time === 102);
    expect(labels102).toHaveLength(1);
    expect(labels102[0]!.text).toBe('overlap-new');
    expect(labels102[0]!.price).toBe(50300);

    // label after overlap: survives unchanged
    const label500 = merged.labels.find((l) => l.time === 500);
    expect(label500).toBeDefined();
    expect(label500!.text).toBe('after');
    expect(label500!.price).toBe(50200);

    expect(merged.labels).toHaveLength(3); // prev(50, 500) + newResult(102)
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

  it('should drop prev label in overlap when same text but shifted price (pivot shift)', () => {
    // When re-execution shifts pivot detection (forming candle OHLC changes),
    // the label price may change (e.g. HH at 150.00 → HH at 150.50).
    // The overlap-zone dedup should still drop the old label by matching on
    // text alone — the re-execution is authoritative for the overlap zone.
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        { time: 100, price: 150.00, text: 'HH', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 102, price: 95.00, text: 'LL', color: '#0000ff', textColor: '#ffffff', style: 'label.style_label_up', size: 'size.normal' },
        { time: 200, price: 200.00, text: 'HH', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        // Same text, different price (pivot shifted due to OHLC change)
        { time: 100, price: 150.50, text: 'HH', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
        { time: 102, price: 94.50, text: 'LL', color: '#0000ff', textColor: '#ffffff', style: 'label.style_label_up', size: 'size.normal' },
      ],
    };

    const merged = prependIndicatorResult(prev, newResult, addedCount, contextSize, overlapTimestamps);

    // prev label at 100: in overlap, same text as newResult → DROPPED (price shifted)
    const prevLabel100 = merged.labels.find((l) => l.time === 100 && l.price === 150.00);
    expect(prevLabel100).toBeUndefined();

    // newResult label at 100: kept
    const newLabel100 = merged.labels.find((l) => l.time === 100 && l.price === 150.50);
    expect(newLabel100).toBeDefined();

    // prev label at 102: in overlap, same text as newResult → DROPPED (price shifted)
    const prevLabel102 = merged.labels.find((l) => l.time === 102 && l.price === 95.00);
    expect(prevLabel102).toBeUndefined();

    // newResult label at 102: kept
    const newLabel102 = merged.labels.find((l) => l.time === 102 && l.price === 94.50);
    expect(newLabel102).toBeDefined();

    // prev label at 200: outside overlap → survives unchanged
    const label200 = merged.labels.find((l) => l.time === 200);
    expect(label200).toBeDefined();
    expect(label200!.text).toBe('HH');
    expect(label200!.price).toBe(200.00);

    // Total: newResult(100, 102) + prev(200) = 3
    expect(merged.labels).toHaveLength(3);
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

  it('should prevent stacking when re-execution changes label classification at same overlap bar', () => {
    // Root cause: the HHLL indicator uses ta.valuewhen(not na(pl), pl, 1) to
    // resolve the previous pivot price.  When the re-execution has MORE
    // historical context (the new prepended bars), ta.valuewhen finds a
    // DIFFERENT previous pivot than the initial execution did.  This changes
    // label classification (e.g. "HL" → "LL" or "HH" → "LH") for the SAME
    // bar in the overlap zone.  The re-execution is authoritative — its label
    // replaces the prev label at that timestamp, even though the text differs.
    //
    // Without this fix, BOTH labels survive and stack on the same candle.

    // Simulates a first scroll-back: 200 new bars + 1000 context bars.
    // Bar 5 of the re-execution (T-195) detects a pivot at T-200 → label text "HL".
    // After a second scroll-back, the re-execution has 200 MORE bars of history,
    // so ta.valuewhen resolves differently → label at T-200 gets text "LL" instead.
    const prev: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        // From first scroll-back re-execution: ta.valuewhen found no prior pivot → "HL"
        { time: 1000, price: 100, text: 'HL', color: '#00ff00', textColor: '#ffffff', style: 'label.style_label_up', size: 'size.normal' },
        // Labels outside overlap survive unchanged
        { time: 5000, price: 200, text: 'HH', color: '#ff0000', textColor: '#ffffff', style: 'label.style_label_down', size: 'size.normal' },
      ],
    };
    const newResult: ScriptResult = {
      ...EMPTY_RESULT,
      labels: [
        // Second scroll-back re-execution: ta.valuewhen now finds a prior pivot → "LL"
        { time: 1000, price: 98, text: 'LL', color: '#0000ff', textColor: '#ffffff', style: 'label.style_label_up', size: 'size.normal' },
      ],
    };

    // addedCount=200, contextSize=1000, overlap covers timestamps 1000-1999
    const overlapTimestamps = new Set<number>([1000, 1001, 1002, 1003, 1999]);

    const merged = prependIndicatorResult(prev, newResult, 200, 1000, overlapTimestamps);

    // Prev label at 1000 ("HL") is DROPPED (in overlap).
    // New label at 1000 ("LL") is kept.
    // Only ONE label at timestamp 1000 — stacking prevented.
    const labels1000 = merged.labels.filter((l) => l.time === 1000);
    expect(labels1000).toHaveLength(1);
    expect(labels1000[0]!.text).toBe('LL');
    expect(labels1000[0]!.price).toBe(98);

    // Prev label at 5000 survives (outside overlap)
    const label5000 = merged.labels.find((l) => l.time === 5000);
    expect(label5000).toBeDefined();
    expect(label5000!.text).toBe('HH');

    expect(merged.labels).toHaveLength(2); // newResult(1000) + prev(5000)
  });
});
