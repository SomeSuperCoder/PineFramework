import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrosshairRenderer } from './CrosshairRenderer';
import type { AlertTriggerData, CandlestickData, PlotSeriesData } from '../types';
import type { Viewport } from '../Viewport';
import type { LayoutManager } from '../LayoutManager';

// ─── Mocks ───────────────────────────────────────────────────────

function createMockCtx(): CanvasRenderingContext2D {
  const stub = vi.fn();
  // We need a dedicated mock for fillText so test assertions on its calls are clean
  const fillTextMock = vi.fn();
  return {
    save: stub,
    restore: stub,
    beginPath: stub,
    moveTo: stub,
    lineTo: stub,
    stroke: stub,
    fill: stub,
    fillRect: stub,
    fillText: fillTextMock,
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
    measureText: vi.fn(() => ({ width: 60 })) as (text: string) => TextMetrics,
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

function makeCandle(close = 100): CandlestickData {
  return { time: 1000000, open: 99, high: 101, low: 98, close, volume: 1000 };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('CrosshairRenderer', () => {
  let renderer: CrosshairRenderer;
  let ctx: CanvasRenderingContext2D;
  let viewport: Viewport;
  let layout: LayoutManager;
  let candles: CandlestickData[];
  let allPlots: Map<string, PlotSeriesData[]>;

  beforeEach(() => {
    renderer = new CrosshairRenderer();
    ctx = createMockCtx();
    viewport = createMockViewport();
    layout = createMockLayout();
    candles = [makeCandle(100), makeCandle(101), makeCandle(102)];
    allPlots = new Map();

    // Set a mouse position so render() proceeds past the visibility check
    renderer.setPosition(200, 200);
  });

  describe('renderTooltip - alert scenarios', () => {
    it('4.1 should render tooltip without alert section when bar has no alerts', () => {
      const alerts: AlertTriggerData[] = [];
      renderer.render(ctx, candles, allPlots, viewport, layout, '#ffffff', alerts);

      // Should have called fillText 6 times (date + O/H/L/C/V)
      expect(ctx.fillText).toHaveBeenCalled();
      // The calls to fillText should not include alert-related text
      const calls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
      const alertCalls = calls.filter((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('⚠')
      );
      expect(alertCalls.length).toBe(0);
    });

    it('4.2 should render alert title and message when bar has one alert', () => {
      const alerts: AlertTriggerData[] = [
        { alertId: 'a1', barIndex: 0, timestamp: 1000000, title: 'BUY Signal', message: 'RSI oversold', destination: 'email' },
      ];
      renderer.render(ctx, candles, allPlots, viewport, layout, '#ffffff', alerts);

      const calls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;

      // Check the title line is present (prefixed with ⚠)
      const titleCall = calls.find((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('⚠') && call[0].includes('BUY Signal')
      );
      expect(titleCall).toBeDefined();

      // Check the message line with destination (indented, no ⚠ prefix)
      const msgCall = calls.find((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('RSI oversold') && call[0].includes('[email]')
      );
      expect(msgCall).toBeDefined();
    });

    it('4.3 should render multiple alerts when bar has several', () => {
      const alerts: AlertTriggerData[] = [
        { alertId: 'a1', barIndex: 0, timestamp: 1000000, title: 'Alert 1', message: 'First alert' },
        { alertId: 'a2', barIndex: 0, timestamp: 1000000, title: 'Alert 2', message: 'Second alert' },
        { alertId: 'a3', barIndex: 0, timestamp: 1000000, title: 'Alert 3', message: 'Third alert' },
      ];
      renderer.render(ctx, candles, allPlots, viewport, layout, '#ffffff', alerts);

      const calls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
      const alertCalls = calls.filter((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('⚠')
      );

      // At minimum: 3 title lines + potentially 3 message lines
      const titleCalls = alertCalls.filter((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('Alert')
      );
      expect(titleCalls.length).toBeGreaterThanOrEqual(3);
    });

    it('4.4 should cap at 5 alerts and show "+N more" when limit exceeded', () => {
      const alerts: AlertTriggerData[] = Array.from({ length: 8 }, (_, i) => ({
        alertId: `a${i}`,
        barIndex: 0,
        timestamp: 1000000,
        title: `Alert ${i + 1}`,
        message: `Message ${i + 1}`,
      }));

      renderer.render(ctx, candles, allPlots, viewport, layout, '#ffffff', alerts);

      const calls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;

      // Should show 5 alerts (title + message each) + 1 cap line = at most 11 lines
      // But at minimum, we should see the "+N more" line
      const capCall = calls.find((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('+3 more')
      );
      expect(capCall).toBeDefined();

      // Should NOT show Alert 6 (index 5, the 6th alert)
      const sixthCall = calls.find((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('Alert 6')
      );
      expect(sixthCall).toBeUndefined();
    });

    it('4.5 should gracefully handle AlertTriggerData without title/message fields', () => {
      const alerts: AlertTriggerData[] = [
        { alertId: 'a1', barIndex: 0, timestamp: 1000000 },  // No title, no message
        { alertId: 'a2', barIndex: 0, timestamp: 1000000 },  // No title, no message
      ];

      // Should not throw
      expect(() => {
        renderer.render(ctx, candles, allPlots, viewport, layout, '#ffffff', alerts);
      }).not.toThrow();

      const calls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
      // Should not render any ⚠ lines since no alerts have title/message
      const alertCalls = calls.filter((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('⚠')
      );
      expect(alertCalls.length).toBe(0);
    });
  });
});
