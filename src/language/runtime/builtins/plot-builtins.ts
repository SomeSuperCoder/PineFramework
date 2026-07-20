import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';
import { createSeries } from '../series.js';

export function registerPlotBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set(
    'timestamp',
    (
      yearOrDate: PineValue,
      month?: PineValue,
      day?: PineValue,
      hour?: PineValue,
      minute?: PineValue,
      second?: PineValue,
    ): PineValue => {
      if (typeof yearOrDate === 'string') {
        const parsed = new Date(yearOrDate).getTime();
        return isNaN(parsed) ? NA : parsed;
      }
      if (isNa(yearOrDate)) return NA;
      const m = month !== undefined && !isNa(month) ? (month as number) - 1 : 0;
      const d = day !== undefined && !isNa(day) ? (day as number) : 1;
      const h = hour !== undefined && !isNa(hour) ? (hour as number) : 0;
      const min = minute !== undefined && !isNa(minute) ? (minute as number) : 0;
      const s = second !== undefined && !isNa(second) ? (second as number) : 0;
      return new Date(yearOrDate as number, m, d, h, min, s).getTime();
    },
  );

  eng.builtins.set('plot', (...allArgs: PineValue[]): PineValue => {
    let seriesName = 'plot';
    let color: string | undefined;
    let linewidth: number | undefined;
    let style: string | undefined;
    let display: PineValue | undefined;
    const PINE_STYLE_MAP: Record<string, string> = {
      style_line: 'line',
      style_linebr: 'line',
      style_stepline: 'stepline',
      style_steplinebr: 'stepline',
      style_histogram: 'histogram',
      style_columns: 'columns',
      style_circles: 'circles',
      style_cross: 'cross',
      style_areabr: 'areabr',
      style_area: 'area',
      style_areaoutline: 'area',
      style_circledot: 'circles',
    };

    const lastArg = allArgs.length > 0 ? allArgs[allArgs.length - 1] : undefined;
    const namedArgs =
      typeof lastArg === 'object' &&
      lastArg !== null &&
      !Array.isArray(lastArg) &&
      !(lastArg as any).__isSeries
        ? (lastArg as unknown as Record<string, PineValue>)
        : undefined;
    const positionalArgs = namedArgs ? allArgs.slice(0, -1) : allArgs;

    // Pine Script plot(series, title, color, linewidth, style, trackprice, histbase, offset, join, editable, show_last, display)
    if (positionalArgs.length >= 2 && typeof positionalArgs[1] === 'string') {
      seriesName = positionalArgs[1] as string;
    }
    if (positionalArgs.length >= 3) {
      const c = positionalArgs[2];
      if (typeof c === 'string') color = c;
    }
    if (positionalArgs.length >= 4 && typeof positionalArgs[3] === 'number') {
      linewidth = positionalArgs[3] as number;
    }
    if (positionalArgs.length >= 5 && typeof positionalArgs[4] === 'string') {
      style = PINE_STYLE_MAP[positionalArgs[4] as string] || 'line';
    }
    if (positionalArgs.length >= 12) {
      display = positionalArgs[11];
    }

    if (namedArgs) {
      if (typeof namedArgs.title === 'string') seriesName = namedArgs.title;
      if (typeof namedArgs.color === 'string') color = namedArgs.color;
      if (typeof namedArgs.linewidth === 'number') linewidth = namedArgs.linewidth;
      if (typeof namedArgs.style === 'string') style = PINE_STYLE_MAP[namedArgs.style] || 'line';
      if (namedArgs.display !== undefined) display = namedArgs.display;
    }

    const metaParts = [seriesName];
    if (linewidth) metaParts.push(`__lw:${linewidth}`);
    if (style) metaParts.push(`__style:${style}`);
    const key = metaParts.join('');

    // Always register the output and return the plot ref (needed for fill()).
    // display=display.none only prevents frontend rendering, not data collection.
    if (display === 'none' || display === 0) {
      eng.hiddenPlotKeys.add(key);
    }
    if (!eng.outputs.has(key)) {
      eng.outputs.set(key, createSeries(key));
    }
    eng.outputs.get(key)!.push(isNa(positionalArgs[0]) ? null : positionalArgs[0]);
    if (!eng.plotColors.has(key)) {
      eng.plotColors.set(key, []);
    }
    eng.plotColors.get(key)!.push(color ?? null);
    eng.trimPlotColorsArrays();
    return `__plot_ref:${key}` as PineValue;
  });

  eng.builtins.set('plotshape', (...args: PineValue[]): PineValue => {
    const namedArgs =
      args.length > 0 &&
      typeof args[args.length - 1] === 'object' &&
      !Array.isArray(args[args.length - 1])
        ? (args[args.length - 1] as unknown as Record<string, PineValue>)
        : {};
    const value = args[0] ?? NA;
    if (isNa(value)) return NA;
    let styleStr: string = 'circle';
    let locationStr: string = 'abovebar';
    let colorStr: string = '#2196f3';
    let textStr: string = '';
    let textColorStr: string = '#ffffff';
    if (typeof namedArgs.style === 'string') styleStr = namedArgs.style;
    if (typeof namedArgs.location === 'string') locationStr = namedArgs.location;
    if (typeof namedArgs.color === 'string') colorStr = namedArgs.color;
    if (typeof namedArgs.text === 'string') textStr = namedArgs.text;
    if (typeof namedArgs.textcolor === 'string') textColorStr = namedArgs.textcolor;
    // Positional args: (series, title, style, location, color, text, ...)
    // title (arg 1) is internal only — do NOT use it as display text
    for (let i = 1; i < args.length - (Object.keys(namedArgs).length > 0 ? 1 : 0) && i < 5; i++) {
      const a = args[i];
      if (typeof a === 'string') {
        if (i === 2)
          styleStr = a; // style
        else if (i === 3) locationStr = a; // location
      }
    }
    const isLocationBool = locationStr === 'abovebar' || locationStr === 'belowbar';
    if (isLocationBool) {
      if (value !== true && value !== 1) return NA;
    }
    eng.shapes.push({
      style: styleStr,
      location: locationStr,
      color: colorStr,
      time: eng.currentTimestamp,
      text: textStr,
      textcolor: textColorStr,
      price: typeof value === 'number' && !isLocationBool ? value : undefined,
      overlay: eng.compiledScript.overlay,
    });
    return NA;
  });

  eng.builtins.set('plotchar', (...allArgs: PineValue[]): PineValue => {
    const lastArg = allArgs.length > 0 ? allArgs[allArgs.length - 1] : undefined;
    const namedArgs =
      typeof lastArg === 'object' &&
      lastArg !== null &&
      !Array.isArray(lastArg) &&
      !(lastArg as any).__isSeries
        ? (lastArg as unknown as Record<string, PineValue>)
        : undefined;
    const positionalArgs = namedArgs ? allArgs.slice(0, -1) : allArgs;

    // Pine Script plotchar(series, title, char, location, color, offset, text, textcolor, editable, size, display)
    const value = positionalArgs[0] ?? NA;
    if (isNa(value)) return NA;
    const char =
      positionalArgs.length >= 3 && typeof positionalArgs[2] === 'string'
        ? (positionalArgs[2] as string)
        : '●';
    let locationStr =
      positionalArgs.length >= 4 && typeof positionalArgs[3] === 'string'
        ? (positionalArgs[3] as string)
        : 'abovebar';
    let colorStr =
      positionalArgs.length >= 5 && typeof positionalArgs[4] === 'string'
        ? (positionalArgs[4] as string)
        : '#2196f3';
    let textStr = '';

    if (namedArgs) {
      if (typeof namedArgs.location === 'string') locationStr = namedArgs.location;
      if (typeof namedArgs.color === 'string') colorStr = namedArgs.color;
      if (typeof namedArgs.text === 'string') textStr = namedArgs.text;
    }

    // Also handle positional named args (location as string like "location.belowbar")
    for (let i = 3; i < positionalArgs.length && i < 6; i++) {
      const a = positionalArgs[i];
      if (typeof a === 'string') {
        if (i === 3) locationStr = a;
        else if (i === 4) colorStr = a;
      }
    }

    // location.belowbar -> belowbar
    if (locationStr.startsWith('location.')) locationStr = locationStr.slice(9);

    const isLocationBool = locationStr === 'abovebar' || locationStr === 'belowbar';
    if (isLocationBool) {
      if (value !== true && value !== 1) return NA;
    }

    eng.shapes.push({
      style: char,
      location: locationStr,
      color: colorStr,
      time: eng.currentTimestamp,
      text: textStr,
      price: typeof value === 'number' && !isLocationBool ? value : undefined,
      overlay: eng.compiledScript.overlay,
    });
    return NA;
  });

  eng.builtins.set('bgcolor', (colorInput: PineValue): PineValue => {
    if (isNa(colorInput)) return NA;
    const colorStr = typeof colorInput === 'string' ? colorInput : '#000000';
    eng.bgcolorData.push({ time: eng.currentTimestamp, color: colorStr });
    return NA;
  });

  eng.builtins.set('barcolor', (colorInput: PineValue): PineValue => {
    if (isNa(colorInput)) return NA;
    const colorStr = typeof colorInput === 'string' ? colorInput : '#000000';
    if (!eng.barColorData) eng.barColorData = [];
    eng.barColorData.push({ time: eng.currentTimestamp, color: colorStr });
    return NA;
  });

  eng.builtins.set('plotcandle', (...args: PineValue[]): PineValue => {
    const namedArgs =
      args.length > 0 &&
      typeof args[args.length - 1] === 'object' &&
      !Array.isArray(args[args.length - 1])
        ? (args[args.length - 1] as unknown as Record<string, PineValue>)
        : {};
    let bodyColor = '#000000';
    if (typeof namedArgs.color === 'string') bodyColor = namedArgs.color;
    if (bodyColor !== 'na' && bodyColor !== '') {
      if (!eng.barColorData) eng.barColorData = [];
      eng.barColorData.push({ time: eng.currentTimestamp, color: bodyColor });
    }
    return NA;
  });

  eng.builtins.set('fill', (...allArgs: PineValue[]): PineValue => {
    const lastArg = allArgs.length > 0 ? allArgs[allArgs.length - 1] : undefined;
    const namedArgs =
      typeof lastArg === 'object' &&
      lastArg !== null &&
      !Array.isArray(lastArg) &&
      !(lastArg as any).__isSeries
        ? (lastArg as unknown as Record<string, PineValue>)
        : undefined;
    const positionalArgs = namedArgs ? allArgs.slice(0, -1) : allArgs;

    // Pine Script fill(plot1, plot2, top_value, bottom_value, top_color, bottom_color, editable, fillgaps, title)
    const from =
      typeof positionalArgs[0] === 'string' &&
      (positionalArgs[0] as string).startsWith('__plot_ref:')
        ? (positionalArgs[0] as string).slice(11)
        : String(positionalArgs[0] ?? '');
    const to =
      typeof positionalArgs[1] === 'string' &&
      (positionalArgs[1] as string).startsWith('__plot_ref:')
        ? (positionalArgs[1] as string).slice(11)
        : String(positionalArgs[1] ?? '');

    let topColor: string | null = null;
    let bottomColor: string | null = null;
    if (positionalArgs.length >= 5 && typeof positionalArgs[4] === 'string')
      topColor = positionalArgs[4] as string;
    if (positionalArgs.length >= 6 && typeof positionalArgs[5] === 'string')
      bottomColor = positionalArgs[5] as string;

    if (namedArgs) {
      if (typeof namedArgs.color === 'string') topColor = namedArgs.color;
    }

    const fillKey = `${from}::${to}`;
    if (!eng.fills.some((f: { from: string; to: string }) => f.from === from && f.to === to)) {
      eng.fills.push({ from, to, color: topColor ?? bottomColor ?? 'rgba(33,150,243,0.2)' });
    }
    if (!eng.fillColorData.has(fillKey)) {
      eng.fillColorData.set(fillKey, []);
    }
    // Push the top color for this bar — the renderer uses one color per bar segment
    eng.fillColorData.get(fillKey)!.push(topColor);
    return NA;
  });
}
