/**
 * LinefillRenderer positioning lock (b11-linefill-left-edge):
 * fills must render at barIndexToPixel(barIndex) — the bar LEFT EDGE —
 * matching skeleton line rendering in PineChart/Viewport. Guards against
 * regression of the removed `+ barSpacing / 2` center shift.
 *
 * Follows the canvas-mock pattern from MarkerRenderer.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { LinefillRenderer } from './LinefillRenderer';
import type { LinefillData } from '../types';
import type { Viewport } from '../Viewport';
import type { LayoutManager } from '../LayoutManager';

function createMockCtx(): CanvasRenderingContext2D {
  const stub = vi.fn();
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: stub,
    fill: vi.fn(),
    save: stub,
    restore: stub,
    stroke: stub,
    fillRect: stub,
    fillText: stub,
    setLineDash: stub,
    clearRect: stub,
    clip: stub,
    arc: stub,
    rect: stub,
    measureText: vi.fn(() => ({ width: 10 }) as unknown as TextMetrics),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    globalAlpha: 1,
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
  } as unknown as CanvasRenderingContext2D;
}

function createMockViewport(): Viewport {
  return {
    // Deterministic mapping: pixel = barIndex * 8 (firstBarIndex = 0)
    barIndexToPixel: vi.fn((barIndex: number) => barIndex * 8),
    getBarSpacing: vi.fn(() => 8),
    getVisibleRange: vi.fn(() => ({ start: 0, end: 10 })),
  } as unknown as Viewport;
}

function createMockLayout(): LayoutManager {
  return {
    getRegions: vi.fn(() => ({
      chartArea: { x: 0, y: 0, width: 700, height: 400 },
      volumeArea: { x: 0, y: 400, width: 700, height: 80 },
      priceScale: { x: 700, y: 0, width: 70, height: 480 },
      timeScale: { x: 0, y: 480, width: 770, height: 30 },
      indicatorPanes: [],
    })),
    priceToPixel: vi.fn(() => 200),
  } as unknown as LayoutManager;
}

function makeLinefill(): LinefillData {
  return {
    line1: { x1: 5, y1: 100, x2: 10, y2: 110, color: '#ff0000' },
    line2: { x1: 5, y1: 50, x2: 10, y2: 60, color: '#ff0000' },
    color: '#ff0000',
    fillgaps: false,
  };
}

describe('LinefillRenderer left-edge positioning', () => {
  it('renders vertices at barIndexToPixel(x) with NO half-bar center shift', () => {
    const ctx = createMockCtx();
    const renderer = new LinefillRenderer();

    renderer.render(ctx, [makeLinefill()], createMockViewport(), createMockLayout());

    // Quadrilateral order: line1.p1 → line1.p2 → line2.p2 → line2.p1
    expect(ctx.moveTo).toHaveBeenCalledWith(5 * 8, 200); // 40 — raw left edge
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 10 * 8, 200); // 80
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 10 * 8, 200);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, 5 * 8, 200);
  });

  it('does not offset by half a barSpacing (+4px would indicate the old center shift)', () => {
    const ctx = createMockCtx();
    const renderer = new LinefillRenderer();

    renderer.render(ctx, [makeLinefill()], createMockViewport(), createMockLayout());

    const moveToCall = (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls[0] as number[];
    expect(moveToCall[0]).toBe(40); // not 44 (= 40 + 8/2)
  });
});
