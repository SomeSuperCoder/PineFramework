import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ScriptsManifestStore, computeChecksum } from './ScriptsManifestStore.js';
import { sanitizeFilename, uniqueFilename } from '../utils/filename.js';

export interface ScriptEntry {
  id: string;
  name: string;
  source: string;
  scriptType: 'strategy' | 'indicator';
  createdAt: number;
  updatedAt: number;
}

function detectScriptType(source: string): 'strategy' | 'indicator' {
  return /\bstrategy\s*\(/.test(source) ? 'strategy' : 'indicator';
}

export class ScriptFileManager {
  private scriptsDir: string;
  private manifest: ScriptsManifestStore;

  constructor(scriptsDir: string, manifest: ScriptsManifestStore) {
    this.scriptsDir = scriptsDir;
    this.manifest = manifest;
  }

  async getAll(): Promise<ScriptEntry[]> {
    const entries = this.manifest.getAll();
    const results: ScriptEntry[] = [];
    for (const entry of entries) {
      try {
        const source = await readFile(join(this.scriptsDir, entry.filePath), 'utf-8');
        results.push({
          id: entry.id,
          name: entry.name,
          source,
          scriptType: entry.scriptType as 'strategy' | 'indicator',
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        });
      } catch {
        // Skip files that can't be read
      }
    }
    return results;
  }

  async getById(id: string): Promise<ScriptEntry | undefined> {
    const entry = this.manifest.getById(id);
    if (!entry) return undefined;
    try {
      const source = await readFile(join(this.scriptsDir, entry.filePath), 'utf-8');
      return {
        id: entry.id,
        name: entry.name,
        source,
        scriptType: entry.scriptType as 'strategy' | 'indicator',
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      };
    } catch {
      return undefined;
    }
  }

  getActiveId(): string | null {
    return this.manifest.getActiveId();
  }

  async getActive(): Promise<ScriptEntry | undefined> {
    const id = this.manifest.getActiveId();
    if (!id) return undefined;
    return this.getById(id);
  }

  setActive(id: string): ScriptEntry | null {
    const entry = this.manifest.getById(id);
    if (!entry) return null;
    this.manifest.setActive(id);
    return {
      id: entry.id,
      name: entry.name,
      source: '',
      scriptType: entry.scriptType as 'strategy' | 'indicator',
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  async create(name: string, source: string): Promise<ScriptEntry> {
    const scriptType = detectScriptType(source);
    const subDir = scriptType === 'strategy' ? 'strategies' : 'indicators';
    const targetDir = join(this.scriptsDir, subDir);

    await mkdir(targetDir, { recursive: true });

    const existingFilenames = this.manifest.getExistingFilenames();
    const baseFilename = uniqueFilename(sanitizeFilename(name), existingFilenames);
    const filename = `${baseFilename}.pine`;
    const filePath = join(subDir, filename);

    await writeFile(join(this.scriptsDir, filePath), source, 'utf-8');

    const now = Date.now();
    const entry = {
      id: randomUUID(),
      filename,
      name: name.trim(),
      scriptType,
      filePath,
      createdAt: now,
      updatedAt: now,
      checksum: computeChecksum(source),
    };

    this.manifest.add(entry);

    return {
      id: entry.id,
      name: entry.name,
      source,
      scriptType: entry.scriptType as 'strategy' | 'indicator',
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  async update(id: string, updates: { name?: string; source?: string }): Promise<ScriptEntry | null> {
    const entry = this.manifest.getById(id);
    if (!entry) return null;

    let source = updates.source;
    let newFilePath = entry.filePath;

    if (source !== undefined) {
      await writeFile(join(this.scriptsDir, entry.filePath), source, 'utf-8');
    } else {
      try {
        source = await readFile(join(this.scriptsDir, entry.filePath), 'utf-8');
      } catch {
        return null;
      }
    }

    if (updates.name !== undefined && updates.name.trim() !== entry.name) {
      const subDir = dirname(entry.filePath);
      const existingFilenames = this.manifest.getExistingFilenames();
      const baseFilename = uniqueFilename(sanitizeFilename(updates.name), existingFilenames);
      const newFilename = `${baseFilename}.pine`;
      newFilePath = join(subDir, newFilename);

      const oldPath = join(this.scriptsDir, entry.filePath);
      const newPath = join(this.scriptsDir, newFilePath);
      await writeFile(newPath, source, 'utf-8');
      if (oldPath !== newPath) {
        await unlink(oldPath).catch(() => {});
      }
    }

    const scriptType = detectScriptType(source);
    const now = Date.now();
    const newFilename = newFilePath.split('/').pop()!;

    this.manifest.update(id, {
      filename: newFilename,
      name: updates.name?.trim() ?? entry.name,
      scriptType,
      filePath: newFilePath,
      updatedAt: now,
      checksum: computeChecksum(source),
    });

    return {
      id: entry.id,
      name: updates.name?.trim() ?? entry.name,
      source,
      scriptType,
      createdAt: entry.createdAt,
      updatedAt: now,
    };
  }

  async delete(id: string): Promise<boolean> {
    const entry = this.manifest.getById(id);
    if (!entry) return false;

    await unlink(join(this.scriptsDir, entry.filePath)).catch(() => {});
    this.manifest.remove(id);
    return true;
  }

  async search(query: string): Promise<ScriptEntry[]> {
    const q = query.toLowerCase().trim();
    const entries = this.manifest.getAll();

    if (!q) return this.getAll();

    const results: ScriptEntry[] = [];
    for (const entry of entries) {
      if (
        entry.name.toLowerCase().includes(q) ||
        entry.scriptType.toLowerCase().includes(q)
      ) {
        try {
          const source = await readFile(join(this.scriptsDir, entry.filePath), 'utf-8');
          results.push({
            id: entry.id,
            name: entry.name,
            source,
            scriptType: entry.scriptType as 'strategy' | 'indicator',
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          });
        } catch {
          // Skip files that can't be read
        }
        continue;
      }

      try {
        const source = await readFile(join(this.scriptsDir, entry.filePath), 'utf-8');
        if (source.toLowerCase().includes(q)) {
          results.push({
            id: entry.id,
            name: entry.name,
            source,
            scriptType: entry.scriptType as 'strategy' | 'indicator',
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }
    return results;
  }
}
