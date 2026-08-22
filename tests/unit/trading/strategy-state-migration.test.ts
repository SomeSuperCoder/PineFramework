import { describe, it, expect } from 'vitest';
import {
  migrateLegacyStrategyState,
  LEGACY_STRATEGY_STATE_KEY,
  type WorldStrategyState,
} from '../../../src/trading/live-strategy-executor.js';

/** Build a minimal persisted world state with the given open position. */
function entry(symbol: string, qty: number, dir: 'long' | 'short' | 'flat' = 'long'): WorldStrategyState {
  return {
    position: { symbol, direction: dir, quantity: qty, entryPrice: 10, entryTime: 1 },
    variables: { n: 1 },
  };
}

describe('migrateLegacyStrategyState (D4)', () => {
  it('recovers legacy flat entries into world keys (${symbol}:${timeframe}:${strategyId})', () => {
    const legacy: Record<string, WorldStrategyState> = {
      'SOLUSDC:5m': entry('SOLUSDC', 2),
      'BTCUSDC:1m': entry('BTCUSDC', 5),
    };
    const v2 = migrateLegacyStrategyState(legacy);
    expect(v2.schemaVersion).toBe(2);
    expect(Object.keys(v2.states)).toEqual([
      `SOLUSDC:5m:${LEGACY_STRATEGY_STATE_KEY}`,
      `BTCUSDC:1m:${LEGACY_STRATEGY_STATE_KEY}`,
    ]);
    expect(v2.legacy).toBeUndefined();
  });

  it('NO-POSITION-LOSS: every legacy entry is preserved (count parity)', () => {
    const legacy: Record<string, WorldStrategyState> = {
      'AAA:1m': entry('AAA', 1),
      'BBB:5m': entry('BBB', 2),
      'CCC:15m': entry('CCC', 3, 'short'),
    };
    const v2 = migrateLegacyStrategyState(legacy);
    const total = Object.keys(v2.states).length + Object.keys(v2.legacy ?? {}).length;
    expect(total).toBe(3);
    // positions are intact, not rewritten
    expect(v2.states[`CCC:15m:${LEGACY_STRATEGY_STATE_KEY}`]!.position).toEqual(
      entry('CCC', 3, 'short').position,
    );
  });

  it('preserves un-mappable (malformed) keys under the __legacy__ bucket, never dropped', () => {
    const legacy: Record<string, WorldStrategyState> = {
      'SOLUSDC:5m': entry('SOLUSDC', 2),
      'no-colon-key': entry('no-colon-key', 9),
      ':': entry('', 0),
    };
    const v2 = migrateLegacyStrategyState(legacy);
    expect(Object.keys(v2.states)).toEqual([`SOLUSDC:5m:${LEGACY_STRATEGY_STATE_KEY}`]);
    expect(v2.legacy).toBeDefined();
    expect(Object.keys(v2.legacy!)).toEqual(['no-colon-key', ':']);
    expect(v2.legacy!['no-colon-key']!.position.quantity).toBe(9);
  });

  it('honors a custom resolver and drops-to-legacy when it returns null', () => {
    const legacy: Record<string, WorldStrategyState> = {
      'SOLUSDC:5m': entry('SOLUSDC', 2),
      'BTCUSDC:1m': entry('BTCUSDC', 5),
    };
    // only SOLUSDC/5m is known to the resolver
    const v2 = migrateLegacyStrategyState(legacy, (sym, tf) =>
      sym === 'SOLUSDC' && tf === '5m' ? 'stgX' : null,
    );
    expect(v2.states[`SOLUSDC:5m:stgX`]).toBeDefined();
    expect(v2.legacy).toBeDefined();
    expect(Object.keys(v2.legacy!)).toEqual(['BTCUSDC:1m']);
  });

  it('round-trips through JSON re-parse without losing positions', () => {
    const legacy: Record<string, WorldStrategyState> = {
      'SOLUSDC:5m': entry('SOLUSDC', 7),
    };
    const v2 = migrateLegacyStrategyState(legacy);
    const reparsed = JSON.parse(JSON.stringify(v2)) as typeof v2;
    expect(reparsed.schemaVersion).toBe(2);
    expect(reparsed.states[`SOLUSDC:5m:${LEGACY_STRATEGY_STATE_KEY}`]!.position.quantity).toBe(7);
  });
});
