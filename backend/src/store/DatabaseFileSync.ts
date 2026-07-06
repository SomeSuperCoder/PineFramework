import * as fs from 'node:fs';
import * as path from 'node:path';
import { ScriptStore, ScriptEntry } from './ScriptStore.js';
import { ScriptsManifestStore, FileScriptEntry, computeChecksum } from './ScriptsManifestStore.js';
import { uniqueFilename } from '../utils/filename.js';

export class DatabaseFileSync {
  private scriptsDir: string;
  private manifestStore: ScriptsManifestStore;

  constructor(
    scriptsDir: string,
    manifestStore: ScriptsManifestStore,
    _scriptStore: ScriptStore
  ) {
    this.scriptsDir = scriptsDir;
    this.manifestStore = manifestStore;
  }

  onScriptCreated(script: ScriptEntry): FileScriptEntry {
    const existingFilenames = this.manifestStore.getExistingFilenames();
    const filename = uniqueFilename(script.name, existingFilenames) + '.pine';
    const filePath = path.join(this.scriptsDir, filename);

    this.ensureDirectoryExists(filePath);
    fs.writeFileSync(filePath, script.source, 'utf-8');

    const checksum = computeChecksum(script.source);
    const entry = this.manifestStore.add({
      id: script.id,
      filename,
      name: script.name,
      scriptType: script.scriptType,
      filePath,
      createdAt: script.createdAt,
      updatedAt: script.updatedAt,
      checksum,
    });

    return entry;
  }

  onScriptUpdated(script: ScriptEntry): FileScriptEntry | undefined {
    const entry = this.manifestStore.getById(script.id);
    if (!entry) return undefined;

    const checksum = computeChecksum(script.source);
    if (entry.checksum === checksum) return entry;

    fs.writeFileSync(entry.filePath, script.source, 'utf-8');

    this.manifestStore.update(script.id, {
      name: script.name,
      scriptType: script.scriptType,
      updatedAt: script.updatedAt,
      checksum,
    });

    return this.manifestStore.getById(script.id);
  }

  onScriptDeleted(scriptId: string): boolean {
    const entry = this.manifestStore.getById(scriptId);
    if (!entry) return false;

    if (fs.existsSync(entry.filePath)) {
      fs.unlinkSync(entry.filePath);
    }

    this.manifestStore.remove(scriptId);
    return true;
  }

  private ensureDirectoryExists(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
