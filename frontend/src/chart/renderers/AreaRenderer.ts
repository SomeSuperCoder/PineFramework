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
    fillColorData?: Record<string, (string | null)[]>,
  ): void {
    const regions = layout.getRegions();
    const { chartArea } = regions;
    const range = viewport.getVisibleRange();
    const barSpacing = viewport.getBarSpacing();

    for (const fill of fills) {
      const fromData = allPlots.get(fill.from);
      const toData = allPlots.get(fill.to);
      if (!fromData || !toData) continue;

      const fillKey = `${fill.from}::${fill.to}`;
      const perBarColors = fillColorData?.[fillKey];

      for (let i = range.start; i < range.end - 1; i++) {
        const v1 = fromData[i]?.value;
        const v2 = toData[i]?.value;
        const v1n = fromData[i + 1]?.value;
        const v2n = toData[i + 1]?.value;
        if (v1 === null || v1 === undefined || v2 === null || v2 === undefined) continue;
        if (v1n === null || v1n === undefined || v2n === null || v2n === undefined) continue;

        const segmentColor = perBarColors?.[i] ?? fill.color;
        if (!segmentColor) continue;

        const x1 = viewport.barIndexToPixel(i) + barSpacing / 2;
        const x2 = viewport.barIndexToPixel(i + 1) + barSpacing / 2;

        ctx.fillStyle = segmentColor;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(x1, layout.priceToPixel(Math.max(v1, v2), chartArea.y, chartArea.height));
        ctx.lineTo(x2, layout.priceToPixel(Math.max(v1n, v2n), chartArea.y, chartArea.height));
        ctx.lineTo(x2, layout.priceToPixel(Math.min(v1n, v2n), chartArea.y, chartArea.height));
        ctx.lineTo(x1, layout.priceToPixel(Math.min(v1, v2), chartArea.y, chartArea.height));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
}
