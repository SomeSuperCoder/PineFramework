import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BotConfigStore, migrateLegacyBotConfig } from '../../../src/trading/config-store.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LEGACY_STRATEGY_ID } from '../../../src/trading/types.js';
import type { BotConfig } from '../../../src/trading/types.js';

describe('migrateLegacyBotConfig (D4)', () => {
  const legacyBase: BotConfig = {
    strategySource: '//@version=6\nstrategy("test")',
    dex: 'jupiter-swap',
    risk: { maxDailyLoss: 1.0, maxDailyWalletLossUsdc: 0 },
  };

  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `cfg-mig-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('migrates legacy {pairs:[x]} into a single v2 world', () => {
    const legacy: BotConfig = {
      ...legacyBase,
      pairs: [{ symbol: 'SOLUSDC', timeframe: '5m' }],
      autoSelect: false,
    };
    const migrated = migrateLegacyBotConfig(legacy);
    expect(migrated.version).toBe(2);
    expect(migrated.worlds).toEqual([
      { timeframe: '5m', symbol: 'SOLUSDC', strategy: LEGACY_STRATEGY_ID },
    ]);
    // original fields preserved (backwards-compatible read path)
    expect(migrated.strategySource).toBe(legacy.strategySource);
    expect(migrated.pairs).toEqual(legacy.pairs);
  });

  it('returns already-v2 configs as-is with normalized version', () => {
    const v2: BotConfig = {
      ...legacyBase,
      version: 2,
      worlds: [{ timeframe: '1m', symbol: 'BTCUSDC', strategy: 'stgA' }],
    };
    const migrated = migrateLegacyBotConfig(v2);
    expect(migrated).toEqual(v2);
    expect(migrated.version).toBe(2);
  });

  it('leaves configs with neither worlds nor pairs untouched', () => {
    const migrated = migrateLegacyBotConfig(legacyBase);
    expect(migrated).toEqual(legacyBase);
  });

  it('BotConfigStore.load migrates a legacy file on read', () => {
    const store = new BotConfigStore(dir);
    writeFileSync(
      join(dir, 'bot-config.json'),
      JSON.stringify({
        strategySource: '//@version=6\nstrategy("t")',
        dex: 'jupiter-swap',
        risk: { maxDailyLoss: 1.0, maxDailyWalletLossUsdc: 0 },
        pairs: [{ symbol: 'ETHUSDC', timeframe: '15m' }],
      }),
      'utf-8',
    );
    const loaded = store.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(2);
    expect(loaded!.worlds).toEqual([
      { timeframe: '15m', symbol: 'ETHUSDC', strategy: LEGACY_STRATEGY_ID },
    ]);
  });
});
