import type { PineType } from '../types/pine-types.js';
import type { PineValue } from '../types/na.js';
import { type Series, createSeries } from './series.js';

export interface VariableBinding {
  name: string;
  type: PineType;
  series: Series;
  isVar: boolean;
  isVarip: boolean;
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
): VariableBinding {
  const series = createSeries(name);
  const binding: VariableBinding = {
    name,
    type,
    series,
    isVar,
    isVarip,
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
      const lastValue = binding.series.last();
      binding.series.push(lastValue);
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
