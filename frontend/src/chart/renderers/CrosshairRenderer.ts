import type { CandlestickData, PlotSeriesData, AlertTriggerData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';
import { formatAxisLabel, formatTooltipDateTime } from 'pine-framework/utils/time';

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
    alerts: AlertTriggerData[] = [],
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

    ctx.fillStyle = 'rgba(15,15,35,0.95)';
    ctx.fillRect(priceScale.x + 2, this.mouseY - 10, priceScale.width - 4, 20);
    ctx.fillStyle = textColor;
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.formatPrice(price), priceScale.x + 6, this.mouseY);

    if (barIndex >= 0 && barIndex < candles.length) {
      const candle = candles[barIndex];
      ctx.fillStyle = 'rgba(15,15,35,0.95)';
      const labelWidth = 80;
      ctx.fillRect(snappedX - labelWidth / 2, timeScale.y + 2, labelWidth, timeScale.height - 4);
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const timeLabel = formatAxisLabel(candle.time);
      ctx.fillText(timeLabel, snappedX, timeScale.y + timeScale.height / 2);

      this.renderTooltip(ctx, candle, allPlots, snappedX, chartArea, textColor, alerts, barIndex);
    }
  }

  private renderTooltip(
    ctx: CanvasRenderingContext2D,
    candle: CandlestickData,
    allPlots: Map<string, PlotSeriesData[]>,
    x: number,
    chartArea: { x: number; y: number; width: number; height: number },
    textColor: string,
    alerts: AlertTriggerData[],
    barIndex: number,
  ): void {
    const dtLine = formatTooltipDateTime(candle.time);
    const lines: Array<{ text: string; style: 'date' | 'ohlc' | 'alert' | 'plot' | 'alertCap' }> = [
      { text: dtLine, style: 'date' },
      { text: `O: ${candle.open.toFixed(2)}`, style: 'ohlc' },
      { text: `H: ${candle.high.toFixed(2)}`, style: 'ohlc' },
      { text: `L: ${candle.low.toFixed(2)}`, style: 'ohlc' },
      { text: `C: ${candle.close.toFixed(2)}`, style: 'ohlc' },
      { text: `V: ${candle.volume.toFixed(0)}`, style: 'ohlc' },
    ];

    // Build alert lines for this bar
    const barAlerts = alerts.filter(a => a.barIndex === barIndex);
    if (barAlerts.length > 0) {
      const MAX_ALERTS = 5;
      const shownAlerts = barAlerts.slice(0, MAX_ALERTS);
      for (const alert of shownAlerts) {
        if (!alert.title && !alert.message) continue;
        const titleLine = `⚠ ${alert.title ?? '(alert)'}`;
        lines.push({ text: titleLine, style: 'alert' });
        if (alert.message) {
          const dest = alert.destination ? ` [${alert.destination}]` : '';
          lines.push({ text: `  ${alert.message}${dest}`, style: 'alert' });
        }
      }
      if (barAlerts.length > MAX_ALERTS) {
        const remaining = barAlerts.length - MAX_ALERTS;
        lines.push({ text: `⚠ +${remaining} more`, style: 'alertCap' });
      }
    }

    const barTime = Math.floor(candle.time);
    let plotIndex = 0;
    for (const [key, data] of allPlots) {
      let val: number | null | undefined = null;
      for (let j = 0; j < data.length; j++) {
        if (Math.floor(data[j].time) === barTime) {
          val = data[j].value;
          break;
        }
      }
      if (val !== null && val !== undefined) {
        const name = key.replace(/__color:[^_]+/, '').replace(/__lw:\d+/, '');
        lines.push({ text: `${name}: ${typeof val === 'number' ? val.toFixed(2) : val}`, style: 'plot' });
      }
      plotIndex++;
      if (plotIndex > 5) break;
    }

    const lineHeight = 16;
    const padding = 6;
    // Measure text width so the tooltip fits its content
    ctx.font = '11px monospace';
    let maxTextWidth = 155;
    for (const { text } of lines) {
      const w = ctx.measureText(text).width;
      if (w > maxTextWidth) maxTextWidth = w;
    }
    const tooltipWidth = maxTextWidth + padding * 2;
    const tooltipHeight = lines.length * lineHeight + padding * 2;
    let tooltipX = x + 12;
    let tooltipY = chartArea.y + 10;
    if (tooltipX + tooltipWidth > chartArea.x + chartArea.width) {
      tooltipX = x - tooltipWidth - 12;
    }

    ctx.fillStyle = 'rgba(12,12,30,0.95)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 4);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      const { text, style } = lines[i];
      switch (style) {
        case 'date':
          ctx.fillStyle = '#8888aa';
          break;
        case 'ohlc':
          ctx.fillStyle = candle.close >= candle.open ? '#4caf50' : '#e94560';
          break;
        case 'alert':
          ctx.fillStyle = '#ffaa44';
          break;
        case 'alertCap':
          ctx.fillStyle = '#cc8844';
          break;
        default:
          ctx.fillStyle = textColor;
          break;
      }
      ctx.fillText(text, tooltipX + padding, tooltipY + padding + i * lineHeight);
    }
  }

  private formatPrice(price: number): string {
    if (Math.abs(price) >= 1000) return price.toFixed(0);
    if (Math.abs(price) >= 1) return price.toFixed(2);
    return price.toFixed(4);
  }
}
