export type InputType =
  | 'int'
  | 'float'
  | 'bool'
  | 'string'
  | 'color'
  | 'symbol'
  | 'timeframe'
  | 'source'
  | 'session';

export interface InputDefinition {
  name: string;
  type: InputType;
  title: string;
  defaultValue: InputValue;
  group?: string;
  tooltip?: string;
  confirm?: boolean;
}

export interface IntInputDefinition extends InputDefinition {
  type: 'int';
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface FloatInputDefinition extends InputDefinition {
  type: 'float';
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface BoolInputDefinition extends InputDefinition {
  type: 'bool';
  defaultValue: boolean;
}

export interface StringInputDefinition extends InputDefinition {
  type: 'string';
  defaultValue: string;
  options?: string[];
}

export interface ColorInputDefinition extends InputDefinition {
  type: 'color';
  defaultValue: string;
}

export interface SymbolInputDefinition extends InputDefinition {
  type: 'symbol';
  defaultValue: string;
}

export interface TimeframeInputDefinition extends InputDefinition {
  type: 'timeframe';
  defaultValue: string;
}

export interface SourceInputDefinition extends InputDefinition {
  type: 'source';
  defaultValue: string;
}

export interface SessionInputDefinition extends InputDefinition {
  type: 'session';
  defaultValue: string;
}

export type AnyInputDefinition =
  | IntInputDefinition
  | FloatInputDefinition
  | BoolInputDefinition
  | StringInputDefinition
  | ColorInputDefinition
  | SymbolInputDefinition
  | TimeframeInputDefinition
  | SourceInputDefinition
  | SessionInputDefinition;

export type InputValue = number | boolean | string;

export interface InputState {
  values: Map<string, InputValue>;
  definitions: Map<string, AnyInputDefinition>;
}

export class InputSystem {
  private state: InputState;
  private listeners: Map<string, ((value: InputValue) => void)[]>;

  constructor() {
    this.state = {
      values: new Map(),
      definitions: new Map(),
    };
    this.listeners = new Map();
  }

  inputInt(
    title: string,
    defaultValue: number,
    options: Partial<Omit<IntInputDefinition, 'name' | 'type' | 'title' | 'defaultValue'>> = {},
  ): number {
    const name = this.generateName(title);
    const definition: IntInputDefinition = {
      name,
      type: 'int',
      title,
      defaultValue,
      ...options,
    };

    this.registerInput(definition);
    return this.getValue(name) as number;
  }

  inputFloat(
    title: string,
    defaultValue: number,
    options: Partial<Omit<FloatInputDefinition, 'name' | 'type' | 'title' | 'defaultValue'>> = {},
  ): number {
    const name = this.generateName(title);
    const definition: FloatInputDefinition = {
      name,
      type: 'float',
      title,
      defaultValue,
      ...options,
    };

    this.registerInput(definition);
    return this.getValue(name) as number;
  }

  inputBool(
    title: string,
    defaultValue: boolean,
    options: Partial<Omit<BoolInputDefinition, 'name' | 'type' | 'title' | 'defaultValue'>> = {},
  ): boolean {
    const name = this.generateName(title);
    const definition: BoolInputDefinition = {
      name,
      type: 'bool',
      title,
      defaultValue,
      ...options,
    };

    this.registerInput(definition);
    return this.getValue(name) as boolean;
  }

  inputString(
    title: string,
    defaultValue: string,
    options: Partial<Omit<StringInputDefinition, 'name' | 'type' | 'title' | 'defaultValue'>> = {},
  ): string {
    const name = this.generateName(title);
    const definition: StringInputDefinition = {
      name,
      type: 'string',
      title,
      defaultValue,
      ...options,
    };

    this.registerInput(definition);
    return this.getValue(name) as string;
  }

  inputColor(
    title: string,
    defaultValue: string,
    options: Partial<Omit<ColorInputDefinition, 'name' | 'type' | 'title' | 'defaultValue'>> = {},
  ): string {
    const name = this.generateName(title);
    const definition: ColorInputDefinition = {
      name,
      type: 'color',
      title,
      defaultValue,
      ...options,
    };

    this.registerInput(definition);
    return this.getValue(name) as string;
  }

  inputSymbol(
    title: string,
    defaultValue: string,
    options: Partial<Omit<SymbolInputDefinition, 'name' | 'type' | 'title' | 'defaultValue'>> = {},
  ): string {
    const name = this.generateName(title);
    const definition: SymbolInputDefinition = {
      name,
      type: 'symbol',
      title,
      defaultValue,
      ...options,
    };

    this.registerInput(definition);
    return this.getValue(name) as string;
  }

  inputTimeframe(
    title: string,
    defaultValue: string,
    options: Partial<
      Omit<TimeframeInputDefinition, 'name' | 'type' | 'title' | 'defaultValue'>
    > = {},
  ): string {
    const name = this.generateName(title);
    const definition: TimeframeInputDefinition = {
      name,
      type: 'timeframe',
      title,
      defaultValue,
      ...options,
    };

    this.registerInput(definition);
    return this.getValue(name) as string;
  }

  inputSource(
    title: string,
    defaultValue: string,
    options: Partial<Omit<SourceInputDefinition, 'name' | 'type' | 'title' | 'defaultValue'>> = {},
  ): string {
    const name = this.generateName(title);
    const definition: SourceInputDefinition = {
      name,
      type: 'source',
      title,
      defaultValue,
      ...options,
    };

    this.registerInput(definition);
    return this.getValue(name) as string;
  }

  inputSession(
    title: string,
    defaultValue: string,
    options: Partial<Omit<SessionInputDefinition, 'name' | 'type' | 'title' | 'defaultValue'>> = {},
  ): string {
    const name = this.generateName(title);
    const definition: SessionInputDefinition = {
      name,
      type: 'session',
      title,
      defaultValue,
      ...options,
    };

    this.registerInput(definition);
    return this.getValue(name) as string;
  }

  private generateName(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private registerInput(definition: AnyInputDefinition): void {
    if (!this.state.definitions.has(definition.name)) {
      this.state.definitions.set(definition.name, definition);
      if (!this.state.values.has(definition.name)) {
        this.state.values.set(definition.name, definition.defaultValue);
      }
    }
  }

  getValue(name: string): InputValue {
    const value = this.state.values.get(name);
    if (value !== undefined) {
      return value;
    }

    const definition = this.state.definitions.get(name);
    if (definition) {
      return definition.defaultValue;
    }

    return '';
  }

  setValue(name: string, value: InputValue): boolean {
    const definition = this.state.definitions.get(name);
    if (!definition) {
      return false;
    }

    if (!this.validateValue(definition, value)) {
      return false;
    }

    this.state.values.set(name, value);
    this.notifyListeners(name, value);
    return true;
  }

  private validateValue(definition: AnyInputDefinition, value: InputValue): boolean {
    switch (definition.type) {
      case 'int': {
        if (typeof value !== 'number' || !Number.isInteger(value)) return false;
        const def = definition as IntInputDefinition;
        if (def.min !== undefined && value < def.min) return false;
        if (def.max !== undefined && value > def.max) return false;
        return true;
      }
      case 'float': {
        if (typeof value !== 'number' || !Number.isFinite(value)) return false;
        const def = definition as FloatInputDefinition;
        if (def.min !== undefined && value < def.min) return false;
        if (def.max !== undefined && value > def.max) return false;
        return true;
      }
      case 'bool':
        return typeof value === 'boolean';
      case 'string': {
        if (typeof value !== 'string') return false;
        const def = definition as StringInputDefinition;
        if (def.options && def.options.length > 0 && !def.options.includes(value)) return false;
        return true;
      }
      case 'color':
        return typeof value === 'string';
      case 'symbol':
        return typeof value === 'string';
      case 'timeframe':
        return typeof value === 'string';
      case 'source':
        return typeof value === 'string';
      case 'session':
        return typeof value === 'string';
      default:
        return false;
    }
  }

  onChange(name: string, callback: (value: InputValue) => void): void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, []);
    }
    this.listeners.get(name)!.push(callback);
  }

  private notifyListeners(name: string, value: InputValue): void {
    const callbacks = this.listeners.get(name);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(value);
      }
    }
  }

  getDefinition(name: string): AnyInputDefinition | undefined {
    return this.state.definitions.get(name);
  }

  getAllDefinitions(): AnyInputDefinition[] {
    return Array.from(this.state.definitions.values());
  }

  getDefinitionsByGroup(group: string): AnyInputDefinition[] {
    return this.getAllDefinitions().filter((def) => def.group === group);
  }

  getGroups(): string[] {
    const groups = new Set<string>();
    for (const def of this.getAllDefinitions()) {
      if (def.group) {
        groups.add(def.group);
      }
    }
    return Array.from(groups);
  }

  getAllValues(): Map<string, InputValue> {
    return new Map(this.state.values);
  }

  setValues(values: Map<string, InputValue>): void {
    for (const [name, value] of values) {
      this.setValue(name, value);
    }
  }

  clear(): void {
    this.state.values.clear();
    this.state.definitions.clear();
    this.listeners.clear();
  }
}
