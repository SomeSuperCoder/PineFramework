import type { PineValue } from '../language/types/na.js';

export type PluginType = 'function' | 'type' | 'renderer' | 'datasource';

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  dependencies?: string[];
  minEngineVersion?: string;
}

export interface PluginInterface {
  metadata: PluginMetadata;
  type: PluginType;
  activate(): void | Promise<void>;
  deactivate(): void | Promise<void>;
  isCompatible(engineVersion: string): boolean;
}

export interface FunctionPlugin extends PluginInterface {
  type: 'function';
  namespace: string;
  name: string;
  signature: FunctionSignature;
  implementation: FunctionImplementation;
}

export interface FunctionSignature {
  params: ParameterDef[];
  returnType: string;
  description: string;
}

export interface ParameterDef {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: PineValue;
  description: string;
}

export type FunctionImplementation = (...args: PineValue[]) => PineValue;

export interface TypePlugin extends PluginInterface {
  type: 'type';
  typeName: string;
  typeDefinition: TypeDefinition;
  operations: TypeOperations;
}

export interface TypeDefinition {
  name: string;
  fields: FieldDef[];
  description: string;
}

export interface FieldDef {
  name: string;
  type: string;
  optional: boolean;
  description: string;
}

export interface TypeOperations {
  create?: (...args: PineValue[]) => PineValue;
  toString?: (value: PineValue) => string;
  toNumber?: (value: PineValue) => number;
  equals?: (a: PineValue, b: PineValue) => boolean;
  add?: (a: PineValue, b: PineValue) => PineValue;
  subtract?: (a: PineValue, b: PineValue) => PineValue;
  multiply?: (a: PineValue, b: PineValue) => PineValue;
  divide?: (a: PineValue, b: PineValue) => PineValue;
}

export interface RendererPlugin extends PluginInterface {
  type: 'renderer';
  renderType: string;
  renderFunction: RenderFunction;
}

export type RenderFunction = (data: PineValue[], options: Record<string, PineValue>) => PineValue;

export interface DataSourcePlugin extends PluginInterface {
  type: 'datasource';
  sourceType: string;
  fetch: DataSourceFetch;
  subscribe?: DataSourceSubscribe;
  unsubscribe?: DataSourceUnsubscribe;
}

export type DataSourceFetch = (
  symbol: string,
  timeframe: string,
  start: number,
  end: number,
) => Promise<PineValue[]>;

export type DataSourceSubscribe = (
  symbol: string,
  timeframe: string,
  callback: (data: PineValue) => void,
) => void;

export type DataSourceUnsubscribe = (symbol: string, timeframe: string) => void;

export type Plugin = FunctionPlugin | TypePlugin | RendererPlugin | DataSourcePlugin;
