/**
 * MarkerRenderer heartbeat glyph tests (fix-chaos-live-invisibility 5.2):
 * noop heartbeats render as a small square, error heartbeats as a small
 * x-cross — so a silent no-op or error is visible on the chart instead of
 * indistinguishable from no data.
 *
 * Follows the canvas-mock pattern from CrosshairRenderer.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkerRenderer } from './MarkerRenderer';
import type { CandlestickData, StrategyMarkerData } from '../types';
import type { Viewport } from '../Viewport';
import type { LayoutManager } from '../LayoutManager';

function createMockCtx(): CanvasRenderingContext2D {
  const stub = vi.fn();
  // Dedicated mocks for the glyph-shape methods the tests assert on, so
  // beginPath/moveTo/lineTo/stroke/fillRect/fill are distinguishable.
  const beginPath = vi.fn();
  const moveTo = vi.fn();
  const lineTo = vi.fn();
  const stroke = vi.fn();
  const fillRect = vi.fn();
  const fill = vi.fn();
  return {
    save: stub,
    restore: stub,
    beginPath,
    moveTo,
    lineTo,
    stroke,
    fill,
    fillRect,
    fillText: vi.fn(),
    roundRect: stub,
    clip: stub,
    setLineDash: stub,
    clearRect: stub,
    drawImage: stub,
    arc: stub,
    arcTo: stub,
    bezierCurveTo: stub,
    closePath: stub,
    ellipse: stub,
    quadraticCurveTo: stub,
    rect: stub,
    createRadialGradient: stub,
    createLinearGradient: stub,
    createPattern: stub,
    isPointInPath: stub,
    isPointInStroke: stub,
    strokeText: stub,
    transform: stub,
    resetTransform: stub,
    translate: stub,
    scale: stub,
    rotate: stub,
    createImageData: stub,
    getImageData: stub,
    putImageData: stub,
    drawFocusIfNeeded: stub,
    drawWidgetAsOnScreen: stub,
    drawWindow: stub,
    createConicGradient: stub,
    scrollPathIntoView: stub,
    getContextAttributes: stub as () => any,
    getLineDash: stub as () => number[],
    getTransform: stub as () => DOMMatrix,
    measureText: vi.fn(() => ({ width: 60 } as unknown as TextMetrics)),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    lineJoin: '' as CanvasLineJoin,
    globalAlpha: 1,
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
    fontKerning: 'auto' as CanvasFontKerning,
    fontStretch: 'normal' as CanvasFontStretch,
    fontVariantCaps: 'normal' as CanvasFontVariantCaps,
    letterSpacing: '0' as string,
    textRendering: 'auto' as CanvasTextRendering,
    wordSpacing: '0' as string,
  } as unknown as CanvasRenderingContext2D;
}

function createMockViewport(): Viewport {
  return {
    pixelToBarIndex: vi.fn(() => 0),
    barIndexToPixel: vi.fn(() => 100),
    getBarSpacing: vi.fn(() => 8),
    getVisibleRange: vi.fn(() => ({ start: 0, end: 10 })),
    setTotalBars: vi.fn(),
    fitContent: vi.fn(),
    adjustForPrepend: vi.fn(),
  } as unknown as Viewport;
}

function createMockLayout(): LayoutManager {
  return {
    getRegions: vi.fn(() => ({
      chartArea: { x: 50, y: 30, width: 700, height: 400 },
      volumeArea: { x: 50, y: 430, width: 700, height: 80 },
      priceScale: { x: 750, y: 30, width: 50, height: 480 },
      timeScale: { x: 50, y: 510, width: 700, height: 30 },
      indicatorPanes: [],
    })),
    pixelToPrice: vi.fn(() => 50000),
    priceToPixel: vi.fn(() => 200),
  } as unknown as LayoutManager;
}

function makeCandle(): CandlestickData {
  return { time: 1000000, open: 100, high: 101, low: 99, close: 100, volume: 1000 };
}

function heartbeatMarker(outcome: 'noop' | 'error', overrides: Partial<StrategyMarkerData> = {}): StrategyMarkerData {
  return {
    type: 'heartbeat',
    name: outcome === 'error' ? 'Chaos Error' : 'No-op',
    direction: 'flat',
    barIndex: 0,
    timestamp: 1000000000,
    color: outcome === 'error' ? '#e94560' : '#ff9800',
    outcome,
    ...overrides,
  };
}

describe('MarkerRenderer heartbeat glyphs', () => {
  let renderer: MarkerRenderer;
  let ctx: CanvasRenderingContext2D;
  let viewport: Viewport;
  let layout: LayoutManager;
  let candles: CandlestickData[];

  beforeEach(() => {
    renderer = new MarkerRenderer();
    ctx = createMockCtx();
    viewport = createMockViewport();
    layout = createMockLayout();
    candles = [makeCandle()];
  });

  it('renders a noop heartbeat as a small square (no arrow, no stroke path)', () => {
    renderer.renderStrategyMarkers(ctx, [heartbeatMarker('noop')], candles, viewport, layout);

    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    // A square glyph is drawn with fillRect only — no x-cross stroke path.
    expect(ctx.stroke).not.toHaveBeenCalled();
    // No arrow entry/exit shape is drawn for heartbeats.
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('renders an error heartbeat as a small x-cross (stroke path, no square)', () => {
    renderer.renderStrategyMarkers(ctx, [heartbeatMarker('error')], candles, viewport, layout);

    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    // The x-cross must NOT also draw a square (one distinct glyph).
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('keeps regular order markers as arrows — heartbeats do not hijack them', () => {
    const entry: StrategyMarkerData = {
      type: 'entry',
      name: 'Long',
      direction: 'long',
      action: 'buy',
      quantity: 0.1,
      price: 50000,
      barIndex: 0,
      timestamp: 1000000000,
      color: '#4caf50',
    };
    renderer.renderStrategyMarkers(ctx, [entry], candles, viewport, layout);

    // Entry arrows are drawn via the triangle fill path (beginPath + fill).
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
  });
});
