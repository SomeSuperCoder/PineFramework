/**
 * Unit tests for the Bybit ticker mapping SSOT helpers in token-registry.ts
 * (OpenSpec change: bybit-ticker-mapping).
 *
 * Contract under test:
 * - GOLDUSDC→XAUTUSDT/spot, TSLAXUSDC→TSLAXUSDT/spot, AAPLXUSDC→AAPLXUSDT/spot
 * - The 7 legacy USDT pairs map identity (pairSymbol) + 'linear' — Bybit
 *   requests for them must stay byte-identical to pre-change behavior.
 * - UNKNOWN symbols fall back to identity (uppercased) + 'linear' and MUST
 *   NOT throw (callers pass arbitrary strings: REST query params, WS topics).
 * - Input is case-normalized before resolution.
 */
import { describe, it, expect } from 'vitest';
import {
  getBybitCategory,
  getBybitSymbol,
  TRADABLE_PAIRS,
} from '../../../src/trading/token-registry.js';

describe('getBybitSymbol / getBybitCategory (Bybit ticker mapping SSOT)', () => {
  it('maps the 3 non-Bybit-listed pairs to their Bybit instruments (spot)', () => {
    expect(getBybitSymbol('GOLDUSDC')).toBe('XAUTUSDT');
    expect(getBybitCategory('GOLDUSDC')).toBe('spot');

    expect(getBybitSymbol('TSLAXUSDC')).toBe('TSLAXUSDT');
    expect(getBybitCategory('TSLAXUSDC')).toBe('spot');

    expect(getBybitSymbol('AAPLXUSDC')).toBe('AAPLXUSDT');
    expect(getBybitCategory('AAPLXUSDC')).toBe('spot');
  });

  it('legacy 7 pairs map to identity + linear (byte-identical Bybit requests)', () => {
    const legacy = [
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'BNBUSDT',
      'XRPUSDT',
      'DOGEUSDT',
      'ADAUSDT',
    ];
    for (const pair of legacy) {
      expect(getBybitSymbol(pair)).toBe(pair);
      expect(getBybitCategory(pair)).toBe('linear');
    }
  });

  it('UNKNOWN symbols fall back to identity (uppercased) + linear and never throw', () => {
    expect(() => getBybitSymbol('NOSUCHPAIR')).not.toThrow();
    expect(getBybitSymbol('NOSUCHPAIR')).toBe('NOSUCHPAIR');
    expect(() => getBybitCategory('NOSUCHPAIR')).not.toThrow();
    expect(getBybitCategory('NOSUCHPAIR')).toBe('linear');

    // Empty string is a valid "unknown" — must fall back, not throw.
    expect(getBybitSymbol('')).toBe('');
    expect(getBybitCategory('')).toBe('linear');
  });

  it('normalizes input case before resolving', () => {
    expect(getBybitSymbol('goldusdc')).toBe('XAUTUSDT');
    expect(getBybitCategory('goldusdc')).toBe('spot');
    expect(getBybitSymbol('btcusdt')).toBe('BTCUSDT');
    expect(getBybitCategory('btcusdt')).toBe('linear');
  });

  it('TRADABLE_PAIRS is exactly the 10 SSoT pairs (7 legacy + 3 mapped)', () => {
    expect([...TRADABLE_PAIRS]).toEqual([
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'BNBUSDT',
      'XRPUSDT',
      'DOGEUSDT',
      'ADAUSDT',
      'GOLDUSDC',
      'TSLAXUSDC',
      'AAPLXUSDC',
    ]);
  });
});
