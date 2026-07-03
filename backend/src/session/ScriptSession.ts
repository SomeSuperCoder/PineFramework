import { parseAndCompile, barsToContext, ExecutionEngine, type Bar, type FormingCandleResult } from 'pine-framework';
import type { ExecutionContext } from 'pine-framework';

function pineValueToJSON(v: unknown): number | string | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'symbol') return null;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
  return null;
}

export interface ScriptOutputs {
  success: boolean;
  error?: string;
  version?: number;
  outputs: Record<string, (number | string | boolean | null)[]>;
  plotColors?: Record<string, (string | null)[]>;
  fillColorData?: Record<string, (string | null)[]>;
  shapes: Array<{ style: string; location: string; color: string; time: number; text: string }>;
  fills: Array<{ from: string; to: string; color: string }>;
  strategyMarkers: Array<{
    type: string;
    name: string;
    direction: string;
    action: string;
    quantity: number;
    price: number;
    barIndex: number;
    timestamp: number;
    color: string;
    comment?: string;
  }>;
  bgcolor?: Array<{ time: number; color: string }>;
  lines?: Array<{ points: Array<{ time: number; price: number }>; color: string; width?: number; style?: string }>;
  labels?: Array<{ time: number; price: number; text: string; color?: string; textColor?: string; style?: string; size?: string }>;
  barTimestamps?: number[];
  barIndex: number;
  formingCandle?: boolean;
  isConfirmed?: boolean;
  alertConditions?: Array<{ id: string; title: string; message: string }>;
  alertTriggers?: Array<{ alertId: string; barIndex: number; timestamp: number }>;
}

export class ScriptSession {
  public source: string;
  public symbol: string;
  public interval: string;
  private bars: Bar[];
  private engine: ExecutionEngine | null = null;
  private contexts: ExecutionContext[] = [];
  private cachedAlertConditions: Array<{ id: string; title: string; message: string }> = [];
  private lastConfirmedTimestamp: number = 0;
  public version: number | null = null;

  constructor(source: string, symbol: string, interval: string, bars: Bar[]) {
    this.source = source;
    this.symbol = symbol;
    this.interval = interval;
    this.bars = bars;
  }

  initialize(): ScriptOutputs {
    const compileResult = parseAndCompile(this.source);
    this.version = compileResult.ir.version ?? null;
    this.engine = new ExecutionEngine(compileResult);
    this.contexts = barsToContext(this.bars);
    const result = this.engine.executeBars(this.contexts);
    return this.toOutputs(result);
  }

  appendOrUpdateBar(bar: Bar, confirmed?: boolean): ScriptOutputs {
    if (!this.engine) {
      this.bars = [bar];
      this.contexts = barsToContext(this.bars);
      return this.initialize();
    }

    // When Bybit confirms the kline (bar close), execute with isFormingCandle=false
    // so barstate.isconfirmed=true and alert triggers are produced.
    // Uses computeFormingCandle (not executeRealtimeBar) to avoid state advancement
    // since the bar was already processed during initialize().
    if (confirmed) {
      // Dedup: skip re-execution if we already confirmed this bar timestamp
      if (bar.timestamp <= this.lastConfirmedTimestamp) {
        this.bars[this.bars.length - 1] = bar;
        const fullContexts = barsToContext(this.bars);
        this.contexts[this.contexts.length - 1] = fullContexts[fullContexts.length - 1]!;
        const context = this.contexts[this.contexts.length - 1]!;
        this.engine.setFormingCandle(true);
        const result = this.engine.computeFormingCandle(context);
        return this.toFormingCandleOutputs(result);
      }
      this.lastConfirmedTimestamp = bar.timestamp;
      this.bars[this.bars.length - 1] = bar;
      const fullContexts = barsToContext(this.bars);
      this.contexts[this.contexts.length - 1] = fullContexts[fullContexts.length - 1]!;
      const context = this.contexts[this.contexts.length - 1]!;
      this.engine.setFormingCandle(false);
      const result = this.engine.computeFormingCandle(context);
      return this.toFormingCandleOutputs(result);
    }

    const lastBar = this.bars[this.bars.length - 1];
    if (lastBar && lastBar.timestamp === bar.timestamp) {
      this.bars[this.bars.length - 1] = bar;
      const fullContexts = barsToContext(this.bars);
      this.contexts[this.contexts.length - 1] = fullContexts[fullContexts.length - 1]!;

      const context = this.contexts[this.contexts.length - 1]!;
      this.engine.setFormingCandle(true);
      const result = this.engine.computeFormingCandle(context);
      return this.toFormingCandleOutputs(result);
    } else {
      this.bars.push(bar);
      const fullContexts = barsToContext(this.bars);
      this.contexts.push(fullContexts[fullContexts.length - 1]!);
    }

    // First tick of a new candle (not yet confirmed by Bybit) — treat as forming
    const context = this.contexts[this.contexts.length - 1]!;
    this.engine.setFormingCandle(true);
    const result = this.engine.computeFormingCandle(context);
    return this.toFormingCandleOutputs(result);
  }

  private toOutputs(result: import('pine-framework').ExecutionResult): ScriptOutputs {
    const outputs: Record<string, (number | string | boolean | null)[]> = {};
    if (result.outputs) {
      for (const [key, series] of result.outputs) {
        outputs[key] = Array.from(series.values).map(pineValueToJSON);
      }
    }

    const plotColors: Record<string, (string | null)[]> = {};
    if (result.plotColors) {
      for (const [key, colors] of result.plotColors) {
        plotColors[key] = Array.from(colors);
      }
    }

    const fillColorData: Record<string, (string | null)[]> = {};
    if (result.fillColorData) {
      for (const [key, colors] of result.fillColorData) {
        fillColorData[key] = Array.from(colors);
      }
    }

    const shapes = (result.shapes || []).map((s) => ({
      style: s.style,
      location: s.location,
      color: s.color,
      time: s.time,
      text: s.text,
      price: s.price,
    }));

    const fills = (result.fills || []).map((f) => ({
      from: f.from,
      to: f.to,
      color: f.color,
    }));

    const strategyMarkers = (result.strategyMarkers || []).map((m) => ({
      type: m.type,
      name: m.name,
      direction: m.direction,
      action: m.action,
      quantity: m.quantity,
      price: m.price,
      barIndex: m.barIndex,
      timestamp: m.timestamp,
      color: m.color,
      comment: m.comment,
    }));

    const barTimestamps = result.barTimestamps ?? [];
    const lines = (result.lines || []).map((l) => ({
      points: [
        { time: l.xloc === 'bar_index' ? (barTimestamps[l.x1] ?? l.x1) : l.x1, price: l.y1 },
        { time: l.xloc === 'bar_index' ? (barTimestamps[l.x2] ?? l.x2) : l.x2, price: l.y2 },
      ],
      color: l.color,
      width: l.width,
      style: l.style === 'style_dotted' ? 'dotted' : l.style === 'style_dashed' ? 'dashed' : 'solid' as string,
    }));

    const labels = (result.labels || []).map((l) => ({
      time: l.time,
      price: l.price,
      text: l.text,
      color: l.color,
      textColor: l.textcolor,
      style: l.style,
      size: l.size,
    }));

    const resultAny = result as unknown as Record<string, unknown>;
    const alertConditions: Array<{ id: string; title: string; message: string }> = [];
    const rawConditions = resultAny.alertConditions as Array<{ id: string; title: string; message: string }> | undefined;
    if (rawConditions) {
      for (const ac of rawConditions) {
        alertConditions.push({ id: ac.id, title: ac.title, message: ac.message });
      }
    }

    if (alertConditions.length > 0) {
      this.cachedAlertConditions = alertConditions;
    }

    const alertTriggers: Array<{ alertId: string; barIndex: number; timestamp: number }> = [];
    const rawTriggers = resultAny.alertTriggers as Array<{ alertId: string; barIndex: number; timestamp: number }> | undefined;
    if (rawTriggers) {
      for (const at of rawTriggers) {
        alertTriggers.push({ alertId: at.alertId, barIndex: at.barIndex, timestamp: at.timestamp });
      }
    }

    return {
      success: result.success,
      error: result.error,
      version: this.version ?? result.version,
      outputs,
      plotColors,
      fillColorData,
      shapes,
      fills,
      strategyMarkers,
      bgcolor: result.bgcolor,
      lines,
      labels,
      barTimestamps: result.barTimestamps ?? [],
      barIndex: this.contexts.length > 0 ? this.contexts.length - 1 : 0,
      isConfirmed: true,
      alertConditions,
      alertTriggers,
    };
  }

  private toFormingCandleOutputs(result: FormingCandleResult): ScriptOutputs {
    const outputs: Record<string, (number | string | boolean | null)[]> = {};
    for (const [key, value] of Object.entries(result.diffOutputs)) {
      outputs[key] = [pineValueToJSON(value)];
    }

    const shapes = result.diffShapes.map((s) => ({
      style: s.style,
      location: s.location,
      color: s.color,
      time: s.time,
      text: s.text,
    }));

    const fills = result.diffFills.map((f) => ({
      from: f.from,
      to: f.to,
      color: f.color,
    }));

    const strategyMarkers: ScriptOutputs['strategyMarkers'] = [];

    const barTimestamps = result.barTimestamps ?? [];
    const lines = (result.diffLines || []).map((l) => ({
      points: [
        { time: l.xloc === 'bar_index' ? (barTimestamps[l.x1] ?? l.x1) : l.x1, price: l.y1 },
        { time: l.xloc === 'bar_index' ? (barTimestamps[l.x2] ?? l.x2) : l.x2, price: l.y2 },
      ],
      color: l.color,
      width: l.width,
      style: l.style === 'style_dotted' ? 'dotted' : l.style === 'style_dashed' ? 'dashed' : 'solid' as string,
    }));

    const labels = (result.diffLabels || []).map((l) => ({
      time: l.time,
      price: l.price,
      text: l.text,
      color: l.color,
      textColor: l.textcolor,
      style: l.style,
      size: l.size,
    }));

    return {
      success: result.success,
      error: result.error,
      version: this.version ?? undefined,
      outputs,
      plotColors: result.diffPlotColors,
      fillColorData: result.diffFillColorData,
      shapes,
      fills,
      strategyMarkers,
      bgcolor: result.diffBgcolor,
      lines,
      labels,
      barTimestamps,
      barIndex: result.barIndex,
      formingCandle: !(result.isConfirmed ?? false),
      isConfirmed: result.isConfirmed ?? false,
      alertConditions: this.cachedAlertConditions,
      alertTriggers: result.diffAlertTriggers ?? [],
    };
  }
}
