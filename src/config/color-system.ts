export interface PineColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type ColorInput = string | PineColor | number;

const NAMED_COLORS: Record<string, PineColor> = {
  black: { r: 0, g: 0, b: 0, a: 255 },
  white: { r: 255, g: 255, b: 255, a: 255 },
  red: { r: 255, g: 0, b: 0, a: 255 },
  green: { r: 0, g: 128, b: 0, a: 255 },
  blue: { r: 0, g: 0, b: 255, a: 255 },
  yellow: { r: 255, g: 255, b: 0, a: 255 },
  orange: { r: 255, g: 165, b: 0, a: 255 },
  purple: { r: 128, g: 0, b: 128, a: 255 },
  pink: { r: 255, g: 192, b: 203, a: 255 },
  cyan: { r: 0, g: 255, b: 255, a: 255 },
  magenta: { r: 255, g: 0, b: 255, a: 255 },
  gray: { r: 128, g: 128, b: 128, a: 255 },
  grey: { r: 128, g: 128, b: 128, a: 255 },
  silver: { r: 192, g: 192, b: 192, a: 255 },
  maroon: { r: 128, g: 0, b: 0, a: 255 },
  olive: { r: 128, g: 128, b: 0, a: 255 },
  lime: { r: 0, g: 255, b: 0, a: 255 },
  teal: { r: 0, g: 128, b: 128, a: 255 },
  navy: { r: 0, g: 0, b: 128, a: 255 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

export function parseColor(input: ColorInput): PineColor {
  if (typeof input === 'object' && 'r' in input && 'g' in input && 'b' in input) {
    return {
      r: clamp(input.r),
      g: clamp(input.g),
      b: clamp(input.b),
      a: 'a' in input ? clamp(input.a) : 255,
    };
  }

  if (typeof input === 'number') {
    return {
      r: (input >> 16) & 255,
      g: (input >> 8) & 255,
      b: input & 255,
      a: 255,
    };
  }

  if (typeof input === 'string') {
    return parseColorString(input);
  }

  return { r: 0, g: 0, b: 0, a: 255 };
}

function parseColorString(input: string): PineColor {
  const lower = input.toLowerCase().trim();

  if (NAMED_COLORS[lower]) {
    return { ...NAMED_COLORS[lower] };
  }

  if (lower.startsWith('#')) {
    return parseHex(lower);
  }

  if (lower.startsWith('rgb(')) {
    return parseRgb(lower);
  }

  if (lower.startsWith('rgba(')) {
    return parseRgba(lower);
  }

  return { r: 0, g: 0, b: 0, a: 255 };
}

function parseHex(input: string): PineColor {
  let hex = input.slice(1);

  if (hex.length === 3) {
    hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!;
  }

  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 255,
    };
  }

  if (hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: parseInt(hex.slice(6, 8), 16),
    };
  }

  return { r: 0, g: 0, b: 0, a: 255 };
}

function parseRgb(input: string): PineColor {
  const match = input.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!match) return { r: 0, g: 0, b: 0, a: 255 };

  return {
    r: parseInt(match[1]!, 10),
    g: parseInt(match[2]!, 10),
    b: parseInt(match[3]!, 10),
    a: 255,
  };
}

function parseRgba(input: string): PineColor {
  const match = input.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (!match) return { r: 0, g: 0, b: 0, a: 255 };

  return {
    r: parseInt(match[1]!, 10),
    g: parseInt(match[2]!, 10),
    b: parseInt(match[3]!, 10),
    a: Math.round(parseFloat(match[4]!) * 255),
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function colorToHex(color: PineColor): string {
  const r = clamp(color.r).toString(16).padStart(2, '0');
  const g = clamp(color.g).toString(16).padStart(2, '0');
  const b = clamp(color.b).toString(16).padStart(2, '0');

  if (color.a < 255) {
    const a = clamp(color.a).toString(16).padStart(2, '0');
    return `#${r}${g}${b}${a}`;
  }

  return `#${r}${g}${b}`;
}

export function colorToRgb(color: PineColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

export function colorToRgba(color: PineColor): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${(color.a / 255).toFixed(2)})`;
}

export function colorToNumber(color: PineColor): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

export function addColors(color1: ColorInput, color2: ColorInput): PineColor {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);

  return {
    r: clamp(c1.r + c2.r),
    g: clamp(c1.g + c2.g),
    b: clamp(c1.b + c2.b),
    a: clamp(c1.a + c2.a),
  };
}

export function subtractColors(color1: ColorInput, color2: ColorInput): PineColor {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);

  return {
    r: clamp(c1.r - c2.r),
    g: clamp(c1.g - c2.g),
    b: clamp(c1.b - c2.b),
    a: clamp(c1.a - c2.a),
  };
}

export function multiplyColor(color: ColorInput, factor: number): PineColor {
  const c = parseColor(color);

  return {
    r: clamp(c.r * factor),
    g: clamp(c.g * factor),
    b: clamp(c.b * factor),
    a: clamp(c.a * factor),
  };
}

export function blendColors(color1: ColorInput, color2: ColorInput, ratio: number): PineColor {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);
  const r = Math.max(0, Math.min(1, ratio));

  return {
    r: Math.round(c1.r * (1 - r) + c2.r * r),
    g: Math.round(c1.g * (1 - r) + c2.g * r),
    b: Math.round(c1.b * (1 - r) + c2.b * r),
    a: Math.round(c1.a * (1 - r) + c2.a * r),
  };
}

export function withOpacity(color: ColorInput, opacity: number): PineColor {
  const c = parseColor(color);
  const a = Math.max(0, Math.min(1, opacity));

  return {
    r: c.r,
    g: c.g,
    b: c.b,
    a: Math.round(a * 255),
  };
}

export function colorEquals(color1: ColorInput, color2: ColorInput): boolean {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);

  return c1.r === c2.r && c1.g === c2.g && c1.b === c2.b && c1.a === c2.a;
}

export function colorToGrayscale(color: ColorInput): PineColor {
  const c = parseColor(color);
  const gray = Math.round(0.299 * c.r + 0.587 * c.g + 0.114 * c.b);

  return {
    r: gray,
    g: gray,
    b: gray,
    a: c.a,
  };
}

export function invertColor(color: ColorInput): PineColor {
  const c = parseColor(color);

  return {
    r: 255 - c.r,
    g: 255 - c.g,
    b: 255 - c.b,
    a: c.a,
  };
}

export function mixColors(colors: ColorInput[], weights: number[]): PineColor {
  if (colors.length === 0) return { r: 0, g: 0, b: 0, a: 255 };
  if (colors.length === 1) return parseColor(colors[0]!);

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return parseColor(colors[0]!);

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;

  for (let i = 0; i < colors.length; i++) {
    const c = parseColor(colors[i]!);
    const w = weights[i]! / totalWeight;

    r += c.r * w;
    g += c.g * w;
    b += c.b * w;
    a += c.a * w;
  }

  return {
    r: clamp(r),
    g: clamp(g),
    b: clamp(b),
    a: clamp(a),
  };
}
