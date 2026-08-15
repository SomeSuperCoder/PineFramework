import { readFile, writeFile, unlink, mkdir, readdir, stat } from 'node:fs/promises';
import { join, dirname, isAbsolute, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ScriptsManifestStore, computeChecksum, type FileScriptEntry } from './ScriptsManifestStore.js';
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

function extractName(source: string): string | null {
  const positional = source.match(/\b(?:indicator|strategy|library)\s*\(\s*["']([^"']+)["']/);
  if (positional) return positional[1];
  const named = source.match(/\b(?:indicator|strategy|library)\s*\(\s*[^)]*title\s*=\s*["']([^"']+)["']/);
  return named ? named[1] : null;
}

export class ScriptFileManager {
  private scriptsDir: string;
  private manifest: ScriptsManifestStore;

  constructor(scriptsDir: string, manifest: ScriptsManifestStore) {
    this.scriptsDir = scriptsDir;
    this.manifest = manifest;
  }

  private resolveFilePath(filePath: string): string {
    return isAbsolute(filePath) ? filePath : join(this.scriptsDir, filePath);
  }

  /**
   * Lazy reconcile: sync the manifest against the actual .pine files on disk.
   * Adds pasted files, prunes deleted ones, and refreshes metadata when a file
   * was edited externally — detected by CONTENT CHECKSUM (not mtime, which is
   * sub-ms precise and would misclassify freshly create()d files as edited).
   * The manifest stays the source of truth for ids/active state while the
   * directory is the source of discovery. Called at the top of every list
   * fetch. Writes at most once (no per-entry add) so concurrent fetches can't
   * duplicate entries.
   *
   * Matching is by RESOLVED ABSOLUTE PATH (not `filename`), because `create()`
   * stores `filename` as a bare basename while `filePath` carries the subdir.
   */
  private async reconcile(): Promise<void> {
    const subDirs = ['strategies', 'indicators'] as const;
    const onDisk = new Map<string, { absPath: string; scriptType: 'strategy' | 'indicator'; relPath: string }>();
    for (const sub of subDirs) {
      const dir = join(this.scriptsDir, sub);
      let files: string[] = [];
      try {
        files = await readdir(dir);
      } catch {
        continue; // subdir may not exist yet
      }
      for (const f of files) {
        if (!f.endsWith('.pine')) continue;
        const relPath = `${sub}/${f}`;
        const abs = join(this.scriptsDir, relPath);
        onDisk.set(abs, { absPath: abs, scriptType: sub === 'strategies' ? 'strategy' : 'indicator', relPath });
      }
    }

    const current = this.manifest.getAll();
    const covered = new Set<string>();
    const next: FileScriptEntry[] = [];
    let changed = false;

    for (const entry of current) {
      // Resolve the entry's on-disk location, tolerating either convention
      // (filePath may be "strategies/foo.pine" or a bare "foo.pine").
      let abs = this.resolveFilePath(entry.filePath);
      let disk = onDisk.get(abs);
      if (!disk) {
        const altAbs = this.resolveFilePath(entry.filename);
        if (onDisk.has(altAbs)) {
          abs = altAbs;
          disk = onDisk.get(altAbs)!;
        }
      }
      if (!disk) {
        // File no longer on disk -> prune (clears active if it was active).
        changed = true;
        continue;
      }

      let updated = entry;
      const baseName = basename(disk.relPath);
      if (entry.filename !== baseName) {
        updated = { ...updated, filename: baseName };
        changed = true;
      }
      try {
        const st = await stat(disk.absPath);
        const source = await readFile(disk.absPath, 'utf-8');
        const checksum = computeChecksum(source);
        if (checksum !== entry.checksum) {
          // Genuine content change (not a fresh create — its checksum matches).
          updated = {
            ...updated,
            name: extractName(source) ?? updated.name,
            checksum,
            updatedAt: st.mtimeMs,
          };
          changed = true;
        }
      } catch {
        // Unreadable -> keep entry as-is (already normalized above).
      }
      covered.add(abs);
      next.push(updated);
    }

    for (const [abs, info] of onDisk) {
      if (covered.has(abs)) continue;
      try {
        const source = await readFile(abs, 'utf-8');
        const now = Date.now();
        next.push({
          id: randomUUID(),
          filename: basename(info.relPath),
          name: extractName(source) ?? basename(info.relPath, '.pine'),
          scriptType: info.scriptType,
          filePath: info.relPath,
          createdAt: now,
          updatedAt: now,
          checksum: computeChecksum(source),
        });
        changed = true;
      } catch {
        // Unreadable -> skip.
      }
    }

    if (changed) {
      this.manifest.replaceAll(next);
    }
  }

  async getAll(): Promise<ScriptEntry[]> {
    await this.reconcile();
    const entries = this.manifest.getAll();
    const results: ScriptEntry[] = [];
    for (const entry of entries) {
      try {
        const source = await readFile(this.resolveFilePath(entry.filePath), 'utf-8');
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
      const source = await readFile(this.resolveFilePath(entry.filePath), 'utf-8');
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
    await this.reconcile();
    const id = this.manifest.getActiveId();
    if (!id) return undefined;
    return this.getById(id);
  }

  async setActive(id: string): Promise<ScriptEntry | null> {
    const entry = this.manifest.getById(id);
    if (!entry) return null;
    this.manifest.setActive(id);
    try {
      const source = await readFile(this.resolveFilePath(entry.filePath), 'utf-8');
      return {
        id: entry.id,
        name: entry.name,
        source,
        scriptType: entry.scriptType as 'strategy' | 'indicator',
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      };
    } catch {
      return null;
    }
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
      await writeFile(this.resolveFilePath(entry.filePath), source, 'utf-8');
    } else {
      try {
        source = await readFile(this.resolveFilePath(entry.filePath), 'utf-8');
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

      const oldPath = this.resolveFilePath(entry.filePath);
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

    await unlink(this.resolveFilePath(entry.filePath)).catch(() => {});
    this.manifest.remove(id);
    return true;
  }

  async search(query: string): Promise<ScriptEntry[]> {
    await this.reconcile();
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
          const source = await readFile(this.resolveFilePath(entry.filePath), 'utf-8');
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
        const source = await readFile(this.resolveFilePath(entry.filePath), 'utf-8');
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
