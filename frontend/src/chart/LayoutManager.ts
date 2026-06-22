export interface LayoutRegions {
  chartArea: { x: number; y: number; width: number; height: number };
  volumeArea: { x: number; y: number; width: number; height: number };
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
  private volumeMax: number = 1;

  constructor(
    private priceScaleWidth: number = 70,
    private timeScaleHeight: number = 30,
    private volumeHeightRatio: number = 0.2,
  ) {}

  calculate(canvasWidth: number, canvasHeight: number): LayoutRegions {
    const chartWidth = canvasWidth - this.priceScaleWidth;
    const totalChartHeight = canvasHeight - this.timeScaleHeight;
    const volumeHeight = totalChartHeight * this.volumeHeightRatio;
    const mainHeight = totalChartHeight - volumeHeight;

    this.regions = {
      chartArea: { x: 0, y: 0, width: chartWidth, height: mainHeight },
      volumeArea: { x: 0, y: mainHeight, width: chartWidth, height: volumeHeight },
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
    this.priceRange = { min: min - padding, max: max + padding };
  }

  getPriceRange(): PriceRange {
    return this.priceRange;
  }

  setVolumeMax(max: number): void {
    this.volumeMax = max || 1;
  }

  getVolumeMax(): number {
    return this.volumeMax;
  }

  priceToPixel(price: number, areaY: number, areaHeight: number): number {
    const { min, max } = this.priceRange;
    if (max === min) return areaY + areaHeight / 2;
    return areaY + areaHeight - ((price - min) / (max - min)) * areaHeight;
  }

  pixelToPrice(pixelY: number, areaY: number, areaHeight: number): number {
    const { min, max } = this.priceRange;
    return min + ((areaY + areaHeight - pixelY) / areaHeight) * (max - min);
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
