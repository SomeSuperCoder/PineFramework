export interface ConfigSection {
  name: string;
  values: Map<string, unknown>;
}

export interface ConfigChangeListener {
  (section: string, key: string, value: unknown): void;
}

export class ConfigManager {
  private sections: Map<string, ConfigSection>;
  private listeners: ConfigChangeListener[];
  private templates: Map<string, Record<string, unknown>>;

  constructor() {
    this.sections = new Map();
    this.listeners = [];
    this.templates = new Map();
  }

  get<T>(section: string, key: string, defaultValue: T): T {
    const sec = this.sections.get(section);
    if (!sec) return defaultValue;

    const value = sec.values.get(key);
    if (value === undefined) return defaultValue;

    return value as T;
  }

  set(section: string, key: string, value: unknown): void {
    if (!this.sections.has(section)) {
      this.sections.set(section, { name: section, values: new Map() });
    }

    const sec = this.sections.get(section)!;
    sec.values.set(key, value);

    this.notifyListeners(section, key, value);
  }

  has(section: string, key: string): boolean {
    const sec = this.sections.get(section);
    if (!sec) return false;
    return sec.values.has(key);
  }

  delete(section: string, key: string): boolean {
    const sec = this.sections.get(section);
    if (!sec) return false;

    const deleted = sec.values.delete(key);
    if (deleted) {
      this.notifyListeners(section, key, undefined);
    }
    return deleted;
  }

  getSection(section: string): ConfigSection | undefined {
    return this.sections.get(section);
  }

  getSectionNames(): string[] {
    return Array.from(this.sections.keys());
  }

  getKeys(section: string): string[] {
    const sec = this.sections.get(section);
    if (!sec) return [];
    return Array.from(sec.values.keys());
  }

  getAll(section: string): Record<string, unknown> {
    const sec = this.sections.get(section);
    if (!sec) return {};

    const result: Record<string, unknown> = {};
    for (const [key, value] of sec.values) {
      result[key] = value;
    }
    return result;
  }

  setMultiple(values: Record<string, Record<string, unknown>>): void {
    for (const [section, sectionValues] of Object.entries(values)) {
      for (const [key, value] of Object.entries(sectionValues)) {
        this.set(section, key, value);
      }
    }
  }

  clear(section?: string): void {
    if (section) {
      this.sections.delete(section);
    } else {
      this.sections.clear();
    }
  }

  onChange(listener: ConfigChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(section: string, key: string, value: unknown): void {
    for (const listener of this.listeners) {
      listener(section, key, value);
    }
  }

  registerTemplate(name: string, template: Record<string, unknown>): void {
    this.templates.set(name, template);
  }

  applyTemplate(name: string): boolean {
    const template = this.templates.get(name);
    if (!template) return false;

    for (const [key, value] of Object.entries(template)) {
      const section = key.includes('.') ? key.split('.')[0]! : 'default';
      const configKey = key.includes('.') ? key.split('.').slice(1).join('.') : key;
      this.set(section, configKey, value);
    }

    return true;
  }

  getTemplateNames(): string[] {
    return Array.from(this.templates.keys());
  }

  toJSON(): string {
    const data: Record<string, Record<string, unknown>> = {};
    for (const [section, sec] of this.sections) {
      data[section] = {};
      for (const [key, value] of sec.values) {
        data[section]![key] = value;
      }
    }
    return JSON.stringify(data, null, 2);
  }

  fromJSON(json: string): boolean {
    try {
      const data = JSON.parse(json) as Record<string, Record<string, unknown>>;
      this.clear();

      for (const [section, values] of Object.entries(data)) {
        for (const [key, value] of Object.entries(values)) {
          this.set(section, key, value);
        }
      }

      return true;
    } catch {
      return false;
    }
  }
}
