import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BotConfigStore } from '../../../src/trading/config-store.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BotConfig } from '../../../src/trading/types.js';

describe('BotConfigStore', () => {
  let store: BotConfigStore;
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `bot-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    store = new BotConfigStore(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const validConfig: BotConfig = {
    strategySource: '//@version=6\nstrategy("test")',
    dex: 'jupiter-swap',
    risk: { maxDailyLoss: 1.0, maxDailyWalletLossUsdc: 0 },
    autoSelect: true,
  };

  it('should return null when no config exists', () => {
    expect(store.load()).toBeNull();
  });

  it('should return false for exists when no config exists', () => {
    expect(store.exists()).toBe(false);
  });

  it('should save and load a valid config', () => {
    store.save(validConfig);
    const loaded = store.load();
    expect(loaded).toEqual(validConfig);
  });

  it('should return true for exists after saving', () => {
    store.save(validConfig);
    expect(store.exists()).toBe(true);
  });

  it('should delete a config', () => {
    store.save(validConfig);
    store.delete();
    expect(store.load()).toBeNull();
    expect(store.exists()).toBe(false);
  });

  it('should delete non-existent config without error', () => {
    expect(() => store.delete()).not.toThrow();
  });

  it('should return null for invalid config (missing strategySource)', () => {
    const invalid = { dex: 'jupiter-swap', risk: { maxDailyLoss: 1 } };
    writeFileSync(join(testDir, 'bot-config.json'), JSON.stringify(invalid), 'utf-8');
    expect(store.load()).toBeNull();
  });

  it('should return null for invalid config (missing risk)', () => {
    const invalid = { strategySource: 'test', dex: 'jupiter-swap' };
    writeFileSync(join(testDir, 'bot-config.json'), JSON.stringify(invalid), 'utf-8');
    expect(store.load()).toBeNull();
  });

  it('should return null for invalid config (bad dex)', () => {
    const invalid = { strategySource: 'test', dex: 'uniswap', risk: { maxDailyLoss: 1 } };
    writeFileSync(join(testDir, 'bot-config.json'), JSON.stringify(invalid), 'utf-8');
    expect(store.load()).toBeNull();
  });

  it('should return null for corrupted JSON', () => {
    writeFileSync(join(testDir, 'bot-config.json'), 'not valid json{{{', 'utf-8');
    expect(store.load()).toBeNull();
  });

  it('should reject negative maxDailyWalletLossUsdc', () => {
    const invalid = {
      strategySource: 'test',
      dex: 'jupiter-swap',
      risk: { maxDailyLoss: 1.0, maxDailyWalletLossUsdc: -1 },
    };
    writeFileSync(join(testDir, 'bot-config.json'), JSON.stringify(invalid), 'utf-8');
    expect(store.load()).toBeNull();
  });

  it('should reject fractional maxDailyWalletLossUsdc (R2)', () => {
    const invalid = {
      strategySource: 'test',
      dex: 'jupiter-swap',
      risk: { maxDailyLoss: 1.0, maxDailyWalletLossUsdc: 50.5 },
    };
    writeFileSync(join(testDir, 'bot-config.json'), JSON.stringify(invalid), 'utf-8');
    expect(store.load()).toBeNull();
  });

  it('should accept missing maxDailyWalletLossUsdc (treated as unlimited)', () => {
    const config = { strategySource: 'test', dex: 'jupiter-swap', risk: { maxDailyLoss: 1.0 } };
    writeFileSync(join(testDir, 'bot-config.json'), JSON.stringify(config), 'utf-8');
    expect(store.load()).not.toBeNull();
    expect(store.load()!.risk.maxDailyWalletLossUsdc).toBeUndefined();
  });

  it('should accept explicit undefined maxDailyWalletLossUsdc (treated as unlimited)', () => {
    const config: BotConfig = {
      strategySource: 'test',
      dex: 'jupiter-swap',
      risk: { maxDailyLoss: 1.0, maxDailyWalletLossUsdc: undefined },
    };
    store.save(config);
    const loaded = store.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.risk.maxDailyWalletLossUsdc).toBeUndefined();
  });

  it('should accept a valid positive maxDailyWalletLossUsdc', () => {
    const config = { ...validConfig, risk: { maxDailyLoss: 1.0, maxDailyWalletLossUsdc: 50 } };
    store.save(config);
    const loaded = store.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.risk.maxDailyWalletLossUsdc).toBe(50);
  });

  it('should accept zero maxDailyWalletLossUsdc (unlimited)', () => {
    const config = { ...validConfig, risk: { maxDailyLoss: 1.0, maxDailyWalletLossUsdc: 0 } };
    store.save(config);
    const loaded = store.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.risk.maxDailyWalletLossUsdc).toBe(0);
  });

  it('should overwrite existing config', () => {
    store.save(validConfig);
    const newConfig: BotConfig = { ...validConfig, dex: 'jupiter-ultra' };
    store.save(newConfig);
    expect(store.load()?.dex).toBe('jupiter-ultra');
  });

  it('should persist autoSelect=false and resolved pairs after backtest', () => {
    const postBacktestConfig: BotConfig = {
      strategySource: '//@version=6\nstrategy("test")',
      dex: 'jupiter-swap',
      risk: { maxDailyLoss: 1.0, maxDailyWalletLossUsdc: 0 },
      autoSelect: false,
      pairs: [{ symbol: 'BTCUSDT', timeframe: '60' }],
    };
    store.save(postBacktestConfig);
    const loaded = store.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.autoSelect).toBe(false);
    expect(loaded!.pairs).toHaveLength(1);
    expect(loaded!.pairs![0]).toEqual({ symbol: 'BTCUSDT', timeframe: '60' });
  });
});
