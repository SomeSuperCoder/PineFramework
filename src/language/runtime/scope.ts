import type { PineType } from '../types/pine-types.js';
import type { PineValue } from '../types/na.js';
import { type Series, createSeries } from './series.js';

export interface VariableBinding {
  name: string;
  type: PineType;
  series: Series;
  isVar: boolean;
  isVarip: boolean;
  isConst: boolean;
}

export interface RuntimeScope {
  variables: Map<string, VariableBinding>;
  parent?: RuntimeScope;
}

export function createRuntimeScope(parent?: RuntimeScope): RuntimeScope {
  return {
    variables: new Map(),
    parent,
  };
}

export function declareVariable(
  scope: RuntimeScope,
  name: string,
  type: PineType,
  isVar: boolean = false,
  isVarip: boolean = false,
  isConst: boolean = false,
): VariableBinding {
  const series = createSeries(name);
  const binding: VariableBinding = {
    name,
    type,
    series,
    isVar,
    isVarip,
    isConst,
  };
  scope.variables.set(name, binding);
  return binding;
}

export function resolveVariable(scope: RuntimeScope, name: string): VariableBinding | undefined {
  let current: RuntimeScope | undefined = scope;
  while (current) {
    const binding = current.variables.get(name);
    if (binding) {
      return binding;
    }
    current = current.parent;
  }
  return undefined;
}

export function pushBarValues(scope: RuntimeScope): void {
  for (const binding of scope.variables.values()) {
    if (binding.isVar || binding.isVarip) {
      if (binding.series.length > 0) {
        const lastValue = binding.series.last();
        binding.series.push(lastValue);
      }
    }
  }
}

export function setVariableValue(scope: RuntimeScope, name: string, value: PineValue): void {
  const binding = resolveVariable(scope, name);
  if (!binding) {
    throw new Error(`Variable '${name}' is not defined`);
  }
  binding.series.push(value);
}

export function getVariableValue(scope: RuntimeScope, name: string, offset: number = 0): PineValue {
  const binding = resolveVariable(scope, name);
  if (!binding) {
    throw new Error(`Variable '${name}' is not defined`);
  }
  return binding.series.getRelative(offset);
}

export function cloneRuntimeScope(scope: RuntimeScope): RuntimeScope {
  const cloned = createRuntimeScope(scope.parent ? cloneRuntimeScope(scope.parent) : undefined);
  for (const [name, binding] of scope.variables) {
    cloned.variables.set(name, {
      ...binding,
      series: createSeries(binding.name, binding.series.values.slice()),
    });
  }
  return cloned;
}

// ============================================================================
// LENGTH-BASED STATE CHECKPOINTS (F3 perf fix)
//
// cloneRuntimeScope deep-copies every variable's full series history — O(bars)
// work per bar, i.e. quadratic over a run. Series arrays only ever GROW
// between two snapshots (setVariableValue/pushBarValues push; nothing shrinks),
// so a rollback can be expressed as "truncate each series back to its recorded
// length". That makes a checkpoint O(variables) regardless of history size.
// ============================================================================

/** One recorded variable: where its binding lives, which series, how long it was. */
interface ScopeCheckpointEntry {
  map: Map<string, VariableBinding>;
  name: string;
  series: Series;
  length: number;
}

export interface ScopeCheckpoint {
  /** The exact scope object this checkpoint was taken against. */
  scope: RuntimeScope;
  entries: ScopeCheckpointEntry[];
  parent?: ScopeCheckpoint;
}

/** Take an O(variables) checkpoint of a scope chain (no history copying). */
export function checkpointScope(scope: RuntimeScope): ScopeCheckpoint {
  const entries: ScopeCheckpointEntry[] = [];
  for (const [name, binding] of scope.variables) {
    entries.push({ map: scope.variables, name, series: binding.series, length: binding.series.values.length });
  }
  return {
    scope,
    entries,
    parent: scope.parent ? checkpointScope(scope.parent) : undefined,
  };
}

/**
 * Restore a scope chain to a checkpoint: truncate every recorded series back
 * to its checkpoint length and drop variables declared after the checkpoint.
 * Mutates the checkpoint's own scope objects so the caller can safely reassign
 * `globalScope` to `checkpoint.scope`, mirroring the old clone-and-reassign
 * rollback semantics.
 */
export function restoreScopeCheckpoint(checkpoint: ScopeCheckpoint): void {
  const known = new Set<string>();
  for (const entry of checkpoint.entries) {
    known.add(entry.name);
    // Grow-only invariant: a series can never be shorter than at checkpoint
    // time. A violation means the series object was swapped for a different
    // one after checkpointing — truncate would silently corrupt state.
    if (entry.series.values.length < entry.length) {
      throw new Error(
        `Checkpoint restore invariant violated: series '${entry.name}' has length ` +
          `${entry.series.values.length} but checkpoint recorded ${entry.length}`,
      );
    }
    // Only ever truncate: between checkpoint and restore the array can only
    // have grown (or still be exactly at `length` if nothing was pushed).
    if (entry.series.values.length > entry.length) {
      entry.series.values.length = entry.length;
    }
  }
  for (const name of [...checkpoint.scope.variables.keys()]) {
    if (!known.has(name)) {
      checkpoint.scope.variables.delete(name);
    }
  }
  if (checkpoint.parent) {
    restoreScopeCheckpoint(checkpoint.parent);
  }
}

/** One recorded named series in a series map (e.g. engine outputs). */
export interface SeriesMapCheckpointEntry {
  map: Map<string, Series>;
  name: string;
  series: Series;
  length: number;
}

export interface SeriesMapCheckpoint {
  map: Map<string, Series>;
  entries: SeriesMapCheckpointEntry[];
}

/** Take an O(entries) checkpoint of a named-series map (no value copying). */
export function checkpointSeriesMap(seriesMap: Map<string, Series>): SeriesMapCheckpoint {
  const entries: SeriesMapCheckpointEntry[] = [];
  for (const [name, series] of seriesMap) {
    entries.push({ map: seriesMap, name, series, length: series.values.length });
  }
  return { map: seriesMap, entries };
}

/** Restore a series map to a checkpoint: truncate values, drop new entries. */
export function restoreSeriesMapCheckpoint(checkpoint: SeriesMapCheckpoint): void {
  const known = new Set<string>();
  for (const entry of checkpoint.entries) {
    known.add(entry.name);
    if (entry.series.values.length > entry.length) {
      entry.series.values.length = entry.length;
    }
  }
  for (const name of [...checkpoint.map.keys()]) {
    if (!known.has(name)) {
      checkpoint.map.delete(name);
    }
  }
}
