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
        // Solid fill with vertical gradient from fill.color at top to transparent at bottom
        const grad = ctx.createLinearGradient(0, chartArea.y, 0, chartArea.y + chartArea.height);
        grad.addColorStop(0, fill.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
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
        // Per-bar gradient: each segment has a vertical gradient from its color to transparent
        for (let i = 0; i < points.length - 1; i++) {
          const segColor = points[i].color;
          if (!segColor) continue;

          const topY = Math.min(points[i].upper, points[i + 1].upper);
          const botY = Math.max(points[i].lower, points[i + 1].lower);

          // Parse segColor to make a transparent version
          const transparentColor = colorToTransparent(segColor);

          const grad = ctx.createLinearGradient(0, topY, 0, botY);
          grad.addColorStop(0, segColor);
          grad.addColorStop(0.4, segColor);
          grad.addColorStop(1, transparentColor);
          ctx.fillStyle = grad;

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

/**
 * Parse a CSS color string and return a transparent version (alpha=0).
 * Handles #RRGGBB, #RRGGBBAA, rgba(), and named colors.
 */
function colorToTransparent(color: string): string {
  // Extract the base color by stripping alpha
  if (color.startsWith('#')) {
    if (color.length === 9) {
      // #RRGGBBAA — strip the alpha channel, return fully transparent version
      return color.slice(0, 7) + '00';
    }
    // #RRGGBB or short form — return fully transparent
    return color + '00';
  }
  if (color.startsWith('rgba(')) {
    return color.replace(/rgba\(([^,]+,[^,]+,[^,]+),[^)]+\)/, 'rgba($1,0)');
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', ',0)');
  }
  // Unknown format — return fully transparent
  return 'rgba(0,0,0,0)';
}
