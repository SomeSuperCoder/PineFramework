import type { ExecutionEngine } from '../execution-engine.js';
import { NA, isNa, type PineValue } from '../../types/na.js';
import { createSeries } from '../series.js';

// Per-engine stable key generator for unnamed plot() calls.
// Replaces the old module-level counter that incremented per bar, causing
// each bar to create a new series instead of accumulating into one.
// State is attached to the engine object to avoid cross-engine contamination.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePlotKey(eng: any): string {
  if (!eng._plotCallOrder) eng._plotCallOrder = 0;
  if (!eng._plotDeclMap) eng._plotDeclMap = new Map<number, string>();
  if (!eng._plotNextId) eng._plotNextId = 0;
  if (eng._lastPlotBarCount === undefined) eng._lastPlotBarCount = -1;

  const currentBarCount = eng.barTimestamps.length;
  // Detect bar boundary: reset per-bar call order counter
  if (currentBarCount !== eng._lastPlotBarCount) {
    eng._plotCallOrder = 0;
    eng._lastPlotBarCount = currentBarCount;
  }
  // Check if we've already assigned a key for this call order
  const existing = eng._plotDeclMap.get(eng._plotCallOrder);
  if (existing) {
    eng._plotCallOrder++;
    return existing;
  }
  // First bar: assign a new stable key
  const key = `plot_${eng._plotNextId++}`;
  eng._plotDeclMap.set(eng._plotCallOrder, key);
  eng._plotCallOrder++;
  return key;
}

export function registerPlotBuiltins(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    let seriesName: string | undefined;
    let color: string | undefined;
    let linewidth: number | undefined;
    let style: string | undefined;
    let display: PineValue | undefined;
    let forceOverlay: boolean | undefined;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // Pine Script plot(..., force_overlay) is at positional index 12 (13th param)
    if (positionalArgs.length >= 13 && typeof positionalArgs[12] === 'boolean') {
      forceOverlay = positionalArgs[12] as boolean;
    }

    if (namedArgs) {
      if (typeof namedArgs.title === 'string') seriesName = namedArgs.title;
      if (typeof namedArgs.color === 'string') color = namedArgs.color;
      if (typeof namedArgs.linewidth === 'number') linewidth = namedArgs.linewidth;
      if (typeof namedArgs.style === 'string') style = PINE_STYLE_MAP[namedArgs.style] || 'line';
      if (namedArgs.display !== undefined) display = namedArgs.display;
      if (typeof namedArgs.force_overlay === 'boolean') forceOverlay = namedArgs.force_overlay;
    }

    if (seriesName === undefined) {
      seriesName = resolvePlotKey(eng);
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
    // force_overlay=true overrides the indicator-level overlay=false for this plot
    if (forceOverlay === true) {
      eng.plotOverlayKeys.add(key);
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

  // ─── hline ──────────────────────────────────────────────────────────────
  // Emits a constant horizontal-line record into the execution result. Wire
  // shape mirrors the frontend's HLineData (frontend/src/chart/renderers/
  // HLineRenderer.ts consumes { price, color, style, width }) — the record
  // carries those exact field names so a future feed path can hand it to the
  // renderer unchanged. hline.style_* constants arrive as raw strings
  // ('style_dotted') from the enum-namespace resolution (expression-executor);
  // map them to the renderer's style strings. Records are deduped by title —
  // hline is a CONSTANT line re-emitted every bar, so the set stays flat.
  const HLINE_STYLE_MAP: Record<string, string> = {
    style_solid: 'solid',
    style_dotted: 'dotted',
    style_dashed: 'dashed',
  };

  eng.builtins.set('hline', (...allArgs: PineValue[]): PineValue => {
    const lastArg = allArgs.length > 0 ? allArgs[allArgs.length - 1] : undefined;
    const namedArgs =
      typeof lastArg === 'object' &&
      lastArg !== null &&
      !Array.isArray(lastArg) &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !(lastArg as any).__isSeries
        ? (lastArg as unknown as Record<string, PineValue>)
        : undefined;
    const positionalArgs = namedArgs ? allArgs.slice(0, -1) : allArgs;

    // Pine Script hline(price, title, color, linestyle, linewidth, editable, display, offset)
    const price =
      typeof positionalArgs[0] === 'number' && !isNa(positionalArgs[0])
        ? (positionalArgs[0] as number)
        : 0;
    let title = 'hline';
    let color = '#000000';
    let style: string = 'solid';
    let width: number = 1;
    if (positionalArgs.length >= 2 && typeof positionalArgs[1] === 'string') {
      title = positionalArgs[1] as string;
    }
    if (positionalArgs.length >= 3 && typeof positionalArgs[2] === 'string') {
      color = positionalArgs[2] as string;
    }
    if (positionalArgs.length >= 4 && typeof positionalArgs[3] === 'string') {
      style = HLINE_STYLE_MAP[positionalArgs[3] as string] || 'solid';
    }
    if (positionalArgs.length >= 5 && typeof positionalArgs[4] === 'number') {
      width = positionalArgs[4] as number;
    }
    if (namedArgs) {
      if (typeof namedArgs.title === 'string') title = namedArgs.title;
      if (typeof namedArgs.color === 'string') color = namedArgs.color;
      if (typeof namedArgs.linestyle === 'string') {
        style = HLINE_STYLE_MAP[namedArgs.linestyle] || 'solid';
      }
      if (typeof namedArgs.linewidth === 'number') width = namedArgs.linewidth;
    }

    if (!eng.hlines.some((h: { title: string }) => h.title === title)) {
      eng.hlines.push({
        title,
        price,
        color,
        style: style as 'solid' | 'dotted' | 'dashed',
        width,
      });
    }
    return NA;
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
        else if (i === 4) colorStr = a; // color
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  eng.builtins.set('barcolor', (colorInput: PineValue, offsetInput?: PineValue): PineValue => {
    if (isNa(colorInput)) return NA;
    const colorStr = typeof colorInput === 'string' ? colorInput : '#000000';
    const offset = typeof offsetInput === 'number' ? Math.floor(offsetInput) : 0;
    if (!eng.barColorData) eng.barColorData = [];
    eng.barColorData.push({ time: eng.currentTimestamp, bodyColor: colorStr, offset });
    return NA;
  });

  eng.builtins.set('plotcandle', (...args: PineValue[]): PineValue => {
    const namedArgs =
      args.length > 0 &&
      typeof args[args.length - 1] === 'object' &&
      !Array.isArray(args[args.length - 1])
        ? (args[args.length - 1] as unknown as Record<string, PineValue>)
        : {};
    const bodyColor =
      typeof namedArgs.color === 'string' && namedArgs.color !== 'na' ? namedArgs.color : undefined;
    const wickColor =
      typeof namedArgs.wickcolor === 'string' && namedArgs.wickcolor !== 'na'
        ? namedArgs.wickcolor
        : undefined;
    const borderColor =
      typeof namedArgs.bordercolor === 'string' && namedArgs.bordercolor !== 'na'
        ? namedArgs.bordercolor
        : undefined;
    if (bodyColor || wickColor || borderColor) {
      if (!eng.barColorData) eng.barColorData = [];
      eng.barColorData.push({
        time: eng.currentTimestamp,
        bodyColor,
        wickColor,
        borderColor,
      });
    }
    return NA;
  });

  eng.builtins.set('fill', (...allArgs: PineValue[]): PineValue => {
    const lastArg = allArgs.length > 0 ? allArgs[allArgs.length - 1] : undefined;
    const namedArgs =
      typeof lastArg === 'object' &&
      lastArg !== null &&
      !Array.isArray(lastArg) &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !(lastArg as any).__isSeries
        ? (lastArg as unknown as Record<string, PineValue>)
        : undefined;
    const positionalArgs = namedArgs ? allArgs.slice(0, -1) : allArgs;

    // Pine Script fill() forms:
    // 1. fill(plot1, plot2, color=...) - simple fill between two plots
    // 2. fill(hline1, hline2, color=...) - fill between two hlines
    // 3. fill(plot1, plot2, top_value, bottom_value, text, color, ...) - band fill
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

    let color: string | null = null;

    // Form 3: band fill - color is at position 5 (after plot1, plot2, top_val, bottom_val, text)
    // Form 1/2: simple fill - color is at position 2 or in named args
    if (positionalArgs.length >= 6) {
      // Band fill form: fill(plot1, plot2, top_value, bottom_value, text, color, ...)
      const rawColor = positionalArgs[5];
      if (typeof rawColor === 'string' && rawColor !== 'na') {
        color = rawColor;
      }
    } else if (positionalArgs.length >= 3 && typeof positionalArgs[2] === 'string') {
      // Simple fill form: fill(plot1, plot2, color)
      color = positionalArgs[2] as string;
    }

    if (namedArgs) {
      if (typeof namedArgs.color === 'string') color = namedArgs.color;
    }

    const fillKey = `${from}::${to}`;
    if (!eng.fills.some((f: { from: string; to: string }) => f.from === from && f.to === to)) {
      eng.fills.push({ from, to, color: color ?? 'rgba(33,150,243,0.2)' });
    }
    if (!eng.fillColorData.has(fillKey)) {
      eng.fillColorData.set(fillKey, []);
    }
    // Push the color for this bar — the renderer uses one color per bar segment
    eng.fillColorData.get(fillKey)!.push(color);
    return NA;
  });
}
