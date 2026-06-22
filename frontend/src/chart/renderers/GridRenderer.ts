import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

export class GridRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    viewport: Viewport,
    layout: LayoutManager,
    gridColor: string,
  ): void {
    const regions = layout.getRegions();
    const { chartArea, volumeArea } = regions;

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.5;

    const priceRange = layout.getPriceRange();
    const tickSpacing = layout.calculateAutoTickSpacing(priceRange.max - priceRange.min);
    const startTick = Math.ceil(priceRange.min / tickSpacing) * tickSpacing;

    const totalChartHeight = chartArea.height + volumeArea.height;
    for (let price = startTick; price <= priceRange.max; price += tickSpacing) {
      const y = layout.priceToPixel(price, chartArea.y, totalChartHeight);
      if (y >= chartArea.y && y <= chartArea.y + totalChartHeight) {
        ctx.beginPath();
        ctx.moveTo(chartArea.x, y);
        ctx.lineTo(chartArea.x + chartArea.width, y);
        ctx.stroke();
      }
    }

    const barSpacing = viewport.getBarSpacing();
    if (barSpacing > 10) {
      const range = viewport.getVisibleRange();
      const step = barSpacing > 30 ? 1 : Math.ceil(30 / barSpacing);
      for (let i = range.start; i <= range.end; i += step) {
        const x = viewport.barIndexToPixel(i) + barSpacing / 2;
        if (x >= chartArea.x && x <= chartArea.x + chartArea.width) {
          ctx.beginPath();
          ctx.moveTo(x, chartArea.y);
          ctx.lineTo(x, chartArea.y + totalChartHeight);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
  }
}
