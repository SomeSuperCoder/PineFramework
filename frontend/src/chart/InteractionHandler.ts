import type { Viewport } from './Viewport.js';
import type { LayoutManager } from './LayoutManager.js';

export interface InteractionCallbacks {
  onCrosshairMove: (x: number, y: number) => void;
  onCrosshairHide: () => void;
  onVisibleRangeChange: () => void;
  onPriceRangeChange: () => void;
  onResize: () => void;
}

export class InteractionHandler {
  private canvas: HTMLCanvasElement;
  private viewport: Viewport;
  private layout: LayoutManager;
  private callbacks: InteractionCallbacks;
  private isDragging: boolean = false;
  private isPriceDragging: boolean = false;
  private isMiddleDragging: boolean = false;
  private isTimeAxisDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private velocity: number = 0;
  private animFrame: number = 0;
  private chartWidth: number;

  constructor(
    canvas: HTMLCanvasElement,
    viewport: Viewport,
    layout: LayoutManager,
    callbacks: InteractionCallbacks,
    chartWidth: number,
  ) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.layout = layout;
    this.callbacks = callbacks;
    this.chartWidth = chartWidth;
    this.bindEvents();
  }

  setChartWidth(width: number): void {
    this.chartWidth = width;
  }

  private bindEvents(): void {
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEnd);
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    cancelAnimationFrame(this.animFrame);
  }

  private getCanvasCoords(e: MouseEvent | Touch): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    };
  }

  private isOnPriceScale(x: number): boolean {
    const regions = this.layout.getRegions();
    if (!regions) return false;
    return x >= regions.priceScale.x;
  }

  private isOnTimeAxis(y: number): boolean {
    const regions = this.layout.getRegions();
    if (!regions) return false;
    return y >= regions.timeScale.y;
  }

  private onMouseMove = (e: MouseEvent): void => {
    const { x, y } = this.getCanvasCoords(e);

    if (this.isMiddleDragging) {
      const deltaX = x - this.dragStartX;
      const deltaY = y - this.dragStartY;
      this.viewport.pan(deltaX);
      this.layout.panPrice(deltaY);
      this.dragStartX = x;
      this.dragStartY = y;
      this.callbacks.onVisibleRangeChange();
      this.callbacks.onPriceRangeChange();
    } else if (this.isTimeAxisDragging) {
      const deltaX = x - this.dragStartX;
      const regions = this.layout.getRegions();
      if (regions) {
        const timeAxisCenterX = regions.timeScale.x + regions.timeScale.width / 2;
        const barSpacing = this.viewport.getBarSpacing();
        const newBarSpacing = Math.max(2, Math.min(100, barSpacing + deltaX * 0.05));
        const factor = newBarSpacing / barSpacing;
        this.viewport.zoom(factor, timeAxisCenterX, this.chartWidth);
        this.dragStartX = x;
        this.callbacks.onVisibleRangeChange();
      }
    } else if (this.isPriceDragging) {
      const deltaY = y - this.dragStartY;
      this.layout.panPrice(deltaY);
      this.dragStartY = y;
      this.callbacks.onPriceRangeChange();
    } else if (this.isDragging) {
      const delta = x - this.dragStartX;
      this.viewport.pan(delta);
      this.dragStartX = x;
      this.velocity = delta;
      this.callbacks.onVisibleRangeChange();
    }

    this.callbacks.onCrosshairMove(x, y);
  };

  private onMouseDown = (e: MouseEvent): void => {
    const { x, y } = this.getCanvasCoords(e);
    this.dragStartX = x;
    this.dragStartY = y;

    if (e.button === 1) {
      e.preventDefault();
      this.isMiddleDragging = true;
      this.canvas.style.cursor = 'grab';
    } else if (this.isOnTimeAxis(y)) {
      this.isTimeAxisDragging = true;
      this.canvas.style.cursor = 'ew-resize';
    } else if (this.isOnPriceScale(x)) {
      this.isPriceDragging = true;
      this.canvas.style.cursor = 'ns-resize';
    } else {
      this.isDragging = true;
      this.canvas.style.cursor = 'grabbing';
    }
    this.velocity = 0;
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
    this.isPriceDragging = false;
    this.isMiddleDragging = false;
    this.isTimeAxisDragging = false;
    this.canvas.style.cursor = 'crosshair';
    if (Math.abs(this.velocity) > 2 && !this.isPriceDragging && !this.isMiddleDragging) {
      this.startInertialScroll();
    }
  };

  private onMouseLeave = (): void => {
    this.isDragging = false;
    this.isPriceDragging = false;
    this.isMiddleDragging = false;
    this.isTimeAxisDragging = false;
    this.canvas.style.cursor = 'crosshair';
    this.callbacks.onCrosshairHide();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const { x, y } = this.getCanvasCoords(e);

    if (this.isOnPriceScale(x) || e.shiftKey) {
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      this.layout.zoomPrice(factor, y);
      this.callbacks.onPriceRangeChange();
    } else {
      let factor: number;
      if (e.ctrlKey || e.metaKey) {
        factor = e.deltaY > 0 ? 0.97 : 1.03;
      } else {
        factor = e.deltaY > 0 ? 0.9 : 1.1;
      }
      this.viewport.zoom(factor, x, this.chartWidth);
      this.callbacks.onVisibleRangeChange();
    }
    this.callbacks.onCrosshairMove(x, y);
  };

  private onDoubleClick = (e: MouseEvent): void => {
    const { x, y } = this.getCanvasCoords(e);

    if (this.isOnTimeAxis(y)) {
      this.viewport.fitContent(this.chartWidth);
      this.callbacks.onVisibleRangeChange();
    } else if (this.isOnPriceScale(x)) {
      this.layout.resetAutoPriceRange();
      this.callbacks.onPriceRangeChange();
    } else {
      this.layout.resetAutoPriceRange();
      this.viewport.fitContent(this.chartWidth);
      this.callbacks.onPriceRangeChange();
      this.callbacks.onVisibleRangeChange();
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 1) {
      const { x, y } = this.getCanvasCoords(e.touches[0]);
      this.isDragging = true;
      this.dragStartX = x;
      this.dragStartY = y;
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1 && this.isDragging) {
      const { x, y } = this.getCanvasCoords(e.touches[0]);
      const delta = x - this.dragStartX;
      this.viewport.pan(delta);
      this.dragStartX = x;
      this.callbacks.onVisibleRangeChange();
      this.callbacks.onCrosshairMove(x, y);
    } else if (e.touches.length === 2) {
      const t1 = this.getCanvasCoords(e.touches[0]);
      const t2 = this.getCanvasCoords(e.touches[1]);
      const dist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
      const centerX = (t1.x + t2.x) / 2;

      if ((this as any)._lastPinchDist) {
        const prevDist = (this as any)._lastPinchDist;
        const factor = dist / prevDist;
        this.viewport.zoom(factor, centerX, this.chartWidth);
        this.callbacks.onVisibleRangeChange();
      }
      (this as any)._lastPinchDist = dist;
    }
  };

  private onTouchEnd = (): void => {
    this.isDragging = false;
    (this as any)._lastPinchDist = null;
  };

  private startInertialScroll(): void {
    const decay = 0.95;
    const animate = () => {
      this.velocity *= decay;
      if (Math.abs(this.velocity) < 0.5) return;
      this.viewport.pan(this.velocity);
      this.callbacks.onVisibleRangeChange();
      this.animFrame = requestAnimationFrame(animate);
    };
    this.animFrame = requestAnimationFrame(animate);
  }
}
