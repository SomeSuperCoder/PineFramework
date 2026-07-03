import type {
  CandlestickData,
  PlotSeriesData,
  ShapeMarkerData,
  StrategyMarkerData,
  FillData,
  HLineData,
  DrawingLineData,
  LabelData,
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
  private chartLabels: LabelData[] = [];
  private eventCallbacks: ChartEventCallbacks = {};

  constructor(container: HTMLElement, options: ChartOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

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
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const w = rect.width;
    const h = rect.height;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.offscreen.width = w * dpr;
    this.offscreen.height = h * dpr;

    let indicatorCount = 0;
    for (const [, handle] of this.plotSeries) {
      if (!handle.overlay) {
        indicatorCount = 1;
        break;
      }
    }
    this.layout.calculate(w * dpr, h * dpr, indicatorCount);
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
      return;
    }

    this.updatePriceRange();
    this.updateVolumeMax();

    this.gridRenderer.render(ctx, this.viewport, this.layout, this.options.gridColor);

    const allPlots = new Map<string, PlotSeriesData[]>();
    for (const [key, handle] of this.plotSeries) {
      allPlots.set(key, handle.data);
    }

    this.areaRenderer.render(ctx, this.fills, allPlots, this.viewport, this.layout, this.fillColorData);

    this.volumeRenderer.render(ctx, this.candles, this.viewport, this.layout);

    if (this.bgColors.size > 0) {
      const regions = this.layout.getRegions();
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

    this.candlestickRenderer.render(ctx, this.candles, this.viewport, this.layout, this.barColors);

    this.hlineRenderer.render(ctx, this.hlines, this.viewport, this.layout);

    this.renderDrawingLines(ctx);

    const regions = this.layout.getRegions();
    for (const [_key, handle] of this.plotSeries) {
      if (handle.overlay) {
        this.lineRenderer.render(ctx, handle.data, this.viewport, this.layout, handle.options);
      }
    }

    for (const pane of regions.indicatorPanes) {
      for (const [_key, handle] of this.plotSeries) {
        if (!handle.overlay) {
          this.lineRenderer.render(ctx, handle.data, this.viewport, this.layout, handle.options, pane);
        }
      }

      ctx.strokeStyle = this.options.borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, pane.y);
      ctx.lineTo(regions.chartArea.width, pane.y);
      ctx.stroke();
    }

    this.markerRenderer.renderShapes(ctx, this.shapeMarkers, this.candles, this.viewport, this.layout);

    this.markerRenderer.renderStrategyMarkers(ctx, this.strategyMarkers, this.candles, this.viewport, this.layout);

    this.markerRenderer.renderAlertTriggers(ctx, this.alertTriggers, this.candles, this.viewport, this.layout);

    this.renderLabels(ctx);

    this.axisRenderer.renderPriceScale(ctx, this.layout, this.options.textColor, this.options.borderColor);
    this.axisRenderer.renderTimeScale(ctx, this.candles, this.viewport, this.layout, this.options.textColor, this.options.borderColor);

    this.crosshairRenderer.render(ctx, this.candles, allPlots, this.viewport, this.layout, this.options.textColor);

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.offscreen, 0, 0);
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

  private renderLabels(ctx: CanvasRenderingContext2D): void {
    const regions = this.layout.getRegions();
    const { chartArea } = regions;
    for (const label of this.chartLabels) {
      const bi = this.findBarIndex(label.time);
      const x = this.viewport.barIndexToPixel(bi) + this.viewport.getBarSpacing() / 2;
      const y = this.layout.priceToPixel(label.price, chartArea.y, chartArea.height);
      const text = label.text || '';
      ctx.save();
      ctx.font = 'bold 12px Arial';
      const metrics = ctx.measureText(text);
      const pad = 4;
      const bw = metrics.width + pad * 2;
      const bh = 20;
      const bx = x - bw / 2;
      const by = y - bh - 4;
      ctx.fillStyle = this.cssColor(label.color || '#2196f3');
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 4);
      ctx.fill();
      ctx.fillStyle = label.textColor || '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, by + bh / 2);
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
      for (const [_key, handle] of this.plotSeries) {
        if (handle.overlay) continue;
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

  setLabels(labels: LabelData[]): void {
    this.chartLabels = labels;
    this.markDirty();
  }

  setCandles(data: CandlestickData[]): void {
    const wasPrepended = data.length > this.candles.length && this.candles.length > 0 && data[0]?.time < this.candles[0]?.time;
    const added = data.length - this.candles.length;
    this.candles = data;
    if (wasPrepended) {
      this.viewport.adjustForPrepend(added);
      for (const [, handle] of this.plotSeries) {
        if (handle.data.length < data.length) {
          const padCount = data.length - handle.data.length;
          const padding: PlotSeriesData[] = [];
          for (let i = 0; i < padCount; i++) {
            padding.push({ time: data[i].time, value: null });
          }
          handle.data = [...padding, ...handle.data];
        }
      }
    } else {
      this.viewport.setTotalBars(data.length);
    }
    this.markDirty();
  }

  setVolume(_data: CandlestickData[]): void {
    // Volume is derived from candles
    this.markDirty();
  }

  addPlotSeries(name: string, options: Partial<PlotRenderOptions> = {}, overlay: boolean = true): PlotSeriesHandle {
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
    };
    this.plotSeries.set(name, handle);
    return handle;
  }

  setPlotData(name: string, data: PlotSeriesData[]): void {
    const handle = this.plotSeries.get(name);
    if (handle) {
      handle.data = data;
      this.markDirty();
    }
  }

  removeSeries(name: string): void {
    this.plotSeries.delete(name);
    this.markDirty();
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
    };
  }

  applyOptions(options: Partial<ChartOptions>): void {
    Object.assign(this.options, options);
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
}

export function createChart(container: HTMLElement, options?: ChartOptions): PineChart {
  return new PineChart(container, options);
}
