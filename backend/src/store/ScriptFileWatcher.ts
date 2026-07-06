import * as chokidar from 'chokidar';
import * as path from 'node:path';
import { FileSyncEngine } from './FileSyncEngine.js';

export class ScriptFileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private syncEngine: FileSyncEngine;
  private scriptsDir: string;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs = 100;

  constructor(scriptsDir: string, syncEngine: FileSyncEngine) {
    this.scriptsDir = scriptsDir;
    this.syncEngine = syncEngine;
  }

  start(): void {
    const pattern = path.join(this.scriptsDir, '**', '*.pine');
    this.watcher = chokidar.watch(pattern, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10,
      },
    });

    this.watcher.on('add', (filePath) => this.handleEvent('add', filePath));
    this.watcher.on('change', (filePath) => this.handleEvent('change', filePath));
    this.watcher.on('unlink', (filePath) => this.handleEvent('unlink', filePath));
    this.watcher.on('error', (error) => {
      console.error('[ScriptFileWatcher] Error:', error);
    });

    console.log(`[ScriptFileWatcher] Watching ${pattern}`);
  }

  async stop(): Promise<void> {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private handleEvent(event: string, filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);
      try {
        if (event === 'unlink') {
          await this.syncEngine.removeFile(filePath);
        } else {
          await this.syncEngine.syncFile(filePath);
        }
      } catch (error) {
        console.error(`[ScriptFileWatcher] Error processing ${event} for ${filePath}:`, error);
      }
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }
}
