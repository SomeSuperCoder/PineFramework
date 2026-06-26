import { parseAndCompile, barsToContext, ExecutionEngine, type Bar } from 'pine-framework';
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
  outputs: Record<string, (number | string | boolean | null)[]>;
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
  barIndex: number;
}

export class ScriptSession {
  public source: string;
  public symbol: string;
  public interval: string;
  private bars: Bar[];
  private engine: ExecutionEngine | null = null;
  private contexts: ExecutionContext[] = [];

  constructor(source: string, symbol: string, interval: string, bars: Bar[]) {
    this.source = source;
    this.symbol = symbol;
    this.interval = interval;
    this.bars = bars;
  }

  initialize(): ScriptOutputs {
    const compileResult = parseAndCompile(this.source);
    this.engine = new ExecutionEngine(compileResult);
    this.contexts = barsToContext(this.bars);
    const result = this.engine.executeBars(this.contexts);
    return this.toOutputs(result);
  }

  appendOrUpdateBar(bar: Bar): ScriptOutputs {
    if (!this.engine) {
      this.bars = [bar];
      this.contexts = barsToContext(this.bars);
      return this.initialize();
    }

    const lastBar = this.bars[this.bars.length - 1];
    if (lastBar && lastBar.timestamp === bar.timestamp) {
      this.bars[this.bars.length - 1] = bar;
      const singleCtx = barsToContext([bar])[0]!;
      this.contexts[this.contexts.length - 1] = singleCtx;
    } else {
      this.bars.push(bar);
      const singleCtx = barsToContext([bar])[0]!;
      singleCtx.barIndex = this.contexts.length;
      singleCtx.barCount = this.contexts.length + 1;
      this.contexts.push(singleCtx);
    }

    const context = this.contexts[this.contexts.length - 1]!;
    const result = this.engine.executeRealtimeBar(context);
    return this.toOutputs(result);
  }

  private toOutputs(result: import('pine-framework').ExecutionResult): ScriptOutputs {
    const outputs: Record<string, (number | string | boolean | null)[]> = {};
    if (result.outputs) {
      for (const [key, series] of result.outputs) {
        outputs[key] = Array.from(series.values).map(pineValueToJSON);
      }
    }

    const shapes = (result.shapes || []).map((s) => ({
      style: s.style,
      location: s.location,
      color: s.color,
      time: s.time,
      text: s.text,
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

    return {
      success: result.success,
      error: result.error,
      outputs,
      shapes,
      fills,
      strategyMarkers,
      bgcolor: result.bgcolor,
      barIndex: this.contexts.length > 0 ? this.contexts.length - 1 : 0,
    };
  }
}
