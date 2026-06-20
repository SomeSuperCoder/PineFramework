import { isNa, type PineValue } from '../language/types/na.js';
import { parseColor, type PineColor, type ColorInput } from '../config/color-system.js';
import type {
  LineStyle,
  ExtendDirection,
  XLocation,
  LabelStyle,
  TextHorizontalAlignment,
  TablePosition,
  Size,
} from './rendering-types.js';

function isNaOrNull(value: PineValue): boolean {
  return isNa(value) || value === null || value === undefined;
}

function toNumber(value: PineValue, defaultValue: number = 0): number {
  if (isNaOrNull(value)) return defaultValue;
  return value as number;
}

function toString(value: PineValue, defaultValue: string = ''): string {
  if (isNaOrNull(value)) return defaultValue;
  return String(value);
}

let drawingIdCounter = 0;

function generateDrawingId(): string {
  return `drawing_${++drawingIdCounter}`;
}

export function resetDrawingIdCounter(): void {
  drawingIdCounter = 0;
}

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

type TextVerticalAlignment = 'top' | 'middle' | 'bottom';

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

export interface TableCell {
  text: string;
  text_color: PineColor;
  text_halign: TextHorizontalAlignment;
  text_valign: TextVerticalAlignment;
  text_size: Size;
  bgcolor: PineColor;
  tooltip: string;
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

export class DrawingEngine {
  private lines: Map<string, LineObject>;
  private boxes: Map<string, BoxObject>;
  private labels: Map<string, LabelObject>;
  private tables: Map<string, TableObject>;
  private linefills: Map<string, LinefillObject>;
  private polylines: Map<string, PolylineObject>;

  constructor() {
    this.lines = new Map();
    this.boxes = new Map();
    this.labels = new Map();
    this.tables = new Map();
    this.linefills = new Map();
    this.polylines = new Map();
  }

  lineNew(
    x1: PineValue,
    y1: PineValue,
    x2: PineValue,
    y2: PineValue,
    options: {
      color?: ColorInput;
      width?: number;
      style?: LineStyle;
      extend?: ExtendDirection;
      xloc?: XLocation;
      editable?: boolean;
      fillgaps?: boolean;
    } = {},
  ): LineObject {
    const id = generateDrawingId();
    const color = options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };

    const line: LineObject = {
      id,
      x1: toNumber(x1),
      y1: toNumber(y1),
      x2: toNumber(x2),
      y2: toNumber(y2),
      color,
      width: options.width ?? 1,
      style: options.style ?? 'solid',
      extend: options.extend ?? 'none',
      xloc: options.xloc ?? 'bar_index',
      editable: options.editable ?? true,
      fillgaps: options.fillgaps ?? false,
    };

    this.lines.set(id, line);
    return line;
  }

  lineSetLine(
    lineId: string,
    x1: PineValue,
    y1: PineValue,
    x2: PineValue,
    y2: PineValue,
  ): void {
    const line = this.lines.get(lineId);
    if (!line) return;
    if (!isNaOrNull(x1)) line.x1 = x1 as number;
    if (!isNaOrNull(y1)) line.y1 = y1 as number;
    if (!isNaOrNull(x2)) line.x2 = x2 as number;
    if (!isNaOrNull(y2)) line.y2 = y2 as number;
  }

  lineDelete(lineId: string): void {
    this.lines.delete(lineId);
  }

  boxNew(
    left: PineValue,
    top: PineValue,
    right: PineValue,
    bottom: PineValue,
    options: {
      border_color?: ColorInput;
      border_width?: number;
      border_style?: LineStyle;
      extend_left?: boolean;
      extend_right?: boolean;
      extend_top?: boolean;
      extend_bottom?: boolean;
      xloc?: XLocation;
      bgcolor?: ColorInput;
      text?: string;
      text_color?: ColorInput;
      text_size?: Size;
      text_halign?: TextHorizontalAlignment;
      text_valign?: TextVerticalAlignment;
      text_wrap?: boolean;
      text_font_family?: string;
    } = {},
  ): BoxObject {
    const id = generateDrawingId();
    const borderColor = options.border_color !== undefined ? parseColor(options.border_color) : { r: 0, g: 0, b: 0, a: 255 };
    const bgcolor = options.bgcolor !== undefined ? parseColor(options.bgcolor) : { r: 0, g: 0, b: 0, a: 0 };
    const textColor = options.text_color !== undefined ? parseColor(options.text_color) : { r: 0, g: 0, b: 0, a: 255 };

    const box: BoxObject = {
      id,
      left: toNumber(left),
      top: toNumber(top),
      right: toNumber(right),
      bottom: toNumber(bottom),
      border_color: borderColor,
      border_width: options.border_width ?? 1,
      border_style: options.border_style ?? 'solid',
      extend_left: options.extend_left ?? false,
      extend_right: options.extend_right ?? false,
      extend_top: options.extend_top ?? false,
      extend_bottom: options.extend_bottom ?? false,
      xloc: options.xloc ?? 'bar_index',
      bgcolor,
      text: options.text ?? '',
      text_color: textColor,
      text_size: options.text_size ?? 'normal',
      text_halign: options.text_halign ?? 'center',
      text_valign: options.text_valign ?? 'middle',
      text_wrap: options.text_wrap ?? false,
      text_font_family: options.text_font_family ?? 'Arial',
    };

    this.boxes.set(id, box);
    return box;
  }

  boxDelete(boxId: string): void {
    this.boxes.delete(boxId);
  }

  labelNew(
    x: PineValue,
    y: PineValue,
    text: PineValue,
    options: {
      color?: ColorInput;
      style?: LabelStyle;
      textcolor?: ColorInput;
      size?: Size;
      textalign?: TextHorizontalAlignment;
      xloc?: XLocation;
      tooltip?: string;
      text_font_family?: string;
    } = {},
  ): LabelObject {
    const id = generateDrawingId();
    const color = options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };
    const textcolor = options.textcolor !== undefined ? parseColor(options.textcolor) : { r: 255, g: 255, b: 255, a: 255 };

    const label: LabelObject = {
      id,
      x: toNumber(x),
      y: toNumber(y),
      text: toString(text),
      color,
      style: options.style ?? 'label_down',
      textcolor,
      size: options.size ?? 'normal',
      textalign: options.textalign ?? 'center',
      xloc: options.xloc ?? 'bar_index',
      tooltip: options.tooltip ?? '',
      text_font_family: options.text_font_family ?? 'Arial',
    };

    this.labels.set(id, label);
    return label;
  }

  labelSetXY(labelId: string, x: PineValue, y: PineValue): void {
    const label = this.labels.get(labelId);
    if (!label) return;
    if (!isNaOrNull(x)) label.x = x as number;
    if (!isNaOrNull(y)) label.y = y as number;
  }

  labelSetText(labelId: string, text: PineValue, textcolor?: PineValue, size?: PineValue): void {
    const label = this.labels.get(labelId);
    if (!label) return;
    if (!isNaOrNull(text)) label.text = String(text);
    if (textcolor !== undefined && !isNaOrNull(textcolor)) label.textcolor = parseColor(textcolor as ColorInput);
    if (size !== undefined && !isNaOrNull(size)) label.size = size as Size;
  }

  labelDelete(labelId: string): void {
    this.labels.delete(labelId);
  }

  tableNew(
    position: PineValue,
    columns: PineValue,
    rows: PineValue,
    options: {
      bgcolor?: ColorInput;
      border_color?: ColorInput;
      border_width?: number;
      frame_color?: ColorInput;
      frame_width?: number;
    } = {},
  ): TableObject {
    const id = generateDrawingId();
    const bgcolor = options.bgcolor !== undefined ? parseColor(options.bgcolor) : { r: 0, g: 0, b: 0, a: 255 };
    const borderColor = options.border_color !== undefined ? parseColor(options.border_color) : { r: 0, g: 0, b: 0, a: 255 };
    const frameColor = options.frame_color !== undefined ? parseColor(options.frame_color) : { r: 0, g: 0, b: 0, a: 255 };

    const table: TableObject = {
      id,
      position: (isNaOrNull(position) ? 'top_right' : position) as TablePosition,
      columns: toNumber(columns, 1),
      rows: toNumber(rows, 1),
      bgcolor,
      border_color: borderColor,
      border_width: options.border_width ?? 0,
      frame_color: frameColor,
      frame_width: options.frame_width ?? 0,
      cells: new Map(),
    };

    this.tables.set(id, table);
    return table;
  }

  tableCellSet(
    tableId: string,
    column: PineValue,
    row: PineValue,
    text: PineValue,
    options: {
      text_color?: ColorInput;
      text_halign?: TextHorizontalAlignment;
      text_valign?: TextVerticalAlignment;
      text_size?: Size;
      bgcolor?: ColorInput;
      tooltip?: string;
    } = {},
  ): void {
    const table = this.tables.get(tableId);
    if (!table) return;

    const col = toNumber(column, 0);
    const r = toNumber(row, 0);
    const key = `${col},${r}`;
    const textColor = options.text_color !== undefined ? parseColor(options.text_color) : { r: 255, g: 255, b: 255, a: 255 };
    const bgcolor = options.bgcolor !== undefined ? parseColor(options.bgcolor) : { r: 0, g: 0, b: 0, a: 255 };

    table.cells.set(key, {
      text: toString(text),
      text_color: textColor,
      text_halign: options.text_halign ?? 'center',
      text_valign: options.text_valign ?? 'middle',
      text_size: options.text_size ?? 'normal',
      bgcolor,
      tooltip: options.tooltip ?? '',
    });
  }

  tableDelete(tableId: string): void {
    this.tables.delete(tableId);
  }

  linefillNew(
    line1Id: string,
    line2Id: string,
    options: {
      color?: ColorInput;
      fillgaps?: boolean;
    } = {},
  ): LinefillObject | undefined {
    const line1 = this.lines.get(line1Id);
    const line2 = this.lines.get(line2Id);
    if (!line1 || !line2) return undefined;

    const id = generateDrawingId();
    const color = options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 255, a: 100 };

    const linefill: LinefillObject = {
      id,
      line1,
      line2,
      color,
      fillgaps: options.fillgaps ?? false,
    };

    this.linefills.set(id, linefill);
    return linefill;
  }

  linefillDelete(linefillId: string): void {
    this.linefills.delete(linefillId);
  }

  polylineNew(
    points: PineValue[],
    options: {
      close?: boolean;
      color?: ColorInput;
      linewidth?: number;
      style?: LineStyle;
      join?: boolean;
    } = {},
  ): PolylineObject {
    const id = generateDrawingId();
    const color = options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };

    const parsedPoints: PolylinePoint[] = [];
    if (Array.isArray(points)) {
      for (const point of points) {
        if (Array.isArray(point) && point.length >= 2) {
          parsedPoints.push({
            barIndex: point[0] as number,
            price: point[1] as number,
          });
        }
      }
    }

    const polyline: PolylineObject = {
      id,
      points: parsedPoints,
      close: options.close ?? false,
      color,
      linewidth: options.linewidth ?? 1,
      style: options.style ?? 'solid',
      join: options.join ?? true,
    };

    this.polylines.set(id, polyline);
    return polyline;
  }

  polylineDelete(polylineId: string): void {
    this.polylines.delete(polylineId);
  }

  getOutput(): DrawingOutput {
    return {
      lines: new Map(this.lines),
      boxes: new Map(this.boxes),
      labels: new Map(this.labels),
      tables: new Map(this.tables),
      linefills: new Map(this.linefills),
      polylines: new Map(this.polylines),
    };
  }

  clear(): void {
    this.lines.clear();
    this.boxes.clear();
    this.labels.clear();
    this.tables.clear();
    this.linefills.clear();
    this.polylines.clear();
  }
}
