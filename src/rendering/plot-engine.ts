import { isNa, type PineValue } from '../language/types/na.js';
import { parseColor, type PineColor, type ColorInput } from '../config/color-system.js';
import type {
  PlotOptions,
  PlotShapeOptions,
  PlotCharOptions,
  PlotArrowOptions,
  PlotDescriptor,
  ShapeDescriptor,
  CharDescriptor,
  ArrowDescriptor,
  HlineOptions,
  HlineDescriptor,
  BgcolorOptions,
  BgcolorDescriptor,
  BarcolorOptions,
  BarcolorDescriptor,
  FillOptions,
  FillDescriptor,
  ChartPoint,
  CandleColorData,
} from './rendering-types.js';

let plotIdCounter = 0;
let plotTitleCounter = 0;
let shapeTitleCounter = 0;
let charTitleCounter = 0;
let arrowTitleCounter = 0;
let hlineTitleCounter = 0;

export function resetPlotIdCounter(): void {
  plotIdCounter = 0;
  plotTitleCounter = 0;
  shapeTitleCounter = 0;
  charTitleCounter = 0;
  arrowTitleCounter = 0;
  hlineTitleCounter = 0;
}

export interface PlotOutput {
  plots: Map<string, PlotDescriptor>;
  shapes: Map<string, ShapeDescriptor>;
  chars: Map<string, CharDescriptor>;
  arrows: Map<string, ArrowDescriptor>;
  hlines: Map<string, HlineDescriptor>;
  bgcolor: BgcolorDescriptor | null;
  barcolor: BarcolorDescriptor | null;
  fills: Map<string, FillDescriptor>;
  /** Per-bar multi-element candle color overrides. Keyed by bar index. */
  candleColors?: Map<number, CandleColorData>;
}

export class ChartPointFactory {
  static new(barIndex: PineValue, price: PineValue): ChartPoint {
    return {
      barIndex:
        isNa(barIndex) || barIndex === null || barIndex === undefined ? 0 : (barIndex as number),
      price: isNa(price) || price === null || price === undefined ? 0 : (price as number),
    };
  }

  static now(price: PineValue): ChartPoint {
    return {
      barIndex: 0,
      price: isNa(price) || price === null || price === undefined ? 0 : (price as number),
    };
  }

  static fromIndex(barIndex: PineValue, price: PineValue): ChartPoint {
    return {
      barIndex:
        isNa(barIndex) || barIndex === null || barIndex === undefined ? 0 : (barIndex as number),
      price: isNa(price) || price === null || price === undefined ? 0 : (price as number),
    };
  }

  static fromTime(timestamp: PineValue, price: PineValue): ChartPoint {
    return {
      barIndex:
        isNa(timestamp) || timestamp === null || timestamp === undefined
          ? 0
          : Math.floor((timestamp as number) / 60000),
      price: isNa(price) || price === null || price === undefined ? 0 : (price as number),
    };
  }

  static copy(point: ChartPoint): ChartPoint {
    return { barIndex: point.barIndex, price: point.price };
  }
}

export class PlotEngine {
  private plots: Map<string, PlotDescriptor>;
  private shapes: Map<string, ShapeDescriptor>;
  private chars: Map<string, CharDescriptor>;
  private arrows: Map<string, ArrowDescriptor>;
  private hlines: Map<string, HlineDescriptor>;
  private bgcolorData: BgcolorDescriptor | null;
  private barcolorData: BarcolorDescriptor | null;
  private fills: Map<string, FillDescriptor>;
  private barIndex: number;
  private candleColors: Map<number, CandleColorData>;

  constructor() {
    this.plots = new Map();
    this.shapes = new Map();
    this.chars = new Map();
    this.arrows = new Map();
    this.hlines = new Map();
    this.bgcolorData = null;
    this.barcolorData = null;
    this.fills = new Map();
    this.barIndex = 0;
    this.candleColors = new Map();
  }

  setBarIndex(index: number): void {
    this.barIndex = index;
  }

  plot(value: PineValue, options: PlotOptions = {}): void {
    const title = options.title ?? `plot_${plotTitleCounter++}`;
    const color =
      options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 255, a: 255 };

    let descriptor = this.plots.get(title);
    if (!descriptor) {
      descriptor = {
        id: `plot_${plotIdCounter++}`,
        title,
        values: [],
        color,
        linewidth: options.linewidth ?? 1,
        style: options.style ?? 'line',
        display: options.display ?? 0,
        trackprice: options.trackprice ?? false,
        histbase: options.histbase ?? 0,
        offset: options.offset ?? 0,
        join: options.join ?? true,
        fillgaps: options.fillgaps ?? true,
      };
      this.plots.set(title, descriptor);
    }

    descriptor.values.push(isNa(value) ? null : (value as number | string | boolean | PineColor));
    descriptor.color = color;
    if (options.linewidth !== undefined) descriptor.linewidth = options.linewidth;
    if (options.style !== undefined) descriptor.style = options.style;
    if (options.display !== undefined) descriptor.display = options.display;
    if (options.trackprice !== undefined) descriptor.trackprice = options.trackprice;
    if (options.histbase !== undefined) descriptor.histbase = options.histbase;
    if (options.offset !== undefined) descriptor.offset = options.offset;
    if (options.join !== undefined) descriptor.join = options.join;
    if (options.fillgaps !== undefined) descriptor.fillgaps = options.fillgaps;
  }

  plotshape(value: PineValue, options: PlotShapeOptions = {}, title?: string): void {
    const shapeTitle = title ?? `shape_${shapeTitleCounter++}`;
    const style = options.style ?? 'circle';
    const location = options.location ?? 'abovebar';
    const color =
      options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };
    const textcolor = options.textcolor !== undefined ? parseColor(options.textcolor) : color;

    let descriptor = this.shapes.get(shapeTitle);
    if (!descriptor) {
      descriptor = {
        id: `shape_${plotIdCounter++}`,
        style,
        location,
        color,
        offset: options.offset ?? 0,
        text: options.text ?? '',
        textcolor,
        size: options.size ?? 'normal',
        display: options.display ?? 0,
        barIndex: [],
      };
      this.shapes.set(shapeTitle, descriptor);
    }

    const isNA = isNa(value) || value === null || value === undefined;
    const shouldShow = !isNA && pineTruthy(value);
    descriptor.barIndex.push(shouldShow ? this.barIndex + (options.offset ?? 0) : -1);
    descriptor.style = style;
    descriptor.location = location;
    descriptor.color = color;
    descriptor.text = options.text ?? '';
    descriptor.textcolor = textcolor;
    if (options.size !== undefined) descriptor.size = options.size;
    if (options.display !== undefined) descriptor.display = options.display;
  }

  plotchar(value: PineValue, options: PlotCharOptions = {}, title?: string): void {
    const charTitle = title ?? `char_${charTitleCounter++}`;
    const char = options.char ?? '●';
    const location = options.location ?? 'abovebar';
    const color =
      options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };
    const textcolor = options.textcolor !== undefined ? parseColor(options.textcolor) : color;

    let descriptor = this.chars.get(charTitle);
    if (!descriptor) {
      descriptor = {
        id: `char_${plotIdCounter++}`,
        char,
        location,
        color,
        offset: options.offset ?? 0,
        text: options.text ?? '',
        textcolor,
        size: options.size ?? 'normal',
        display: options.display ?? 0,
        font: options.font ?? 'Arial',
        barIndex: [],
      };
      this.chars.set(charTitle, descriptor);
    }

    const isNA = isNa(value) || value === null || value === undefined;
    const shouldShow = !isNA && pineTruthy(value);
    descriptor.barIndex.push(shouldShow ? this.barIndex + (options.offset ?? 0) : -1);
    descriptor.char = char;
    descriptor.location = location;
    descriptor.color = color;
    descriptor.text = options.text ?? '';
    descriptor.textcolor = textcolor;
    if (options.size !== undefined) descriptor.size = options.size;
    if (options.display !== undefined) descriptor.display = options.display;
    if (options.font !== undefined) descriptor.font = options.font;
  }

  plotarrow(series: PineValue, options: PlotArrowOptions = {}, title?: string): void {
    const arrowTitle = title ?? `arrow_${arrowTitleCounter++}`;
    const color =
      options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };

    let descriptor = this.arrows.get(arrowTitle);
    if (!descriptor) {
      descriptor = {
        id: `arrow_${plotIdCounter++}`,
        series: [],
        offset: options.offset ?? 0,
        color,
        style: options.style ?? 'directional',
        display: options.display ?? 0,
        barIndex: [],
      };
      this.arrows.set(arrowTitle, descriptor);
    }

    const numValue =
      isNa(series) || series === null || series === undefined ? 0 : (series as number);
    descriptor.series.push(numValue);
    descriptor.barIndex.push(this.barIndex);
    descriptor.color = color;
    if (options.offset !== undefined) descriptor.offset = options.offset;
    if (options.style !== undefined) descriptor.style = options.style;
    if (options.display !== undefined) descriptor.display = options.display;
  }

  getOutput(): PlotOutput {
    return {
      plots: new Map(this.plots),
      shapes: new Map(this.shapes),
      chars: new Map(this.chars),
      arrows: new Map(this.arrows),
      hlines: new Map(this.hlines),
      bgcolor: this.bgcolorData,
      barcolor: this.barcolorData,
      fills: new Map(this.fills),
      candleColors: new Map(this.candleColors),
    };
  }

  clear(): void {
    this.plots.clear();
    this.shapes.clear();
    this.chars.clear();
    this.arrows.clear();
    this.hlines.clear();
    this.bgcolorData = null;
    this.barcolorData = null;
    this.fills.clear();
    this.candleColors.clear();
  }

  hline(price: PineValue, options: HlineOptions = {}): void {
    const title = options.title ?? `hline_${hlineTitleCounter++}`;
    const color =
      options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };
    const numPrice = isNa(price) || price === null || price === undefined ? 0 : (price as number);

    this.hlines.set(title, {
      id: `hline_${plotIdCounter++}`,
      title,
      price: numPrice,
      color,
      linewidth: options.linewidth ?? 1,
      linestyle: options.linestyle ?? 'solid',
      editable: options.editable ?? true,
      display: options.display ?? 0,
    });
  }

  bgcolor(colorInput: ColorInput, options: BgcolorOptions = {}): void {
    const color = parseColor(colorInput);
    const title = 'bgcolor';

    if (!this.bgcolorData) {
      this.bgcolorData = {
        id: 'bgcolor',
        title,
        color,
        offset: options.offset ?? 0,
        editable: options.editable ?? true,
        fillgaps: options.fillgaps ?? true,
        barColors: [],
      };
    }

    this.bgcolorData.barColors.push(color);
    this.bgcolorData.color = color;
  }

  barcolor(colorInput: ColorInput, options: BarcolorOptions = {}): void {
    const color = parseColor(colorInput);
    const title = 'barcolor';

    if (!this.barcolorData) {
      this.barcolorData = {
        id: 'barcolor',
        title,
        color,
        offset: options.offset ?? 0,
        editable: options.editable ?? true,
        barColors: [],
      };
    }

    this.barcolorData.barColors.push(color);
    this.barcolorData.color = color;
  }

  /**
   * Set per-bar multi-element candle colors.
   * @param barIndex - the bar index to color
   * @param data - color data with optional body, wick, border fields
   */
  setCandleColor(barIndex: number, data: CandleColorData): void {
    this.candleColors.set(barIndex, data);
  }

  fill(plot1Title: string, plot2Title: string, options: FillOptions = {}): void {
    const color =
      options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 255, a: 100 };
    const title = options.title ?? `fill_${plot1Title}_${plot2Title}`;

    this.fills.set(title, {
      id: `fill_${plotIdCounter++}`,
      title,
      plot1Title,
      plot2Title,
      color,
      editable: options.editable ?? true,
      fillgaps: options.fillgaps ?? true,
    });
  }
}

function pineTruthy(value: PineValue): boolean {
  if (isNa(value) || value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}
