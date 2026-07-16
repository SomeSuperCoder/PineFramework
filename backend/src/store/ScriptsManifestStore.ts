import { JsonStore } from './JsonStore.js';
import { createHash } from 'node:crypto';

export interface FileScriptEntry {
  id: string;
  filename: string;
  name: string;
  scriptType: 'strategy' | 'indicator' | 'library';
  filePath: string;
  createdAt: number;
  updatedAt: number;
  checksum: string;
  [key: string]: unknown;
}

export interface ScriptsManifest {
  scripts: FileScriptEntry[];
  lastSyncAt: number;
  version: number;
  activeScriptId: string | null;
  [key: string]: unknown;
}

const DEFAULT_MANIFEST: ScriptsManifest = {
  scripts: [],
  lastSyncAt: 0,
  version: 1,
  activeScriptId: null,
};

function validateManifest(data: unknown): data is ScriptsManifest {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.scripts)) return false;
  if (typeof obj.lastSyncAt !== 'number') return false;
  if (typeof obj.version !== 'number') return false;
  if (obj.activeScriptId !== undefined && obj.activeScriptId !== null && typeof obj.activeScriptId !== 'string') return false;
  for (const entry of obj.scripts) {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string') return false;
    if (typeof e.filename !== 'string') return false;
    if (typeof e.name !== 'string') return false;
    if (e.scriptType !== 'strategy' && e.scriptType !== 'indicator' && e.scriptType !== 'library') return false;
    if (typeof e.filePath !== 'string') return false;
    if (typeof e.createdAt !== 'number') return false;
    if (typeof e.updatedAt !== 'number') return false;
    if (typeof e.checksum !== 'string') return false;
  }
  return true;
}

export function computeChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export class ScriptsManifestStore {
  private store: JsonStore<ScriptsManifest>;

  constructor(filePath: string) {
    this.store = new JsonStore<ScriptsManifest>(filePath, {
      defaultData: DEFAULT_MANIFEST,
      validate: validateManifest,
    });
  }

  getAll(): FileScriptEntry[] {
    return this.store.read().scripts;
  }

  getById(id: string): FileScriptEntry | undefined {
    return this.store.read().scripts.find((s) => s.id === id);
  }

  getByFilename(filename: string): FileScriptEntry | undefined {
    return this.store.read().scripts.find((s) => s.filename === filename);
  }

  add(entry: FileScriptEntry): FileScriptEntry {
    const data = this.store.read();
    const existing = data.scripts.find((s) => s.id === entry.id);
    if (existing) {
      throw new Error(`Script with id ${entry.id} already exists in manifest`);
    }

    data.scripts.push(entry);
    data.lastSyncAt = Date.now();
    this.store.write(data);
    return entry;
  }

  update(id: string, updates: Partial<Omit<FileScriptEntry, 'id'>>): FileScriptEntry | undefined {
    const data = this.store.read();
    const idx = data.scripts.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;

    const entry = data.scripts[idx];
    Object.assign(entry, updates);
    data.lastSyncAt = Date.now();
    this.store.write(data);
    return entry;
  }

  remove(id: string): boolean {
    const data = this.store.read();
    const idx = data.scripts.findIndex((s) => s.id === id);
    if (idx === -1) return false;

    data.scripts.splice(idx, 1);
    if (data.activeScriptId === id) {
      data.activeScriptId = null;
    }
    data.lastSyncAt = Date.now();
    this.store.write(data);
    return true;
  }

  removeByFilename(filename: string): boolean {
    const data = this.store.read();
    const idx = data.scripts.findIndex((s) => s.filename === filename);
    if (idx === -1) return false;

    const removed = data.scripts[idx];
    data.scripts.splice(idx, 1);
    if (data.activeScriptId === removed.id) {
      data.activeScriptId = null;
    }
    data.lastSyncAt = Date.now();
    this.store.write(data);
    return true;
  }

  getLastSyncAt(): number {
    return this.store.read().lastSyncAt;
  }

  updateLastSyncAt(): void {
    const data = this.store.read();
    data.lastSyncAt = Date.now();
    this.store.write(data);
  }

  getExistingFilenames(): Set<string> {
    const scripts = this.store.read().scripts;
    return new Set(scripts.map((s) => s.filename));
  }

  getActiveId(): string | null {
    return this.store.read().activeScriptId ?? null;
  }

  setActive(id: string): boolean {
    const data = this.store.read();
    const entry = data.scripts.find((s) => s.id === id);
    if (!entry) return false;
    data.activeScriptId = id;
    this.store.write(data);
    return true;
  }
}
