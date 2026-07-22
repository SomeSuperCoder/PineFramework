/**
 * Plot Series Manager
 *
 * Manages the lifecycle of plot series on the chart — add, remove,
 * update data, and toggle visibility. Handles layout recalculation
 * notifications when indicator panes change.
 */

import type { PlotSeriesData } from './types.js';
import type { PlotRenderOptions } from './renderers/LineRenderer.js';

export interface PlotSeriesHandle {
  name: string;
  options: PlotRenderOptions;
  data: PlotSeriesData[];
  overlay: boolean;
  paneIndex?: number;
}

export class PlotSeriesManager {
  private plotSeries: Map<string, PlotSeriesHandle> = new Map();
  private hiddenPlots: Set<string> = new Set();
  private lastIndicatorCount: number = 0;

  /** Called when the number of non-overlay indicator panes changes. */
  onLayoutChanged: (() => void) | null = null;

  addPlotSeries(
    name: string,
    options: Partial<PlotRenderOptions> = {},
    overlay: boolean = true,
    paneIndex?: number,
  ): PlotSeriesHandle {
    const existing = this.plotSeries.get(name);
    if (existing) {
      existing.paneIndex = paneIndex;
      return existing;
    }

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
    this.checkLayoutChange();
    return handle;
  }

  setPlotData(name: string, data: PlotSeriesData[]): void {
    const handle = this.plotSeries.get(name);
    if (handle) {
      if (data.length === 0) return;
      handle.data = data;
    }
  }

  setHiddenPlots(names: string[]): void {
    this.hiddenPlots = new Set(names);
  }

  removeSeries(name: string): void {
    this.plotSeries.delete(name);
    this.checkLayoutChange();
  }

  /** Iterate all series, calling fn for each. */
  forEach(fn: (handle: PlotSeriesHandle) => void): void {
    for (const [, handle] of this.plotSeries) {
      fn(handle);
    }
  }

  /** Iterate all series in order, calling fn for each, with break support. */
  forEachWithBreak(
    fn: (handle: PlotSeriesHandle) => boolean | void,
  ): void {
    for (const [, handle] of this.plotSeries) {
      if (fn(handle) === false) break;
    }
  }

  getSeries(name: string): PlotSeriesHandle | undefined {
    return this.plotSeries.get(name);
  }

  getAllSeries(): Map<string, PlotSeriesHandle> {
    return this.plotSeries;
  }

  isHidden(name: string): boolean {
    return this.hiddenPlots.has(name);
  }

  getHiddenPlots(): Set<string> {
    return this.hiddenPlots;
  }

  getNonOverlayPaneCount(): number {
    const paneIndices = new Set<number>();
    for (const [, handle] of this.plotSeries) {
      if (!handle.overlay && handle.paneIndex !== undefined) {
        paneIndices.add(handle.paneIndex);
      }
    }
    return paneIndices.size;
  }

  private checkLayoutChange(): void {
    const count = this.getNonOverlayPaneCount();
    if (count !== this.lastIndicatorCount) {
      this.lastIndicatorCount = count;
      this.onLayoutChanged?.();
    }
  }
}
