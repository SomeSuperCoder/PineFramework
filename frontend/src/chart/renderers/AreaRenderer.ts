import type { FillData, PlotSeriesData, CandlestickData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

export class AreaRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    fills: FillData[],
    allPlots: Map<string, PlotSeriesData[]>,
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    fillColorData?: Record<string, (string | null)[]>,
  ): void {
    const regions = layout.getRegions();
    const { chartArea } = regions;
    const barSpacing = viewport.getBarSpacing();

    for (const fill of fills) {
      const fromData = allPlots.get(fill.from);
      const toData = allPlots.get(fill.to);
      if (!fromData || !toData) continue;

      const fillKey = `${fill.from}::${fill.to}`;
      const perBarColors = fillColorData?.[fillKey];

      const points: Array<{ x: number; upper: number; lower: number; color?: string }> = [];
      const limit = Math.min(fromData.length, toData.length, candles.length);
      for (let i = 0; i < limit; i++) {
        const v1 = fromData[i]?.value;
        const v2 = toData[i]?.value;
        if (v1 === null || v1 === undefined || v2 === null || v2 === undefined) continue;
        const x = viewport.barIndexToPixel(i) + barSpacing / 2;
        const upper = layout.priceToPixel(Math.max(v1, v2), chartArea.y, chartArea.height);
        const lower = layout.priceToPixel(Math.min(v1, v2), chartArea.y, chartArea.height);
        points.push({ x, upper, lower, color: perBarColors?.[i] ?? undefined });
      }

      if (points.length < 2) continue;

      if (!perBarColors) {
        // TradingView-style: solid semi-transparent fill across the entire polygon.
        // The color already has transparency from color.new() — no artificial gradient needed.
        ctx.fillStyle = fill.color;
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
      } else {
        // Per-bar segments: each bar segment gets its own solid color.
        // Colors already have per-bar transparency from color.new().
        for (let i = 0; i < points.length - 1; i++) {
          const segColor = points[i].color;
          if (!segColor) continue;

          ctx.fillStyle = segColor;
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].upper);
          ctx.lineTo(points[i + 1].x, points[i + 1].upper);
          ctx.lineTo(points[i + 1].x, points[i + 1].lower);
          ctx.lineTo(points[i].x, points[i].lower);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
}
