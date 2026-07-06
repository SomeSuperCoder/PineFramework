import { JsonStore } from './JsonStore.js';
import { randomUUID } from 'node:crypto';

export interface ScriptEntry {
  id: string;
  name: string;
  source: string;
  scriptType: 'strategy' | 'indicator';
  createdAt: number;
  updatedAt: number;
}

export interface ScriptBankData {
  scripts: ScriptEntry[];
  activeScriptId: string | null;
  [key: string]: unknown;
}

const DEFAULT_SCRIPT_BANK_DATA: ScriptBankData = {
  scripts: [],
  activeScriptId: null,
};

function detectScriptType(source: string): 'strategy' | 'indicator' {
  const strategyPattern = /\bstrategy\s*\(/;
  return strategyPattern.test(source) ? 'strategy' : 'indicator';
}

function validateScriptBankData(data: unknown): data is ScriptBankData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.scripts)) return false;
  if (obj.activeScriptId !== null && typeof obj.activeScriptId !== 'string') return false;
  for (const script of obj.scripts) {
    if (!script || typeof script !== 'object') return false;
    const s = script as Record<string, unknown>;
    if (typeof s.id !== 'string') return false;
    if (typeof s.name !== 'string' || s.name.trim() === '') return false;
    if (typeof s.source !== 'string') return false;
    if (s.scriptType !== 'strategy' && s.scriptType !== 'indicator') return false;
    if (typeof s.createdAt !== 'number') return false;
    if (typeof s.updatedAt !== 'number') return false;
  }
  return true;
}

export class ScriptStore {
  private store: JsonStore<ScriptBankData>;

  constructor(filePath: string) {
    this.store = new JsonStore<ScriptBankData>(filePath, {
      defaultData: DEFAULT_SCRIPT_BANK_DATA,
      validate: validateScriptBankData,
    });
  }

  getAll(): ScriptEntry[] {
    return this.store.read().scripts;
  }

  getById(id: string): ScriptEntry | undefined {
    return this.store.read().scripts.find((s) => s.id === id);
  }

  getActive(): ScriptEntry | undefined {
    const data = this.store.read();
    if (!data.activeScriptId) return undefined;
    return data.scripts.find((s) => s.id === data.activeScriptId);
  }

  getActiveId(): string | null {
    return this.store.read().activeScriptId;
  }

  setActive(id: string): ScriptEntry | undefined {
    const data = this.store.read();
    const script = data.scripts.find((s) => s.id === id);
    if (!script) return undefined;
    data.activeScriptId = id;
    this.store.write(data);
    return script;
  }

  create(name: string, source: string, id?: string): ScriptEntry {
    const now = Date.now();
    const script: ScriptEntry = {
      id: id || randomUUID(),
      name: name.trim(),
      source,
      scriptType: detectScriptType(source),
      createdAt: now,
      updatedAt: now,
    };
    const data = this.store.read();
    data.scripts.push(script);
    this.store.write(data);
    return script;
  }

  update(id: string, updates: Partial<Pick<ScriptEntry, 'name' | 'source'>>): ScriptEntry | undefined {
    const data = this.store.read();
    const idx = data.scripts.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    const script = data.scripts[idx];
    if (updates.name !== undefined) script.name = updates.name.trim();
    if (updates.source !== undefined) {
      script.source = updates.source;
      script.scriptType = detectScriptType(updates.source);
    }
    script.updatedAt = Date.now();
    this.store.write(data);
    return script;
  }

  delete(id: string): boolean {
    const data = this.store.read();
    const idx = data.scripts.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    data.scripts.splice(idx, 1);
    if (data.activeScriptId === id) {
      data.activeScriptId = null;
    }
    this.store.write(data);
    return true;
  }

  search(query: string): ScriptEntry[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getAll();
    return this.store.read().scripts.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q) ||
        s.scriptType.toLowerCase().includes(q)
    );
  }
}
