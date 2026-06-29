import fs from 'node:fs';
import path from 'node:path';
import { lockSync, unlockSync } from 'proper-lockfile';

export interface JsonStoreOptions {
  defaultData: Record<string, unknown>;
  validate?: (data: unknown) => boolean;
}

export class JsonStore<T extends Record<string, unknown>> {
  private filePath: string;
  private defaults: T;
  private validateFn?: (data: unknown) => boolean;

  constructor(filePath: string, options: JsonStoreOptions) {
    this.filePath = path.resolve(filePath);
    this.defaults = options.defaultData as T;
    this.validateFn = options.validate;

    this.initIfMissing();
  }

  private ensureDir(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private initIfMissing(): void {
    if (!fs.existsSync(this.filePath)) {
      this.ensureDir();
      fs.writeFileSync(this.filePath, JSON.stringify(this.defaults, null, 2), 'utf-8');
    }
  }

  read(): T {
    this.initIfMissing();
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as T;
      if (this.validateFn && !this.validateFn(parsed)) {
        return { ...this.defaults };
      }
      return parsed;
    } catch {
      return { ...this.defaults };
    }
  }

  write(data: T): void {
    if (this.validateFn && !this.validateFn(data)) {
      throw new Error('JSON store write validation failed');
    }
    this.writeRaw(data);
  }

  patch(update: Partial<T>): T {
    const current = this.read();
    const merged = { ...current, ...update } as T;
    this.write(merged);
    return merged;
  }

  private writeRaw(data: T): void {
    this.ensureDir();
    let release: (() => void) | null = null;
    try {
      release = lockSync(this.filePath, { retries: { retries: 5, minTimeout: 20 } });
    } catch {
      // proceed without lock if locking fails
    }
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } finally {
      if (release) {
        try {
          unlockSync(this.filePath);
        } catch {
          // ignore unlock errors
        }
      }
    }
  }
}
