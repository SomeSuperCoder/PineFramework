import type { FillData, PlotSeriesData, CandlestickData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

export class AreaRenderer {
  private findBarIndex(candles: CandlestickData[], time: number): number {
    const targetTime = Math.floor(time);
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].time === targetTime) return i;
    }
    if (candles.length > 0 && targetTime >= candles[candles.length - 1]!.time) {
      return candles.length;
    }
    return -1;
  }

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
      for (let i = 0; i < fromData.length; i++) {
        const v1 = fromData[i]?.value;
        const v2 = toData[i]?.value;
        if (v1 === null || v1 === undefined || v2 === null || v2 === undefined) continue;
        const time = fromData[i].time;
        const barIdx = this.findBarIndex(candles, time);
        if (barIdx < 0) continue;
        const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
        const upper = layout.priceToPixel(Math.max(v1, v2), chartArea.y, chartArea.height);
        const lower = layout.priceToPixel(Math.min(v1, v2), chartArea.y, chartArea.height);
        points.push({ x, upper, lower, color: perBarColors?.[i] ?? undefined });
      }

      if (points.length < 2) continue;

      if (!perBarColors) {
        // No per-bar data: draw a single fill polygon with the fill's static color
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
        // Per-bar colors available: draw each bar segment with its own color
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
