import { tokens } from '../../theme/tokens.js';
import type { CandlestickData, PlotSeriesData, AlertTriggerData, StrategyMarkerData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager } from '../LayoutManager.js';
import { formatAxisLabel, formatTooltipDateTime } from 'pine-framework/utils/time';

export type MarkerTooltipStyle = 'entryLong' | 'entryShort' | 'exit' | 'close' | 'order' | 'cancel' | 'markerCap';
export type TooltipLineStyle = 'date' | 'ohlc' | 'alert' | 'plot' | 'alertCap' | 'markerDesc' | MarkerTooltipStyle;

type TooltipLine = { text: string; style: TooltipLineStyle };

function getMarkerLineStyle(type: string, direction?: string): MarkerTooltipStyle {
  if (type === 'entry') {
    return direction === 'short' ? 'entryShort' : 'entryLong';
  }
  switch (type) {
    case 'exit': return 'exit';
    case 'close': return 'close';
    case 'order': return 'order';
    case 'cancel': return 'cancel';
    default: return 'order';
  }
}

function getMarkerColor(style: MarkerTooltipStyle): string {
  switch (style) {
    case 'entryLong': return tokens.colors.semantic.success;
    case 'entryShort': return '#e91e63';
    case 'exit': return tokens.colors.semantic.warning;
    case 'close': return tokens.colors.semantic.error;
    case 'order': return '#ffeb3b';
    case 'cancel': return '#999999';
    case 'markerCap': return '#888888';
  }
}

function getMarkerLabel(type: string, name: string, direction?: string): string {
  if (type === 'entry') {
    const arrow = direction === 'short' ? '▼' : '▲';
    return `${arrow} ${name}`;
  }
  if (type === 'exit') return `▼ ${name}`;
  if (type === 'close') return `✕ ${name}`;
  if (type === 'order') return `◇ ${name}`;
  if (type === 'cancel' || type === 'cancel_all') return `— ${name}`;
  return name;
}

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
    strategyMarkers: StrategyMarkerData[] = [],
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
    ctx.font = `11px ${tokens.typography.fontFamily}`;
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

      this.renderTooltip(ctx, candle, allPlots, snappedX, chartArea, textColor, alerts, strategyMarkers, barIndex);
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
    strategyMarkers: StrategyMarkerData[],
    barIndex: number,
  ): void {
    const dtLine = formatTooltipDateTime(candle.time);
    const lines: TooltipLine[] = [
      { text: dtLine, style: 'date' },
      { text: `O: ${candle.open.toFixed(2)}`, style: 'ohlc' },
      { text: `H: ${candle.high.toFixed(2)}`, style: 'ohlc' },
      { text: `L: ${candle.low.toFixed(2)}`, style: 'ohlc' },
      { text: `C: ${candle.close.toFixed(2)}`, style: 'ohlc' },
      { text: `V: ${candle.volume.toFixed(0)}`, style: 'ohlc' },
    ];

    // Build strategy marker lines for this bar (inserted between OHLC and alerts)
    const barMarkers = strategyMarkers.filter(m => m.barIndex === barIndex);
    if (barMarkers.length > 0) {
      const MAX_MARKERS = 5;
      const shownMarkers = barMarkers.slice(0, MAX_MARKERS);
      for (const marker of shownMarkers) {
        const titleStyle = getMarkerLineStyle(marker.type, marker.direction);
        const titleLine = getMarkerLabel(marker.type, marker.name || marker.type, marker.direction);
        lines.push({ text: titleLine, style: titleStyle });

        // Build details line: quantity, price, action
        const details: string[] = [];
        if (marker.quantity != null) {
          details.push(`qty: ${marker.quantity}`);
        }
        if (marker.price != null && marker.price > 0) {
          details.push(`@ ${marker.price.toFixed(2)}`);
        }
        if (marker.action) {
          details.push(marker.action);
        }
        if (details.length > 0) {
          lines.push({ text: `  ${details.join(' · ')}`, style: titleStyle });
        }

        // Show comment as indented description line if present
        if (marker.comment && marker.comment !== 'reverse') {
          lines.push({ text: `  ${marker.comment}`, style: 'markerDesc' });
        }
      }
      if (barMarkers.length > MAX_MARKERS) {
        const remaining = barMarkers.length - MAX_MARKERS;
        lines.push({ text: `+${remaining} more`, style: 'markerCap' });
      }
    }

    // Build alert lines for this bar (after markers)
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
    ctx.font = `11px ${tokens.typography.fontFamily}`;
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
          ctx.fillStyle = candle.close >= candle.open ? tokens.colors.semantic.success : tokens.colors.semantic.error;
          break;
        case 'alert':
          ctx.fillStyle = '#ffaa44';
          break;
        case 'alertCap':
          ctx.fillStyle = '#cc8844';
          break;
        case 'markerDesc':
          ctx.fillStyle = '#aaaaaa';
          break;
        case 'plot':
          ctx.fillStyle = textColor;
          break;
        default:
          ctx.fillStyle = getMarkerColor(style as MarkerTooltipStyle);
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
