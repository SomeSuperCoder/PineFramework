import type {
  CandlestickData,
  PlotSeriesData,
  ShapeMarkerData,
  StrategyMarkerData,
  FillData,
  HLineData,
  DrawingLineData,
  LabelData,
  BoxData,
  TableData,
  ChartOptions,
} from './types.js';
import { DEFAULT_OPTIONS } from './types.js';
import { Viewport } from './Viewport.js';
import { LayoutManager } from './LayoutManager.js';
import { InteractionHandler } from './InteractionHandler.js';
import { CandlestickRenderer } from './renderers/CandlestickRenderer.js';
import { VolumeRenderer } from './renderers/VolumeRenderer.js';
import { LineRenderer, type PlotRenderOptions } from './renderers/LineRenderer.js';
import { AreaRenderer } from './renderers/AreaRenderer.js';
import { MarkerRenderer } from './renderers/MarkerRenderer.js';
import type { AlertTriggerData } from './types.js';
import { HLineRenderer } from './renderers/HLineRenderer.js';
import { GridRenderer } from './renderers/GridRenderer.js';
import { AxisRenderer } from './renderers/AxisRenderer.js';
import { CrosshairRenderer } from './renderers/CrosshairRenderer.js';

export interface PlotSeriesHandle {
  name: string;
  options: PlotRenderOptions;
  data: PlotSeriesData[];
  overlay: boolean;
  paneIndex?: number;
}

export interface ChartEventCallbacks {
  onCrosshairMove?: (barIndex: number, price: number) => void;
  onVisibleRangeChange?: (start: number, end: number) => void;
  onResize?: (width: number, height: number) => void;
}

export class PineChart {
  private canvas: HTMLCanvasElement;
  private offscreen: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offCtx: CanvasRenderingContext2D;
  private options: Required<ChartOptions>;
  private viewport: Viewport;
  private layout: LayoutManager;
  private interaction: InteractionHandler;
  private dirty: boolean = true;
  private batchCount: number = 0;
  private animFrame: number = 0;
  private resizeObserver: ResizeObserver;

  private candlestickRenderer: CandlestickRenderer;
  private volumeRenderer: VolumeRenderer;
  private lineRenderer: LineRenderer;
  private areaRenderer: AreaRenderer;
  private markerRenderer: MarkerRenderer;
  private hlineRenderer: HLineRenderer;
  private gridRenderer: GridRenderer;
  private axisRenderer: AxisRenderer;
  private crosshairRenderer: CrosshairRenderer;

  private candles: CandlestickData[] = [];
  private plotSeries: Map<string, PlotSeriesHandle> = new Map();
  private shapeMarkers: ShapeMarkerData[] = [];
  private strategyMarkers: StrategyMarkerData[] = [];
  private fills: FillData[] = [];
  private fillColorData: Record<string, (string | null)[]> = {};
  private hlines: HLineData[] = [];
  private alertTriggers: AlertTriggerData[] = [];
  private barColors: Map<number, string> = new Map();
  private bgColors: Map<number, string> = new Map();
  private drawingLines: DrawingLineData[] = [];
  private teleportLine: { time: number; timestamp: number; color?: string; width?: number; style?: 'solid' | 'dotted' | 'dashed'; label?: string; visible: boolean } | null = null;
  private chartLabels: LabelData[] = [];
  private boxes: BoxData[] = [];
  private tables: TableData[] = [];
  private eventCallbacks: ChartEventCallbacks = {};
  private lastIndicatorCount: number = 0;
  private container: HTMLElement;
  private tableContainer: HTMLElement | null = null;

  constructor(container: HTMLElement, options: ChartOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.container = container;

    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.cursor = 'crosshair';
    container.appendChild(this.canvas);

    this.offscreen = document.createElement('canvas');

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;

    const offCtx = this.offscreen.getContext('2d');
    if (!offCtx) throw new Error('Offscreen canvas 2D not supported');
    this.offCtx = offCtx;

    this.viewport = new Viewport(
      this.options.barSpacing,
      this.options.minBarSpacing,
      this.options.maxBarSpacing,
    );

    this.layout = new LayoutManager(
      this.options.priceScaleWidth,
      this.options.timeScaleHeight,
      this.options.volumeHeightRatio,
    );

    this.candlestickRenderer = new CandlestickRenderer();
    this.volumeRenderer = new VolumeRenderer();
    this.lineRenderer = new LineRenderer();
    this.areaRenderer = new AreaRenderer();
    this.markerRenderer = new MarkerRenderer();
    this.hlineRenderer = new HLineRenderer();
    this.gridRenderer = new GridRenderer();
    this.axisRenderer = new AxisRenderer();
    this.crosshairRenderer = new CrosshairRenderer();

    this.interaction = new InteractionHandler(
      this.canvas,
      this.viewport,
      this.layout,
      {
        onCrosshairMove: (x, y) => {
          this.crosshairRenderer.setPosition(x, y);
          this.markDirty();
        },
        onCrosshairHide: () => {
          this.crosshairRenderer.hide();
          this.markDirty();
        },
        onVisibleRangeChange: () => {
          this.markDirty();
          const range = this.viewport.getVisibleRange();
          this.eventCallbacks.onVisibleRangeChange?.(range.start, range.end);
        },
        onPriceRangeChange: () => {
          this.markDirty();
        },
        onResize: () => {
          this.resize();
        },
      },
      this.canvas.clientWidth * (window.devicePixelRatio || 1),
    );

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);

    this.resize();
    this.startRenderLoop();
  }

  private resize(): void {
    console.log('[PC] resize');
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const w = rect.width;
    const h = rect.height;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.offscreen.width = w * dpr;
    this.offscreen.height = h * dpr;

    this.layout.calculate(w * dpr, h * dpr, this.lastIndicatorCount);
    this.interaction.setChartWidth(w * dpr);
    this.markDirty();
    this.eventCallbacks.onResize?.(w, h);
  }

  private startRenderLoop(): void {
    const loop = () => {
      if (this.dirty) {
        this.render();
        this.dirty = false;
      }
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  private markDirty(): void {
    if (this.batchCount === 0) {
      this.dirty = true;
    }
  }

  beginUpdate(): void {
    this.batchCount++;
  }

  endUpdate(): void {
    this.batchCount = Math.max(0, this.batchCount - 1);
    if (this.batchCount === 0) {
      this.markDirty();
    }
  }

  private render(): void {
    const ctx = this.offCtx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.options.background;
    ctx.fillRect(0, 0, w, h);

    if (this.candles.length === 0) {
      this.ctx.clearRect(0, 0, w, h);
      this.ctx.drawImage(this.offscreen, 0, 0);
      console.log('[PC] render SKIP (empty candles)', { plotCount: this.plotSeries.size });
      return;
    }

    this.updatePriceRange();
    this.updateVolumeMax();

    this.gridRenderer.render(ctx, this.viewport, this.layout, this.options.gridColor);

    const allPlots = new Map<string, PlotSeriesData[]>();
    for (const [key, handle] of this.plotSeries) {
      allPlots.set(key, handle.data);
    }

    this.areaRenderer.render(ctx, this.fills, allPlots, this.candles, this.viewport, this.layout, this.fillColorData);

    const regions = this.layout.getRegions();

    ctx.save();
    ctx.beginPath();
    ctx.rect(regions.volumeArea.x, regions.volumeArea.y, regions.volumeArea.width, regions.volumeArea.height);
    ctx.clip();
    this.volumeRenderer.render(ctx, this.candles, this.viewport, this.layout);
    ctx.restore();

    if (this.bgColors.size > 0) {
      const visibleRange = this.viewport.getVisibleRange();
      for (let i = visibleRange.start; i < visibleRange.end && i < this.candles.length; i++) {
        const color = this.bgColors.get(i);
        if (color) {
          const barSpacing = this.viewport.getBarSpacing();
          const barX = this.viewport.barIndexToPixel(i);
          ctx.fillStyle = this.cssColor(color);
          ctx.fillRect(barX, regions.chartArea.y, barSpacing, regions.chartArea.height);
        }
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(regions.chartArea.x, regions.chartArea.y, regions.chartArea.width, regions.chartArea.height);
    ctx.clip();

    this.candlestickRenderer.render(ctx, this.candles, this.viewport, this.layout, this.barColors);

    this.hlineRenderer.render(ctx, this.hlines, this.viewport, this.layout);

    this.renderDrawingLines(ctx);

    this.renderTeleportLine(ctx);

    for (const [_key, handle] of this.plotSeries) {
      if (handle.overlay) {
        const nonNull = handle.data.filter(d => d.value !== null).length;
        if (nonNull === 0) console.log('[PC] draw overlay plot ALL NULLS', { name: handle.name, dataLen: handle.data.length });
        this.lineRenderer.render(ctx, handle.data, this.candles, this.viewport, this.layout, handle.options);
      }
    }

    const overlayShapes = this.shapeMarkers.filter((s) => s.overlay !== false);
    if (overlayShapes.length > 0) {
      this.markerRenderer.renderShapes(ctx, overlayShapes, this.candles, this.viewport, this.layout);
    }

    ctx.restore();

    for (const pane of regions.indicatorPanes) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(pane.x, pane.y, pane.width, pane.height);
      ctx.clip();

      const paneIndex = parseInt(pane.id.replace('indicator_', ''), 10);
      for (const [_key, handle] of this.plotSeries) {
        if (!handle.overlay && handle.paneIndex === paneIndex) {
          this.lineRenderer.render(ctx, handle.data, this.candles, this.viewport, this.layout, handle.options, pane);
        }
      }

      // Render shapes for this indicator pane
      const paneShapes = this.shapeMarkers.filter((s) => s.paneIndex === paneIndex && s.overlay === false);
      if (paneShapes.length > 0) {
        this.markerRenderer.renderShapes(ctx, paneShapes, this.candles, this.viewport, this.layout, pane);
      }

      ctx.restore();

      ctx.strokeStyle = this.options.borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, pane.y);
      ctx.lineTo(regions.chartArea.width, pane.y);
      ctx.stroke();
    }

    this.markerRenderer.renderStrategyMarkers(ctx, this.strategyMarkers, this.candles, this.viewport, this.layout);

    this.markerRenderer.renderAlertTriggers(ctx, this.alertTriggers, this.candles, this.viewport, this.layout);

    this.renderLabels(ctx);
    this.renderBoxes(ctx);

    this.axisRenderer.renderPriceScale(ctx, this.layout, this.options.textColor, this.options.borderColor);
    this.axisRenderer.renderTimeScale(ctx, this.candles, this.viewport, this.layout, this.options.textColor, this.options.borderColor);

    this.crosshairRenderer.render(ctx, this.candles, allPlots, this.viewport, this.layout, this.options.textColor);

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.offscreen, 0, 0);

    this.renderTables();
  }

  private renderTables(): void {
    if (this.tables.length === 0) {
      if (this.tableContainer) {
        this.tableContainer.style.display = 'none';
      }
      return;
    }

    if (!this.tableContainer) {
      this.tableContainer = document.createElement('div');
      this.tableContainer.style.position = 'absolute';
      this.tableContainer.style.pointerEvents = 'auto';
      this.tableContainer.style.overflow = 'auto';
      this.tableContainer.style.maxHeight = '60%';
      this.tableContainer.style.maxWidth = '60%';
      this.container.appendChild(this.tableContainer);
    }

    this.tableContainer.style.display = 'block';

    // Pine Script table position constants
    const POSITIONS = ['top_right', 'top_left', 'bottom_right', 'bottom_left'] as const;
    const positionName = POSITIONS[this.tables[0]?.position] || 'top_right';
    const table = this.tables[0];

    // Position the container
    this.tableContainer.style.position = 'absolute';
    this.tableContainer.style.margin = '8px';
    if (positionName === 'top_left') {
      this.tableContainer.style.top = '0';
      this.tableContainer.style.left = '0';
    } else if (positionName === 'top_right') {
      this.tableContainer.style.top = '0';
      this.tableContainer.style.right = '0';
    } else if (positionName === 'bottom_left') {
      this.tableContainer.style.bottom = '0';
      this.tableContainer.style.left = '0';
    } else if (positionName === 'bottom_right') {
      this.tableContainer.style.bottom = '0';
      this.tableContainer.style.right = '0';
    }

    // Build HTML table
    const frameColor = table.frame_color || '#373a46';
    const borderColor = table.border_color || '#373a46';
    const borderWidth = table.border_width || 1;
    const frameWidth = table.frame_width || 1;
    const bgcolor = table.bgcolor || 'transparent';

    let html = `<table style="border-collapse: collapse; background: ${bgcolor}; border: ${frameWidth}px solid ${frameColor}; font-size: 11px; font-family: Arial, sans-serif;">`;

    for (let row = 0; row < table.rows; row++) {
      html += '<tr>';
      for (let col = 0; col < table.columns; col++) {
        const cell = table.cells[`${col},${row}`];
        if (cell) {
          const textColor = cell.text_color || '#FFFFFF';
          const cellBg = cell.bgcolor || 'transparent';
          const halign = cell.text_halign || 'center';
          const valign = cell.text_valign || 'center';
          const fontSize = cell.text_size === 'size.large' ? '14px'
            : cell.text_size === 'size.small' ? '9px'
            : '11px';
          html += `<td style="border: ${borderWidth}px solid ${borderColor}; padding: 2px 6px; color: ${textColor}; background: ${cellBg}; text-align: ${halign}; vertical-align: ${valign}; font-size: ${fontSize}; white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${cell.tooltip || cell.text}">${cell.text}</td>`;
        } else {
          html += `<td style="border: ${borderWidth}px solid ${borderColor}; padding: 2px 6px;"></td>`;
        }
      }
      html += '</tr>';
    }
    html += '</table>';

    this.tableContainer.innerHTML = html;
  }

  private findBarIndex(time: number): number {
    const target = Math.floor(time);
    for (let i = 0; i < this.candles.length; i++) {
      if (this.candles[i].time === target) return i;
    }
    let lo = 0, hi = this.candles.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.candles[mid].time < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return lo;
  }

  private renderDrawingLines(ctx: CanvasRenderingContext2D): void {
    const regions = this.layout.getRegions();
    const { chartArea } = regions;
    for (const line of this.drawingLines) {
      if (line.points.length < 2) continue;
      const bi1 = this.findBarIndex(line.points[0].time);
      const bi2 = this.findBarIndex(line.points[1].time);
      const x1 = this.viewport.barIndexToPixel(bi1);
      const y1 = this.layout.priceToPixel(line.points[0].price, chartArea.y, chartArea.height);
      const x2 = this.viewport.barIndexToPixel(bi2);
      const y2 = this.layout.priceToPixel(line.points[1].price, chartArea.y, chartArea.height);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = this.cssColor(line.color || '#2196f3');
      ctx.lineWidth = line.width || 1;
      if (line.style === 'dotted') {
        ctx.setLineDash([4, 4]);
      } else if (line.style === 'dashed') {
        ctx.setLineDash([8, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private renderTeleportLine(ctx: CanvasRenderingContext2D): void {
    if (!this.teleportLine || !this.teleportLine.visible) return;
    const regions = this.layout.getRegions();
    const { chartArea } = regions;
    const bi = this.findBarIndex(this.teleportLine.timestamp);
    const x = this.viewport.barIndexToPixel(bi);
    ctx.save();
    ctx.strokeStyle = this.cssColor(this.teleportLine.color || '#2196f3');
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.y);
    ctx.lineTo(x, chartArea.y + chartArea.height);
    ctx.stroke();
    ctx.setLineDash([]);
    if (this.teleportLine.label) {
      ctx.font = 'bold 11px Arial';
      const text = this.teleportLine.label;
      const metrics = ctx.measureText(text);
      const padX = 6, padY = 2;
      const bw = metrics.width + padX * 2;
      const bh = 18;
      const bx = x - bw / 2;
      const by = chartArea.y + 4;
      ctx.fillStyle = this.cssColor(this.teleportLine.color || '#2196f3');
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, by + bh / 2);
    }
    ctx.restore();
  }

  private renderLabels(ctx: CanvasRenderingContext2D): void {
    const regions = this.layout.getRegions();
    const { chartArea } = regions;

    // Map Pine Script size strings to font sizes
    const sizeMap: Record<string, number> = {
      'size.tiny': 9,
      'size.small': 10,
      'size.normal': 12,
      'size.large': 14,
      'size.huge': 16,
    };

    for (const label of this.chartLabels) {
      const bi = this.findBarIndex(label.time);
      const x = this.viewport.barIndexToPixel(bi) + this.viewport.getBarSpacing() / 2;
      const y = this.layout.priceToPixel(label.price, chartArea.y, chartArea.height);
      const text = label.text || '';
      const style = label.style || 'label.style_label_down';
      const fontSize = sizeMap[label.size || 'size.normal'] || 12;

      ctx.save();
      ctx.font = `bold ${fontSize}px Arial`;
      const metrics = ctx.measureText(text);
      const pad = 4;
      const bw = metrics.width + pad * 2;
      const bh = fontSize + 8;

      const isUp = style === 'label.style_label_up';
      const isDown = style === 'label.style_label_down';

      // Position: label_up → below bar (arrow points up), label_down → above bar (arrow points down)
      let bx: number, by: number;
      if (isUp) {
        bx = x - bw / 2;
        by = y + 4; // below the price
      } else {
        bx = x - bw / 2;
        by = y - bh - 4; // above the price (default)
      }

      // Draw arrow triangle + rounded rect background
      ctx.fillStyle = this.cssColor(label.color || '#2196f3');

      if (isUp || isDown) {
        // Draw arrow triangle
        ctx.beginPath();
        if (isUp) {
          // Arrow pointing up: triangle at top center
          const triH = 6;
          ctx.moveTo(x, by - triH);
          ctx.lineTo(x - 5, by);
          ctx.lineTo(x + 5, by);
        } else {
          // Arrow pointing down: triangle at bottom center
          const triH = 6;
          const triY = by + bh;
          ctx.moveTo(x, triY + triH);
          ctx.lineTo(x - 5, triY);
          ctx.lineTo(x + 5, triY);
        }
        ctx.fill();
      }

      // Draw background rect
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 3);
      ctx.fill();

      // Draw text
      ctx.fillStyle = label.textColor || '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, by + bh / 2);
      ctx.restore();
    }
  }

  private renderBoxes(ctx: CanvasRenderingContext2D): void {
    if (this.boxes.length === 0) return;
    const regions = this.layout.getRegions();
    const { chartArea } = regions;
    for (const box of this.boxes) {
      const startIdx = this.findBarIndex(box.startTime);
      const endIdx = this.findBarIndex(box.endTime);
      const x1 = this.viewport.barIndexToPixel(startIdx);
      const x2 = this.viewport.barIndexToPixel(endIdx) + this.viewport.getBarSpacing();
      const y1 = this.layout.priceToPixel(box.startPrice, chartArea.y, chartArea.height);
      const y2 = this.layout.priceToPixel(box.endPrice, chartArea.y, chartArea.height);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      ctx.save();
      if (box.backgroundColor && box.backgroundColor !== 'rgba(0,0,0,0)' && box.backgroundColor !== 'transparent') {
        ctx.fillStyle = this.cssColor(box.backgroundColor);
        ctx.fillRect(left, top, right - left, bottom - top);
      }
      if (box.borderColor) {
        ctx.strokeStyle = this.cssColor(box.borderColor);
        ctx.lineWidth = 1;
        ctx.strokeRect(left, top, right - left, bottom - top);
      }
      ctx.restore();
    }
  }

  private cssColor(color: string): string {
    if (color.length === 9 && color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      const a = parseInt(color.slice(7, 9), 16) / 255;
      return `rgba(${r},${g},${b},${a.toFixed(3)})`;
    }
    return color;
  }

  private updatePriceRange(): void {
    const range = this.viewport.getVisibleRange();
    let min = Infinity;
    let max = -Infinity;

    for (let i = range.start; i < range.end && i < this.candles.length; i++) {
      const c = this.candles[i];
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }

    if (min === Infinity || max === -Infinity) {
      this.layout.setPriceRange(0, 100);
      return;
    }

    const candleRange = max - min || 1;

    for (const [_key, handle] of this.plotSeries) {
      if (!handle.overlay) continue;
      for (let i = range.start; i < range.end && i < handle.data.length; i++) {
        const v = handle.data[i]?.value;
        if (v !== null && v !== undefined && typeof v === 'number' && isFinite(v)) {
          if (Math.abs(v) < 1e-10) continue;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }

    const totalRange = max - min || 1;
    if (totalRange > candleRange * 10) {
      const center = (min + max) / 2;
      min = center - candleRange * 5;
      max = center + candleRange * 5;
    }

    this.layout.setPriceRange(min, max);

    const regions = this.layout.getRegions();
    for (const pane of regions.indicatorPanes) {
      let indMin = Infinity;
      let indMax = -Infinity;
      const paneIndex = parseInt(pane.id.replace('indicator_', ''), 10);
      for (const [_key, handle] of this.plotSeries) {
        if (handle.overlay || handle.paneIndex !== paneIndex) continue;
        for (let i = range.start; i < range.end && i < handle.data.length; i++) {
          const v = handle.data[i]?.value;
          if (v !== null && v !== undefined && typeof v === 'number' && isFinite(v)) {
            if (v < indMin) indMin = v;
            if (v > indMax) indMax = v;
          }
        }
      }
      if (indMin !== Infinity && indMax !== -Infinity) {
        this.layout.setIndicatorPriceRange(pane.id, indMin, indMax);
      }
    }
  }

  private updateVolumeMax(): void {
    const range = this.viewport.getVisibleRange();
    let maxVol = 0;
    for (let i = range.start; i < range.end && i < this.candles.length; i++) {
      if (this.candles[i].volume > maxVol) maxVol = this.candles[i].volume;
    }
    this.layout.setVolumeMax(maxVol);
  }

  setDrawingLines(lines: DrawingLineData[]): void {
    this.drawingLines = lines;
    this.markDirty();
  }

  // Teleport line (vertical marker for "go to date")
  setTeleportLine(timeSeconds: number, options?: { color?: string; width?: number; style?: 'solid' | 'dotted' | 'dashed'; label?: string }): void {
    this.teleportLine = { timestamp: timeSeconds, visible: true, ...options };
    this.markDirty();
  }

  clearTeleportLine(): void {
    this.teleportLine = null;
    this.markDirty();
  }

  setLabels(labels: LabelData[]): void {
    this.chartLabels = labels;
    this.markDirty();
  }

  setBoxes(boxes: BoxData[]): void {
    this.boxes = boxes;
    this.markDirty();
  }

  setTables(tables: TableData[]): void {
    this.tables = tables;
    this.markDirty();
  }

  setCandles(data: CandlestickData[]): void {
    const prevLength = this.candles.length;
    const wasPrepended = data.length > prevLength && prevLength > 0 && data[0]?.time < this.candles[0]?.time;
    const added = data.length - prevLength;
    this.candles = data;
    if (wasPrepended) {
      this.viewport.adjustForPrepend(added);
    } else {
      this.viewport.setTotalBars(data.length);
    }
    if (prevLength <= 1 && data.length > 1) {
      const regions = this.layout.getRegions();
      this.viewport.fitContent(regions.chartArea.width);
    }
    this.markDirty();
  }

  setVolume(_data: CandlestickData[]): void {
    // Volume is derived from candles
    this.markDirty();
  }

  addPlotSeries(name: string, options: Partial<PlotRenderOptions> = {}, overlay: boolean = true, paneIndex?: number): PlotSeriesHandle {
    const existing = this.plotSeries.get(name);
    if (existing) {
      existing.paneIndex = paneIndex;
      return existing;
    }
    console.warn('[PineChart] addPlotSeries', name);
    const handle: PlotSeriesHandle = {
      name,
      options: {
        color: options.color ?? '#2196f3',
        lineWidth: options.lineWidth ?? 1,
        style: options.style ?? 'line',
        histbase: options.histbase,
      },
      data: [],
      overlay,
      paneIndex,
    };
    this.plotSeries.set(name, handle);
    this.recalculateLayout();
    return handle;
  }

  setPlotData(name: string, data: PlotSeriesData[]): void {
    const handle = this.plotSeries.get(name);
    if (handle) {
      if (data.length === 0) {
        console.warn('[PineChart] setPlotData EMPTY (skipped)', name);
        return;
      }
      handle.data = data;
      this.markDirty();
    }
  }

  removeSeries(name: string): void {
    console.warn('[PineChart] removeSeries', name);
    this.plotSeries.delete(name);
    this.recalculateLayout();
    this.markDirty();
  }

  private recalculateLayout(): void {
    const paneIndices = new Set<number>();
    for (const [, handle] of this.plotSeries) {
      if (!handle.overlay && handle.paneIndex !== undefined) {
        paneIndices.add(handle.paneIndex);
      }
    }
    const indicatorCount = paneIndices.size;
    if (indicatorCount !== this.lastIndicatorCount) {
      this.lastIndicatorCount = indicatorCount;
      this.resize();
    }
  }

  setMarkers(markers: ShapeMarkerData[]): void {
    this.shapeMarkers = markers;
    this.markDirty();
  }

  setStrategyMarkers(markers: StrategyMarkerData[]): void {
    this.strategyMarkers = markers;
    this.markDirty();
  }

  setAlertTriggers(triggers: AlertTriggerData[]): void {
    this.alertTriggers = triggers;
    this.markDirty();
  }

  setFills(fills: FillData[]): void {
    this.fills = fills;
    this.markDirty();
  }

  setFillColorData(data: Record<string, (string | null)[]>): void {
    this.fillColorData = data;
    this.markDirty();
  }

  setHLines(hlines: HLineData[]): void {
    this.hlines = hlines;
    this.markDirty();
  }

  setBarColors(colors: Map<number, string>): void {
    this.barColors = colors;
    this.markDirty();
  }

  setBgColors(colors: Map<number, string>): void {
    this.bgColors = colors;
    this.markDirty();
  }

  timeScale() {
    return {
      fitContent: () => {
        this.viewport.fitContent(this.canvas.width);
        this.markDirty();
      },
      scrollTo: (barIndex: number) => {
        this.viewport.scrollTo(barIndex, this.canvas.width);
        this.markDirty();
      },
      getVisibleRange: () => {
        return this.viewport.getVisibleRange();
      },
      scrollToDate: (_timestamp: number) => {
        this.markDirty();
      },
      setTeleportLine: (timeSeconds: number, options?: { color?: string; width?: number; style?: 'solid' | 'dotted' | 'dashed'; label?: string }) => {
        this.teleportLine = { timestamp: timeSeconds, visible: true, ...options };
        this.markDirty();
      },
      clearTeleportLine: () => {
        this.teleportLine = null;
        this.markDirty();
      },
    };
  }

  applyOptions(options: Partial<ChartOptions>): void {
    Object.assign(this.options, options);
    this.markDirty();
  }

  setForceAutoScale(enabled: boolean): void {
    this.layout.setForceAutoScale(enabled);
    this.markDirty();
  }

  on(event: string, callback: (...args: any[]) => void): void {
    if (event === 'onCrosshairMove') {
      this.eventCallbacks.onCrosshairMove = callback;
    } else if (event === 'onVisibleRangeChange') {
      this.eventCallbacks.onVisibleRangeChange = callback;
    } else if (event === 'onResize') {
      this.eventCallbacks.onResize = callback;
    }
  }

  remove(): void {
    this.resizeObserver.disconnect();
    this.interaction.destroy();
    cancelAnimationFrame(this.animFrame);
    this.canvas.parentElement?.removeChild(this.canvas);
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  getCanvasDimensions(): { width: number; height: number; dpr: number } {
    const dpr = window.devicePixelRatio || 1;
    return { width: this.canvas.width / dpr, height: this.canvas.height / dpr, dpr };
  }

  getLayoutRegions(): ReturnType<LayoutManager['getRegions']> {
    return this.layout.getRegions();
  }
}

export function createChart(container: HTMLElement, options?: ChartOptions): PineChart {
  return new PineChart(container, options);
}
