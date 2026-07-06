import * as properLockfile from 'proper-lockfile';
import * as fs from 'node:fs';
import { ScriptsManifestStore, computeChecksum } from './ScriptsManifestStore.js';

export class ConflictResolver {
  private manifestStore: ScriptsManifestStore;
  private fileLocks: Map<string, () => void> = new Map();

  constructor(manifestStore: ScriptsManifestStore) {
    this.manifestStore = manifestStore;
  }

  async acquireFileLock(filePath: string): Promise<(() => void) | null> {
    try {
      const release = await properLockfile.lock(filePath, {
        retries: { retries: 3, minTimeout: 100 },
        realpath: false,
      });
      this.fileLocks.set(filePath, release);
      return release;
    } catch {
      return null;
    }
  }

  releaseFileLock(filePath: string): void {
    const release = this.fileLocks.get(filePath);
    if (release) {
      release();
      this.fileLocks.delete(filePath);
    }
  }

  hasConflict(filePath: string, content: string): boolean {
    const entry = this.manifestStore.getAll().find((e) => e.filePath === filePath);
    if (!entry) return false;

    const currentChecksum = computeChecksum(content);
    return entry.checksum !== currentChecksum;
  }

  resolveConflict(filePath: string, content: string, lastWriteWins: boolean = true): boolean {
    if (!lastWriteWins) return false;

    const entry = this.manifestStore.getAll().find((e) => e.filePath === filePath);
    if (!entry) return false;

    const checksum = computeChecksum(content);
    if (entry.checksum === checksum) return true;

    fs.writeFileSync(filePath, content, 'utf-8');

    this.manifestStore.update(entry.id, {
      updatedAt: Date.now(),
      checksum,
    });

    return true;
  }
}
