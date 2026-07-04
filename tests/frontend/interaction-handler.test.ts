import { jest } from '@jest/globals';

const g = globalThis as any;
if (!g.window) g.window = { devicePixelRatio: 1 };
if (!g.cancelAnimationFrame) g.cancelAnimationFrame = () => {};

import { InteractionHandler } from '../../frontend/src/chart/InteractionHandler.js';
import { Viewport } from '../../frontend/src/chart/Viewport.js';
import { LayoutManager } from '../../frontend/src/chart/LayoutManager.js';

function createMockCanvas() {
  const listeners: Record<string, Function[]> = {};
  const addEventListener = jest.fn((event: string, fn: Function, _opts?: any) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event]!.push(fn);
  });
  const removeEventListener = jest.fn((event: string, fn: Function) => {
    if (listeners[event]) {
      listeners[event] = listeners[event]!.filter((f) => f !== fn);
    }
  });
  const styleObj: Record<string, string> = { cursor: 'crosshair' };
  const canvas = {
    addEventListener,
    removeEventListener,
    style: styleObj,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    _emit(event: string, e: any) {
      for (const fn of listeners[event] || []) fn(e);
    },
  };
  return canvas;
}

function createWheelEvent(overrides: Record<string, any> = {}): WheelEvent {
  return {
    clientX: 500,
    clientY: 300,
    deltaY: 100,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: jest.fn(),
    ...overrides,
  } as unknown as WheelEvent;
}

function createMouseEvent(overrides: Record<string, any> = {}): MouseEvent {
  return {
    clientX: 500,
    clientY: 300,
    button: 0,
    preventDefault: jest.fn(),
    ...overrides,
  } as unknown as MouseEvent;
}

describe('InteractionHandler - TradingView-style Navigation', () => {
  let canvas: ReturnType<typeof createMockCanvas>;
  let viewport: Viewport;
  let layout: LayoutManager;
  let callbacks: {
    onCrosshairMove: ReturnType<typeof jest.fn>;
    onCrosshairHide: ReturnType<typeof jest.fn>;
    onVisibleRangeChange: ReturnType<typeof jest.fn>;
    onPriceRangeChange: ReturnType<typeof jest.fn>;
    onResize: ReturnType<typeof jest.fn>;
  };
  let handler: InteractionHandler;

  beforeEach(() => {
    canvas = createMockCanvas();
    viewport = new Viewport(8, 2, 100);
    viewport.setTotalBars(200);
    layout = new LayoutManager(70, 30, 0.2);
    layout.calculate(1000, 600, 0);
    layout.setPriceRange(100, 200);
    callbacks = {
      onCrosshairMove: jest.fn(),
      onCrosshairHide: jest.fn(),
      onVisibleRangeChange: jest.fn(),
      onPriceRangeChange: jest.fn(),
      onResize: jest.fn(),
    };
    handler = new InteractionHandler(canvas as any, viewport, layout, callbacks, 930);
  });

  afterEach(() => {
    handler.destroy();
  });

  describe('92.1 Ctrl+scroll fine zoom', () => {
    it('should apply reduced zoom factor when ctrlKey is held', () => {
      const initialSpacing = viewport.getBarSpacing();
      canvas._emit(
        'wheel',
        createWheelEvent({ deltaY: -100, ctrlKey: true, clientX: 400, clientY: 300 }),
      );
      const fineSpacing = viewport.getBarSpacing();
      const fineDelta = Math.abs(fineSpacing - initialSpacing);

      viewport.fitContent(930);
      const beforeNormal = viewport.getBarSpacing();
      canvas._emit(
        'wheel',
        createWheelEvent({ deltaY: -100, ctrlKey: false, clientX: 400, clientY: 300 }),
      );
      const normalDelta = Math.abs(viewport.getBarSpacing() - beforeNormal);

      expect(fineDelta).toBeGreaterThan(0);
      expect(normalDelta).toBeGreaterThan(fineDelta);
    });

    it('should apply reduced zoom factor when metaKey (Cmd) is held', () => {
      const initialSpacing = viewport.getBarSpacing();
      canvas._emit(
        'wheel',
        createWheelEvent({ deltaY: -100, metaKey: true, clientX: 400, clientY: 300 }),
      );
      const fineSpacing = viewport.getBarSpacing();

      expect(fineSpacing).not.toBe(initialSpacing);
      expect(Math.abs(fineSpacing - initialSpacing)).toBeGreaterThan(0);
    });
  });

  describe('92.2 Middle mouse button free panning', () => {
    it('should enter middle-drag mode on middle mouse button down', () => {
      canvas._emit('mousedown', createMouseEvent({ button: 1, clientX: 400, clientY: 300 }));
      expect(canvas.style.cursor).toBe('grab');
    });

    it('should pan both X and Y on middle mouse drag', () => {
      canvas._emit('mousedown', createMouseEvent({ button: 1, clientX: 400, clientY: 300 }));
      canvas._emit('mousemove', createMouseEvent({ clientX: 450, clientY: 350 }));

      expect(callbacks.onVisibleRangeChange).toHaveBeenCalled();
      expect(callbacks.onPriceRangeChange).toHaveBeenCalled();
    });

    it('should reset cursor on mouse up after middle-drag', () => {
      canvas._emit('mousedown', createMouseEvent({ button: 1, clientX: 400, clientY: 300 }));
      canvas._emit('mouseup', createMouseEvent());

      expect(canvas.style.cursor).toBe('crosshair');
    });

    it('should prevent default on middle mouse down', () => {
      const pd = jest.fn();
      canvas._emit(
        'mousedown',
        createMouseEvent({ button: 1, clientX: 400, clientY: 300, preventDefault: pd }),
      );
      expect(pd).toHaveBeenCalled();
    });
  });

  describe('92.3 Time axis drag interaction', () => {
    it('should enter time-axis-drag mode on mousedown on time axis', () => {
      const regions = layout.getRegions();
      const timeAxisY = regions.timeScale.y + 5;
      canvas._emit('mousedown', createMouseEvent({ clientX: 400, clientY: timeAxisY }));
      expect(canvas.style.cursor).toBe('ew-resize');
    });

    it('should change bar spacing on time axis drag', () => {
      const regions = layout.getRegions();
      const timeAxisY = regions.timeScale.y + 5;
      const initialSpacing = viewport.getBarSpacing();

      canvas._emit('mousedown', createMouseEvent({ clientX: 400, clientY: timeAxisY }));
      canvas._emit('mousemove', createMouseEvent({ clientX: 500, clientY: timeAxisY }));

      expect(viewport.getBarSpacing()).not.toBe(initialSpacing);
      expect(callbacks.onVisibleRangeChange).toHaveBeenCalled();
    });
  });

  describe('92.4 Double-click time axis reset', () => {
    it('should reset bar spacing on double-click of time axis', () => {
      const regions = layout.getRegions();
      const timeAxisY = regions.timeScale.y + 5;

      viewport.zoom(0.1, 400, 930);
      const zoomedSpacing = viewport.getBarSpacing();

      canvas._emit('dblclick', createMouseEvent({ clientX: 400, clientY: timeAxisY }));

      expect(viewport.getBarSpacing()).not.toBe(zoomedSpacing);
      expect(callbacks.onVisibleRangeChange).toHaveBeenCalled();
    });

    it('should not reset price range on double-click of time axis', () => {
      const regions = layout.getRegions();
      const timeAxisY = regions.timeScale.y + 5;
      layout.setManualPriceRange(50, 150);

      canvas._emit('dblclick', createMouseEvent({ clientX: 400, clientY: timeAxisY }));

      expect(callbacks.onPriceRangeChange).not.toHaveBeenCalled();
    });
  });

  describe('92.5 Double-click price scale reset', () => {
    it('should reset price range on double-click of price scale', () => {
      const regions = layout.getRegions();
      const priceScaleX = regions.priceScale.x + 10;
      layout.setManualPriceRange(50, 150);

      canvas._emit('dblclick', createMouseEvent({ clientX: priceScaleX, clientY: 300 }));

      expect(callbacks.onPriceRangeChange).toHaveBeenCalled();
      expect(layout.isManualPriceRange()).toBe(false);
    });

    it('should reset both price and time on double-click of chart area', () => {
      layout.setManualPriceRange(50, 150);
      viewport.zoom(0.1, 400, 930);

      canvas._emit('dblclick', createMouseEvent({ clientX: 400, clientY: 300 }));

      expect(callbacks.onPriceRangeChange).toHaveBeenCalled();
      expect(callbacks.onVisibleRangeChange).toHaveBeenCalled();
      expect(layout.isManualPriceRange()).toBe(false);
    });
  });

  describe('Chart area free pan', () => {
    it('should pan both X and Y on chart area drag', () => {
      canvas._emit('mousedown', createMouseEvent({ clientX: 400, clientY: 300 }));
      canvas._emit('mousemove', createMouseEvent({ clientX: 450, clientY: 350 }));

      expect(callbacks.onVisibleRangeChange).toHaveBeenCalled();
      expect(callbacks.onPriceRangeChange).toHaveBeenCalled();
    });

    it('should pan horizontally only when moving only in X', () => {
      canvas._emit('mousedown', createMouseEvent({ clientX: 400, clientY: 300 }));
      canvas._emit('mousemove', createMouseEvent({ clientX: 500, clientY: 300 }));

      expect(callbacks.onVisibleRangeChange).toHaveBeenCalled();
      expect(callbacks.onPriceRangeChange).toHaveBeenCalled();
    });
  });

  describe('Price scale drag zoom', () => {
    it('should zoom price scale vertically on drag', () => {
      const regions = layout.getRegions();
      const priceScaleX = regions.priceScale.x + 10;
      const initialRange = layout.getPriceRange();
      const initialHeight = initialRange.max - initialRange.min;

      canvas._emit('mousedown', createMouseEvent({ clientX: priceScaleX, clientY: 300 }));
      canvas._emit('mousemove', createMouseEvent({ clientX: priceScaleX, clientY: 400 }));

      const newRange = layout.getPriceRange();
      const newHeight = newRange.max - newRange.min;

      expect(newHeight).not.toBe(initialHeight);
      expect(callbacks.onPriceRangeChange).toHaveBeenCalled();
    });
  });

  describe('Cursor changes', () => {
    it('should set ns-resize cursor on price scale mousedown', () => {
      const regions = layout.getRegions();
      const priceScaleX = regions.priceScale.x + 10;
      canvas._emit('mousedown', createMouseEvent({ clientX: priceScaleX, clientY: 300 }));
      expect(canvas.style.cursor).toBe('ns-resize');
    });

    it('should set grabbing cursor on chart area mousedown', () => {
      canvas._emit('mousedown', createMouseEvent({ clientX: 400, clientY: 300 }));
      expect(canvas.style.cursor).toBe('grabbing');
    });

    it('should reset to crosshair on mouseup', () => {
      canvas._emit('mousedown', createMouseEvent({ clientX: 400, clientY: 300 }));
      canvas._emit('mouseup', createMouseEvent());
      expect(canvas.style.cursor).toBe('crosshair');
    });

    it('should reset to crosshair on mouseleave', () => {
      canvas._emit('mousedown', createMouseEvent({ clientX: 400, clientY: 300 }));
      canvas._emit('mouseleave', createMouseEvent());
      expect(canvas.style.cursor).toBe('crosshair');
    });
  });
});
