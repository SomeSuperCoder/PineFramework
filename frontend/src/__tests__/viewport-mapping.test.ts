import { describe, it, expect } from 'vitest';
import { Viewport } from '../chart/Viewport.js';

describe('Viewport.barIndexToPixel', () => {
  // 3.1 — Simple linear mapping
  it('maps barIndex to pixel linearly when firstBarIndex = 0', () => {
    const vp = new Viewport(8);
    vp.setTotalBars(100);
    vp.fitContent(800);
    // After fitContent, firstBarIndex may be > 0 if totalBars > visible count.
    // Set state directly for deterministic test.
    const state = vp.getState();
    // Override to known state via scrollTo
    vp.scrollTo(0, 800);
    expect(vp.barIndexToPixel(0)).toBe(0);
    expect(vp.barIndexToPixel(5)).toBe(40);
  });

  // 3.2 — Scrolled viewport
  // scrollTo centers the barIndex; with 200 bars at 8px spacing on 800px:
  //   barCount = ceil(800/8) + 2 = 102
  //   firstBarIndex = max(0, round(scrollTarget - barCount/2))
  //   With scrollTarget=50: firstBarIndex = max(0, round(50 - 51)) = 0
  //   So scrollTo(50) on 200 bars does not actually scroll because
  //   bar 50 is already visible.
  //   To test a truly scrolled viewport use a larger scroll target.
  it('maps barIndex correctly when scrolled', () => {
    const vp = new Viewport(8);
    vp.setTotalBars(200);
    vp.scrollTo(150, 800);
    // firstBarIndex = max(0, round(150 - ceil(800/8)/2 - 1)) ≈ 150 - 51 = 99
    const state = vp.getState();
    expect(state.firstBarIndex).toBe(99);
    expect(vp.barIndexToPixel(state.firstBarIndex)).toBe(0);
    expect(vp.barIndexToPixel(state.firstBarIndex + 5)).toBe(40);
  });

  // 3.3 — Prepend adjustment
  it('keeps firstBarIndex at 0 when at left edge after prepend', () => {
    const vp = new Viewport(8);
    vp.setTotalBars(100);
    vp.scrollTo(0, 800);

    vp.adjustForPrepend(20);
    // When the user is at the left edge (firstBarIndex = 0),
    // prepend should keep them there so they can see the new data.
    expect(vp.getFirstBarIndex()).toBe(0);
    expect(vp.getTotalBars()).toBe(120);
  });

  it('shifts firstBarIndex after prepend when scrolled away from left edge', () => {
    const vp = new Viewport(8);
    vp.setTotalBars(200);
    vp.scrollTo(150, 800);
    // firstBarIndex = 99 after scrollTo(150)
    expect(vp.getFirstBarIndex()).toBe(99);

    vp.adjustForPrepend(50);
    // When scrolled away from left edge, prepend shifts the viewport.
    expect(vp.getFirstBarIndex()).toBe(149);
    expect(vp.getTotalBars()).toBe(250);
  });

  // 3.4 — Inverse relationship
  it('barIndexToPixel and pixelToBarIndex are approximate inverses', () => {
    const vp = new Viewport(8);
    vp.setTotalBars(200);
    vp.scrollTo(30, 800);

    for (let i = 30; i < 100; i++) {
      const pixel = vp.barIndexToPixel(i);
      const inverse = vp.pixelToBarIndex(pixel);
      expect(Math.abs(inverse - i)).toBeLessThan(1e-9);
    }
  });

  it('handles fitContent state correctly', () => {
    const vp = new Viewport(8);
    vp.setTotalBars(200);
    vp.fitContent(800);
    // With 200 bars on 800px, spacing recalculates to 800/200 = 4.
    // barCount = ceil(800/4) + 2 = 202 which exceeds total bars, so
    // firstBarIndex = 0 (all bars visible, no scrolling needed).
    const state = vp.getState();
    expect(state.firstBarIndex).toBe(0);
    expect(state.barSpacing).toBe(4);
    // barIndexToPixel should work for all bars without throwing
    expect(() => vp.barIndexToPixel(0)).not.toThrow();
    expect(() => vp.barIndexToPixel(199)).not.toThrow();
  });
});
