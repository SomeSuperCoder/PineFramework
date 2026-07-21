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

      // Build points with both from and to plot values so we can
      // orient the gradient correctly per segment.
      const points: Array<{
        x: number;
        upper: number;
        lower: number;
        fromY: number;
        toY: number;
        color?: string;
      }> = [];
      const limit = Math.min(fromData.length, toData.length, candles.length);
      for (let i = 0; i < limit; i++) {
        const v1 = fromData[i]?.value;
        const v2 = toData[i]?.value;
        if (v1 === null || v1 === undefined || v2 === null || v2 === undefined) continue;
        const x = viewport.barIndexToPixel(i) + barSpacing / 2;
        const upper = layout.priceToPixel(Math.max(v1, v2), chartArea.y, chartArea.height);
        const lower = layout.priceToPixel(Math.min(v1, v2), chartArea.y, chartArea.height);
        const fromY = layout.priceToPixel(v1, chartArea.y, chartArea.height);
        const toY = layout.priceToPixel(v2, chartArea.y, chartArea.height);
        const color = perBarColors?.[i] ?? undefined;
        points.push({ x, upper, lower, fromY, toY, color: color ? toRgba(color) : undefined });
      }

      if (points.length < 2) continue;

      if (!perBarColors) {
        // Solid fill fallback — one-directional gradient from opaque at
        // the 'from' plot (first fill arg) to transparent at the 'to' plot.
        const fillColor = toRgba(fill.color);
        this.renderGradientPolygon(ctx, points, fillColor);
      } else {
        // Per-bar segments — each trapezoid has a one-directional gradient
        // from opaque (at the 'from' plot) to transparent (at the 'to' plot).
        for (let i = 0; i < points.length - 1; i++) {
          const segColor = points[i].color;
          if (!segColor) continue;
          this.renderGradientSegment(ctx, points[i], points[i + 1], segColor);
        }
      }
    }
  }

  /** Draw a filled polygon with a one-directional vertical gradient from
   *  opaque (at the 'from' plot) to transparent (at the 'to' plot). */
  private renderGradientPolygon(
    ctx: CanvasRenderingContext2D,
    points: Array<{ upper: number; lower: number; fromY: number; toY: number }>,
    color: string,
  ): void {
    // Average fromY and toY across all points to get the gradient axis
    let fromSum = 0, toSum = 0;
    for (const p of points) { fromSum += p.fromY; toSum += p.toY; }
    const avgFromY = fromSum / points.length;
    const avgToY = toSum / points.length;

    const yStart = Math.min(avgFromY, avgToY);
    const yEnd = Math.max(avgFromY, avgToY);
    const gradientHeight = yEnd - yStart;

    if (gradientHeight < 1) {
      // From and to are at the same Y — just fill solid
      ctx.fillStyle = color;
    } else {
      const opaquePos = (avgFromY - yStart) / gradientHeight;
      const transparentPos = (avgToY - yStart) / gradientHeight;
      const grad = ctx.createLinearGradient(0, yStart, 0, yEnd);
      // Fill area outside the from-to range with transparent
      grad.addColorStop(0, transparent(color));
      // Place the opaque color at the from-plot position
      if (opaquePos < transparentPos) {
        // from is above to: opaque at top, transparent at bottom
        grad.addColorStop(opaquePos, color);
        grad.addColorStop(transparentPos, transparent(color));
      } else {
        // from is below to: transparent at top, opaque at bottom
        grad.addColorStop(transparentPos, transparent(color));
        grad.addColorStop(opaquePos, color);
      }
      grad.addColorStop(1, transparent(color));
      ctx.fillStyle = grad;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].upper);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].upper);
    for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(points[i].x, points[i].lower);
    ctx.closePath();
    ctx.fill();
  }

  /** Draw a trapezoid segment between two bars with a vertical gradient
   *  from opaque (at the 'from' plot) to transparent (at the 'to' plot). */
  private renderGradientSegment(
    ctx: CanvasRenderingContext2D,
    a: { x: number; upper: number; lower: number; fromY: number; toY: number },
    b: { x: number; upper: number; lower: number; fromY: number; toY: number },
    color: string,
  ): void {
    // Average the from/to Y positions for a smooth gradient
    const avgFromY = (a.fromY + b.fromY) / 2;
    const avgToY = (a.toY + b.toY) / 2;

    // The trapezoid bounds
    const segTop = Math.min(a.upper, b.upper);
    const segBot = Math.max(a.lower, b.lower);

    // Gradient from min(from,to) to max(from,to), with opaque at from
    const yStart = Math.min(avgFromY, avgToY, segTop);
    const yEnd = Math.max(avgFromY, avgToY, segBot);

    if (yEnd - yStart < 1) {
      ctx.fillStyle = color;
    } else {
      const gradientH = yEnd - yStart;
      const opaquePos = (avgFromY - yStart) / gradientH;
      const transparentPos = (avgToY - yStart) / gradientH;
      const grad = ctx.createLinearGradient(0, yStart, 0, yEnd);
      grad.addColorStop(0, transparent(color));
      if (opaquePos < transparentPos) {
        grad.addColorStop(opaquePos, color);
        grad.addColorStop(transparentPos, transparent(color));
      } else {
        grad.addColorStop(transparentPos, transparent(color));
        grad.addColorStop(opaquePos, color);
      }
      grad.addColorStop(1, transparent(color));
      ctx.fillStyle = grad;
    }

    ctx.beginPath();
    ctx.moveTo(a.x, a.upper);
    ctx.lineTo(b.x, b.upper);
    ctx.lineTo(b.x, b.lower);
    ctx.lineTo(a.x, a.lower);
    ctx.closePath();
    ctx.fill();
  }
}
