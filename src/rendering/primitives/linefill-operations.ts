/**
 * Linefill and Polyline drawing object operations.
 * Pure functions operating on the Maps owned by DrawingEngine.
 */
import type { PineValue } from '../../language/types/na.js';
import { parseColor, type ColorInput } from '../../config/color-system.js';
import type { LineStyle } from '../rendering-types.js';
import type { LineObject, LinefillObject, PolylineObject, PolylinePoint } from './drawing-types.js';
import { generateDrawingId } from './drawing-helpers.js';

// ==========================================================================
// Linefill operations
// ==========================================================================

export function linefillNew(
  linefills: Map<string, LinefillObject>,
  lines: Map<string, LineObject>,
  line1Id: string,
  line2Id: string,
  options: {
    color?: ColorInput;
    fillgaps?: boolean;
  } = {},
): LinefillObject | undefined {
  const line1 = lines.get(line1Id);
  const line2 = lines.get(line2Id);
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

  linefills.set(id, linefill);
  return linefill;
}

export function linefillDelete(
  linefills: Map<string, LinefillObject>,
  linefillId: string,
): void {
  linefills.delete(linefillId);
}

export function linefillGetLine1(
  linefills: Map<string, LinefillObject>,
  linefillId: string,
): LineObject | undefined {
  return linefills.get(linefillId)?.line1;
}

export function linefillGetLine2(
  linefills: Map<string, LinefillObject>,
  linefillId: string,
): LineObject | undefined {
  return linefills.get(linefillId)?.line2;
}

export function linefillSetColor(
  linefills: Map<string, LinefillObject>,
  linefillId: string,
  color: ColorInput,
): void {
  const linefill = linefills.get(linefillId);
  if (linefill) linefill.color = parseColor(color);
}

// ==========================================================================
// Polyline operations
// ==========================================================================

export function polylineNew(
  polylines: Map<string, PolylineObject>,
  maxPolylines: number,
  points: PineValue[],
  options: {
    close?: boolean;
    color?: ColorInput;
    linewidth?: number;
    style?: LineStyle;
    join?: boolean;
  } = {},
): PolylineObject | undefined {
  if (polylines.size >= maxPolylines) {
    const firstKey = polylines.keys().next().value;
    if (firstKey) polylines.delete(firstKey);
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

  polylines.set(id, polyline);
  return polyline;
}

export function polylineDelete(
  polylines: Map<string, PolylineObject>,
  polylineId: string,
): void {
  polylines.delete(polylineId);
}
