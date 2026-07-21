import type { FillData, PlotSeriesData, CandlestickData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

/** Convert #RRGGBBAA to rgba() — some Canvas contexts silently reject 9-char hex */
function toRgba(hex: string): string {
  if (hex.length === 9 && hex.startsWith('#')) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = parseInt(hex.slice(7, 9), 16) / 255;
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }
  return hex;
}

/**
 * Parse a CSS color string and return a fully transparent version (alpha=0).
 * Handles #RRGGBB, #RRGGBBAA, rgba(), and rgb().
 */
function transparent(color: string): string {
  if (color.startsWith('#')) {
    if (color.length === 9) return color.slice(0, 7) + '00';
    return color + '00';
  }
  if (color.startsWith('rgba(')) {
    return color.replace(/rgba\(([^,]+,[^,]+,[^,]+),[^)]+\)/, 'rgba($1,0)');
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', ',0)');
  }
  return 'rgba(0,0,0,0)';
}

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
        const color = perBarColors?.[i] ?? undefined;
        points.push({ x, upper, lower, color: color ? toRgba(color) : undefined });
      }

      if (points.length < 2) continue;

      if (!perBarColors) {
        // Solid fill: gradient radiating from BOTH plot lines towards the middle.
        // Opaque near plot lines, transparent in the middle (TradingView-style glow).
        const fillColor = toRgba(fill.color);
        // Find the vertical extent of the entire fill polygon
        let polyTop = Infinity, polyBot = -Infinity;
        for (const p of points) {
          if (p.upper < polyTop) polyTop = p.upper;
          if (p.lower > polyBot) polyBot = p.lower;
        }
        const grad = ctx.createLinearGradient(0, polyTop, 0, polyBot);
        grad.addColorStop(0, fillColor);
        grad.addColorStop(0.5, 'rgba(0,0,0,0)');
        grad.addColorStop(1, fillColor);
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
        // Per-bar segments: gradient radiates from BOTH plot lines
        // (opaque at edges) towards the middle (transparent).
        for (let i = 0; i < points.length - 1; i++) {
          const segColor = points[i].color;
          if (!segColor) continue;

          const topY = Math.min(points[i].upper, points[i + 1].upper);
          const botY = Math.max(points[i].lower, points[i + 1].lower);

          const grad = ctx.createLinearGradient(0, topY, 0, botY);
          grad.addColorStop(0, segColor);
          grad.addColorStop(0.5, transparent(segColor));
          grad.addColorStop(1, segColor);
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
