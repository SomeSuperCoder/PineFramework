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
  private eng: ExecutionEngine;

  constructor(engine: ExecutionEngine) {
    this.eng = engine;
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
    const preSmaBuffers = this.eng.smaBuffers.size > 0
      ? new Map([...this.eng.smaBuffers].map(([k, v]) => [k, v instanceof RingBuffer ? v.toArray() : [...v]]))
      : undefined;
    const preEmaState = this.eng.emaState.size > 0
      ? new Map([...this.eng.emaState].map(([k, v]) => [k, { ...v }]))
      : undefined;
    const preCrossPrevValues = this.eng.crossPrevValues.size > 0
      ? new Map(this.eng.crossPrevValues)
      : undefined;
    const preChangePrevValues = this.eng.changePrevValues.size > 0
      ? new Map(this.eng.changePrevValues)
      : undefined;
    const preHighestBuffers = this.eng.highestBuffers.size > 0
      ? new Map([...this.eng.highestBuffers].map(([k, v]) => [k, [...v]]))
      : undefined;
    const preLowestBuffers = this.eng.lowestBuffers.size > 0
      ? new Map([...this.eng.lowestBuffers].map(([k, v]) => [k, [...v]]))
      : undefined;
    const prePlotColors = this.eng.plotColors.size > 0
      ? new Map([...this.eng.plotColors].map(([k, v]) => [k, [...v]]))
      : undefined;
    const preFillColorData = this.eng.fillColorData.size > 0
      ? new Map([...this.eng.fillColorData].map(([k, v]) => [k, [...v]]))
      : undefined;
    const preBgcolorDataLen = this.eng.bgcolorData.length;
    const preRsiState = this.eng.rsiState.size > 0
      ? new Map([...this.eng.rsiState].map(([k, v]) => [k, { ...v }]))
      : undefined;
    const preAtrState = this.eng.atrState.size > 0
      ? new Map([...this.eng.atrState].map(([k, v]) => [k, { ...v, values: [...v.values] }]))
      : undefined;
    const preHmaBuffers = this.eng.hmaBuffers.size > 0
      ? new Map([...this.eng.hmaBuffers].map(([k, v]) => [
          k,
          { half: [...v.half], full: [...v.full], diff: [...v.diff] },
        ]))
      : undefined;
    const preSarState = this.eng.sarState.size > 0
      ? new Map([...this.eng.sarState].map(([k, v]) => [k, { ...v }]))
      : undefined;
    const preFunctionPersistentScopes = this.eng.functionPersistentScopes.size > 0
      ? new Map([...this.eng.functionPersistentScopes].map(([k, v]) => [k, cloneRuntimeScope(v)]))
      : undefined;
    const preBarColorDataLen = this.eng.barColorData.length;
    const preBoxesSize = this.eng.boxes.size;
    const preBoxIdCounter = this.eng.boxIdCounter;
    const preStrategyState = this.eng.strategyEngine ? this.eng.strategyEngine.saveState() : null;

    // Save pre-tick global scope variable series lengths so we can restore them
    // after cloneRuntimeScope. Each forming-candle tick adds entries to every
    // variable's series (via = assignment in executeBar → setVariableValue).
    // Without restoration, these phantom entries accumulate across N ticks,
    // causing historical references like trend[1] to read from the wrong offset
    // when the next confirmed bar is executed.
    const preVarLengths = new Map<string, number>();
    for (const [name, binding] of this.eng.globalScope.variables) {
      preVarLengths.set(name, binding.series.length);
    }

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
    // Restore global scope variable series lengths to pre-tick state,
    // removing the phantom entries added during the tick.
    for (const [name, binding] of this.eng.globalScope.variables) {
      const preLen = preVarLengths.get(name);
      if (preLen !== undefined && binding.series.length > preLen) {
        binding.series.values.length = preLen;
      }
    }
    if (preSmaBuffers) {
      this.eng.smaBuffers = new Map();
      for (const [key, arr] of preSmaBuffers) {
        const parts = key.split('_');
        const capacity = parseInt(parts[1], 10);
        this.eng.smaBuffers.set(key, RingBuffer.fromArray(arr, capacity));
      }
    } else {
      this.eng.smaBuffers.clear();
    }
    restoreMap(this.eng.emaState, preEmaState);
    restoreMap(this.eng.crossPrevValues, preCrossPrevValues);
    restoreMap(this.eng.changePrevValues, preChangePrevValues);
    restoreMap(this.eng.highestBuffers, preHighestBuffers);
    restoreMap(this.eng.lowestBuffers, preLowestBuffers);
    restoreMap(this.eng.rsiState, preRsiState);
    restoreMap(this.eng.atrState, preAtrState);
    restoreMap(this.eng.hmaBuffers, preHmaBuffers);
    restoreMap(this.eng.sarState, preSarState);
    restoreMap(this.eng.functionPersistentScopes, preFunctionPersistentScopes);
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

    if (prePlotColors) {
      this.eng.plotColors = prePlotColors;
    } else {
      this.eng.plotColors.clear();
    }
    if (preFillColorData) {
      this.eng.fillColorData = preFillColorData;
    } else {
      this.eng.fillColorData.clear();
    }
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

/**
 * Restore a Map-typed buffer from a pre-execution snapshot.
 * If snapshot is undefined, clear the buffer (it was empty before execution,
 * so any entries added speculatively must be removed).
 */
function restoreMap<T>(target: Map<string, T>, snapshot: Map<string, T> | undefined): void {
  if (snapshot) {
    target.clear();
    for (const [k, v] of snapshot) {
      target.set(k, v);
    }
  } else {
    target.clear();
  }
}
