import type { PineColor, ColorInput } from '../config/color-system.js';

export type PlotStyle =
  | 'line'
  | 'area'
  | 'columns'
  | 'circles'
  | 'cross'
  | 'histogram'
  | 'stepline'
  | 'areabr';

export type ShapeStyle =
  | 'cross'
  | 'plus'
  | 'xcross'
  | 'diamond'
  | 'circle'
  | 'flag'
  | 'arrowup'
  | 'arrowdown'
  | 'label_up'
  | 'label_down'
  | 'label_left'
  | 'label_right'
  | 'square'
  | 'triangleup'
  | 'triangledown'
  | 'triangleleft'
  | 'triangleright'
  | 'text'
  | 'text_outline';

export type ArrowStyle = 'directional' | 'shapes';

export type LineStyle = 'solid' | 'dotted' | 'dashed' | 'arrow_left' | 'arrow_right' | 'arrow_both';

export type ExtendDirection = 'none' | 'left' | 'right' | 'both';

export type XLocation = 'bar_index' | 'bar_time';

export type LabelStyle =
  | 'none'
  | 'xcross'
  | 'cross'
  | 'triangleup'
  | 'triangledown'
  | 'flag'
  | 'circle'
  | 'arrowup'
  | 'arrowdown'
  | 'label_up'
  | 'label_down'
  | 'label_left'
  | 'label_right'
  | 'square'
  | 'diamond'
  | 'text'
  | 'text_outline';

export type TextHorizontalAlignment = 'left' | 'center' | 'right';

export type TextVerticalAlignment = 'top' | 'middle' | 'bottom';

export type TablePosition =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'middle_left'
  | 'middle_center'
  | 'middle_right'
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right';

export type Size = 'auto' | 'tiny' | 'small' | 'normal' | 'large' | 'huge';

export type HlineStyle = 'solid' | 'dotted' | 'dashed';

export type ChartPointLocation = 'abovebar' | 'belowbar' | 'top' | 'middle' | 'bottom' | 'absolute';

export interface ChartPoint {
  barIndex: number;
  price: number;
}

export interface HlineOptions {
  title?: string;
  color?: ColorInput;
  linewidth?: number;
  linestyle?: HlineStyle;
  editable?: boolean;
  display?: number;
}

export interface HlineDescriptor {
  id: string;
  title: string;
  price: number;
  color: PineColor;
  linewidth: number;
  linestyle: HlineStyle;
  editable: boolean;
  display: number;
}

export interface BgcolorOptions {
  color?: ColorInput;
  offset?: number;
  editable?: boolean;
  fillgaps?: boolean;
}

export interface BgcolorDescriptor {
  id: string;
  title: string;
  color: PineColor;
  offset: number;
  editable: boolean;
  fillgaps: boolean;
  barColors: (PineColor | null)[];
}

export interface BarcolorOptions {
  color?: ColorInput;
  offset?: number;
  editable?: boolean;
}

export interface BarcolorDescriptor {
  id: string;
  title: string;
  color: PineColor;
  offset: number;
  editable: boolean;
  barColors: (PineColor | null)[];
}

export interface FillOptions {
  color?: ColorInput;
  title?: string;
  editable?: boolean;
  fillgaps?: boolean;
}

export interface FillDescriptor {
  id: string;
  title: string;
  plot1Title: string;
  plot2Title: string;
  color: PineColor;
  editable: boolean;
  fillgaps: boolean;
}

export interface PlotOptions {
  title?: string;
  color?: ColorInput;
  linewidth?: number;
  style?: PlotStyle;
  display?: number;
  trackprice?: boolean;
  histbase?: number;
  offset?: number;
  join?: boolean;
  editable?: boolean;
  show_last?: number;
  fillgaps?: boolean;
}

export interface PlotShapeOptions {
  style?: ShapeStyle;
  location?: 'abovebar' | 'belowbar' | 'top' | 'middle' | 'bottom';
  color?: ColorInput;
  offset?: number;
  text?: string;
  textcolor?: ColorInput;
  editable?: boolean;
  size?: Size;
  show_last?: number;
  display?: number;
}

export interface PlotCharOptions {
  char?: string;
  location?: 'abovebar' | 'belowbar' | 'top' | 'middle' | 'bottom';
  color?: ColorInput;
  offset?: number;
  text?: string;
  textcolor?: ColorInput;
  editable?: boolean;
  size?: Size;
  show_last?: number;
  display?: number;
  font?: string;
}

export interface PlotArrowOptions {
  offset?: number;
  color?: ColorInput;
  editable?: boolean;
  show_last?: number;
  display?: number;
  style?: ArrowStyle;
}

export interface PlotDescriptor {
  id: string;
  title: string;
  values: (number | string | boolean | PineColor | null)[];
  color: PineColor;
  linewidth: number;
  style: PlotStyle;
  display: number;
  trackprice: boolean;
  histbase: number;
  offset: number;
  join: boolean;
  fillgaps: boolean;
}

export interface ShapeDescriptor {
  id: string;
  style: ShapeStyle;
  location: string;
  color: PineColor;
  offset: number;
  text: string;
  textcolor: PineColor;
  size: Size;
  display: number;
  barIndex: number[];
}

export interface CharDescriptor {
  id: string;
  char: string;
  location: string;
  color: PineColor;
  offset: number;
  text: string;
  textcolor: PineColor;
  size: Size;
  display: number;
  font: string;
  barIndex: number[];
}

export interface ArrowDescriptor {
  id: string;
  series: number[];
  offset: number;
  color: PineColor;
  style: ArrowStyle;
  display: number;
  barIndex: number[];
}
