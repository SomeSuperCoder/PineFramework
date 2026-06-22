import type { Viewport } from './Viewport.js';

export interface InteractionCallbacks {
  onCrosshairMove: (x: number, y: number) => void;
  onCrosshairHide: () => void;
  onVisibleRangeChange: () => void;
  onResize: () => void;
}

export class InteractionHandler {
  private canvas: HTMLCanvasElement;
  private viewport: Viewport;
  private callbacks: InteractionCallbacks;
  private isDragging: boolean = false;
  private lastMouseY: number = 0;
  private dragStartX: number = 0;
  private velocity: number = 0;
  private animFrame: number = 0;
  private chartWidth: number;

  constructor(
    canvas: HTMLCanvasElement,
    viewport: Viewport,
    callbacks: InteractionCallbacks,
    chartWidth: number,
  ) {
    this.canvas = canvas;
    this.viewport = viewport;
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

  private onMouseMove = (e: MouseEvent): void => {
    const { x, y } = this.getCanvasCoords(e);
    this.lastMouseY = y;

    if (this.isDragging) {
      const delta = x - this.dragStartX;
      this.viewport.pan(delta);
      this.dragStartX = x;
      this.velocity = delta;
      this.callbacks.onVisibleRangeChange();
    }

    this.callbacks.onCrosshairMove(x, y);
  };

  private onMouseDown = (e: MouseEvent): void => {
    const { x } = this.getCanvasCoords(e);
    this.isDragging = true;
    this.dragStartX = x;
    this.velocity = 0;
    this.canvas.style.cursor = 'grabbing';
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
    this.canvas.style.cursor = 'crosshair';
    if (Math.abs(this.velocity) > 2) {
      this.startInertialScroll();
    }
  };

  private onMouseLeave = (): void => {
    this.isDragging = false;
    this.canvas.style.cursor = 'crosshair';
    this.callbacks.onCrosshairHide();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const { x } = this.getCanvasCoords(e);
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.viewport.zoom(factor, x, this.chartWidth);
    this.callbacks.onVisibleRangeChange();
    this.callbacks.onCrosshairMove(x, this.lastMouseY);
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 1) {
      const { x } = this.getCanvasCoords(e.touches[0]);
      this.isDragging = true;
      this.dragStartX = x;
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
