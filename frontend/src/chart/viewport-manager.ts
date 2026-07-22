/**
 * Viewport Manager
 *
 * Coordinates the viewport with chart data — price-range computation,
 * volume-max computation, and viewport state updates when candles change.
 * Keeps the coordination logic out of PineChart so the main class focuses
 * on rendering and public API.
 */

import type { CandlestickData } from './types.js';
import type { Viewport } from './Viewport.js';
import type { LayoutManager } from './LayoutManager.js';
import type { PlotSeriesHandle } from './plot-series-manager.js';

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
   */
  updatePriceRange(
    candles: CandlestickData[],
    allSeries: Map<string, PlotSeriesHandle>,
    hiddenPlots: Set<string>,
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

  getVisibleRange(): { start: number; end: number } {
    return this.viewport.getVisibleRange();
  }
}
