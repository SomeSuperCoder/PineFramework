export interface ViewportState {
  firstBarIndex: number;
  barCount: number;
  barSpacing: number;
}

export class Viewport {
  /** Bars from the left edge at which scroll-back triggers and prepend keeps the viewport at 0. */
  static readonly SCROLL_BACK_THRESHOLD = 50;

  private state: ViewportState;
  private minBarSpacing: number;
  private maxBarSpacing: number;
  private totalBars: number = 0;

  constructor(barSpacing: number = 8, minBarSpacing: number = 2, maxBarSpacing: number = 100) {
    this.state = {
      firstBarIndex: 0,
      barCount: 0,
      barSpacing,
    };
    this.minBarSpacing = minBarSpacing;
    this.maxBarSpacing = maxBarSpacing;
  }

  getState(): ViewportState {
    return { ...this.state };
  }

  setTotalBars(count: number): void {
    this.totalBars = count;
  }

  adjustForPrepend(added: number): void {
    this.totalBars += added;
    this.state.firstBarIndex += added;
  }

  fitContent(chartWidth: number): void {
    if (this.totalBars === 0) return;
    this.state.barSpacing = Math.max(this.minBarSpacing, Math.min(this.maxBarSpacing, chartWidth / this.totalBars));
    this.state.barCount = Math.ceil(chartWidth / this.state.barSpacing) + 2;
    this.state.firstBarIndex = Math.max(0, this.totalBars - this.state.barCount);
  }

  scrollTo(barIndex: number, chartWidth: number): void {
    this.state.barCount = Math.ceil(chartWidth / this.state.barSpacing) + 2;
    this.state.firstBarIndex = Math.round(Math.max(0, barIndex - this.state.barCount / 2));
  }

  scrollToDate(_timestamp: number, _chartWidth: number): void {
    // Would need bar-to-time mapping; simplified
  }

  zoom(factor: number, centerPixelX: number, chartWidth: number): void {
    const centerBar = this.pixelToBarIndex(centerPixelX);
    this.state.barSpacing = Math.max(this.minBarSpacing, Math.min(this.maxBarSpacing, this.state.barSpacing * factor));
    this.state.barCount = Math.ceil(chartWidth / this.state.barSpacing) + 2;
    this.state.firstBarIndex = Math.round(Math.max(0, centerBar - (centerPixelX / this.state.barSpacing)));
  }

  pan(deltaPixels: number): void {
    const deltaBars = deltaPixels / this.state.barSpacing;
    // No lower-bound clamp: allow overscroll past the oldest data so the user
    // can drag past the edge while older data loads asynchronously.  The
    // renderers use getVisibleRange() (which clamps start to 0) so they never
    // read negative bar indices.  The scroll-back threshold check in
    // ChartComponent uses the true firstBarIndex (via timeScale().getFirstBarIndex())
    // to decide when to trigger a fetch.
    this.state.firstBarIndex = Math.round(this.state.firstBarIndex - deltaBars);
  }

  barIndexToPixel(barIndex: number): number {
    return (barIndex - this.state.firstBarIndex) * this.state.barSpacing;
  }

  pixelToBarIndex(pixelX: number): number {
    return this.state.firstBarIndex + pixelX / this.state.barSpacing;
  }

  getVisibleRange(): { start: number; end: number } {
    const start = Math.floor(this.state.firstBarIndex);
    const end = Math.ceil(this.state.firstBarIndex + this.state.barCount);
    return { start: Math.max(0, start), end };
  }

  getBarSpacing(): number {
    return this.state.barSpacing;
  }

  getFirstBarIndex(): number {
    return this.state.firstBarIndex;
  }

  getBarCount(): number {
    return this.state.barCount;
  }

  getTotalBars(): number {
    return this.totalBars;
  }
}
