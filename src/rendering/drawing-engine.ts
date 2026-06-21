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

export interface DrawingLimits {
  maxLines: number;
  maxLabels: number;
  maxBoxes: number;
  maxPolylines: number;
}

const DEFAULT_LIMITS: DrawingLimits = {
  maxLines: 500,
  maxLabels: 500,
  maxBoxes: 500,
  maxPolylines: 500,
};

export class DrawingEngine {
  private lines: Map<string, LineObject>;
  private boxes: Map<string, BoxObject>;
  private labels: Map<string, LabelObject>;
  private tables: Map<string, TableObject>;
  private linefills: Map<string, LinefillObject>;
  private polylines: Map<string, PolylineObject>;
  private limits: DrawingLimits;

  constructor(limits: Partial<DrawingLimits> = {}) {
    this.lines = new Map();
    this.boxes = new Map();
    this.labels = new Map();
    this.tables = new Map();
    this.linefills = new Map();
    this.polylines = new Map();
    this.limits = { ...DEFAULT_LIMITS, ...limits };
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
  ): LineObject | undefined {
    if (this.lines.size >= this.limits.maxLines) {
      const firstKey = this.lines.keys().next().value;
      if (firstKey) this.lines.delete(firstKey);
    }

    const id = generateDrawingId();
    const color =
      options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };

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

  lineCopy(lineId: string): LineObject | undefined {
    const original = this.lines.get(lineId);
    if (!original) return undefined;

    const id = generateDrawingId();
    const copy: LineObject = { ...original, id };
    this.lines.set(id, copy);
    return copy;
  }

  lineGetPoints(lineId: string): { x1: number; y1: number; x2: number; y2: number } | undefined {
    const line = this.lines.get(lineId);
    if (!line) return undefined;
    return { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 };
  }

  lineGetColor(lineId: string): PineColor | undefined {
    const line = this.lines.get(lineId);
    if (!line) return undefined;
    return { ...line.color };
  }

  lineGetWidth(lineId: string): number | undefined {
    const line = this.lines.get(lineId);
    if (!line) return undefined;
    return line.width;
  }

  lineGetStyle(lineId: string): LineStyle | undefined {
    const line = this.lines.get(lineId);
    if (!line) return undefined;
    return line.style;
  }

  lineGetExtend(lineId: string): ExtendDirection | undefined {
    const line = this.lines.get(lineId);
    if (!line) return undefined;
    return line.extend;
  }

  lineGetEditable(lineId: string): boolean | undefined {
    const line = this.lines.get(lineId);
    if (!line) return undefined;
    return line.editable;
  }

  lineSetLine(lineId: string, x1: PineValue, y1: PineValue, x2: PineValue, y2: PineValue): void {
    const line = this.lines.get(lineId);
    if (!line) return;
    if (!isNaOrNull(x1)) line.x1 = x1 as number;
    if (!isNaOrNull(y1)) line.y1 = y1 as number;
    if (!isNaOrNull(x2)) line.x2 = x2 as number;
    if (!isNaOrNull(y2)) line.y2 = y2 as number;
  }

  lineSetX1(lineId: string, x: PineValue): void {
    const line = this.lines.get(lineId);
    if (line && !isNaOrNull(x)) line.x1 = x as number;
  }

  lineSetY1(lineId: string, y: PineValue): void {
    const line = this.lines.get(lineId);
    if (line && !isNaOrNull(y)) line.y1 = y as number;
  }

  lineSetX2(lineId: string, x: PineValue): void {
    const line = this.lines.get(lineId);
    if (line && !isNaOrNull(x)) line.x2 = x as number;
  }

  lineSetY2(lineId: string, y: PineValue): void {
    const line = this.lines.get(lineId);
    if (line && !isNaOrNull(y)) line.y2 = y as number;
  }

  lineSetColor(lineId: string, color: ColorInput): void {
    const line = this.lines.get(lineId);
    if (line) line.color = parseColor(color);
  }

  lineSetWidth(lineId: string, width: PineValue): void {
    const line = this.lines.get(lineId);
    if (line && !isNaOrNull(width)) line.width = width as number;
  }

  lineSetStyle(lineId: string, style: LineStyle): void {
    const line = this.lines.get(lineId);
    if (line) line.style = style;
  }

  lineSetExtend(lineId: string, extend: ExtendDirection): void {
    const line = this.lines.get(lineId);
    if (line) line.extend = extend;
  }

  lineSetEditable(lineId: string, editable: PineValue): void {
    const line = this.lines.get(lineId);
    if (line && !isNaOrNull(editable)) line.editable = editable as boolean;
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
  ): BoxObject | undefined {
    if (this.boxes.size >= this.limits.maxBoxes) {
      const firstKey = this.boxes.keys().next().value;
      if (firstKey) this.boxes.delete(firstKey);
    }

    const id = generateDrawingId();
    const borderColor =
      options.border_color !== undefined
        ? parseColor(options.border_color)
        : { r: 0, g: 0, b: 0, a: 255 };
    const bgcolor =
      options.bgcolor !== undefined ? parseColor(options.bgcolor) : { r: 0, g: 0, b: 0, a: 0 };
    const textColor =
      options.text_color !== undefined
        ? parseColor(options.text_color)
        : { r: 0, g: 0, b: 0, a: 255 };

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

  boxCopy(boxId: string): BoxObject | undefined {
    const original = this.boxes.get(boxId);
    if (!original) return undefined;

    const id = generateDrawingId();
    const copy: BoxObject = { ...original, id };
    this.boxes.set(id, copy);
    return copy;
  }

  boxGetLeft(boxId: string): number | undefined {
    const box = this.boxes.get(boxId);
    return box?.left;
  }

  boxGetTop(boxId: string): number | undefined {
    const box = this.boxes.get(boxId);
    return box?.top;
  }

  boxGetRight(boxId: string): number | undefined {
    const box = this.boxes.get(boxId);
    return box?.right;
  }

  boxGetBottom(boxId: string): number | undefined {
    const box = this.boxes.get(boxId);
    return box?.bottom;
  }

  boxGetBgColor(boxId: string): PineColor | undefined {
    const box = this.boxes.get(boxId);
    return box ? { ...box.bgcolor } : undefined;
  }

  boxGetBorderColor(boxId: string): PineColor | undefined {
    const box = this.boxes.get(boxId);
    return box ? { ...box.border_color } : undefined;
  }

  boxSetLeft(boxId: string, left: PineValue): void {
    const box = this.boxes.get(boxId);
    if (box && !isNaOrNull(left)) box.left = left as number;
  }

  boxSetTop(boxId: string, top: PineValue): void {
    const box = this.boxes.get(boxId);
    if (box && !isNaOrNull(top)) box.top = top as number;
  }

  boxSetRight(boxId: string, right: PineValue): void {
    const box = this.boxes.get(boxId);
    if (box && !isNaOrNull(right)) box.right = right as number;
  }

  boxSetBottom(boxId: string, bottom: PineValue): void {
    const box = this.boxes.get(boxId);
    if (box && !isNaOrNull(bottom)) box.bottom = bottom as number;
  }

  boxSetBgColor(boxId: string, color: ColorInput): void {
    const box = this.boxes.get(boxId);
    if (box) box.bgcolor = parseColor(color);
  }

  boxSetBorderColor(boxId: string, color: ColorInput): void {
    const box = this.boxes.get(boxId);
    if (box) box.border_color = parseColor(color);
  }

  boxSetBorderWidth(boxId: string, width: PineValue): void {
    const box = this.boxes.get(boxId);
    if (box && !isNaOrNull(width)) box.border_width = width as number;
  }

  boxSetBorderStyle(boxId: string, style: LineStyle): void {
    const box = this.boxes.get(boxId);
    if (box) box.border_style = style;
  }

  boxSetText(boxId: string, text: PineValue): void {
    const box = this.boxes.get(boxId);
    if (box && !isNaOrNull(text)) box.text = String(text);
  }

  boxSetTextColor(boxId: string, color: ColorInput): void {
    const box = this.boxes.get(boxId);
    if (box) box.text_color = parseColor(color);
  }

  boxSetTextSize(boxId: string, size: Size): void {
    const box = this.boxes.get(boxId);
    if (box) box.text_size = size;
  }

  boxSetTextHalign(boxId: string, halign: TextHorizontalAlignment): void {
    const box = this.boxes.get(boxId);
    if (box) box.text_halign = halign;
  }

  boxSetTextValign(boxId: string, valign: TextVerticalAlignment): void {
    const box = this.boxes.get(boxId);
    if (box) box.text_valign = valign;
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
  ): LabelObject | undefined {
    if (this.labels.size >= this.limits.maxLabels) {
      const firstKey = this.labels.keys().next().value;
      if (firstKey) this.labels.delete(firstKey);
    }

    const id = generateDrawingId();
    const color =
      options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };
    const textcolor =
      options.textcolor !== undefined
        ? parseColor(options.textcolor)
        : { r: 255, g: 255, b: 255, a: 255 };

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

  labelCopy(labelId: string): LabelObject | undefined {
    const original = this.labels.get(labelId);
    if (!original) return undefined;

    const id = generateDrawingId();
    const copy: LabelObject = { ...original, id };
    this.labels.set(id, copy);
    return copy;
  }

  labelGetText(labelId: string): string | undefined {
    const label = this.labels.get(labelId);
    return label?.text;
  }

  labelGetColor(labelId: string): PineColor | undefined {
    const label = this.labels.get(labelId);
    return label ? { ...label.color } : undefined;
  }

  labelGetTextColor(labelId: string): PineColor | undefined {
    const label = this.labels.get(labelId);
    return label ? { ...label.textcolor } : undefined;
  }

  labelGetSize(labelId: string): Size | undefined {
    const label = this.labels.get(labelId);
    return label?.size;
  }

  labelSetText(labelId: string, text: PineValue, textcolor?: PineValue, size?: PineValue): void {
    const label = this.labels.get(labelId);
    if (!label) return;
    if (!isNaOrNull(text)) label.text = String(text);
    if (textcolor !== undefined && !isNaOrNull(textcolor))
      label.textcolor = parseColor(textcolor as ColorInput);
    if (size !== undefined && !isNaOrNull(size)) label.size = size as Size;
  }

  labelSetX(labelId: string, x: PineValue): void {
    const label = this.labels.get(labelId);
    if (label && !isNaOrNull(x)) label.x = x as number;
  }

  labelSetY(labelId: string, y: PineValue): void {
    const label = this.labels.get(labelId);
    if (label && !isNaOrNull(y)) label.y = y as number;
  }

  labelSetColor(labelId: string, color: ColorInput): void {
    const label = this.labels.get(labelId);
    if (label) label.color = parseColor(color);
  }

  labelSetTextSize(labelId: string, size: Size): void {
    const label = this.labels.get(labelId);
    if (label) label.size = size;
  }

  labelSetStyle(labelId: string, style: LabelStyle): void {
    const label = this.labels.get(labelId);
    if (label) label.style = style;
  }

  labelSetTextAlign(labelId: string, textalign: TextHorizontalAlignment): void {
    const label = this.labels.get(labelId);
    if (label) label.textalign = textalign;
  }

  labelSetTooltip(labelId: string, tooltip: PineValue): void {
    const label = this.labels.get(labelId);
    if (label && !isNaOrNull(tooltip)) label.tooltip = String(tooltip);
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
    const bgcolor =
      options.bgcolor !== undefined ? parseColor(options.bgcolor) : { r: 0, g: 0, b: 0, a: 255 };
    const borderColor =
      options.border_color !== undefined
        ? parseColor(options.border_color)
        : { r: 0, g: 0, b: 0, a: 255 };
    const frameColor =
      options.frame_color !== undefined
        ? parseColor(options.frame_color)
        : { r: 0, g: 0, b: 0, a: 255 };

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

  tableClear(tableId: string): void {
    const table = this.tables.get(tableId);
    if (table) table.cells.clear();
  }

  tableMergeCells(
    tableId: string,
    startColumn: PineValue,
    startRow: PineValue,
    endColumn: PineValue,
    endRow: PineValue,
  ): void {
    const table = this.tables.get(tableId);
    if (!table) return;

    const sc = toNumber(startColumn, 0);
    const sr = toNumber(startRow, 0);
    const ec = toNumber(endColumn, 0);
    const er = toNumber(endRow, 0);

    for (let c = sc; c <= ec; c++) {
      for (let r = sr; r <= er; r++) {
        const key = `${c},${r}`;
        table.cells.delete(key);
      }
    }
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
    const textColor =
      options.text_color !== undefined
        ? parseColor(options.text_color)
        : { r: 255, g: 255, b: 255, a: 255 };
    const bgcolor =
      options.bgcolor !== undefined ? parseColor(options.bgcolor) : { r: 0, g: 0, b: 0, a: 255 };

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
    const color =
      options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 255, a: 100 };

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
  ): PolylineObject | undefined {
    if (this.polylines.size >= this.limits.maxPolylines) {
      const firstKey = this.polylines.keys().next().value;
      if (firstKey) this.polylines.delete(firstKey);
    }

    const id = generateDrawingId();
    const color =
      options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };

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

  linefillGetLine1(linefillId: string): LineObject | undefined {
    const linefill = this.linefills.get(linefillId);
    return linefill?.line1;
  }

  linefillGetLine2(linefillId: string): LineObject | undefined {
    const linefill = this.linefills.get(linefillId);
    return linefill?.line2;
  }

  linefillSetColor(linefillId: string, color: ColorInput): void {
    const linefill = this.linefills.get(linefillId);
    if (linefill) linefill.color = parseColor(color);
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
