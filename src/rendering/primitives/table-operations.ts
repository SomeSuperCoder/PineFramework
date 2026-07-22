/**
 * Table drawing object operations.
 * Pure functions operating on the table Map owned by DrawingEngine.
 */
import type { PineValue } from '../../language/types/na.js';
import { parseColor, type ColorInput } from '../../config/color-system.js';
import type { TextHorizontalAlignment, Size } from '../rendering-types.js';
import type { TableObject, TableCell } from './drawing-types.js';
import { isNaOrNull, toNumber, toString, generateDrawingId } from './drawing-helpers.js';

export function tableNew(
  tables: Map<string, TableObject>,
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
  const bgcolorResolved =
    options.bgcolor !== undefined ? parseColor(options.bgcolor) : { r: 0, g: 0, b: 0, a: 255 };
  const borderColorResolved =
    options.border_color !== undefined
      ? parseColor(options.border_color)
      : { r: 0, g: 0, b: 0, a: 255 };
  const frameColorResolved =
    options.frame_color !== undefined
      ? parseColor(options.frame_color)
      : { r: 0, g: 0, b: 0, a: 255 };

  const table: TableObject = {
    id,
    position: (isNaOrNull(position) ? 'top_right' : position) as TableObject['position'],
    columns: toNumber(columns, 1),
    rows: toNumber(rows, 1),
    bgcolor: bgcolorResolved,
    border_color: borderColorResolved,
    border_width: options.border_width ?? 0,
    frame_color: frameColorResolved,
    frame_width: options.frame_width ?? 0,
    cells: new Map(),
  };

  tables.set(id, table);
  return table;
}

export function tableClear(
  tables: Map<string, TableObject>,
  tableId: string,
): void {
  const table = tables.get(tableId);
  if (table) table.cells.clear();
}

export function tableMergeCells(
  tables: Map<string, TableObject>,
  tableId: string,
  startColumn: PineValue,
  startRow: PineValue,
  endColumn: PineValue,
  endRow: PineValue,
): void {
  const table = tables.get(tableId);
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

export function tableCellSet(
  tables: Map<string, TableObject>,
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
  const table = tables.get(tableId);
  if (!table) return;

  const col = toNumber(column, 0);
  const r = toNumber(row, 0);
  const key = `${col},${r}`;
  const textColorResolved =
    options.text_color !== undefined
      ? parseColor(options.text_color)
      : { r: 255, g: 255, b: 255, a: 255 };
  const bgcolorResolved =
    options.bgcolor !== undefined ? parseColor(options.bgcolor) : { r: 0, g: 0, b: 0, a: 255 };

  table.cells.set(key, {
    text: toString(text),
    text_color: textColorResolved,
    text_halign: options.text_halign ?? 'center',
    text_valign: options.text_valign ?? 'middle',
    text_size: options.text_size ?? 'normal',
    bgcolor: bgcolorResolved,
    tooltip: options.tooltip ?? '',
  });
}

export function tableDelete(
  tables: Map<string, TableObject>,
  tableId: string,
): void {
  tables.delete(tableId);
}
