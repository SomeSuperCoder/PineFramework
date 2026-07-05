import type { PlotSeriesData, CandlestickData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager, PaneRegion } from '../LayoutManager.js';

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
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    options: PlotRenderOptions,
    pane?: PaneRegion,
  ): void {
    const regions = layout.getRegions();
    const chartArea = pane ?? regions.chartArea;
    const barSpacing = viewport.getBarSpacing();
    const paneId = pane?.id;

    ctx.strokeStyle = options.color;
    ctx.fillStyle = options.color;
    ctx.lineWidth = options.lineWidth;
    ctx.lineJoin = 'round';

    switch (options.style) {
      case 'line':
        this.renderLine(ctx, data, candles, viewport, layout, chartArea, barSpacing, options, paneId);
        break;
      case 'stepline':
        this.renderStepline(ctx, data, candles, viewport, layout, chartArea, barSpacing, options, paneId);
        break;
      case 'histogram':
        this.renderHistogram(ctx, data, candles, viewport, layout, chartArea, barSpacing, options, paneId);
        break;
      case 'columns':
        this.renderColumns(ctx, data, candles, viewport, layout, chartArea, barSpacing, options, paneId);
        break;
      case 'circles':
        this.renderCircles(ctx, data, candles, viewport, layout, chartArea, barSpacing, options, paneId);
        break;
      case 'cross':
        this.renderCross(ctx, data, candles, viewport, layout, chartArea, barSpacing, options, paneId);
        break;
      case 'area':
      case 'areabr':
        this.renderArea(ctx, data, candles, viewport, layout, chartArea, barSpacing, options, paneId);
        break;
    }
  }

  private findBarIndex(candles: CandlestickData[], time: number): number {
    const targetTime = Math.floor(time);
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].time === targetTime) return i;
    }
    return -1;
  }

  private renderLine(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    barSpacing: number,
    options: PlotRenderOptions,
    paneId?: string,
  ): void {
    let prevX: number | undefined;
    let prevY: number | undefined;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) {
        prevX = undefined;
        prevY = undefined;
        continue;
      }
      const barIdx = this.findBarIndex(candles, d.time);
      if (barIdx < 0) {
        prevX = undefined;
        prevY = undefined;
        continue;
      }
      const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height, paneId);
      if (prevX !== undefined && prevY !== undefined) {
        ctx.strokeStyle = d.color ?? options.color;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      prevX = x;
      prevY = y;
    }
  }

  private renderStepline(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    barSpacing: number,
    options: PlotRenderOptions,
    paneId?: string,
  ): void {
    let prevX: number | undefined;
    let prevY: number | undefined;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) {
        prevX = undefined;
        prevY = undefined;
        continue;
      }
      const barIdx = this.findBarIndex(candles, d.time);
      if (barIdx < 0) {
        prevX = undefined;
        prevY = undefined;
        continue;
      }
      const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height, paneId);
      if (prevX !== undefined && prevY !== undefined) {
        const segmentColor = d.color ?? options.color;
        ctx.strokeStyle = segmentColor;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, prevY);
        ctx.stroke();
        ctx.strokeStyle = segmentColor;
        ctx.beginPath();
        ctx.moveTo(x, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      prevX = x;
      prevY = y;
    }
  }

  private renderHistogram(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    barSpacing: number,
    options: PlotRenderOptions,
    paneId?: string,
  ): void {
    const baseY = layout.priceToPixel(options.histbase ?? 0, chartArea.y, chartArea.height, paneId);
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) continue;
      const barIdx = this.findBarIndex(candles, d.time);
      if (barIdx < 0) continue;
      const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height, paneId);
      ctx.strokeStyle = d.color ?? options.color;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  private renderColumns(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    barSpacing: number,
    options: PlotRenderOptions,
    paneId?: string,
  ): void {
    const baseY = layout.priceToPixel(options.histbase ?? 0, chartArea.y, chartArea.height, paneId);
    const colWidth = Math.max(1, barSpacing * 0.5);
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) continue;
      const barIdx = this.findBarIndex(candles, d.time);
      if (barIdx < 0) continue;
      const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height, paneId);
      const top = Math.min(baseY, y);
      const height = Math.max(1, Math.abs(y - baseY));
      ctx.fillStyle = d.color ?? options.color;
      ctx.fillRect(x - colWidth / 2, top, colWidth, height);
    }
  }

  private renderCircles(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    barSpacing: number,
    _options: PlotRenderOptions,
    paneId?: string,
  ): void {
    const radius = Math.max(2, barSpacing * 0.2);
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) continue;
      const barIdx = this.findBarIndex(candles, d.time);
      if (barIdx < 0) continue;
      const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height, paneId);
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  private renderCross(
    ctx: CanvasRenderingContext2D,
    data: PlotSeriesData[],
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    barSpacing: number,
    _options: PlotRenderOptions,
    paneId?: string,
  ): void {
    const size = Math.max(3, barSpacing * 0.25);
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) continue;
      const barIdx = this.findBarIndex(candles, d.time);
      if (barIdx < 0) continue;
      const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height, paneId);
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
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    chartArea: { x: number; y: number; width: number; height: number },
    barSpacing: number,
    _options: PlotRenderOptions,
    paneId?: string,
  ): void {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.value === null || d.value === undefined) continue;
      const barIdx = this.findBarIndex(candles, d.time);
      if (barIdx < 0) continue;
      const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
      const y = layout.priceToPixel(d.value, chartArea.y, chartArea.height, paneId);
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
