import type { ExecutionEngine } from './execution-engine.js';
import { createSeries, type Series } from './series.js';
import {
  checkpointScope,
  checkpointSeriesMap,
  restoreScopeCheckpoint,
  restoreSeriesMapCheckpoint,
} from './scope.js';
import type { ExecutionSnapshot } from './execution-types.js';

export class StateManager {
  private eng: ExecutionEngine;

  constructor(engine: ExecutionEngine) {
    this.eng = engine;
  }

  /**
   * F3 perf fix: O(variables) length-based checkpoint instead of a deep scope
   * clone. The old cloneRuntimeScope copied every variable's full series
   * history EVERY bar — O(bars²) over a run and the dominant cost on long
   * workloads (~44% CPU + GC pressure). Series only grow between snapshots,
   * so rollback is expressible as truncation; see scope.ts.
   */
  createSnapshot(): void {
    const snapshot: ExecutionSnapshot = {
      scopeCheckpoint: checkpointScope(this.eng.globalScope),
      outputCheckpoint: checkpointSeriesMap(this.eng.outputs),
      shapes: [...this.eng.shapes],
      fills: [...this.eng.fills],
      lines: new Map(this.eng.lines),
      lineIdCounter: this.eng.lineIdCounter,
      linefills: new Map(this.eng.linefills),
      linefillIdCounter: this.eng.linefillIdCounter,
      labels: [...this.eng.labels],
      bgcolorData: [...this.eng.bgcolorData],
      barColorData: [...this.eng.barColorData],
      sarState: new Map([...this.eng.sarState].map(([k, v]) => [k, { ...v }])),
      barIndex: this.eng.metrics.totalBars,
      plotColors: new Map(this.eng.plotColors),
      fillColorData: new Map(this.eng.fillColorData),
      hiddenPlotKeys: [...this.eng.hiddenPlotKeys],
      alertConditionEntries: [...this.eng.alertConditionEntries],
      alertTriggers: [...this.eng.alertTriggers],
      boxes: new Map(this.eng.boxes),
      tables:
        this.eng.tables.size > 0
          ? [...this.eng.tables.entries()].map(
              ([id, t]) => [id, { ...t, cells: { ...t.cells } }] as [number, typeof t],
            )
          : [],
      tableIdCounter: this.eng.tableIdCounter,
      barTimestamps: [...this.eng.barTimestamps],
      ohlcHistory: {
        open: [...this.eng.ohlcHistory.open],
        high: [...this.eng.ohlcHistory.high],
        low: [...this.eng.ohlcHistory.low],
        close: [...this.eng.ohlcHistory.close],
        volume: [...this.eng.ohlcHistory.volume],
      },
    };
    this.eng.snapshots.push(snapshot);
    if (this.eng.snapshots.length > this.eng.maxSnapshots) {
      this.eng.snapshots.shift();
    }
  }

  rollbackToSnapshot(index: number = -1): boolean {
    if (this.eng.snapshots.length === 0) {
      return false;
    }
    const snapshotIndex = index < 0 ? this.eng.snapshots.length + index : index;
    if (snapshotIndex < 0 || snapshotIndex >= this.eng.snapshots.length) {
      return false;
    }
    const snapshot = this.eng.snapshots[snapshotIndex]!;
    // Restore into the checkpoint's own scope/output objects, then reassign —
    // mirrors the old clone-and-reassign rollback semantics exactly (including
    // forming-candle's post-checkpoint globalScope replacement).
    restoreScopeCheckpoint(snapshot.scopeCheckpoint);
    restoreSeriesMapCheckpoint(snapshot.outputCheckpoint);
    this.eng.globalScope = snapshot.scopeCheckpoint.scope;
    this.eng.outputs = snapshot.outputCheckpoint.map;
    this.eng.shapes = snapshot.shapes;
    this.eng.fills = snapshot.fills;
    this.eng.lines = new Map(snapshot.lines);
    this.eng.lineIdCounter = snapshot.lineIdCounter;
    this.eng.linefills = new Map(snapshot.linefills);
    this.eng.linefillIdCounter = snapshot.linefillIdCounter;
    this.eng.labels = [...snapshot.labels];
    this.eng.bgcolorData = snapshot.bgcolorData;
    this.eng.barColorData = snapshot.barColorData;
    this.eng.sarState = new Map([...snapshot.sarState].map(([k, v]) => [k, { ...v }]));
    if (snapshot.plotColors) this.eng.plotColors = new Map(snapshot.plotColors);
    if (snapshot.fillColorData) this.eng.fillColorData = new Map(snapshot.fillColorData);
    if (snapshot.hiddenPlotKeys) this.eng.hiddenPlotKeys = new Set(snapshot.hiddenPlotKeys);
    if (snapshot.alertConditionEntries)
      this.eng.alertConditionEntries = [...snapshot.alertConditionEntries];
    if (snapshot.alertTriggers) this.eng.alertTriggers = [...snapshot.alertTriggers];
    if (snapshot.boxes) this.eng.boxes = new Map(snapshot.boxes);
    if (snapshot.tables) {
      this.eng.tables = new Map(
        snapshot.tables.map(([id, t]) => [id, { ...t, cells: { ...t.cells } }]),
      );
    }
    if (snapshot.tableIdCounter !== undefined) this.eng.tableIdCounter = snapshot.tableIdCounter;
    if (snapshot.barTimestamps) this.eng.barTimestamps = [...snapshot.barTimestamps];
    if (snapshot.ohlcHistory) {
      this.eng.ohlcHistory = {
        open: [...snapshot.ohlcHistory.open],
        high: [...snapshot.ohlcHistory.high],
        low: [...snapshot.ohlcHistory.low],
        close: [...snapshot.ohlcHistory.close],
        volume: [...snapshot.ohlcHistory.volume],
      };
    }
    this.eng.snapshots = this.eng.snapshots.slice(0, snapshotIndex);
    return true;
  }

  rollbackToPreviousBar(): boolean {
    if (this.eng.metrics.totalBars <= 0) {
      return false;
    }
    return this.rollbackToSnapshot(-1);
  }

  cloneOutputs(): Map<string, Series> {
    const cloned = new Map<string, Series>();
    for (const [name, series] of this.eng.outputs) {
      cloned.set(name, createSeries(name, series.values.slice()));
    }
    return cloned;
  }
}
