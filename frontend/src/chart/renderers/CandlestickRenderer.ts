import type { CandlestickData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

export class CandlestickRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    barColors?: Map<number, string>,
  ): void {
    const regions = layout.getRegions();
    const { chartArea } = regions;
    const range = viewport.getVisibleRange();
    const barSpacing = viewport.getBarSpacing();
    const bodyWidth = Math.max(1, barSpacing * 0.7);

    for (let i = range.start; i < range.end && i < candles.length; i++) {
      const candle = candles[i];
      const x = viewport.barIndexToPixel(i);
      const centerX = x + barSpacing / 2;

      const openY = layout.priceToPixel(candle.open, chartArea.y, chartArea.height);
      const closeY = layout.priceToPixel(candle.close, chartArea.y, chartArea.height);
      const highY = layout.priceToPixel(candle.high, chartArea.y, chartArea.height);
      const lowY = layout.priceToPixel(candle.low, chartArea.y, chartArea.height);

      const isBullish = candle.close >= candle.open;
      const overrideColor = barColors?.get(i);
      const bodyColor = overrideColor || (isBullish ? '#4caf50' : '#e94560');

      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(centerX, highY);
      ctx.lineTo(centerX, lowY);
      ctx.stroke();

      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));

      ctx.fillStyle = bodyColor;
      ctx.fillRect(centerX - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    }
  }
}
