import type { ExecutionEngine } from './execution-engine.js';
import { createSeries, type Series } from './series.js';
import { cloneRuntimeScope } from './scope.js';
import type { ExecutionSnapshot } from './execution-types.js';

export class StateManager {
  private eng: any;

  constructor(engine: ExecutionEngine) {
    this.eng = engine as any;
  }

  createSnapshot(): void {
    const snapshot: ExecutionSnapshot = {
      scope: cloneRuntimeScope(this.eng.globalScope),
      outputs: this.cloneOutputs(),
      shapes: [...this.eng.shapes],
      fills: [...this.eng.fills],
      lines: new Map(this.eng.lines),
      lineIdCounter: this.eng.lineIdCounter,
      labels: [...this.eng.labels],
      bgcolorData: [...this.eng.bgcolorData],
      barColorData: [...this.eng.barColorData],
      sarState: new Map([...this.eng.sarState].map(([k, v]) => [k, { ...v }])),
      barIndex: this.eng.metrics.totalBars,
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
    this.eng.globalScope = snapshot.scope;
    this.eng.outputs = snapshot.outputs;
    this.eng.shapes = snapshot.shapes;
    this.eng.fills = snapshot.fills;
    this.eng.lines = new Map(snapshot.lines);
    this.eng.lineIdCounter = snapshot.lineIdCounter;
    this.eng.labels = [...snapshot.labels];
    this.eng.bgcolorData = snapshot.bgcolorData;
    this.eng.barColorData = snapshot.barColorData;
    this.eng.sarState = new Map([...snapshot.sarState].map(([k, v]) => [k, { ...v }]));
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
