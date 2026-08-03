/**
 * BotConfigStore — JSON file-based persistent storage for bot configuration.
 *
 * Persists the BotConfig to a JSON file so it survives server restarts.
 * The config file is stored alongside the wallet (wallet.enc) in the data directory.
 *
 * @module trading
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { BotConfig } from './types.js';

export class BotConfigStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, 'bot-config.json');
  }

  /**
   * Save bot configuration to disk.
   */
  save(config: BotConfig): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Load bot configuration from disk.
   * Returns null if file doesn't exist or is invalid.
   */
  load(): BotConfig | null {
    try {
      if (!existsSync(this.filePath)) {
        return null;
      }
      const data = readFileSync(this.filePath, 'utf-8');
      const config = JSON.parse(data) as BotConfig;
      if (!this.isValid(config)) {
        return null;
      }
      return config;
    } catch {
      return null;
    }
  }

  /**
   * Delete bot configuration from disk.
   */
  delete(): void {
    if (existsSync(this.filePath)) {
      unlinkSync(this.filePath);
    }
  }

  /**
   * Check if a bot configuration file exists on disk.
   */
  exists(): boolean {
    return existsSync(this.filePath);
  }

  /**
   * Validate that a config object has the required fields.
   */
  private isValid(config: unknown): config is BotConfig {
    if (!config || typeof config !== 'object') return false;
    const c = config as Record<string, unknown>;
    if (typeof c.strategySource !== 'string') return false;
    if (c.dex !== 'jupiter-swap' && c.dex !== 'jupiter-ultra') return false;
    if (!c.risk || typeof c.risk !== 'object') return false;
    const risk = c.risk as Record<string, unknown>;
    if (typeof risk.maxDailyLoss !== 'number' || risk.maxDailyLoss < 0) return false;
    return true;
  }
}
