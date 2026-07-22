import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';

export function registerDrawingBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  // ── Position namespace constants ─────────────────────────────────────────
  eng.builtins.set('position.top_left', 0);
  eng.builtins.set('position.top_center', 1);
  eng.builtins.set('position.top_right', 2);
  eng.builtins.set('position.middle_left', 3);
  eng.builtins.set('position.middle_center', 4);
  eng.builtins.set('position.middle_right', 5);
  eng.builtins.set('position.bottom_left', 6);
  eng.builtins.set('position.bottom_center', 7);
  eng.builtins.set('position.bottom_right', 8);

  // ── Size namespace constants ─────────────────────────────────────────────
  eng.builtins.set('size.auto', 'auto');
  eng.builtins.set('size.tiny', 'tiny');
  eng.builtins.set('size.small', 'small');
  eng.builtins.set('size.normal', 'normal');
  eng.builtins.set('size.large', 'large');
  eng.builtins.set('size.huge', 'huge');

  // ── Text alignment constants ─────────────────────────────────────────────
  eng.builtins.set('text.align_left', 'left');
  eng.builtins.set('text.align_center', 'center');
  eng.builtins.set('text.align_right', 'right');

  // ── Box builtins ─────────────────────────────────────────────────────────
  eng.builtins.set('box', (_arg?: PineValue): PineValue => {
    return NA;
  });

  eng.builtins.set(
    'box.new',
    (
      left: PineValue,
      top: PineValue,
      right: PineValue,
      bottom: PineValue,
      namedArgs?: Record<string, PineValue>,
    ): PineValue => {
      if (isNa(left) || isNa(top) || isNa(right) || isNa(bottom)) return NA;
      let borderColor = '#00000000';
      let bgcolor = '#2196f380';
      if (typeof namedArgs === 'object' && namedArgs !== null) {
        if (typeof namedArgs.border_color === 'string') borderColor = namedArgs.border_color;
        if (typeof namedArgs.bgcolor === 'string') bgcolor = namedArgs.bgcolor;
      }
      const id = ++eng.boxIdCounter;
      eng.boxes.set(id, {
        left: left as number,
        top: top as number,
        right: right as number,
        bottom: bottom as number,
        border_color: borderColor,
        bgcolor,
      });
      return id;
    },
  );

  // ── Line builtins ────────────────────────────────────────────────────────
  eng.builtins.set(
    'line.new',
    (
      x1: PineValue,
      y1: PineValue,
      x2: PineValue,
      y2: PineValue,
      namedArgs?: Record<string, PineValue>,
    ): PineValue => {
      if (isNa(x1) || isNa(y1) || isNa(x2) || isNa(y2)) {
        return 0;
      }
      let colorStr = '#2196f3';
      let styleStr = 'solid';
      let widthNum = 1;
      let xlocStr = 'bar_index';
      let extendStr = 'none';
      if (typeof namedArgs === 'object' && namedArgs !== null) {
        if (typeof namedArgs.color === 'string') colorStr = namedArgs.color;
        if (typeof namedArgs.style === 'string') styleStr = namedArgs.style;
        if (typeof namedArgs.width === 'number') widthNum = namedArgs.width;
        if (typeof namedArgs.xloc === 'string') xlocStr = namedArgs.xloc;
        if (typeof namedArgs.extend === 'string') extendStr = namedArgs.extend;
      }
      const id = eng.lineIdCounter++;
      eng.lines.set(id, {
        x1: x1 as number,
        y1: y1 as number,
        x2: x2 as number,
        y2: y2 as number,
        color: colorStr,
        style: styleStr,
        width: widthNum,
        xloc: xlocStr,
        extend: extendStr,
      });
      return id;
    },
  );

  eng.builtins.set('line.delete', (lineId: PineValue): PineValue => {
    if (typeof lineId === 'number' && eng.lines.has(lineId)) {
      eng.lines.delete(lineId);
    }
    return 0;
  });

  eng.builtins.set('line.get_x2', (lineId: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) return line.x2;
    }
    return 0;
  });

  eng.builtins.set('line.get_x1', (lineId: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) return line.x1;
    }
    return 0;
  });

  eng.builtins.set('line.get_y1', (lineId: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) return line.y1;
    }
    return 0;
  });

  eng.builtins.set('line.get_y2', (lineId: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) return line.y2;
    }
    return 0;
  });

  eng.builtins.set('line.get_color', (lineId: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) return line.color;
    }
    return '';
  });

  eng.builtins.set('line.get_style', (lineId: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) return line.style;
    }
    return '';
  });

  eng.builtins.set('line.get_width', (lineId: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) return line.width;
    }
    return 0;
  });

  eng.builtins.set('line.set_x1', (lineId: PineValue, x: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) line.x1 = x as number;
    }
    return 0;
  });

  eng.builtins.set('line.set_y1', (lineId: PineValue, y: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) line.y1 = y as number;
    }
    return 0;
  });

  eng.builtins.set('line.set_x2', (lineId: PineValue, x: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) line.x2 = x as number;
    }
    return 0;
  });

  eng.builtins.set('line.set_y2', (lineId: PineValue, y: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) line.y2 = y as number;
    }
    return 0;
  });

  eng.builtins.set('line.set_color', (lineId: PineValue, color: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) line.color = String(color ?? '#2196f3');
    }
    return 0;
  });

  eng.builtins.set('line.set_style', (lineId: PineValue, style: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) line.style = String(style ?? 'solid');
    }
    return 0;
  });

  eng.builtins.set('line.set_width', (lineId: PineValue, width: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) line.width = (width as number) ?? 1;
    }
    return 0;
  });

  eng.builtins.set('line.set_extend', (lineId: PineValue, extend: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) line.extend = String(extend ?? 'none');
    }
    return 0;
  });

  // ── Label builtins ───────────────────────────────────────────────────────
  eng.builtins.set(
    'label.new',
    (
      x: PineValue,
      y: PineValue,
      text: PineValue,
      namedArgs?: Record<string, PineValue>,
    ): PineValue => {
      // When text is passed as named arg (not positional), the signature shifts:
      // args = [x, y, namedArgs] so text param receives the namedArgs object.
      let actualNamedArgs: Record<string, PineValue> | undefined;
      let actualText: PineValue = text;
      if (typeof text === 'object' && text !== null && !Array.isArray(text)) {
        actualNamedArgs = text as unknown as Record<string, PineValue>;
        actualText = actualNamedArgs['text'] ?? '';
      } else {
        actualNamedArgs = namedArgs;
      }
      if (isNa(x) || isNa(y)) return 0;
      let colorStr = '#2196f3';
      let textcolorStr = '#ffffff';
      let styleStr = 'label.style_label_down';
      let sizeStr = 'size.normal';
      let xlocStr = 'bar_index';
      if (typeof actualNamedArgs === 'object' && actualNamedArgs !== null) {
        if (typeof actualNamedArgs.color === 'string') colorStr = actualNamedArgs.color;
        if (typeof actualNamedArgs.textcolor === 'string') textcolorStr = actualNamedArgs.textcolor;
        if (typeof actualNamedArgs.style === 'string') styleStr = actualNamedArgs.style;
        if (typeof actualNamedArgs.size === 'string') sizeStr = actualNamedArgs.size;
        if (typeof actualNamedArgs.xloc === 'string') xlocStr = actualNamedArgs.xloc;
        if (typeof actualNamedArgs.text === 'string') actualText = actualNamedArgs.text;
      }
      // Member expression resolution strips prefixes: label.style_label_down → style_label_down
      if (!styleStr.startsWith('label.')) styleStr = 'label.' + styleStr;
      if (!sizeStr.startsWith('size.')) sizeStr = 'size.' + sizeStr;
      // Compute the label time from x depending on xloc mode.
      let time: number;
      if (xlocStr === 'bar_time') {
        time = x as number;
      } else {
        const barIdx = Math.trunc(x as number);
        if (barIdx >= 0 && barIdx < eng.barTimestamps.length) {
          time = eng.barTimestamps[barIdx];
        } else {
          time = eng.currentTimestamp;
        }
      }
      eng.labels.push({
        time,
        price: y as number,
        text: String(actualText),
        color: colorStr,
        textcolor: textcolorStr,
        style: styleStr,
        size: sizeStr,
      });
      return 0;
    },
  );
}
