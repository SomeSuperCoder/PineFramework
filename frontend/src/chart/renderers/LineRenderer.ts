import type { PlotSeriesData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

export interface PlotRenderOptions {
  color: string;
  lineWidth: number;
  style: 'line' | 'stepline' | 'histogram' | 'columns' | 'circles' | 'cross' | 'area' | 'areabr';
  histbase?: number;
}

export class LineRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    viewport: Viewport,
    layout: LayoutManager,
    options: PlotRenderOptions,
  ): void {
    const regions = layout.getRegions();
    const { chartArea } = regions;
    const range = viewport.getVisibleRange();
    const barSpacing = viewport.getBarSpacing();

    ctx.strokeStyle = options.color;
    ctx.fillStyle = options.color;
    ctx.lineWidth = options.lineWidth;
    ctx.lineJoin = 'round';

    switch (options.style) {
      case 'line':
        this.renderLine(ctx, data, viewport, layout, chartArea, range, barSpacing, options);
        break;
      case 'stepline':
        this.renderStepline(ctx, data, viewport, layout, chartArea, range, barSpacing, options);
        break;
      case 'histogram':
        this.renderHistogram(ctx, data, viewport, layout, chartArea, range, barSpacing, options);
        break;
      case 'columns':
        this.renderColumns(ctx, data, viewport, layout, chartArea, range, barSpacing, options);
        break;
      case 'circles':
        this.renderCircles(ctx, data, viewport, layout, chartArea, range, barSpacing, options);
        break;
      case 'cross':
        this.renderCross(ctx, data, viewport, layout, chartArea, range, barSpacing, options);
        break;
      case 'area':
      case 'areabr':
        this.renderArea(ctx, data, viewport, layout, chartArea, range, barSpacing, options);
        break;
    }
  }

  private renderLine(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    range: { start: number; end: number },
    barSpacing: number,
    _options: PlotRenderOptions,
  ): void {
    let started = false;
    ctx.beginPath();
    for (let i = range.start; i < range.end && i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) {
        started = false;
        continue;
      }
      const x = viewport.barIndexToPixel(i) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  private renderStepline(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    range: { start: number; end: number },
    barSpacing: number,
    _options: PlotRenderOptions,
  ): void {
    let prevY: number | null = null;
    ctx.beginPath();
    for (let i = range.start; i < range.end && i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) {
        prevY = null;
        continue;
      }
      const x = viewport.barIndexToPixel(i) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height);
      if (prevY !== null) {
        ctx.lineTo(x, prevY);
      }
      ctx.lineTo(x, y);
      prevY = y;
    }
    ctx.stroke();
  }

  private renderHistogram(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    range: { start: number; end: number },
    barSpacing: number,
    options: PlotRenderOptions,
  ): void {
    const baseY = layout.priceToPixel(options.histbase ?? 0, chartArea.y, chartArea.height);
    ctx.beginPath();
    for (let i = range.start; i < range.end && i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) continue;
      const x = viewport.barIndexToPixel(i) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height);
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private renderColumns(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    range: { start: number; end: number },
    barSpacing: number,
    options: PlotRenderOptions,
  ): void {
    const baseY = layout.priceToPixel(options.histbase ?? 0, chartArea.y, chartArea.height);
    const colWidth = Math.max(1, barSpacing * 0.5);
    for (let i = range.start; i < range.end && i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) continue;
      const x = viewport.barIndexToPixel(i) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height);
      const top = Math.min(baseY, y);
      const height = Math.max(1, Math.abs(y - baseY));
      ctx.fillRect(x - colWidth / 2, top, colWidth, height);
    }
  }

  private renderCircles(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    range: { start: number; end: number },
    barSpacing: number,
    _options: PlotRenderOptions,
  ): void {
    const radius = Math.max(2, barSpacing * 0.2);
    ctx.beginPath();
    for (let i = range.start; i < range.end && i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) continue;
      const x = viewport.barIndexToPixel(i) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height);
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  private renderCross(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    range: { start: number; end: number },
    barSpacing: number,
    _options: PlotRenderOptions,
  ): void {
    const size = Math.max(3, barSpacing * 0.25);
    for (let i = range.start; i < range.end && i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) continue;
      const x = viewport.barIndexToPixel(i) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height);
      ctx.beginPath();
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x + size, y + size);
      ctx.moveTo(x + size, y - size);
      ctx.lineTo(x - size, y + size);
      ctx.stroke();
    }
  }

  private renderArea(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    range: { start: number; end: number },
    barSpacing: number,
    _options: PlotRenderOptions,
  ): void {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = range.start; i < range.end && i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) continue;
      const x = viewport.barIndexToPixel(i) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height);
      points.push({ x, y });
    }
    if (points.length < 2) return;

    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, chartArea.y + chartArea.height);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.lineTo(points[points.length - 1].x, chartArea.y + chartArea.height);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }
}
