/**
 * Label drawing object operations.
 * Pure functions operating on the label Map owned by DrawingEngine.
 */
import type { PineValue } from '../../language/types/na.js';
import { parseColor, type ColorInput } from '../../config/color-system.js';
import type { LabelStyle, TextHorizontalAlignment, XLocation, Size } from '../rendering-types.js';
import type { LabelObject } from './drawing-types.js';
import { isNaOrNull, toNumber, toString, generateDrawingId } from './drawing-helpers.js';

export function labelNew(
  labels: Map<string, LabelObject>,
  maxLabels: number,
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
  if (labels.size >= maxLabels) {
    const firstKey = labels.keys().next().value;
    if (firstKey) labels.delete(firstKey);
  }

  const id = generateDrawingId();
  const colorResolved =
    options.color !== undefined ? parseColor(options.color) : { r: 0, g: 0, b: 0, a: 255 };
  const textcolorResolved =
    options.textcolor !== undefined
      ? parseColor(options.textcolor)
      : { r: 255, g: 255, b: 255, a: 255 };

  const label: LabelObject = {
    id,
    x: toNumber(x),
    y: toNumber(y),
    text: toString(text),
    color: colorResolved,
    style: options.style ?? 'label_down',
    textcolor: textcolorResolved,
    size: options.size ?? 'normal',
    textalign: options.textalign ?? 'center',
    xloc: options.xloc ?? 'bar_index',
    tooltip: options.tooltip ?? '',
    text_font_family: options.text_font_family ?? 'Arial',
  };

  labels.set(id, label);
  return label;
}

export function labelCopy(
  labels: Map<string, LabelObject>,
  labelId: string,
): LabelObject | undefined {
  const original = labels.get(labelId);
  if (!original) return undefined;

  const id = generateDrawingId();
  const copy: LabelObject = { ...original, id };
  labels.set(id, copy);
  return copy;
}

export function labelGetText(
  labels: Map<string, LabelObject>,
  labelId: string,
): string | undefined {
  return labels.get(labelId)?.text;
}

export function labelGetColor(
  labels: Map<string, LabelObject>,
  labelId: string) {
  const label = labels.get(labelId);
  return label ? { ...label.color } : undefined;
}

export function labelGetTextColor(
  labels: Map<string, LabelObject>,
  labelId: string) {
  const label = labels.get(labelId);
  return label ? { ...label.textcolor } : undefined;
}

export function labelGetSize(
  labels: Map<string, LabelObject>,
  labelId: string): Size | undefined {
  return labels.get(labelId)?.size;
}

export function labelSetText(
  labels: Map<string, LabelObject>,
  labelId: string,
  text: PineValue,
  textcolor?: PineValue,
  size?: PineValue,
): void {
  const label = labels.get(labelId);
  if (!label) return;
  if (!isNaOrNull(text)) label.text = String(text);
  if (textcolor !== undefined && !isNaOrNull(textcolor))
    label.textcolor = parseColor(textcolor as ColorInput);
  if (size !== undefined && !isNaOrNull(size)) label.size = size as Size;
}

export function labelSetX(
  labels: Map<string, LabelObject>,
  labelId: string,
  x: PineValue,
): void {
  const label = labels.get(labelId);
  if (label && !isNaOrNull(x)) label.x = x as number;
}

export function labelSetY(
  labels: Map<string, LabelObject>,
  labelId: string,
  y: PineValue,
): void {
  const label = labels.get(labelId);
  if (label && !isNaOrNull(y)) label.y = y as number;
}

export function labelSetColor(
  labels: Map<string, LabelObject>,
  labelId: string,
  color: ColorInput,
): void {
  const label = labels.get(labelId);
  if (label) label.color = parseColor(color);
}

export function labelSetTextSize(
  labels: Map<string, LabelObject>,
  labelId: string,
  size: Size,
): void {
  const label = labels.get(labelId);
  if (label) label.size = size;
}

export function labelSetStyle(
  labels: Map<string, LabelObject>,
  labelId: string,
  style: LabelStyle,
): void {
  const label = labels.get(labelId);
  if (label) label.style = style;
}

export function labelSetTextAlign(
  labels: Map<string, LabelObject>,
  labelId: string,
  textalign: TextHorizontalAlignment,
): void {
  const label = labels.get(labelId);
  if (label) label.textalign = textalign;
}

export function labelSetTooltip(
  labels: Map<string, LabelObject>,
  labelId: string,
  tooltip: PineValue,
): void {
  const label = labels.get(labelId);
  if (label && !isNaOrNull(tooltip)) label.tooltip = String(tooltip);
}

export function labelDelete(
  labels: Map<string, LabelObject>,
  labelId: string,
): void {
  labels.delete(labelId);
}
