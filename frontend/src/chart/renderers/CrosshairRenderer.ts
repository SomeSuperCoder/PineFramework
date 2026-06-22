import type { CandlestickData, PlotSeriesData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';

export class CrosshairRenderer {
  private hoveredBarIndex: number = -1;
  private mouseX: number = 0;
  private mouseY: number = 0;
  private visible: boolean = false;

  setPosition(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  getHoveredBarIndex(): number {
    return this.hoveredBarIndex;
  }

  render(
    ctx: CanvasRenderingContext2D,
    candles: CandlestickData[],
    allPlots: Map<string, PlotSeriesData[]>,
    viewport: Viewport,
    layout: LayoutManager,
    textColor: string,
  ): void {
    if (!this.visible) return;

    const regions = layout.getRegions();
    const { chartArea, volumeArea, priceScale, timeScale } = regions;
    const totalChartHeight = chartArea.height + volumeArea.height;

    const barIndex = Math.round(viewport.pixelToBarIndex(this.mouseX));
    this.hoveredBarIndex = barIndex;

    const snappedX = viewport.barIndexToPixel(barIndex) + viewport.getBarSpacing() / 2;
    const price = layout.pixelToPrice(this.mouseY, chartArea.y, totalChartHeight);

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(snappedX, chartArea.y);
    ctx.lineTo(snappedX, chartArea.y + totalChartHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(chartArea.x, this.mouseY);
    ctx.lineTo(chartArea.x + chartArea.width, this.mouseY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(30,30,60,0.9)';
    ctx.fillRect(priceScale.x + 2, this.mouseY - 10, priceScale.width - 4, 20);
    ctx.fillStyle = textColor;
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.formatPrice(price), priceScale.x + 6, this.mouseY);

    if (barIndex >= 0 && barIndex < candles.length) {
      const candle = candles[barIndex];
      ctx.fillStyle = 'rgba(30,30,60,0.9)';
      const labelWidth = 80;
      ctx.fillRect(snappedX - labelWidth / 2, timeScale.y + 2, labelWidth, timeScale.height - 4);
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const date = new Date(candle.time * 1000);
      const timeLabel = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      ctx.fillText(timeLabel, snappedX, timeScale.y + timeScale.height / 2);

      this.renderTooltip(ctx, candle, allPlots, barIndex, snappedX, chartArea, textColor);
    }
  }

  private renderTooltip(
    ctx: CanvasRenderingContext2D,
    candle: CandlestickData,
    allPlots: Map<string, PlotSeriesData[]>,
    barIndex: number,
    x: number,
    chartArea: { x: number; y: number; width: number; height: number },
    textColor: string,
  ): void {
    const lines = [
      `O: ${candle.open.toFixed(2)}`,
      `H: ${candle.high.toFixed(2)}`,
      `L: ${candle.low.toFixed(2)}`,
      `C: ${candle.close.toFixed(2)}`,
      `V: ${candle.volume.toFixed(0)}`,
    ];

    let plotIndex = 0;
    for (const [key, data] of allPlots) {
      const val = data[barIndex]?.value;
      if (val !== null && val !== undefined) {
        const name = key.replace(/__color:[^_]+/, '').replace(/__lw:\d+/, '');
        lines.push(`${name}: ${typeof val === 'number' ? val.toFixed(2) : val}`);
      }
      plotIndex++;
      if (plotIndex > 5) break;
    }

    const lineHeight = 16;
    const padding = 6;
    const tooltipWidth = 130;
    const tooltipHeight = lines.length * lineHeight + padding * 2;
    let tooltipX = x + 12;
    let tooltipY = chartArea.y + 10;
    if (tooltipX + tooltipWidth > chartArea.x + chartArea.width) {
      tooltipX = x - tooltipWidth - 12;
    }

    ctx.fillStyle = 'rgba(20,20,50,0.92)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      const isOHLC = i < 4;
      ctx.fillStyle = isOHLC ? (candle.close >= candle.open ? '#4caf50' : '#e94560') : textColor;
      ctx.fillText(lines[i], tooltipX + padding, tooltipY + padding + i * lineHeight);
    }
  }

  private formatPrice(price: number): string {
    if (Math.abs(price) >= 1000) return price.toFixed(0);
    if (Math.abs(price) >= 1) return price.toFixed(2);
    return price.toFixed(4);
  }
}
