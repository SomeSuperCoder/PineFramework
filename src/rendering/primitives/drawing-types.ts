/**
 * Drawing object types for Pine Script runtime.
 * Extracted from drawing-engine.ts for reusability.
 */
import type { PineColor, ColorInput } from '../../config/color-system.js';
import type {
  LineStyle,
  ExtendDirection,
  XLocation,
  LabelStyle,
  TextHorizontalAlignment,
  TextVerticalAlignment,
  Size,
} from '../rendering-types.js';

export interface LinePoint {
  barIndex: number;
  price: number;
}

export interface LineObject {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: PineColor;
  width: number;
  style: LineStyle;
  extend: ExtendDirection;
  xloc: XLocation;
  editable: boolean;
  fillgaps: boolean;
}

export interface BoxObject {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  border_color: PineColor;
  border_width: number;
  border_style: LineStyle;
  extend_left: boolean;
  extend_right: boolean;
  extend_top: boolean;
  extend_bottom: boolean;
  xloc: XLocation;
  bgcolor: PineColor;
  text: string;
  text_color: PineColor;
  text_size: Size;
  text_halign: TextHorizontalAlignment;
  text_valign: TextVerticalAlignment;
  text_wrap: boolean;
  text_font_family: string;
}

export interface LabelObject {
  id: string;
  x: number;
  y: number;
  text: string;
  color: PineColor;
  style: LabelStyle;
  textcolor: PineColor;
  size: Size;
  textalign: TextHorizontalAlignment;
  xloc: XLocation;
  tooltip: string;
  text_font_family: string;
}

export interface TableCell {
  text: string;
  text_color: PineColor;
  text_halign: TextHorizontalAlignment;
  text_valign: TextVerticalAlignment;
  text_size: Size;
  bgcolor: PineColor;
  tooltip: string;
}

export interface TableObject {
  id: string;
  position: TablePosition;
  columns: number;
  rows: number;
  bgcolor: PineColor;
  border_color: PineColor;
  border_width: number;
  frame_color: PineColor;
  frame_width: number;
  cells: Map<string, TableCell>;
}

export interface LinefillObject {
  id: string;
  line1: LineObject;
  line2: LineObject;
  color: PineColor;
  fillgaps: boolean;
}

export interface PolylinePoint {
  barIndex: number;
  price: number;
}

export interface PolylineObject {
  id: string;
  points: PolylinePoint[];
  close: boolean;
  color: PineColor;
  linewidth: number;
  style: LineStyle;
  join: boolean;
}

export interface DrawingOutput {
  lines: Map<string, LineObject>;
  boxes: Map<string, BoxObject>;
  labels: Map<string, LabelObject>;
  tables: Map<string, TableObject>;
  linefills: Map<string, LinefillObject>;
  polylines: Map<string, PolylineObject>;
}

export interface DrawingLimits {
  maxLines: number;
  maxLabels: number;
  maxBoxes: number;
  maxPolylines: number;
}

export const DEFAULT_LIMITS: DrawingLimits = {
  maxLines: 500,
  maxLabels: 500,
  maxBoxes: 500,
  maxPolylines: 500,
};

export type TablePosition = import('../rendering-types.js').TablePosition;
