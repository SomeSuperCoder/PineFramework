import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';

export function registerColorBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set(
    'color.new',
    (color: PineValue, transp: PineValue, _namedOrNamed?: PineValue): PineValue => {
      if (isNa(color)) return NA;  // color.new(na, ...) should return na
      const c = typeof color === 'string' ? color : '#2196f3';
      const t = isNa(transp) ? 0 : (transp as number);
      const alpha = Math.round(Math.max(0, Math.min(100, 100 - t)) * 2.55);
      const hex = alpha.toString(16).padStart(2, '0');
      if (c.startsWith('#')) {
        return c + hex;
      }
      return c;
    },
  );

  eng.builtins.set(
    'color.from_gradient',
    (
      value: PineValue,
      minVal: PineValue,
      maxVal: PineValue,
      bottomColor: PineValue,
      topColor: PineValue,
    ): PineValue => {
      if (isNa(value) || isNa(minVal) || isNa(maxVal)) return '#80808080';
      const v = value as number;
      const min = minVal as number;
      const max = maxVal as number;
      if (Math.abs(max - min) < 1e-10)
        return typeof bottomColor === 'string' ? bottomColor : '#808080';
      const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
      const bot = typeof bottomColor === 'string' ? bottomColor : '#8BC34A';
      const top = typeof topColor === 'string' ? topColor : '#F44336';
      const parseRgb = (hex: string): [number, number, number] => {
        const c = hex.replace('#', '');
        return [
          parseInt(c.substring(0, 2), 16) || 0,
          parseInt(c.substring(2, 4), 16) || 0,
          parseInt(c.substring(4, 6), 16) || 0,
        ];
      };
      const [r1, g1, b1] = parseRgb(bot);
      const [r2, g2, b2] = parseRgb(top);
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    },
  );
}
