/**
 * Viewport Manager
 *
 * Coordinates the viewport with chart data — price-range computation,
 * volume-max computation, and viewport state updates when candles change.
 * Keeps the coordination logic out of PineChart so the main class focuses
 * on rendering and public API.
 */

import type { CandlestickData, LinefillData, DrawingLineData, LabelData } from './types.js';
import type { Viewport } from './Viewport.js';
import type { LayoutManager } from './LayoutManager.js';
import type { PlotSeriesHandle } from './plot-series-manager.js';

/**
 * The pane-scoped drawing objects whose price values can seed an indicator
 * pane's price range when the pane has no non-overlay plot series.
 */
export interface PaneDrawings {
  linefills: LinefillData[];
  drawingLines: DrawingLineData[];
  labels: LabelData[];
}

export class ViewportManager {
  constructor(
    private viewport: Viewport,
    private layout: LayoutManager,
  ) {}

  /**
   * Update viewport state when candles change — handles prepend vs. append,
   * and auto-fits content for the initial load.
   *
   * @returns The number of added bars (positive for prepend/append).
   */
  updateCandles(
    candles: CandlestickData[],
    prevLength: number,
    prevFirstTime: number | undefined,
    _chartWidth: number,
  ): number {
    const added = candles.length - prevLength;
    const wasPrepended =
      added > 0 &&
      prevLength > 0 &&
      prevFirstTime !== undefined &&
      candles[0]?.time < prevFirstTime;

    if (wasPrepended) {
      this.viewport.adjustForPrepend(added);
    } else {
      this.viewport.setTotalBars(candles.length);
    }

    if (prevLength <= 1 && candles.length > 1) {
      const regions = this.layout.getRegions();
      this.viewport.fitContent(regions.chartArea.width);
    }

    return added;
  }

  /**
   * Compute and set the price range from visible candles + overlay plots.
   * Also updates indicator pane price ranges.
   *
   * Panes with non-overlay plot series are seeded from those series' prices.
   * A pane with NO non-overlay series (e.g. an all-force_overlay indicator
   * like supertrend-3d) falls back to `paneDrawings` — the price extents of
   * the pane's own drawing objects — so lines/linefills/labels map on-pane
   * instead of hitting the {-1,1} default and rendering off-pane. This is
   * fallback-only: it never overrides a series-derived pane range.
   */
  updatePriceRange(
    candles: CandlestickData[],
    allSeries: Map<string, PlotSeriesHandle>,
    hiddenPlots: Set<string>,
    paneDrawings?: PaneDrawings,
  ): void {
    const range = this.viewport.getVisibleRange();
    let min = Infinity;
    let max = -Infinity;

    for (let i = range.start; i < range.end && i < candles.length; i++) {
      const c = candles[i];
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }

    if (min === Infinity || max === -Infinity) {
      this.layout.setPriceRange(0, 100);
      return;
    }

    const candleRange = max - min || 1;

    for (const [, handle] of allSeries) {
      if (!handle.overlay || hiddenPlots.has(handle.name)) continue;
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

    // Clamp Y-axis against outlier candles: never zoom out past 20× the
    // visible candle range so a single rogue tick doesn't compress the chart.
    {
      const clampedRange = max - min || 1;
      if (clampedRange > candleRange * 20) {
        const center = (min + max) / 2;
        min = center - candleRange * 10;
        max = center + candleRange * 10;
      }
    }

    this.layout.setPriceRange(min, max);

    const regions = this.layout.getRegions();
    for (const pane of regions.indicatorPanes) {
      let indMin = Infinity;
      let indMax = -Infinity;
      const paneIndex = parseInt(pane.id.replace('indicator_', ''), 10);
      for (const [, handle] of allSeries) {
        if (handle.overlay || handle.paneIndex !== paneIndex || hiddenPlots.has(handle.name))
          continue;
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
      } else if (paneDrawings) {
        // FALLBACK-ONLY: this pane has no non-overlay series prices, so the
        // range would stay at the {-1,1} default and every drawing would map
        // off-pane. Seed the range from the pane's drawing objects instead.
        let drawingMin = Infinity;
        let drawingMax = -Infinity;
        const consider = (v: number | undefined): void => {
          if (v !== null && v !== undefined && typeof v === 'number' && isFinite(v)) {
            if (v < drawingMin) drawingMin = v;
            if (v > drawingMax) drawingMax = v;
          }
        };
        for (const lf of paneDrawings.linefills) {
          if (lf.paneIndex !== paneIndex) continue;
          consider(lf.line1.y1);
          consider(lf.line1.y2);
          consider(lf.line2.y1);
          consider(lf.line2.y2);
        }
        for (const line of paneDrawings.drawingLines) {
          if (line.paneIndex !== paneIndex) continue;
          for (const p of line.points) consider(p.price);
        }
        for (const label of paneDrawings.labels) {
          if (label.paneIndex !== paneIndex) continue;
          consider(label.price);
        }
        if (drawingMin !== Infinity && drawingMax !== -Infinity) {
          // setIndicatorPriceRange applies the 10% padding so the surface is
          // not clipped at the pane edges.
          this.layout.setIndicatorPriceRange(pane.id, drawingMin, drawingMax);
        }
      }
    }
  }

  /**
   * Compute and set the max volume from visible candles.
   */
  updateVolumeMax(candles: CandlestickData[]): void {
    const range = this.viewport.getVisibleRange();
    let maxVol = 0;
    for (let i = range.start; i < range.end && i < candles.length; i++) {
      if (candles[i].volume > maxVol) maxVol = candles[i].volume;
    }
    this.layout.setVolumeMax(maxVol);
  }

  // --- Viewport passthroughs ---

  fitContent(width: number): void {
    this.viewport.fitContent(width);
  }

  scrollTo(barIndex: number, chartWidth: number): void {
    this.viewport.scrollTo(barIndex, chartWidth);
  }

  getFirstBarIndex(): number {
    return this.viewport.getFirstBarIndex();
  }

  getVisibleRange(): { start: number; end: number } {
    return this.viewport.getVisibleRange();
  }
}
