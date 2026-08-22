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
import type { BotConfig, WorldConfig } from './types.js';
import { LEGACY_STRATEGY_ID } from './types.js';

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
      // D4: migrate legacy (pre-v2) configs — `pairs` → a single `worlds`
      // entry — so the rest of the system only ever sees the v2 shape.
      const migrated = migrateLegacyBotConfig(config);
      if (!this.isValid(migrated)) {
        return null;
      }
      return migrated;
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
    // Optional field for backward compatibility: missing/undefined is VALID and
    // treated as 0 (unlimited). Only when present must it be a number >= 0.
    // R2: it must also be a whole integer — a fractional value (e.g. 50.5)
    // passes the >= 0 check but throws RangeError inside WalletBalanceGuard's
    // BigInt conversion, silently disabling the guard. Reject it here instead.
    if (typeof risk.maxDailyWalletLossUsdc !== 'undefined') {
      if (
        typeof risk.maxDailyWalletLossUsdc !== 'number' ||
        risk.maxDailyWalletLossUsdc < 0 ||
        !Number.isInteger(risk.maxDailyWalletLossUsdc)
      )
        return false;
    }
    return true;
  }
}

/**
 * Migrate a (possibly legacy) bot config into the v2 shape (D4).
 *
 * - Already-v2 configs (have a non-empty `worlds`) are returned as-is with
 *   `version` normalized to 2.
 * - Legacy v1 configs derive a single world from `pairs[0]` (only `pairs[0]`
 *   was ever active pre-v2 — the wizard used it as the single "world"). Only
 *   the first pair is carried; additional legacy pairs were never traded.
 *
 * Pure and side-effect-free so it can be unit-tested directly.
 */
export function migrateLegacyBotConfig(config: BotConfig): BotConfig {
  if (Array.isArray(config.worlds) && config.worlds.length > 0) {
    return { ...config, version: config.version ?? 2 };
  }
  if (Array.isArray(config.pairs) && config.pairs.length > 0) {
    const p = config.pairs[0]!;
    const worlds: WorldConfig[] = [
      { timeframe: p.timeframe, symbol: p.symbol, strategy: LEGACY_STRATEGY_ID },
    ];
    return { ...config, version: 2, worlds };
  }
  // No worlds and no pairs — leave untouched; isValid() decides acceptance.
  return config;
}
