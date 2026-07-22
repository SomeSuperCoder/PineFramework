import { type Bar, type ExecutionContext, ExecutionEngine, barsToContext, createSeries, type FormingCandleResult, type ExecutionResult } from 'pine-framework';
import type { ScriptOutputs } from './ScriptSession.js';

function pineValueToJSON(v: unknown): number | string | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'symbol') return null;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
  return null;
}

export class FormingCandleManager {
  private bars: Bar[];
  private contexts: ExecutionContext[];
  private engine: ExecutionEngine;
  private lastConfirmedTimestamp: number = 0;
  private cachedAlertConditions: Array<{ id: string; title: string; message: string }> = [];
  private version: number | null;

  /**
   * Tracks the number of alert triggers the last time we called toOutputs()
   * (i.e. after the most recent confirmed bar).  In confirm() we save this
   * count before executing the new bar, then compute the diff (new triggers
   * added during the confirmed-bar run) and stash them as pendingNewTriggers
   * so the gateway can send Telegram notifications for ONLY the new bar's
   * triggers, not all accumulated historical triggers.
   */
  private lastAlertTriggerCount: number = 0;

  /**
   * New triggers generated during the most recent confirm() call.
   * Cleared after the gateway reads them via getPendingNewAlertTriggers().
   */
  private _pendingNewTriggers: Array<{ alertId: string; barIndex: number; timestamp: number }> = [];

  /** Returns and clears the pending new triggers from the last confirmed bar. */
  getPendingNewAlertTriggers(): Array<{ alertId: string; barIndex: number; timestamp: number }> {
    const result = this._pendingNewTriggers;
    this._pendingNewTriggers = [];
    return result;
  }

  constructor(bars: Bar[], contexts: ExecutionContext[], engine: ExecutionEngine, version: number | null) {
    this.bars = bars;
    this.contexts = contexts;
    this.engine = engine;
    this.version = version;
    this.lastConfirmedTimestamp = bars.length > 0 ? bars[bars.length - 1].timestamp : 0;
  }

  /**
   * Process a tick (forming candle update).
   * Updates the bar in place and runs computeFormingCandle.
   */
  tick(bar: Bar): ScriptOutputs {
    const lastBar = this.bars[this.bars.length - 1];
    if (lastBar && lastBar.timestamp === bar.timestamp) {
      this.bars[this.bars.length - 1] = bar;
      // Update only the last context in-place (O(1)) instead of rebuilding all (O(n))
      const lastContext = this.contexts[this.contexts.length - 1];
      lastContext.timestamp = bar.timestamp;
      lastContext.open = createSeries('open', [bar.open]);
      lastContext.high = createSeries('high', [bar.high]);
      lastContext.low = createSeries('low', [bar.low]);
      lastContext.close = createSeries('close', [bar.close]);
      lastContext.volume = createSeries('volume', [bar.volume]);
    } else {
      this.bars.push(bar);
      const fullContexts = barsToContext(this.bars);
      this.contexts.push(fullContexts[fullContexts.length - 1]!);
    }
      this.cachedAlertConditions = [];

    const context = this.contexts[this.contexts.length - 1]!;
    this.engine.setFormingCandle(true);
    const result = this.engine.computeFormingCandle(context);
    return this.toFormingCandleOutputs(result);
  }

  /**
   * Process a confirmed (closed) bar.
   * Runs executeBar with full outputs.
   */
  confirm(bar: Bar): ScriptOutputs {
    if (bar.timestamp <= this.lastConfirmedTimestamp) {
      if (bar.timestamp < this.lastConfirmedTimestamp) {
        // Stale bar (older than last confirmed): reject with warning
        console.warn(
          `[FormingCandleManager] Received stale bar with timestamp ${bar.timestamp}, last confirmed was ${this.lastConfirmedTimestamp}. Ignoring.`,
        );
        return this.toFormingCandleOutputs({
          success: false,
          error: 'Stale bar ignored',
          overlay: false,
          diffOutputs: {},
          diffShapes: [],
          diffFills: [],
          diffLines: [],
          diffLabels: [],
          barTimestamps: [],
          barIndex: this.bars.length - 1,
          isDiff: false,
        });
      }
      // Re-confirm of the most recent bar (timestamp === lastConfirmedTimestamp)
      this.bars[this.bars.length - 1] = bar;
      // Update only the last context in-place
      const lastContext = this.contexts[this.contexts.length - 1];
      lastContext.timestamp = bar.timestamp;
      lastContext.open = createSeries('open', [bar.open]);
      lastContext.high = createSeries('high', [bar.high]);
      lastContext.low = createSeries('low', [bar.low]);
      lastContext.close = createSeries('close', [bar.close]);
      lastContext.volume = createSeries('volume', [bar.volume]);
      const context = this.contexts[this.contexts.length - 1]!;
      this.engine.setFormingCandle(true);
      const result = this.engine.computeFormingCandle(context);
      return this.toFormingCandleOutputs(result);
    }
    this.lastConfirmedTimestamp = bar.timestamp;
    this.bars[this.bars.length - 1] = bar;
    // Update only the last context in-place
    const lastContext = this.contexts[this.contexts.length - 1];
    lastContext.timestamp = bar.timestamp;
    lastContext.open = createSeries('open', [bar.open]);
    lastContext.high = createSeries('high', [bar.high]);
    lastContext.low = createSeries('low', [bar.low]);
    lastContext.close = createSeries('close', [bar.close]);
    lastContext.volume = createSeries('volume', [bar.volume]);
    const context = this.contexts[this.contexts.length - 1]!;
    this.engine.setFormingCandle(false);

    // Save the pre-execution trigger count so we can extract only the
    // triggers that fire for THIS bar (not all accumulated historical triggers).
    const preAlertTriggersLen = this.lastAlertTriggerCount;

    const execResult = this.engine.executeBar(context);

    // Compute new triggers that were added during this bar's execution.
    const allTriggers: Array<{ alertId: string; barIndex: number; timestamp: number }> =
      (execResult.alertTriggers as any) ?? [];
    const newTriggers = allTriggers.slice(preAlertTriggersLen);
    this._pendingNewTriggers = newTriggers;
    this.lastAlertTriggerCount = allTriggers.length;

    return this.toOutputs(execResult);
  }

  toOutputs(result: ExecutionResult): ScriptOutputs {
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
      overlay: s.overlay,
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

    const barTimestampsForBoxes = result.barTimestamps ?? [];
    const boxes = (result.boxes || []).map((b) => ({
      startTime: b.left < barTimestampsForBoxes.length ? (barTimestampsForBoxes[b.left] ?? 0) : 0,
      startPrice: b.top,
      endTime: b.right < barTimestampsForBoxes.length ? (barTimestampsForBoxes[b.right] ?? 0) : 0,
      endPrice: b.bottom,
      borderColor: b.border_color,
      backgroundColor: b.bgcolor,
    }));

    const resultAny = result as unknown as Record<string, unknown>;
    const rawTables = resultAny.tables as Array<{
      position: number; columns: number; rows: number; bgcolor: string;
      border_color: string; border_width: number; frame_color: string; frame_width: number;
      cells: Record<string, { text: string; text_color: string; text_halign: string; text_valign: string; bgcolor: string; width: number; text_size: string; tooltip: string }>;
    }> | undefined;
    const tables = (rawTables || []).map((t) => ({
      position: t.position,
      columns: t.columns,
      rows: t.rows,
      bgcolor: t.bgcolor,
      border_color: t.border_color,
      border_width: t.border_width,
      frame_color: t.frame_color,
      frame_width: t.frame_width,
      cells: t.cells,
    }));
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

    // Track the trigger count so confirm() can produce diffs.  This is
    // also the first point where we learn how many triggers exist after
    // the initial executeBars() call in ScriptSession.initialize().
    this.lastAlertTriggerCount = alertTriggers.length;

    return {
      success: result.success,
      error: result.error,
      version: this.version ?? result.version,
      overlay: result.overlay,
      outputs,
      plotColors,
      fillColorData,
      shapes,
      fills,
      strategyMarkers,
      bgcolor: result.bgcolor,
      lines,
      labels,
      boxes,
      tables,
      barTimestamps: result.barTimestamps ?? [],
      barIndex: this.contexts.length > 0 ? this.contexts.length - 1 : 0,
      formingCandle: false,
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
      overlay: s.overlay,
    }));

    const fills = result.diffFills.map((f) => ({
      from: f.from,
      to: f.to,
      color: f.color,
    }));

    const strategyMarkers: ScriptOutputs['strategyMarkers'] = [];

    const barTimestamps = [...(result.barTimestamps ?? [])];
    while (barTimestamps.length < this.bars.length) {
      const bar = this.bars[barTimestamps.length];
      barTimestamps.push(bar?.timestamp ?? 0);
    }
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
      overlay: result.overlay,
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
      barIndex: this.bars.length - 1,
      formingCandle: !(result.isConfirmed ?? false),
      isConfirmed: result.isConfirmed ?? false,
      alertConditions: this.cachedAlertConditions,
      alertTriggers: result.diffAlertTriggers ?? [],
    };
  }
}
