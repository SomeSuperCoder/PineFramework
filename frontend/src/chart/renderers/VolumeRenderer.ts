import type { CandlestickData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

export class VolumeRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
  ): void {
    const regions = layout.getRegions();
    const { volumeArea } = regions;
    const range = viewport.getVisibleRange();
    const barSpacing = viewport.getBarSpacing();
    const barWidth = Math.max(1, barSpacing * 0.7);

    let maxVol = 0;
    for (let i = range.start; i < range.end && i < candles.length; i++) {
      if (candles[i].volume > maxVol) maxVol = candles[i].volume;
    }
    layout.setVolumeMax(maxVol);

    for (let i = range.start; i < range.end && i < candles.length; i++) {
      const candle = candles[i];
      const x = viewport.barIndexToPixel(i);
      const centerX = x + barSpacing / 2;

      const barY = layout.volumeToPixel(candle.volume, volumeArea.y, volumeArea.height);
      const barHeight = volumeArea.y + volumeArea.height - barY;

      const isBullish = candle.close >= candle.open;
      ctx.fillStyle = isBullish ? 'rgba(76, 175, 80, 0.5)' : 'rgba(233, 69, 96, 0.5)';
      ctx.fillRect(centerX - barWidth / 2, barY, barWidth, barHeight);
    }
  }
}
