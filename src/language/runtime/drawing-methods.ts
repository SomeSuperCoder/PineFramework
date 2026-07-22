/**
 * Drawing object method dispatch for Pine Script runtime.
 * Handles method calls on line and box object IDs (e.g., lineId.set_color(...)).
 */
import { NA, type PineValue } from '../types/na.js';
import type { LineEntry, BoxEntry } from './execution-types.js';

/**
 * Dispatch a line method call on a line ID.
 * @returns The result value, or undefined if the method is not a line method.
 */
export function executeLineMethod(
  line: LineEntry,
  methodName: string,
  args: PineValue[],
): PineValue | undefined {
  switch (methodName) {
    case 'get_x1': return line.x1;
    case 'get_y1': return line.y1;
    case 'get_x2': return line.x2;
    case 'get_y2': return line.y2;
    case 'get_color': return line.color;
    case 'get_style': return line.style;
    case 'get_width': return line.width;
    case 'set_color': line.color = String(args[0] ?? '#2196f3'); return true;
    case 'set_style': line.style = String(args[0] ?? 'solid'); return true;
    case 'set_width': line.width = (args[0] as number) ?? 1; return true;
    default: return undefined;
  }
}

/**
 * Dispatch a box method call on a box ID.
 * @returns The result value, or undefined if the method is not a box method.
 */
export function executeBoxMethod(
  bx: BoxEntry,
  methodName: string,
  args: PineValue[],
): PineValue | undefined {
  switch (methodName) {
    case 'set_left': bx.left = (args[0] as number) ?? bx.left; return true;
    case 'set_top': bx.top = (args[0] as number) ?? bx.top; return true;
    case 'set_right': bx.right = (args[0] as number) ?? bx.right; return true;
    case 'set_bottom': bx.bottom = (args[0] as number) ?? bx.bottom; return true;
    case 'set_border_color': bx.border_color = String(args[0] ?? '#00000000'); return true;
    case 'set_bgcolor': bx.bgcolor = String(args[0] ?? '#2196f380'); return true;
    case 'get_left': return bx.left;
    case 'get_top': return bx.top;
    case 'get_right': return bx.right;
    case 'get_bottom': return bx.bottom;
    default: return undefined;
  }
}
