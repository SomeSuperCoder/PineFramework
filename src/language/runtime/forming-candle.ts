import type { ExecutionEngine } from './execution-engine.js';
import {
  type ExecutionContext,
  type FormingCandleResult,
  type ShapeEntry,
  type LineEntry,
  type LabelEntry,
  type AlertTriggerEntry,
} from './execution-types.js';
import { type PineValue } from '../types/na.js';
import { RingBuffer } from './ring-buffer.js';
import { createSeries, type Series } from './series.js';
import { cloneRuntimeScope } from './scope.js';

export class FormingCandleProcessor {
  private eng: any;

  constructor(engine: ExecutionEngine) {
    this.eng = engine as any;
  }

  computeFormingCandle(context: ExecutionContext): FormingCandleResult {
    if (this.eng.metrics.totalBars === 0) {
      const result = this.eng.executeRealtimeBar(context);
      return {
        success: result.success,
        error: result.error,
        overlay: this.eng.compiledScript.overlay,
        diffOutputs: Object.fromEntries(
          Array.from(result.outputs as Map<string, any>).map(([k, s]) => [k, (s as any).last()]),
        ),
        diffShapes: [...result.shapes],
        diffFills: [...result.fills],
        diffLines: [...(result.lines || [])],
        diffLabels: [...(result.labels || [])],
        barTimestamps: [...(result.barTimestamps ?? [])],
        barIndex: (result.barTimestamps ?? []).length - 1,
        isDiff: true,
      };
    }

    const preOutputs = this.cloneOutputs();
    const preShapesLen = this.eng.shapes.length;
    const preFillsLen = this.eng.fills.length;
    const preLinesSize = this.eng.lines.size;
    const preLabelsLen = this.eng.labels.length;
    const preTimestampsLen = this.eng.barTimestamps.length;
    const preTotalBars = this.eng.metrics.totalBars;
    const preAlertTriggersLen = this.eng.alertTriggers.length;
    const preSmaBuffers = new Map(
      [...this.eng.smaBuffers].map(([k, v]) => [k, v instanceof RingBuffer ? v.toArray() : [...v]]),
    );
    const preEmaState = new Map([...this.eng.emaState].map(([k, v]) => [k, { ...v }]));
    const preCrossPrevValues = new Map(this.eng.crossPrevValues);
    const preChangePrevValues = new Map(this.eng.changePrevValues);
    const preHighestBuffers = new Map([...this.eng.highestBuffers].map(([k, v]) => [k, [...v]]));
    const preLowestBuffers = new Map([...this.eng.lowestBuffers].map(([k, v]) => [k, [...v]]));
    const prePlotColors = new Map([...this.eng.plotColors].map(([k, v]) => [k, [...v]]));
    const preFillColorData = new Map([...this.eng.fillColorData].map(([k, v]) => [k, [...v]]));
    const preBgcolorDataLen = this.eng.bgcolorData.length;
    const preRsiState = new Map([...this.eng.rsiState].map(([k, v]) => [k, { ...v }]));
    const preAtrState = new Map(
      [...this.eng.atrState].map(([k, v]) => [k, { ...v, values: [...v.values] }]),
    );
    const preHmaBuffers = new Map(
      [...this.eng.hmaBuffers].map(([k, v]) => [
        k,
        { half: [...v.half], full: [...v.full], diff: [...v.diff] },
      ]),
    );
    const preSarState = new Map([...this.eng.sarState].map(([k, v]) => [k, { ...v }]));
    const preFunctionPersistentScopes = new Map(
      [...this.eng.functionPersistentScopes].map(([k, v]) => [k, cloneRuntimeScope(v)]),
    );
    const preBarColorDataLen = this.eng.barColorData.length;
    const preBoxesSize = this.eng.boxes.size;
    const preBoxIdCounter = this.eng.boxIdCounter;
    const preStrategyState = this.eng.strategyEngine ? this.eng.strategyEngine.saveState() : null;

    const result = this.eng.executeBar(context);

    const snapshotsAdded = this.eng.snapshots.length > 0 ? 1 : 0;
    for (let i = 0; i < snapshotsAdded; i++) {
      this.eng.snapshots.pop();
    }

    this.eng.barTimestamps.length = preTimestampsLen;
    this.eng.metrics.totalBars = preTotalBars;
    this.eng.metrics.successfulBars = result.success
      ? this.eng.metrics.successfulBars - 1
      : this.eng.metrics.successfulBars;
    this.eng.metrics.failedBars = result.success
      ? this.eng.metrics.failedBars
      : this.eng.metrics.failedBars - 1;

    this.eng.globalScope = cloneRuntimeScope(this.eng.globalScope);
    this.eng.smaBuffers = new Map();
    for (const [key, arr] of preSmaBuffers) {
      const parts = key.split('_');
      const capacity = parseInt(parts[1], 10);
      this.eng.smaBuffers.set(key, RingBuffer.fromArray(arr, capacity));
    }
    this.eng.emaState = preEmaState;
    this.eng.crossPrevValues = preCrossPrevValues;
    this.eng.changePrevValues = preChangePrevValues;
    this.eng.highestBuffers = preHighestBuffers;
    this.eng.lowestBuffers = preLowestBuffers;
    this.eng.rsiState = preRsiState;
    this.eng.atrState = preAtrState;
    this.eng.hmaBuffers = preHmaBuffers;
    this.eng.sarState = preSarState;
    this.eng.functionPersistentScopes = preFunctionPersistentScopes;
    this.eng.barColorData.length = preBarColorDataLen;
    if (this.eng.boxes.size > preBoxesSize) {
      for (const [id] of this.eng.boxes) {
        if (id >= preBoxesSize) {
          this.eng.boxes.delete(id);
        }
      }
    }
    this.eng.boxIdCounter = preBoxIdCounter;
    if (this.eng.strategyEngine && preStrategyState) {
      this.eng.strategyEngine.restoreState(preStrategyState);
    }

    const diffOutputs: Record<string, PineValue> = {};
    for (const [key, series] of this.eng.outputs) {
      const preSeries = preOutputs.get(key);
      if (preSeries && series.length > 0 && preSeries.length > 0) {
        const lastVal = series.last();
        const preLastVal = preSeries.last();
        if (lastVal !== preLastVal) {
          diffOutputs[key] = lastVal;
        }
        series.values.length = preSeries.length;
      } else if (series.length > 0 && (!preSeries || preSeries.length === 0)) {
        diffOutputs[key] = series.last();
        this.eng.outputs.delete(key);
      }
    }

    let diffShapes: ShapeEntry[] = [];
    if (this.eng.shapes.length > preShapesLen) {
      diffShapes = this.eng.shapes.slice(preShapesLen);
      this.eng.shapes.length = preShapesLen;
    }

    let diffFills: Array<{ from: string; to: string; color: string }> = [];
    if (this.eng.fills.length > preFillsLen) {
      diffFills = this.eng.fills.slice(preFillsLen);
      this.eng.fills.length = preFillsLen;
    }

    let diffLines: LineEntry[] = [];
    if (this.eng.lines.size > preLinesSize) {
      diffLines = [];
      for (const [id, entry] of this.eng.lines) {
        if (id >= preLinesSize) {
          diffLines.push({ ...entry });
          this.eng.lines.delete(id);
        }
      }
    }

    let diffLabels: LabelEntry[] = [];
    if (this.eng.labels.length > preLabelsLen) {
      diffLabels = this.eng.labels.slice(preLabelsLen);
      this.eng.labels.length = preLabelsLen;
    }

    let diffAlertTriggers: AlertTriggerEntry[] = [];
    if (this.eng.alertTriggers.length > preAlertTriggersLen) {
      diffAlertTriggers = this.eng.alertTriggers.slice(preAlertTriggersLen);
      this.eng.alertTriggers.length = preAlertTriggersLen;
    }

    const diffPlotColors: Record<string, (string | null)[]> = {};
    for (const [key, colors] of this.eng.plotColors) {
      const preColors = prePlotColors.get(key);
      if (!preColors || colors.length > preColors.length) {
        diffPlotColors[key] = colors.slice(preColors?.length ?? 0);
      }
    }

    const diffFillColorData: Record<string, (string | null)[]> = {};
    for (const [key, colors] of this.eng.fillColorData) {
      const preColors = preFillColorData.get(key);
      if (!preColors || colors.length > preColors.length) {
        diffFillColorData[key] = colors.slice(preColors?.length ?? 0);
      }
    }

    let diffBgcolor: Array<{ time: number; color: string }> = [];
    if (this.eng.bgcolorData.length > preBgcolorDataLen) {
      diffBgcolor = this.eng.bgcolorData.slice(preBgcolorDataLen);
    }

    this.eng.plotColors = prePlotColors;
    this.eng.fillColorData = preFillColorData;
    this.eng.bgcolorData.length = preBgcolorDataLen;

    const isDiff =
      Object.keys(diffOutputs).length > 0 ||
      diffShapes.length > 0 ||
      diffFills.length > 0 ||
      diffLines.length > 0 ||
      diffLabels.length > 0 ||
      diffAlertTriggers.length > 0;

    return {
      success: result.success,
      error: result.error,
      overlay: this.eng.compiledScript.overlay,
      diffOutputs,
      diffShapes,
      diffFills,
      diffLines,
      diffLabels,
      diffPlotColors: Object.keys(diffPlotColors).length > 0 ? diffPlotColors : undefined,
      diffFillColorData: Object.keys(diffFillColorData).length > 0 ? diffFillColorData : undefined,
      diffBgcolor: diffBgcolor.length > 0 ? diffBgcolor : undefined,
      diffAlertTriggers: diffAlertTriggers.length > 0 ? diffAlertTriggers : undefined,
      barTimestamps: [...this.eng.barTimestamps],
      barIndex: this.eng.barTimestamps.length - 1,
      isDiff,
      isConfirmed: !this.eng.isFormingCandle,
    };
  }

  private cloneOutputs(): Map<string, Series> {
    const cloned = new Map<string, Series>();
    for (const [name, series] of this.eng.outputs) {
      cloned.set(name, createSeries(name, series.values.slice()));
    }
    return cloned;
  }
}
