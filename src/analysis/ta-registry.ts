import { NA, type PineValue } from '../language/types/na.js';

export type TAFunction = (...args: number[]) => PineValue;

export interface TAFunctionInfo {
  name: string;
  namespace: string;
  minArgs: number;
  maxArgs: number;
  implementation: TAFunction;
  description: string;
}

export class TARegistry {
  private functions: Map<string, TAFunctionInfo>;

  constructor() {
    this.functions = new Map();
  }

  register(info: TAFunctionInfo): void {
    const key = `${info.namespace}.${info.name}`;
    this.functions.set(key, info);
  }

  get(namespace: string, name: string): TAFunctionInfo | undefined {
    return this.functions.get(`${namespace}.${name}`);
  }

  has(namespace: string, name: string): boolean {
    return this.functions.has(`${namespace}.${name}`);
  }

  call(namespace: string, name: string, args: number[]): number {
    const info = this.get(namespace, name);
    if (!info) {
      throw new Error(`TA function not found: ${namespace}.${name}`);
    }

    if (args.length < info.minArgs) {
      throw new Error(
        `${namespace}.${name} requires at least ${info.minArgs} arguments, got ${args.length}`,
      );
    }

    if (info.maxArgs !== -1 && args.length > info.maxArgs) {
      throw new Error(
        `${namespace}.${name} accepts at most ${info.maxArgs} arguments, got ${args.length}`,
      );
    }

    return info.implementation(...args);
  }

  getFunctionsByNamespace(namespace: string): TAFunctionInfo[] {
    const result: TAFunctionInfo[] = [];
    for (const info of this.functions.values()) {
      if (info.namespace === namespace) {
        result.push(info);
      }
    }
    return result;
  }

  getAllFunctions(): TAFunctionInfo[] {
    return Array.from(this.functions.values());
  }

  getFunctionNames(): string[] {
    return Array.from(this.functions.keys());
  }
}
