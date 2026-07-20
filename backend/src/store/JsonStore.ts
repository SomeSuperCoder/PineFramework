import fs from 'node:fs';
import path from 'node:path';
import { lockSync, unlockSync } from 'proper-lockfile';
import { sanitizeJson } from '../utils/security.js';

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

  getDefaults(): T {
    return { ...this.defaults };
  }

  read(): T {
    this.initIfMissing();
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Strip __proto__ and constructor.prototype keys to prevent prototype pollution
      const sanitized = sanitizeJson(parsed) as T;
      if (this.validateFn && !this.validateFn(sanitized)) {
        return { ...this.defaults };
      }
      return sanitized;
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
    try {
      lockSync(this.filePath);
    } catch (err) {
      // Lock failure is a critical data integrity risk — throw to prevent corruption
      throw new Error(
        `Failed to acquire file lock for ${path.basename(this.filePath)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } finally {
      try {
        unlockSync(this.filePath);
      } catch {
        // ignore unlock errors — write already succeeded
      }
    }
  }
}
