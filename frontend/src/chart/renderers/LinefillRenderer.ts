import type { LinefillData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager, PaneRegion } from '../LayoutManager.js';

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
 * Renders linefill objects — filled polygons between two line segments.
 *
 * Each linefill defines two lines (line1, line2) in barIndex/price space.
 * The renderer converts these to canvas pixel coordinates and draws a filled
 * quadrilateral: line1.p1 → line1.p2 → line2.p2 → line2.p1 → closePath.
 *
 * Performance: batches by color — one beginPath/fill per unique color group.
 */
export class LinefillRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    linefills: LinefillData[],
    viewport: Viewport,
    layout: LayoutManager,
    pane?: PaneRegion,
  ): void {
    if (linefills.length === 0) return;

    const regions = layout.getRegions();
    const chartArea = pane ?? regions.chartArea;
    const paneId = pane?.id;

    // Group by color for batch rendering (one fill call per color group)
    const colorGroups = new Map<string, LinefillData[]>();
    for (const lf of linefills) {
      const key = toRgba(lf.color);
      let group = colorGroups.get(key);
      if (!group) {
        group = [];
        colorGroups.set(key, group);
      }
      group.push(lf);
    }

    for (const [color, group] of colorGroups) {
      ctx.fillStyle = color;
      ctx.beginPath();

      for (const lf of group) {
        // Convert barIndex → pixel X (LEFT EDGE — matches skeleton line
        // rendering in PineChart/Viewport, no half-bar shift), price → pixel Y
        const x1 = viewport.barIndexToPixel(lf.line1.x1);
        const y1 = layout.priceToPixel(lf.line1.y1, chartArea.y, chartArea.height, paneId);
        const x2 = viewport.barIndexToPixel(lf.line1.x2);
        const y2 = layout.priceToPixel(lf.line1.y2, chartArea.y, chartArea.height, paneId);
        const x3 = viewport.barIndexToPixel(lf.line2.x2);
        const y3 = layout.priceToPixel(lf.line2.y2, chartArea.y, chartArea.height, paneId);
        const x4 = viewport.barIndexToPixel(lf.line2.x1);
        const y4 = layout.priceToPixel(lf.line2.y1, chartArea.y, chartArea.height, paneId);

        // Draw quadrilateral: line1.p1 → line1.p2 → line2.p2 → line2.p1
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.closePath();
      }

      ctx.fill();
    }
  }
}
