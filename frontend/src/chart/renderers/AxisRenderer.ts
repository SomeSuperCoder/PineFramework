import type { CandlestickData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';
import { formatAxisLabel } from '../../utils/time';

export class AxisRenderer {
  renderPriceScale(
    ctx: CanvasRenderingContext2D,
    layout: LayoutManager,
    textColor: string,
    borderColor: string,
  ): void {
    const regions = layout.getRegions();
    const { priceScale, chartArea, volumeArea, indicatorPanes } = regions;
    const mainHeight = chartArea.height + volumeArea.height;

    ctx.fillStyle = '#0d0d18';
    ctx.fillRect(priceScale.x, priceScale.y, priceScale.width, priceScale.height);

    // Main chart + volume price labels
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(priceScale.x, priceScale.y);
    ctx.lineTo(priceScale.x, priceScale.y + mainHeight);
    ctx.stroke();

    const priceRange = layout.getPriceRange();
    const tickSpacing = layout.calculateAutoTickSpacing(priceRange.max - priceRange.min);
    const startTick = Math.ceil(priceRange.min / tickSpacing) * tickSpacing;

    ctx.fillStyle = textColor;
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let price = startTick; price <= priceRange.max; price += tickSpacing) {
      const y = layout.priceToPixel(price, chartArea.y, mainHeight);
      if (y >= chartArea.y && y <= chartArea.y + mainHeight) {
        ctx.fillText(this.formatPrice(price), priceScale.x + 4, y);
      }
    }

    // Indicator pane price labels
    for (const pane of indicatorPanes) {
      const paneRange = layout.getIndicatorPriceRange(pane.id);
      const paneTickSpacing = layout.calculateAutoTickSpacing(paneRange.max - paneRange.min);
      const paneStartTick = Math.ceil(paneRange.min / paneTickSpacing) * paneTickSpacing;

      // Pane border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(priceScale.x, pane.y + pane.height);
      ctx.lineTo(priceScale.x + priceScale.width, pane.y + pane.height);
      ctx.stroke();

      // Pane price labels
      ctx.fillStyle = textColor;
      ctx.font = '11px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      for (let price = paneStartTick; price <= paneRange.max; price += paneTickSpacing) {
        const y = layout.priceToPixel(price, pane.y, pane.height, pane.id);
        if (y >= pane.y && y <= pane.y + pane.height) {
          ctx.fillText(this.formatPrice(price), priceScale.x + 4, y);
        }
      }
    }
  }

  renderTimeScale(
    ctx: CanvasRenderingContext2D,
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    textColor: string,
    borderColor: string,
  ): void {
    const regions = layout.getRegions();
    const { timeScale, chartArea } = regions;

    ctx.fillStyle = '#0d0d18';
    ctx.fillRect(timeScale.x, timeScale.y, timeScale.width, timeScale.height);

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(timeScale.x, timeScale.y);
    ctx.lineTo(timeScale.x + timeScale.width, timeScale.y);
    ctx.stroke();

    const range = viewport.getVisibleRange();
    const barSpacing = viewport.getBarSpacing();

    ctx.fillStyle = textColor;
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const step = barSpacing > 30 ? 1 : Math.ceil(50 / barSpacing);
    for (let i = range.start; i <= range.end; i += step) {
      if (i >= candles.length) break;
      const x = viewport.barIndexToPixel(i) + barSpacing / 2;
      if (x >= chartArea.x && x <= chartArea.x + chartArea.width) {
        const time = candles[i].time;
        const label = formatAxisLabel(time);
        ctx.fillText(label, x, timeScale.y + 6);
      }
    }
  }

  private formatPrice(price: number): string {
    if (Math.abs(price) >= 1000) return price.toFixed(0);
    if (Math.abs(price) >= 1) return price.toFixed(2);
    return price.toFixed(4);
  }
}
