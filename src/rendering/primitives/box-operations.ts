/**
 * Box drawing object operations.
 * Pure functions operating on the box Map owned by DrawingEngine.
 */
import type { PineValue } from '../../language/types/na.js';
import { parseColor, type ColorInput } from '../../config/color-system.js';
import type { LineStyle, XLocation, Size, TextHorizontalAlignment, TextVerticalAlignment } from '../rendering-types.js';
import type { BoxObject } from './drawing-types.js';
import { isNaOrNull, toNumber, generateDrawingId } from './drawing-helpers.js';

export function boxNew(
  boxes: Map<string, BoxObject>,
  maxBoxes: number,
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
  if (boxes.size >= maxBoxes) {
    const firstKey = boxes.keys().next().value;
    if (firstKey) boxes.delete(firstKey);
  }

  const id = generateDrawingId();
  const borderColor =
    options.border_color !== undefined
      ? parseColor(options.border_color)
      : { r: 0, g: 0, b: 0, a: 255 };
  const bgcolorResolved =
    options.bgcolor !== undefined ? parseColor(options.bgcolor) : { r: 0, g: 0, b: 0, a: 0 };
  const textColorResolved =
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
    bgcolor: bgcolorResolved,
    text: options.text ?? '',
    text_color: textColorResolved,
    text_size: options.text_size ?? 'normal',
    text_halign: options.text_halign ?? 'center',
    text_valign: options.text_valign ?? 'middle',
    text_wrap: options.text_wrap ?? false,
    text_font_family: options.text_font_family ?? 'Arial',
  };

  boxes.set(id, box);
  return box;
}

export function boxCopy(
  boxes: Map<string, BoxObject>,
  boxId: string,
): BoxObject | undefined {
  const original = boxes.get(boxId);
  if (!original) return undefined;

  const id = generateDrawingId();
  const copy: BoxObject = { ...original, id };
  boxes.set(id, copy);
  return copy;
}

export function boxGetLeft(
  boxes: Map<string, BoxObject>,
  boxId: string,
): number | undefined {
  return boxes.get(boxId)?.left;
}

export function boxGetTop(
  boxes: Map<string, BoxObject>,
  boxId: string,
): number | undefined {
  return boxes.get(boxId)?.top;
}

export function boxGetRight(
  boxes: Map<string, BoxObject>,
  boxId: string,
): number | undefined {
  return boxes.get(boxId)?.right;
}

export function boxGetBottom(
  boxes: Map<string, BoxObject>,
  boxId: string,
): number | undefined {
  return boxes.get(boxId)?.bottom;
}

export function boxGetBgColor(
  boxes: Map<string, BoxObject>,
  boxId: string,
) {
  const box = boxes.get(boxId);
  return box ? { ...box.bgcolor } : undefined;
}

export function boxGetBorderColor(
  boxes: Map<string, BoxObject>,
  boxId: string,
) {
  const box = boxes.get(boxId);
  return box ? { ...box.border_color } : undefined;
}

export function boxSetLeft(
  boxes: Map<string, BoxObject>,
  boxId: string,
  left: PineValue,
): void {
  const box = boxes.get(boxId);
  if (box && !isNaOrNull(left)) box.left = left as number;
}

export function boxSetTop(
  boxes: Map<string, BoxObject>,
  boxId: string,
  top: PineValue,
): void {
  const box = boxes.get(boxId);
  if (box && !isNaOrNull(top)) box.top = top as number;
}

export function boxSetRight(
  boxes: Map<string, BoxObject>,
  boxId: string,
  right: PineValue,
): void {
  const box = boxes.get(boxId);
  if (box && !isNaOrNull(right)) box.right = right as number;
}

export function boxSetBottom(
  boxes: Map<string, BoxObject>,
  boxId: string,
  bottom: PineValue,
): void {
  const box = boxes.get(boxId);
  if (box && !isNaOrNull(bottom)) box.bottom = bottom as number;
}

export function boxSetBgColor(
  boxes: Map<string, BoxObject>,
  boxId: string,
  color: ColorInput,
): void {
  const box = boxes.get(boxId);
  if (box) box.bgcolor = parseColor(color);
}

export function boxSetBorderColor(
  boxes: Map<string, BoxObject>,
  boxId: string,
  color: ColorInput,
): void {
  const box = boxes.get(boxId);
  if (box) box.border_color = parseColor(color);
}

export function boxSetBorderWidth(
  boxes: Map<string, BoxObject>,
  boxId: string,
  width: PineValue,
): void {
  const box = boxes.get(boxId);
  if (box && !isNaOrNull(width)) box.border_width = width as number;
}

export function boxSetBorderStyle(
  boxes: Map<string, BoxObject>,
  boxId: string,
  style: LineStyle,
): void {
  const box = boxes.get(boxId);
  if (box) box.border_style = style;
}

export function boxSetText(
  boxes: Map<string, BoxObject>,
  boxId: string,
  text: PineValue,
): void {
  const box = boxes.get(boxId);
  if (box && !isNaOrNull(text)) box.text = String(text);
}

export function boxSetTextColor(
  boxes: Map<string, BoxObject>,
  boxId: string,
  color: ColorInput,
): void {
  const box = boxes.get(boxId);
  if (box) box.text_color = parseColor(color);
}

export function boxSetTextSize(
  boxes: Map<string, BoxObject>,
  boxId: string,
  size: Size,
): void {
  const box = boxes.get(boxId);
  if (box) box.text_size = size;
}

export function boxSetTextHalign(
  boxes: Map<string, BoxObject>,
  boxId: string,
  halign: TextHorizontalAlignment,
): void {
  const box = boxes.get(boxId);
  if (box) box.text_halign = halign;
}

export function boxSetTextValign(
  boxes: Map<string, BoxObject>,
  boxId: string,
  valign: TextVerticalAlignment,
): void {
  const box = boxes.get(boxId);
  if (box) box.text_valign = valign;
}

export function boxDelete(
  boxes: Map<string, BoxObject>,
  boxId: string,
): void {
  boxes.delete(boxId);
}
