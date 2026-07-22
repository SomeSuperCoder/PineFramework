import { parseAndCompile, barsToContext, ExecutionEngine, type Bar } from 'pine-framework';
import { FormingCandleManager } from './FormingCandleManager.js';

export interface ScriptOutputs {
  success: boolean;
  error?: string;
  version?: number;
  overlay: boolean;
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
  boxes?: Array<{ startTime: number; startPrice: number; endTime: number; endPrice: number; borderColor?: string; backgroundColor?: string }>;
  tables?: Array<{
    position: number;
    columns: number;
    rows: number;
    bgcolor: string;
    border_color: string;
    border_width: number;
    frame_color: string;
    frame_width: number;
    cells: Record<string, {
      text: string;
      text_color: string;
      text_halign: string;
      text_valign: string;
      bgcolor: string;
      width: number;
      text_size: string;
      tooltip: string;
    }>;
  }>;
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
  private contexts: import('pine-framework').ExecutionContext[] = [];
  public version: number | null = null;
  private formingCandleManager: FormingCandleManager | null = null;

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
    this.formingCandleManager = new FormingCandleManager(this.bars, this.contexts, this.engine, this.version);
    return this.formingCandleManager.toOutputs(result);
  }

  appendOrUpdateBar(bar: Bar, confirmed?: boolean): ScriptOutputs {
    if (!this.engine || !this.formingCandleManager) {
      this.bars = [bar];
      this.contexts = barsToContext(this.bars);
      return this.initialize();
    }

    if (confirmed) {
      return this.formingCandleManager.confirm(bar);
    }

    return this.formingCandleManager.tick(bar);
  }

  /**
   * Returns any new alert triggers generated during the last confirmed bar
   * execution.  Used by the gateway to send Telegram notifications only for
   * the NEW bar's triggers, not all accumulated historical triggers.
   * Triggers are returned once and then cleared.
   */
  getPendingNewAlertTriggers(): Array<{ alertId: string; barIndex: number; timestamp: number }> {
    return this.formingCandleManager?.getPendingNewAlertTriggers() ?? [];
  }
}
