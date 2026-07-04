import { JsonStore } from './JsonStore.js';
import { randomUUID } from 'node:crypto';

export interface RunningIndicator {
  id: string;
  scriptId: string;
  name: string;
  overlay: boolean;
  source: string;
  addedAt: number;
}

export interface RunningIndicatorsData {
  indicators: RunningIndicator[];
  [key: string]: unknown;
}

const DEFAULT_DATA: RunningIndicatorsData = {
  indicators: [],
};

function validate(data: unknown): data is RunningIndicatorsData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.indicators)) return false;
  for (const ind of obj.indicators) {
    if (!ind || typeof ind !== 'object') return false;
    const i = ind as Record<string, unknown>;
    if (typeof i.id !== 'string') return false;
    if (typeof i.scriptId !== 'string') return false;
    if (typeof i.name !== 'string') return false;
    if (typeof i.overlay !== 'boolean') return false;
    if (typeof i.source !== 'string') return false;
    if (typeof i.addedAt !== 'number') return false;
  }
  return true;
}

export class RunningIndicatorsStore {
  private store: JsonStore<RunningIndicatorsData>;

  constructor(filePath: string) {
    this.store = new JsonStore<RunningIndicatorsData>(filePath, {
      defaultData: DEFAULT_DATA,
      validate,
    });
  }

  getAll(): RunningIndicator[] {
    return this.store.read().indicators;
  }

  getById(id: string): RunningIndicator | undefined {
    return this.store.read().indicators.find((i) => i.id === id);
  }

  getByScriptId(scriptId: string): RunningIndicator | undefined {
    return this.store.read().indicators.find((i) => i.scriptId === scriptId);
  }

  add(scriptId: string, name: string, overlay: boolean, source: string): RunningIndicator {
    const existing = this.getByScriptId(scriptId);
    if (existing) return existing;

    const indicator: RunningIndicator = {
      id: randomUUID(),
      scriptId,
      name,
      overlay,
      source,
      addedAt: Date.now(),
    };
    const data = this.store.read();
    data.indicators.push(indicator);
    this.store.write(data);
    return indicator;
  }

  remove(id: string): boolean {
    const data = this.store.read();
    const idx = data.indicators.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    data.indicators.splice(idx, 1);
    this.store.write(data);
    return true;
  }

  removeByScriptId(scriptId: string): RunningIndicator[] {
    const data = this.store.read();
    const removed: RunningIndicator[] = [];
    data.indicators = data.indicators.filter((i) => {
      if (i.scriptId === scriptId) {
        removed.push(i);
        return false;
      }
      return true;
    });
    if (removed.length > 0) {
      this.store.write(data);
    }
    return removed;
  }

  updateOverlay(id: string, overlay: boolean): boolean {
    const data = this.store.read();
    const indicator = data.indicators.find((i) => i.id === id);
    if (!indicator) return false;
    indicator.overlay = overlay;
    this.store.write(data);
    return true;
  }
}
