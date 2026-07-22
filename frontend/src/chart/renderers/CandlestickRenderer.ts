import type { CandlestickData, CandleColorData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

export class CandlestickRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    candleColors?: Map<number, CandleColorData>,
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
      const defaultColor = isBullish ? '#4caf50' : '#e94560';
      const override = candleColors?.get(i);

      // Resolve colors with fallback chain: element-specific → body → default
      const bodyColor = override?.body ?? defaultColor;
      const wickColor = override?.wick ?? override?.body ?? defaultColor;
      const borderColor = override?.border ?? override?.body ?? defaultColor;

      // Draw wick (high to body top, body bottom to low)
      ctx.strokeStyle = wickColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      // Upper wick
      ctx.moveTo(centerX, highY);
      ctx.lineTo(centerX, bodyTop);
      // Lower wick
      ctx.moveTo(centerX, bodyBottom);
      ctx.lineTo(centerX, lowY);
      ctx.stroke();

      // Draw body
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      ctx.fillStyle = bodyColor;
      ctx.fillRect(centerX - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);

      // Draw border (outline around body) if borderColor differs from bodyColor
      if (borderColor !== bodyColor) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(centerX - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
      }
    }
  }
}
