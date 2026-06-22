import type { HLineData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

export class HLineRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    hlines: HLineData[],
    _viewport: Viewport,
    layout: LayoutManager,
  ): void {
    const regions = layout.getRegions();
    const { chartArea } = regions;

    for (const hline of hlines) {
      const y = layout.priceToPixel(hline.price, chartArea.y, chartArea.height);

      ctx.strokeStyle = hline.color;
      ctx.lineWidth = hline.width ?? 1;

      if (hline.style === 'dashed') {
        ctx.setLineDash([8, 4]);
      } else if (hline.style === 'dotted') {
        ctx.setLineDash([2, 3]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(chartArea.x, y);
      ctx.lineTo(chartArea.x + chartArea.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
