import type { FillData, PlotSeriesData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

export class AreaRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    fills: FillData[],
    allPlots: Map<string, PlotSeriesData[]>,
    viewport: Viewport,
    layout: LayoutManager,
  ): void {
    const regions = layout.getRegions();
    const { chartArea } = regions;
    const range = viewport.getVisibleRange();
    const barSpacing = viewport.getBarSpacing();

    for (const fill of fills) {
      const fromData = allPlots.get(fill.from);
      const toData = allPlots.get(fill.to);
      if (!fromData || !toData) continue;

      const points: Array<{ x: number; upper: number; lower: number }> = [];
      for (let i = range.start; i < range.end; i++) {
        const v1 = fromData[i]?.value;
        const v2 = toData[i]?.value;
        if (v1 === null || v1 === undefined || v2 === null || v2 === undefined) continue;
        const x = viewport.barIndexToPixel(i) + barSpacing / 2;
        const upper = layout.priceToPixel(Math.max(v1, v2), chartArea.y, chartArea.height);
        const lower = layout.priceToPixel(Math.min(v1, v2), chartArea.y, chartArea.height);
        points.push({ x, upper, lower });
      }

      if (points.length < 2) continue;

      ctx.fillStyle = fill.color;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].upper);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].upper);
      }
      for (let i = points.length - 1; i >= 0; i--) {
        ctx.lineTo(points[i].x, points[i].lower);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
