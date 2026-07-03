export interface PaneRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutRegions {
  chartArea: { x: number; y: number; width: number; height: number };
  volumeArea: { x: number; y: number; width: number; height: number };
  indicatorPanes: PaneRegion[];
  priceScale: { x: number; y: number; width: number; height: number };
  timeScale: { x: number; y: number; width: number; height: number };
}

export interface PriceRange {
  min: number;
  max: number;
}

export class LayoutManager {
  private regions!: LayoutRegions;
  private priceRange: PriceRange = { min: 0, max: 100 };
  private autoPriceRange: PriceRange = { min: 0, max: 100 };
  private manualPriceRange: boolean = false;
  private volumeMax: number = 1;
  private indicatorPriceRanges: Map<string, PriceRange> = new Map();
  private indicatorAutoPriceRanges: Map<string, PriceRange> = new Map();

  constructor(
    private priceScaleWidth: number = 70,
    private timeScaleHeight: number = 30,
    private volumeHeightRatio: number = 0.2,
    private indicatorHeightRatio: number = 0.3,
    private paneGap: number = 4,
  ) {}

  calculate(canvasWidth: number, canvasHeight: number, indicatorCount: number = 0): LayoutRegions {
    const chartWidth = canvasWidth - this.priceScaleWidth;
    const totalChartHeight = canvasHeight - this.timeScaleHeight;
    const volumeHeight = totalChartHeight * this.volumeHeightRatio;

    let indicatorTotalHeight = 0;
    const indicatorPanes: PaneRegion[] = [];

    if (indicatorCount > 0) {
      indicatorTotalHeight = totalChartHeight * this.indicatorHeightRatio;
      const paneHeight = (indicatorTotalHeight - (indicatorCount - 1) * this.paneGap) / indicatorCount;
      let y = totalChartHeight - indicatorTotalHeight;

      for (let i = 0; i < indicatorCount; i++) {
        indicatorPanes.push({
          id: `indicator_${i}`,
          x: 0,
          y,
          width: chartWidth,
          height: paneHeight,
        });
        y += paneHeight + this.paneGap;
      }
    }

    const mainHeight = totalChartHeight - volumeHeight - indicatorTotalHeight;

    this.regions = {
      chartArea: { x: 0, y: 0, width: chartWidth, height: mainHeight },
      volumeArea: { x: 0, y: mainHeight, width: chartWidth, height: volumeHeight },
      indicatorPanes,
      priceScale: { x: chartWidth, y: 0, width: this.priceScaleWidth, height: totalChartHeight },
      timeScale: { x: 0, y: totalChartHeight, width: canvasWidth, height: this.timeScaleHeight },
    };

    return this.regions;
  }

  getRegions(): LayoutRegions {
    return this.regions;
  }

  setPriceRange(min: number, max: number): void {
    const padding = (max - min) * 0.05 || 1;
    this.autoPriceRange = { min: min - padding, max: max + padding };
    if (!this.manualPriceRange) {
      this.priceRange = { ...this.autoPriceRange };
    }
  }

  getPriceRange(): PriceRange {
    return this.priceRange;
  }

  isManualPriceRange(): boolean {
    return this.manualPriceRange;
  }

  setManualPriceRange(min: number, max: number): void {
    this.manualPriceRange = true;
    this.priceRange = { min, max };
  }

  setIndicatorPriceRange(paneId: string, min: number, max: number): void {
    const padding = (max - min) * 0.1 || 1;
    this.indicatorAutoPriceRanges.set(paneId, { min: min - padding, max: max + padding });
    if (!this.indicatorPriceRanges.has(paneId)) {
      this.indicatorPriceRanges.set(paneId, this.indicatorAutoPriceRanges.get(paneId)!);
    }
  }

  getIndicatorPriceRange(paneId: string): PriceRange {
    return this.indicatorPriceRanges.get(paneId) || { min: -1, max: 1 };
  }

  zoomPrice(factor: number, centerPixelY: number): void {
    if (!this.regions) return;
    const { chartArea } = this.regions;
    const centerPrice = this.pixelToPrice(centerPixelY, chartArea.y, chartArea.height);
    const { min, max } = this.priceRange;
    const range = max - min;
    const newRange = range * factor;
    const ratio = (centerPrice - min) / range;
    const newMin = centerPrice - newRange * ratio;
    const newMax = centerPrice + newRange * (1 - ratio);
    this.manualPriceRange = true;
    this.priceRange = { min: newMin, max: newMax };
  }

  panPrice(deltaPixels: number): void {
    if (!this.regions) return;
    const { chartArea } = this.regions;
    const { min, max } = this.priceRange;
    const range = max - min;
    const pricePerPixel = range / chartArea.height;
    const priceDelta = deltaPixels * pricePerPixel;
    this.manualPriceRange = true;
    this.priceRange = { min: min + priceDelta, max: max + priceDelta };
  }

  resetAutoPriceRange(): void {
    this.manualPriceRange = false;
    this.priceRange = { ...this.autoPriceRange };
  }

  setVolumeMax(max: number): void {
    this.volumeMax = max || 1;
  }

  getVolumeMax(): number {
    return this.volumeMax;
  }

  priceToPixel(price: number, areaY: number, areaHeight: number, paneId?: string): number {
    const range = paneId ? this.getIndicatorPriceRange(paneId) : this.priceRange;
    if (range.max === range.min) return areaY + areaHeight / 2;
    return areaY + areaHeight - ((price - range.min) / (range.max - range.min)) * areaHeight;
  }

  pixelToPrice(pixelY: number, areaY: number, areaHeight: number, paneId?: string): number {
    const range = paneId ? this.getIndicatorPriceRange(paneId) : this.priceRange;
    return range.min + ((areaY + areaHeight - pixelY) / areaHeight) * (range.max - range.min);
  }

  volumeToPixel(volume: number, areaY: number, areaHeight: number): number {
    if (this.volumeMax === 0) return areaY + areaHeight;
    return areaY + areaHeight - (volume / this.volumeMax) * areaHeight;
  }

  calculateAutoTickSpacing(range: number, targetTicks: number = 6): number {
    if (range === 0) return 1;
    const rawStep = range / targetTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    let step: number;
    if (normalized <= 1.5) step = 1;
    else if (normalized <= 3) step = 2;
    else if (normalized <= 7) step = 5;
    else step = 10;
    return step * magnitude;
  }
}
