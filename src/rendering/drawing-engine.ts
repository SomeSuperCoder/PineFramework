/**
 * DrawingEngine — manages the lifecycle of Pine Script drawing objects
 * (lines, boxes, labels, tables, linefills, polylines).
 *
 * Delegates CRUD operations to focused domain modules in primitives/.
 */
import type { PineValue } from '../language/types/na.js';
import { parseColor } from '../config/color-system.js';
import type {
  LineStyle,
  ExtendDirection,
  XLocation,
  LabelStyle,
  TextHorizontalAlignment,
  TextVerticalAlignment,
  Size,
} from './rendering-types.js';
import {
  type DrawingOutput,
  type DrawingLimits,
  type LineObject,
  type BoxObject,
  type LabelObject,
  type TableObject,
  type LinefillObject,
  type PolylineObject,
  type TableCell,
  type LinePoint,
  type PolylinePoint,
  type ColorInput,
  DEFAULT_LIMITS,
} from './primitives/drawing-types.js';
import { resetDrawingIdCounter } from './primitives/drawing-helpers.js';
import {
  lineNew, lineCopy, lineGetPoints, lineGetColor, lineGetWidth,
  lineGetStyle, lineGetExtend, lineGetEditable,
  lineSetLine, lineSetX1, lineSetY1, lineSetX2, lineSetY2,
  lineSetColor, lineSetWidth, lineSetStyle, lineSetExtend, lineSetEditable,
  lineDelete,
} from './primitives/line-operations.js';
import {
  boxNew, boxCopy,
  boxGetLeft, boxGetTop, boxGetRight, boxGetBottom,
  boxGetBgColor, boxGetBorderColor,
  boxSetLeft, boxSetTop, boxSetRight, boxSetBottom,
  boxSetBgColor, boxSetBorderColor, boxSetBorderWidth, boxSetBorderStyle,
  boxSetText, boxSetTextColor, boxSetTextSize,
  boxSetTextHalign, boxSetTextValign, boxDelete,
} from './primitives/box-operations.js';
import {
  labelNew, labelCopy,
  labelGetText, labelGetColor, labelGetTextColor, labelGetSize,
  labelSetText, labelSetX, labelSetY,
  labelSetColor, labelSetTextSize, labelSetStyle, labelSetTextAlign, labelSetTooltip,
  labelDelete,
} from './primitives/label-operations.js';
import {
  tableNew, tableClear, tableMergeCells, tableCellSet, tableDelete,
} from './primitives/table-operations.js';
import {
  linefillNew, linefillDelete, linefillGetLine1, linefillGetLine2, linefillSetColor,
  polylineNew, polylineDelete,
} from './primitives/linefill-operations.js';

// Re-export types for backward compatibility
export type {
  DrawingOutput,
  LineObject,
  BoxObject,
  LabelObject,
  TableObject,
  LinefillObject,
  PolylineObject,
  TableCell,
  LinePoint,
  PolylinePoint,
  ColorInput,
};

export { resetDrawingIdCounter };

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

  // ==========================================================================
  // Line operations
  // ==========================================================================

  lineNew(
    x1: PineValue, y1: PineValue, x2: PineValue, y2: PineValue,
    options: {
      color?: ColorInput; width?: number; style?: LineStyle;
      extend?: ExtendDirection; xloc?: XLocation; editable?: boolean; fillgaps?: boolean;
    } = {},
  ): LineObject | undefined {
    return lineNew(this.lines, this.limits.maxLines, x1, y1, x2, y2, options);
  }

  lineCopy(lineId: string): LineObject | undefined { return lineCopy(this.lines, lineId); }
  lineGetPoints(lineId: string) { return lineGetPoints(this.lines, lineId); }
  lineGetColor(lineId: string) { return lineGetColor(this.lines, lineId); }
  lineGetWidth(lineId: string) { return lineGetWidth(this.lines, lineId); }
  lineGetStyle(lineId: string) { return lineGetStyle(this.lines, lineId); }
  lineGetExtend(lineId: string) { return lineGetExtend(this.lines, lineId); }
  lineGetEditable(lineId: string) { return lineGetEditable(this.lines, lineId); }
  lineSetLine(lineId: string, x1: PineValue, y1: PineValue, x2: PineValue, y2: PineValue) { return lineSetLine(this.lines, lineId, x1, y1, x2, y2); }
  lineSetX1(lineId: string, x: PineValue) { return lineSetX1(this.lines, lineId, x); }
  lineSetY1(lineId: string, y: PineValue) { return lineSetY1(this.lines, lineId, y); }
  lineSetX2(lineId: string, x: PineValue) { return lineSetX2(this.lines, lineId, x); }
  lineSetY2(lineId: string, y: PineValue) { return lineSetY2(this.lines, lineId, y); }
  lineSetColor(lineId: string, color: ColorInput) { return lineSetColor(this.lines, lineId, color); }
  lineSetWidth(lineId: string, width: PineValue) { return lineSetWidth(this.lines, lineId, width); }
  lineSetStyle(lineId: string, style: LineStyle) { return lineSetStyle(this.lines, lineId, style); }
  lineSetExtend(lineId: string, extend: ExtendDirection) { return lineSetExtend(this.lines, lineId, extend); }
  lineSetEditable(lineId: string, editable: PineValue) { return lineSetEditable(this.lines, lineId, editable); }
  lineDelete(lineId: string) { return lineDelete(this.lines, lineId); }

  // ==========================================================================
  // Box operations
  // ==========================================================================

  boxNew(
    left: PineValue, top: PineValue, right: PineValue, bottom: PineValue,
    options: {
      border_color?: ColorInput; border_width?: number; border_style?: LineStyle;
      extend_left?: boolean; extend_right?: boolean; extend_top?: boolean; extend_bottom?: boolean;
      xloc?: XLocation; bgcolor?: ColorInput; text?: string; text_color?: ColorInput;
      text_size?: Size; text_halign?: TextHorizontalAlignment; text_valign?: TextVerticalAlignment;
      text_wrap?: boolean; text_font_family?: string;
    } = {},
  ): BoxObject | undefined {
    return boxNew(this.boxes, this.limits.maxBoxes, left, top, right, bottom, options);
  }

  boxCopy(boxId: string) { return boxCopy(this.boxes, boxId); }
  boxGetLeft(boxId: string) { return boxGetLeft(this.boxes, boxId); }
  boxGetTop(boxId: string) { return boxGetTop(this.boxes, boxId); }
  boxGetRight(boxId: string) { return boxGetRight(this.boxes, boxId); }
  boxGetBottom(boxId: string) { return boxGetBottom(this.boxes, boxId); }
  boxGetBgColor(boxId: string) { return boxGetBgColor(this.boxes, boxId); }
  boxGetBorderColor(boxId: string) { return boxGetBorderColor(this.boxes, boxId); }
  boxSetLeft(boxId: string, left: PineValue) { return boxSetLeft(this.boxes, boxId, left); }
  boxSetTop(boxId: string, top: PineValue) { return boxSetTop(this.boxes, boxId, top); }
  boxSetRight(boxId: string, right: PineValue) { return boxSetRight(this.boxes, boxId, right); }
  boxSetBottom(boxId: string, bottom: PineValue) { return boxSetBottom(this.boxes, boxId, bottom); }
  boxSetBgColor(boxId: string, color: ColorInput) { return boxSetBgColor(this.boxes, boxId, color); }
  boxSetBorderColor(boxId: string, color: ColorInput) { return boxSetBorderColor(this.boxes, boxId, color); }
  boxSetBorderWidth(boxId: string, width: PineValue) { return boxSetBorderWidth(this.boxes, boxId, width); }
  boxSetBorderStyle(boxId: string, style: LineStyle) { return boxSetBorderStyle(this.boxes, boxId, style); }
  boxSetText(boxId: string, text: PineValue) { return boxSetText(this.boxes, boxId, text); }
  boxSetTextColor(boxId: string, color: ColorInput) { return boxSetTextColor(this.boxes, boxId, color); }
  boxSetTextSize(boxId: string, size: Size) { return boxSetTextSize(this.boxes, boxId, size); }
  boxSetTextHalign(boxId: string, halign: TextHorizontalAlignment) { return boxSetTextHalign(this.boxes, boxId, halign); }
  boxSetTextValign(boxId: string, valign: TextVerticalAlignment) { return boxSetTextValign(this.boxes, boxId, valign); }
  boxDelete(boxId: string) { return boxDelete(this.boxes, boxId); }

  // ==========================================================================
  // Label operations
  // ==========================================================================

  labelNew(
    x: PineValue, y: PineValue, text: PineValue,
    options: {
      color?: ColorInput; style?: LabelStyle; textcolor?: ColorInput; size?: Size;
      textalign?: TextHorizontalAlignment; xloc?: XLocation; tooltip?: string;
      text_font_family?: string;
    } = {},
  ): LabelObject | undefined {
    return labelNew(this.labels, this.limits.maxLabels, x, y, text, options);
  }

  labelCopy(labelId: string) { return labelCopy(this.labels, labelId); }
  labelGetText(labelId: string) { return labelGetText(this.labels, labelId); }
  labelGetColor(labelId: string) { return labelGetColor(this.labels, labelId); }
  labelGetTextColor(labelId: string) { return labelGetTextColor(this.labels, labelId); }
  labelGetSize(labelId: string) { return labelGetSize(this.labels, labelId); }
  labelSetText(labelId: string, text: PineValue, textcolor?: PineValue, size?: PineValue) { return labelSetText(this.labels, labelId, text, textcolor, size); }
  labelSetX(labelId: string, x: PineValue) { return labelSetX(this.labels, labelId, x); }
  labelSetY(labelId: string, y: PineValue) { return labelSetY(this.labels, labelId, y); }
  labelSetColor(labelId: string, color: ColorInput) { return labelSetColor(this.labels, labelId, color); }
  labelSetTextSize(labelId: string, size: Size) { return labelSetTextSize(this.labels, labelId, size); }
  labelSetStyle(labelId: string, style: LabelStyle) { return labelSetStyle(this.labels, labelId, style); }
  labelSetTextAlign(labelId: string, textalign: TextHorizontalAlignment) { return labelSetTextAlign(this.labels, labelId, textalign); }
  labelSetTooltip(labelId: string, tooltip: PineValue) { return labelSetTooltip(this.labels, labelId, tooltip); }
  labelDelete(labelId: string) { return labelDelete(this.labels, labelId); }

  // ==========================================================================
  // Table operations
  // ==========================================================================

  tableNew(
    position: PineValue, columns: PineValue, rows: PineValue,
    options: {
      bgcolor?: ColorInput; border_color?: ColorInput; border_width?: number;
      frame_color?: ColorInput; frame_width?: number;
    } = {},
  ): TableObject {
    return tableNew(this.tables, position, columns, rows, options);
  }

  tableClear(tableId: string) { return tableClear(this.tables, tableId); }
  tableMergeCells(tableId: string, startColumn: PineValue, startRow: PineValue, endColumn: PineValue, endRow: PineValue) { return tableMergeCells(this.tables, tableId, startColumn, startRow, endColumn, endRow); }
  tableCellSet(tableId: string, column: PineValue, row: PineValue, text: PineValue, options?: any) { return tableCellSet(this.tables, tableId, column, row, text, options); }
  tableDelete(tableId: string) { return tableDelete(this.tables, tableId); }

  // ==========================================================================
  // Linefill operations
  // ==========================================================================

  linefillNew(line1Id: string, line2Id: string, options?: any) { return linefillNew(this.linefills, this.lines, line1Id, line2Id, options); }
  linefillDelete(linefillId: string) { return linefillDelete(this.linefills, linefillId); }
  linefillGetLine1(linefillId: string) { return linefillGetLine1(this.linefills, linefillId); }
  linefillGetLine2(linefillId: string) { return linefillGetLine2(this.linefills, linefillId); }
  linefillSetColor(linefillId: string, color: ColorInput) { return linefillSetColor(this.linefills, linefillId, color); }

  // ==========================================================================
  // Polyline operations
  // ==========================================================================

  polylineNew(points: PineValue[], options?: any) { return polylineNew(this.polylines, this.limits.maxPolylines, points, options); }
  polylineDelete(polylineId: string) { return polylineDelete(this.polylines, polylineId); }

  // ==========================================================================
  // Output & cleanup
  // ==========================================================================

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
