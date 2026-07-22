/**
 * Line drawing object operations.
 * Pure functions operating on the line Map owned by DrawingEngine.
 */
import type { PineValue } from '../../language/types/na.js';
import { parseColor, type PineColor, type ColorInput } from '../../config/color-system.js';
import type { LineStyle, ExtendDirection, XLocation } from '../rendering-types.js';
import type { LineObject } from './drawing-types.js';
import { isNaOrNull, toNumber, generateDrawingId } from './drawing-helpers.js';

export function lineNew(
  lines: Map<string, LineObject>,
  maxLines: number,
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
  if (lines.size >= maxLines) {
    const firstKey = lines.keys().next().value;
    if (firstKey) lines.delete(firstKey);
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

  lines.set(id, line);
  return line;
}

export function lineCopy(
  lines: Map<string, LineObject>,
  lineId: string,
): LineObject | undefined {
  const original = lines.get(lineId);
  if (!original) return undefined;

  const id = generateDrawingId();
  const copy: LineObject = { ...original, id };
  lines.set(id, copy);
  return copy;
}

export function lineGetPoints(
  lines: Map<string, LineObject>,
  lineId: string,
): { x1: number; y1: number; x2: number; y2: number } | undefined {
  const line = lines.get(lineId);
  if (!line) return undefined;
  return { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 };
}

export function lineGetColor(
  lines: Map<string, LineObject>,
  lineId: string,
): PineColor | undefined {
  const line = lines.get(lineId);
  if (!line) return undefined;
  return { ...line.color };
}

export function lineGetWidth(
  lines: Map<string, LineObject>,
  lineId: string,
): number | undefined {
  const line = lines.get(lineId);
  if (!line) return undefined;
  return line.width;
}

export function lineGetStyle(
  lines: Map<string, LineObject>,
  lineId: string,
): LineStyle | undefined {
  const line = lines.get(lineId);
  if (!line) return undefined;
  return line.style;
}

export function lineGetExtend(
  lines: Map<string, LineObject>,
  lineId: string,
): ExtendDirection | undefined {
  const line = lines.get(lineId);
  if (!line) return undefined;
  return line.extend;
}

export function lineGetEditable(
  lines: Map<string, LineObject>,
  lineId: string,
): boolean | undefined {
  const line = lines.get(lineId);
  if (!line) return undefined;
  return line.editable;
}

export function lineSetLine(
  lines: Map<string, LineObject>,
  lineId: string,
  x1: PineValue,
  y1: PineValue,
  x2: PineValue,
  y2: PineValue,
): void {
  const line = lines.get(lineId);
  if (!line) return;
  if (!isNaOrNull(x1)) line.x1 = x1 as number;
  if (!isNaOrNull(y1)) line.y1 = y1 as number;
  if (!isNaOrNull(x2)) line.x2 = x2 as number;
  if (!isNaOrNull(y2)) line.y2 = y2 as number;
}

export function lineSetX1(
  lines: Map<string, LineObject>,
  lineId: string,
  x: PineValue,
): void {
  const line = lines.get(lineId);
  if (line && !isNaOrNull(x)) line.x1 = x as number;
}

export function lineSetY1(
  lines: Map<string, LineObject>,
  lineId: string,
  y: PineValue,
): void {
  const line = lines.get(lineId);
  if (line && !isNaOrNull(y)) line.y1 = y as number;
}

export function lineSetX2(
  lines: Map<string, LineObject>,
  lineId: string,
  x: PineValue,
): void {
  const line = lines.get(lineId);
  if (line && !isNaOrNull(x)) line.x2 = x as number;
}

export function lineSetY2(
  lines: Map<string, LineObject>,
  lineId: string,
  y: PineValue,
): void {
  const line = lines.get(lineId);
  if (line && !isNaOrNull(y)) line.y2 = y as number;
}

export function lineSetColor(
  lines: Map<string, LineObject>,
  lineId: string,
  color: ColorInput,
): void {
  const line = lines.get(lineId);
  if (line) line.color = parseColor(color);
}

export function lineSetWidth(
  lines: Map<string, LineObject>,
  lineId: string,
  width: PineValue,
): void {
  const line = lines.get(lineId);
  if (line && !isNaOrNull(width)) line.width = width as number;
}

export function lineSetStyle(
  lines: Map<string, LineObject>,
  lineId: string,
  style: LineStyle,
): void {
  const line = lines.get(lineId);
  if (line) line.style = style;
}

export function lineSetExtend(
  lines: Map<string, LineObject>,
  lineId: string,
  extend: ExtendDirection,
): void {
  const line = lines.get(lineId);
  if (line) line.extend = extend;
}

export function lineSetEditable(
  lines: Map<string, LineObject>,
  lineId: string,
  editable: PineValue,
): void {
  const line = lines.get(lineId);
  if (line && !isNaOrNull(editable)) line.editable = editable as boolean;
}

export function lineDelete(
  lines: Map<string, LineObject>,
  lineId: string,
): void {
  lines.delete(lineId);
}
