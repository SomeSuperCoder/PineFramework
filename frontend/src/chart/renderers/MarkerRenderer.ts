import type { ShapeMarkerData, StrategyMarkerData, AlertTriggerData } from '../types.js';
import type { Viewport } from '../Viewport.js';
import type { LayoutManager, PaneRegion } from '../LayoutManager.js';
import type { CandlestickData } from '../types.js';

export class MarkerRenderer {
  renderShapes(
    ctx: CanvasRenderingContext2D,
    markers: ShapeMarkerData[],
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
    pane?: PaneRegion,
  ): void {
    const regions = layout.getRegions();
    const barSpacing = viewport.getBarSpacing();
    const margin = barSpacing * 1.5;

    const area = pane ?? regions.chartArea;
    const paneId = pane?.id;

    for (const marker of markers) {
      const barIdx = marker.barIndex ?? this.findBarIndex(candles, marker.time);
      if (barIdx < 0) continue;

      const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
      let y: number;

      if (marker.position === 'absolute' && marker.price != null) {
        y = layout.priceToPixel(marker.price, area.y, area.height, paneId);
      } else if (marker.position === 'belowbar') {
        const candle = candles[barIdx];
        y = layout.priceToPixel(candle.low, area.y, area.height, paneId) + margin;
      } else {
        const candle = candles[barIdx];
        y = layout.priceToPixel(candle.high, area.y, area.height, paneId) - margin;
      }

      if (marker.shape === 'labelup' || marker.shape === 'labeldown') {
        this.drawLabel(ctx, x, y, marker.shape, marker.color, marker.text, marker.textcolor, barSpacing);
      } else {
        this.drawShape(ctx, x, y, marker.shape, marker.color, barSpacing);

        if (marker.text) {
          ctx.fillStyle = marker.textcolor || marker.color;
          ctx.font = `${Math.max(9, barSpacing * 1.2)}px Arial`;
          ctx.textAlign = 'center';
          ctx.fillText(marker.text, x, y + (marker.position === 'belowbar' ? 12 : -6));
        }
      }
    }
  }

  renderStrategyMarkers(
    ctx: CanvasRenderingContext2D,
    markers: StrategyMarkerData[],
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
  ): void {
    const regions = layout.getRegions();
    const { chartArea } = regions;
    const barSpacing = viewport.getBarSpacing();
    const margin = barSpacing * 1.2;

    for (const marker of markers) {
      if (marker.type === 'cancel' || marker.type === 'cancel_all') continue;

      const barIdx = marker.barIndex ?? this.findBarIndexByTimestamp(candles, marker.timestamp);
      if (barIdx < 0 || barIdx >= candles.length) continue;

      const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
      const isLong = marker.direction === 'long';
      const isEntry = marker.type === 'entry' || marker.type === 'order';

      let y: number;
      let color: string;
      let shape: string;

      if (isEntry) {
        y = layout.priceToPixel(candles[barIdx].low, chartArea.y, chartArea.height) + margin;
        color = marker.color || (isLong ? '#4caf50' : '#e91e63');
        shape = isLong ? 'arrowUp' : 'arrowDown';
      } else {
        y = layout.priceToPixel(candles[barIdx].high, chartArea.y, chartArea.height) - margin;
        color = marker.color || (isLong ? '#f44336' : '#2196f3');
        shape = isLong ? 'arrowDown' : 'arrowUp';
      }

      this.drawShape(ctx, x, y, shape, color, barSpacing);

      if (marker.comment || marker.name) {
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.max(9, barSpacing * 1.1)}px Arial`;
        ctx.textAlign = 'center';
        const label = marker.comment || marker.name;
        ctx.fillText(label, x, y + (isEntry ? 14 : -8));
      }
    }
  }

  renderAlertTriggers(
    ctx: CanvasRenderingContext2D,
    triggers: AlertTriggerData[],
    candles: CandlestickData[],
    viewport: Viewport,
    layout: LayoutManager,
  ): void {
    const regions = layout.getRegions();
    const { chartArea } = regions;
    const barSpacing = viewport.getBarSpacing();
    const size = Math.max(3, barSpacing * 0.35);
    ctx.fillStyle = '#ff9800';
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;

    for (const trigger of triggers) {
      const barIdx = trigger.barIndex;
      if (barIdx < 0 || barIdx >= candles.length) continue;
      const x = viewport.barIndexToPixel(barIdx) + barSpacing / 2;
      const y = chartArea.y + 2;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  private drawShape(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    shape: string,
    color: string,
    barSpacing: number,
  ): void {
    const size = Math.max(5, barSpacing * 0.6);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    switch (shape) {
      case '▲':
      case 'arrowUp':
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x - size * 0.6, y + size * 0.3);
        ctx.lineTo(x + size * 0.6, y + size * 0.3);
        ctx.closePath();
        ctx.fill();
        break;
      case '▼':
      case 'arrowDown':
        ctx.beginPath();
        ctx.moveTo(x, y + size);
        ctx.lineTo(x - size * 0.6, y - size * 0.3);
        ctx.lineTo(x + size * 0.6, y - size * 0.3);
        ctx.closePath();
        ctx.fill();
        break;
      case 'triangleup':
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x - size * 0.7, y + size * 0.5);
        ctx.lineTo(x + size * 0.7, y + size * 0.5);
        ctx.closePath();
        ctx.fill();
        break;
      case 'triangledown':
        ctx.beginPath();
        ctx.moveTo(x, y + size);
        ctx.lineTo(x - size * 0.7, y - size * 0.5);
        ctx.lineTo(x + size * 0.7, y - size * 0.5);
        ctx.closePath();
        ctx.fill();
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'square':
        ctx.fillRect(x - size * 0.4, y - size * 0.4, size * 0.8, size * 0.8);
        break;
      case '◆':
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.5);
        ctx.lineTo(x + size * 0.5, y);
        ctx.lineTo(x, y + size * 0.5);
        ctx.lineTo(x - size * 0.5, y);
        ctx.closePath();
        ctx.fill();
        break;
      case 'cross':
        ctx.beginPath();
        ctx.moveTo(x - size * 0.4, y);
        ctx.lineTo(x + size * 0.4, y);
        ctx.moveTo(x, y - size * 0.4);
        ctx.lineTo(x, y + size * 0.4);
        ctx.stroke();
        break;
      case 'xcross':
        ctx.beginPath();
        ctx.moveTo(x - size * 0.4, y - size * 0.4);
        ctx.lineTo(x + size * 0.4, y + size * 0.4);
        ctx.moveTo(x + size * 0.4, y - size * 0.4);
        ctx.lineTo(x - size * 0.4, y + size * 0.4);
        ctx.stroke();
        break;
      default:
        ctx.beginPath();
        ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  private drawLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    shape: string,
    bgColor: string,
    text: string | undefined,
    textColor: string | undefined,
    barSpacing: number,
  ): void {
    if (!text) return;
    const fontSize = Math.max(9, barSpacing * 1.1);
    ctx.font = `bold ${fontSize}px Arial`;
    const metrics = ctx.measureText(text);
    const padX = Math.max(4, barSpacing * 0.4);
    const padY = Math.max(3, barSpacing * 0.25);
    const bw = metrics.width + padX * 2;
    const bh = fontSize + padY * 2;
    const radius = Math.max(3, barSpacing * 0.25);
    const pointerSize = Math.max(3, barSpacing * 0.3);

    let rectY: number;
    let pointerY: number;
    if (shape === 'labeldown') {
      rectY = y - bh - pointerSize;
      pointerY = rectY + bh;
    } else {
      rectY = y + pointerSize;
      pointerY = rectY;
    }
    const rectX = x - bw / 2;

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(rectX, rectY, bw, bh, radius);
    ctx.fill();

    ctx.beginPath();
    if (shape === 'labeldown') {
      ctx.moveTo(x, pointerY + pointerSize);
      ctx.lineTo(x - pointerSize, pointerY);
      ctx.lineTo(x + pointerSize, pointerY);
    } else {
      ctx.moveTo(x, pointerY - pointerSize);
      ctx.lineTo(x - pointerSize, pointerY);
      ctx.lineTo(x + pointerSize, pointerY);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = textColor || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, rectY + bh / 2);
    ctx.textBaseline = 'alphabetic';
  }

  private findBarIndex(candles: CandlestickData[], time: number): number {
    const targetTime = Math.floor(time);
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].time === targetTime) return i;
    }
    let lo = 0, hi = candles.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].time < targetTime) lo = mid + 1;
      else hi = mid - 1;
    }
    return lo;
  }

  private findBarIndexByTimestamp(candles: CandlestickData[], timestamp: number): number {
    const time = Math.floor(timestamp / 1000);
    return this.findBarIndex(candles, time);
  }
}
