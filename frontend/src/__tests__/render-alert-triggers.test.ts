import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkerRenderer } from '../chart/renderers/MarkerRenderer';
import type { AlertTriggerData, CandlestickData } from '../chart/types';
import type { Viewport } from '../chart/Viewport';
import type { LayoutManager } from '../chart/LayoutManager';

// ─── Mocks ───────────────────────────────────────────────────────

function createMockCtx(): CanvasRenderingContext2D {
  // Use separate spies for methods our tests assert on; share a stub for the rest.
  const arcSpy = vi.fn();
  const fillSpy = vi.fn();
  const beginPathSpy = vi.fn();
  const stub = vi.fn();
  return {
    save: stub,
    restore: stub,
    beginPath: beginPathSpy,
    moveTo: stub,
    lineTo: stub,
    stroke: stub,
    fill: fillSpy,
    fillRect: stub,
    fillText: stub,
    roundRect: stub,
    clip: stub,
    setLineDash: stub,
    clearRect: stub,
    drawImage: stub,
    arc: arcSpy,
    arcTo: stub,
    closePath: stub,
    rect: stub,
    measureText: vi.fn(() => ({ width: 60 })) as (text: string) => TextMetrics,
    globalAlpha: 1,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    lineJoin: '' as CanvasLineJoin,
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    direction: 'ltr' as CanvasDirection,
    filter: 'none',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low' as ImageSmoothingQuality,
    lineCap: 'butt' as CanvasLineCap,
    miterLimit: 10,
    shadowBlur: 0,
    shadowColor: 'transparent',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    lineDashOffset: 0,
  } as unknown as CanvasRenderingContext2D;
}

function createMockViewport(barSpacing = 8): Viewport {
  return {
    pixelToBarIndex: vi.fn(() => 0),
    barIndexToPixel: vi.fn((idx: number) => idx * barSpacing),
    getBarSpacing: vi.fn(() => barSpacing),
    getVisibleRange: vi.fn(() => ({ start: 0, end: 10 })),
    setTotalBars: vi.fn(),
    fitContent: vi.fn(),
    adjustForPrepend: vi.fn(),
    scrollTo: vi.fn(),
    getFirstBarIndex: vi.fn(() => 0),
    getBarCount: vi.fn(() => 10),
    getState: vi.fn(() => ({ firstBarIndex: 0, barCount: 10, barSpacing })),
    zoom: vi.fn(),
    pan: vi.fn(),
  } as unknown as Viewport;
}

function createMockLayout(chartY = 30): LayoutManager {
  return {
    getRegions: vi.fn(() => ({
      chartArea: { x: 50, y: chartY, width: 700, height: 400 },
      volumeArea: { x: 50, y: 430, width: 700, height: 80 },
      priceScale: { x: 750, y: 30, width: 50, height: 480 },
      timeScale: { x: 50, y: 510, width: 700, height: 30 },
      indicatorPanes: [],
    })),
    pixelToPrice: vi.fn(() => 50000),
    priceToPixel: vi.fn(() => 200),
  } as unknown as LayoutManager;
}

function makeCandle(close = 100): CandlestickData {
  return { time: 1000000, open: 99, high: 101, low: 98, close, volume: 1000 };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('MarkerRenderer.renderAlertTriggers', () => {
  let renderer: MarkerRenderer;
  let ctx: CanvasRenderingContext2D;
  let viewport: Viewport;
  let layout: LayoutManager;

  beforeEach(() => {
    renderer = new MarkerRenderer();
    ctx = createMockCtx();
    viewport = createMockViewport(8);
    layout = createMockLayout(30);
  });

  // 4.1 — Single trigger renders at correct bar x
  // barIndexToPixel(10) = 10 * 8 = 80, plus barSpacing/2 = 4 → x = 84
  it('renders a single trigger at the correct X position', () => {
    const triggers: AlertTriggerData[] = [
      { barIndex: 10, alertId: 'a1', timestamp: 1000 },
    ];
    const candles = Array.from({ length: 20 }, () => makeCandle());

    renderer.renderAlertTriggers(ctx, triggers, candles, viewport, layout);

    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect(ctx.arc).toHaveBeenCalledWith(84, 32, expect.any(Number), 0, Math.PI * 2);
  });

  // 4.2 — Multiple triggers on same bar render at same X position
  it('renders multiple triggers on the same bar at the same X position', () => {
    const triggers: AlertTriggerData[] = [
      { barIndex: 5, alertId: 'a1', timestamp: 1000 },
      { barIndex: 5, alertId: 'a2', timestamp: 1000 },
      { barIndex: 5, alertId: 'a3', timestamp: 1000 },
    ];
    const candles = Array.from({ length: 20 }, () => makeCandle());

    renderer.renderAlertTriggers(ctx, triggers, candles, viewport, layout);

    // All three should have been rendered
    expect(ctx.arc).toHaveBeenCalledTimes(3);
    // All three calls should have the same x coordinate
    const calls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
    const xPositions = calls.map((c: number[]) => c[0]);
    expect(new Set(xPositions).size).toBe(1);
    expect(xPositions[0]).toBe(44); // 5*8 + 4 = 44
  });

  // 4.3 — Off-screen triggers are skipped
  it('skips triggers with barIndex >= candles.length', () => {
    const triggers: AlertTriggerData[] = [
      { barIndex: 5, alertId: 'a1', timestamp: 1000 },
      { barIndex: 20, alertId: 'a2', timestamp: 1000 },  // out of bounds
      { barIndex: 3, alertId: 'a3', timestamp: 1000 },
    ];
    const candles = Array.from({ length: 10 }, () => makeCandle());

    renderer.renderAlertTriggers(ctx, triggers, candles, viewport, layout);

    // Only 2 triggers should render (barIndex 5 and 3), barIndex 20 skipped
    expect(ctx.arc).toHaveBeenCalledTimes(2);
  });

  // 4.4 — globalAlpha restored to 1 after rendering
  it('restores globalAlpha to 1 after rendering', () => {
    const triggers: AlertTriggerData[] = [
      { barIndex: 3, alertId: 'a1', timestamp: 1000 },
    ];
    const candles = Array.from({ length: 10 }, () => makeCandle());

    renderer.renderAlertTriggers(ctx, triggers, candles, viewport, layout);

    expect(ctx.globalAlpha).toBe(1);
  });

  // Additional: empty triggers array does not call arc
  it('does nothing when triggers array is empty', () => {
    const triggers: AlertTriggerData[] = [];
    const candles = Array.from({ length: 10 }, () => makeCandle());

    renderer.renderAlertTriggers(ctx, triggers, candles, viewport, layout);

    expect(ctx.arc).not.toHaveBeenCalled();
  });
});
