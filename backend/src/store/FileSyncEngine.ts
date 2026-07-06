import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ScriptStore } from './ScriptStore.js';
import { ScriptsManifestStore, computeChecksum } from './ScriptsManifestStore.js';

export class FileSyncEngine {
  private scriptsDir: string;
  private manifestStore: ScriptsManifestStore;
  private scriptStore: ScriptStore;

  constructor(
    scriptsDir: string,
    manifestStore: ScriptsManifestStore,
    scriptStore: ScriptStore
  ) {
    this.scriptsDir = scriptsDir;
    this.manifestStore = manifestStore;
    this.scriptStore = scriptStore;
  }

  async syncFile(filePath: string): Promise<void> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const checksum = computeChecksum(content);
    const filename = path.relative(this.scriptsDir, filePath);
    const name = this.extractNameFromContent(content) || this.nameFromFilename(path.basename(filePath));
    const scriptType = this.detectScriptType(content);

    const existing = this.manifestStore.getByFilename(filename);
    if (existing) {
      if (existing.checksum === checksum) {
        return;
      }

      this.manifestStore.update(existing.id, {
        name,
        scriptType,
        filePath,
        updatedAt: Date.now(),
        checksum,
      });

      this.scriptStore.update(existing.id, {
        name,
        source: content,
      });
    } else {
      const id = randomUUID();
      this.manifestStore.add({
        id,
        filename,
        name,
        scriptType,
        filePath,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        checksum,
      });

      this.scriptStore.create(name, content, id);
    }
  }

  async removeFile(filePath: string): Promise<void> {
    const filename = path.relative(this.scriptsDir, filePath);
    const entry = this.manifestStore.getByFilename(filename);
    if (entry) {
      this.scriptStore.delete(entry.id);
      this.manifestStore.remove(entry.id);
    }
  }

  async fullSync(): Promise<{ added: number; updated: number; removed: number }> {
    const manifestFiles = new Set(this.manifestStore.getAll().map((e) => e.filename));
    const diskFiles = new Set(this.getDiskFiles());
    let added = 0;
    let updated = 0;
    let removed = 0;

    for (const file of diskFiles) {
      const filePath = path.join(this.scriptsDir, file);
      const existing = this.manifestStore.getByFilename(file);
      if (existing) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const checksum = computeChecksum(content);
        if (existing.checksum !== checksum) {
          await this.syncFile(filePath);
          updated++;
        }
        manifestFiles.delete(file);
      } else {
        await this.syncFile(filePath);
        added++;
      }
    }

    for (const file of manifestFiles) {
      const entry = this.manifestStore.getByFilename(file);
      if (entry) {
        this.scriptStore.delete(entry.id);
        this.manifestStore.remove(entry.id);
        removed++;
      }
    }

    this.manifestStore.updateLastSyncAt();
    return { added, updated, removed };
  }

  async bulkImport(filePaths: string[]): Promise<{ imported: number; errors: string[] }> {
    let imported = 0;
    const errors: string[] = [];

    for (const filePath of filePaths) {
      try {
        if (!filePath.endsWith('.pine')) {
          errors.push(`Skipping non-.pine file: ${filePath}`);
          continue;
        }

        if (!fs.existsSync(filePath)) {
          errors.push(`File not found: ${filePath}`);
          continue;
        }

        const stat = fs.statSync(filePath);
        if (stat.size > 1024 * 1024) {
          errors.push(`File too large (>1MB): ${filePath}`);
          continue;
        }

        await this.syncFile(filePath);
        imported++;
      } catch (err) {
        errors.push(`Error importing ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { imported, errors };
  }

  private getDiskFiles(): string[] {
    const files: string[] = [];
    this.walkDir(this.scriptsDir, files);
    return files;
  }

  private walkDir(dir: string, files: string[]): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(fullPath, files);
      } else if (entry.name.endsWith('.pine')) {
        files.push(path.relative(this.scriptsDir, fullPath));
      }
    }
  }

  private detectScriptType(source: string): 'strategy' | 'indicator' | 'library' {
    if (/\bstrategy\s*\(/.test(source)) return 'strategy';
    if (/\blibrary\s*\(/.test(source)) return 'library';
    return 'indicator';
  }

  private extractNameFromContent(source: string): string | null {
    const match = source.match(/\b(?:indicator|strategy|library)\s*\(\s*["']([^"']+)["']/);
    return match ? match[1] : null;
  }

  private nameFromFilename(filename: string): string {
    return filename.replace(/\.pine$/, '').replace(/_/g, ' ');
  }
}
