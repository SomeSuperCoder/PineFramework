import { type Bar, type ExecutionContext, ExecutionEngine, barsToContext, createSeries, type FormingCandleResult, type ExecutionResult } from 'pine-framework';
import {
  normalizeExecutionResultMessage,
  type AlertConditionData,
  type AlertTriggerData,
  type BarColorData,
  type BoxData,
  type ColorValuesMap,
  type ExecutionResultMessageInput,
  type FillData,
  type LabelData,
  type LineData,
  type LinefillData,
  type OutputValuesMap,
  type ShapeData,
  type StrategyMarkerData,
  type TableData,
} from 'pine-framework/contracts';
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
    const outputs: OutputValuesMap = {};
    if (result.outputs) {
      for (const [key, series] of result.outputs) {
        outputs[key] = Array.from(series.values).map(pineValueToJSON);
      }
    }

    const plotColors: ColorValuesMap = {};
    if (result.plotColors) {
      for (const [key, colors] of result.plotColors) {
        plotColors[key] = Array.from(colors);
      }
    }

    const fillColorData: ColorValuesMap = {};
    if (result.fillColorData) {
      for (const [key, colors] of result.fillColorData) {
        fillColorData[key] = Array.from(colors);
      }
    }

    const shapes: ShapeData[] = (result.shapes || []).map((s) => ({
      style: s.style,
      location: s.location,
      color: s.color,
      time: s.time,
      text: s.text,
      price: s.price,
      overlay: s.overlay,
    }));

    const fills: FillData[] = (result.fills || []).map((f) => ({
      from: f.from,
      to: f.to,
      color: f.color,
    }));

    const strategyMarkers: StrategyMarkerData[] = (result.strategyMarkers || []).map((m) => ({
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
    const lines: LineData[] = (result.lines || []).map((l) => ({
      points: [
        { time: l.xloc === 'bar_index' ? (barTimestamps[l.x1] ?? l.x1) : l.x1, price: l.y1 },
        { time: l.xloc === 'bar_index' ? (barTimestamps[l.x2] ?? l.x2) : l.x2, price: l.y2 },
      ],
      color: l.color,
      width: l.width,
      style: l.style === 'style_dotted' ? 'dotted' : l.style === 'style_dashed' ? 'dashed' : 'solid',
    }));

    const linefills: LinefillData[] = (result.linefills || []).map((lf) => ({
      line1: { x1: lf.line1.x1, y1: lf.line1.y1, x2: lf.line1.x2, y2: lf.line1.y2, color: lf.line1.color },
      line2: { x1: lf.line2.x1, y1: lf.line2.y1, x2: lf.line2.x2, y2: lf.line2.y2, color: lf.line2.color },
      color: lf.color,
      fillgaps: lf.fillgaps,
    }));

    const labels: LabelData[] = (result.labels || []).map((l) => ({
      time: l.time,
      price: l.price,
      text: l.text,
      color: l.color,
      textColor: l.textcolor,
      style: l.style,
      size: l.size,
    }));

    // Engine types already declare tables/alertConditions/alertTriggers
    // (execution-types.ts), so no `as unknown as` cast is needed here —
    // the old cast predates those type declarations.
    const barTimestampsForBoxes = result.barTimestamps ?? [];
    const boxes: BoxData[] = (result.boxes || []).map((b) => ({
      startTime: b.left < barTimestampsForBoxes.length ? (barTimestampsForBoxes[b.left] ?? 0) : 0,
      startPrice: b.top,
      endTime: b.right < barTimestampsForBoxes.length ? (barTimestampsForBoxes[b.right] ?? 0) : 0,
      endPrice: b.bottom,
      borderColor: b.border_color,
      backgroundColor: b.bgcolor,
    }));

    const tables: TableData[] = (result.tables || []).map((t) => ({
      position: t.position,
      columns: t.columns,
      rows: t.rows,
      bgcolor: t.bgcolor,
      border_color: t.border_color,
      border_width: t.border_width,
      frame_color: t.frame_color,
      frame_width: t.frame_width,
      cells: t.cells,
      mergedCells: t.mergedCells,
    }));

    const alertConditions: AlertConditionData[] = [];
    const rawConditions = result.alertConditions;
    if (rawConditions) {
      for (const ac of rawConditions) {
        alertConditions.push({ id: ac.id, title: ac.title, message: ac.message });
      }
    }

    if (alertConditions.length > 0) {
      this.cachedAlertConditions = alertConditions;
    }

    const alertTriggers: AlertTriggerData[] = [];
    const rawTriggers = result.alertTriggers;
    if (rawTriggers) {
      for (const at of rawTriggers) {
        alertTriggers.push({ alertId: at.alertId, barIndex: at.barIndex, timestamp: at.timestamp });
      }
    }

    // Track the trigger count so confirm() can produce diffs.  This is
    // also the first point where we learn how many triggers exist after
    // the initial executeBars() call in ScriptSession.initialize().
    this.lastAlertTriggerCount = alertTriggers.length;

    const barColors: BarColorData[] = (result.barColorData || []).map((b) => ({
      time: b.time,
      bodyColor: b.bodyColor ?? undefined,
      wickColor: b.wickColor ?? undefined,
      borderColor: b.borderColor ?? undefined,
      offset: b.offset ?? undefined,
      color: b.bodyColor ?? undefined,
    }));

    // Build FROM the shared contract (B1/B2): payload is the contract's
    // input shape (collections optional on INPUT), normalize() guarantees
    // the OUTPUT — every required collection filled ([] / {}) and unknown
    // keys stripped. isConfirmed MUST be set before normalizing: normalize
    // defaults a missing discriminant to false (diff).
    const payload: ExecutionResultMessageInput = {
      success: result.success,
      error: toErrorMessage(result.error),
      // DRIFT (documented, not normalized this wave — Backend Lead):
      // WS emits `version ?? result.version` while REST emits
      // `version ?? null`. Deliberate preserved divergence.
      version: this.version ?? result.version,
      overlay: result.overlay,
      outputs,
      plotColors,
      fillColorData,
      hiddenPlotKeys: result.hiddenPlotKeys ?? [],
      plotOverlayKeys: result.plotOverlayKeys ?? [],
      shapes,
      fills,
      strategyMarkers,
      bgcolor: result.bgcolor,
      barColors,
      lines,
      linefills,
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

    return normalizeExecutionResultMessage(payload);
  }

  private toFormingCandleOutputs(result: FormingCandleResult): ScriptOutputs {
    const outputs: OutputValuesMap = {};
    for (const [key, value] of Object.entries(result.diffOutputs)) {
      outputs[key] = [pineValueToJSON(value)];
    }

    const shapes: ShapeData[] = result.diffShapes.map((s) => ({
      style: s.style,
      location: s.location,
      color: s.color,
      time: s.time,
      text: s.text,
      overlay: s.overlay,
    }));

    const fills: FillData[] = result.diffFills.map((f) => ({
      from: f.from,
      to: f.to,
      color: f.color,
    }));

    const strategyMarkers: StrategyMarkerData[] = [];

    const barTimestamps = [...(result.barTimestamps ?? [])];
    while (barTimestamps.length < this.bars.length) {
      const bar = this.bars[barTimestamps.length];
      barTimestamps.push(bar?.timestamp ?? 0);
    }
    const lines: LineData[] = (result.diffLines || []).map((l) => ({
      points: [
        { time: l.xloc === 'bar_index' ? (barTimestamps[l.x1] ?? l.x1) : l.x1, price: l.y1 },
        { time: l.xloc === 'bar_index' ? (barTimestamps[l.x2] ?? l.x2) : l.x2, price: l.y2 },
      ],
      color: l.color,
      width: l.width,
      style: l.style === 'style_dotted' ? 'dotted' : l.style === 'style_dashed' ? 'dashed' : 'solid',
    }));

    const linefills: LinefillData[] = (result.diffLinefills || []).map((lf) => ({
      line1: { x1: lf.line1.x1, y1: lf.line1.y1, x2: lf.line1.x2, y2: lf.line1.y2, color: lf.line1.color },
      line2: { x1: lf.line2.x1, y1: lf.line2.y1, x2: lf.line2.x2, y2: lf.line2.y2, color: lf.line2.color },
      color: lf.color,
      fillgaps: lf.fillgaps,
    }));

    const labels: LabelData[] = (result.diffLabels || []).map((l) => ({
      time: l.time,
      price: l.price,
      text: l.text,
      color: l.color,
      textColor: l.textcolor,
      style: l.style,
      size: l.size,
    }));

    const barColors: BarColorData[] = (result.diffBarColors || []).map((b) => ({
      time: b.time,
      bodyColor: b.bodyColor ?? undefined,
      wickColor: b.wickColor ?? undefined,
      borderColor: b.borderColor ?? undefined,
      offset: b.offset ?? undefined,
      color: b.bodyColor ?? undefined,
    }));

    // Build FROM the shared contract (B1/B2): the payload is the contract's
    // input shape; normalize() guarantees the OUTPUT. The 7(+1) empty-array
    // gap fixes live HERE as the DELIBERATE wire deltas (undefined -> []/{}):
    //   - plotColors/fillColorData are MAPS on the wire -> {} when no diff
    //   - bgcolor/barColors/boxes/tables/alertConditions are ARRAYS -> []
    //   - boxes/tables were MISSING keys entirely — structurally always []
    //     (known limitation: the engine has no diffBoxes/diffTables; do NOT
    //     build engine diffing this wave — documented for a follow-up)
    //   - alertConditions could be undefined when the cache is empty -> []
    const payload: ExecutionResultMessageInput = {
      success: result.success,
      error: toErrorMessage(result.error),
      // DRIFT (documented, not normalized this wave — Backend Lead):
      // WS diff emits `version ?? undefined` while REST emits
      // `version ?? null`. Deliberate preserved divergence.
      version: this.version ?? undefined,
      overlay: result.overlay,
      outputs,
      plotColors: result.diffPlotColors ?? {},
      fillColorData: result.diffFillColorData ?? {},
      hiddenPlotKeys: result.hiddenPlotKeys ?? [],
      plotOverlayKeys: result.plotOverlayKeys ?? [],
      shapes,
      fills,
      strategyMarkers,
      bgcolor: result.diffBgcolor ?? [],
      barColors,
      lines,
      linefills,
      labels,
      boxes: [],
      tables: [],
      barTimestamps,
      barIndex: this.bars.length - 1,
      formingCandle: !(result.isConfirmed ?? false),
      // Diff variant: isConfirmed explicitly false on a forming tick
      // (normalize defaults a missing discriminant to false, but the
      // producer states it so the intent is never ambiguous).
      isConfirmed: result.isConfirmed ?? false,
      alertConditions: this.cachedAlertConditions ?? [],
      alertTriggers: result.diffAlertTriggers ?? [],
    };

    return normalizeExecutionResultMessage(payload);
  }
}

/** Convert EngineError | string | undefined to a plain string for ScriptOutputs. */
function toErrorMessage(err: string | { message?: string } | undefined): string | undefined {
  if (typeof err === 'string') return err;
  if (err && err.message) return err.message;
  return undefined;
}
