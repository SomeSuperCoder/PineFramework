/**
 * Unit tests for the Bybit ticker mapping SSOT helpers in token-registry.ts
 * (OpenSpec change: bybit-ticker-mapping).
 *
 * Contract under test:
 * - GOLDUSDC→XAUTUSDT/spot, TSLAXUSDC→TSLAXUSDT/spot, AAPLXUSDC→AAPLXUSDT/spot
 * - The 4 Backed xStock pairs added 2026-08-15 map to their Bybit spot
 *   instruments: NVDAXUSDC→NVDAXUSDT/spot, MCDXUSDC→MCDXUSDT/spot,
 *   GOOGLXUSDC→GOOGLXUSDT/spot, SPCXXUSDC→SPCXXUSDT/spot (mint + decimals 8).
 * - SPYUSDC (Backed SPYx) maps to the Bybit S&P 500 LINEAR perpetual
 *   SPYUSDT/linear — Bybit has no spot S&P 500 instrument (verified live
 *   2026-08-15); same category as the 7 legacy crypto pairs.
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
  getTokenInfo,
  getTradablePairs,
  TRADABLE_PAIRS,
} from '../../../src/trading/token-registry.js';

/**
 * Expected SSoT order. The registry is the single source of truth; the pair
 * count derives from this constant — never hardcode a count in the tests.
 */
const EXPECTED_SOOT_PAIRS = [
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
  'NVDAXUSDC',
  'MCDXUSDC',
  'GOOGLXUSDC',
  'SPCXXUSDC',
  'SPYUSDC',
] as const;

describe('getBybitSymbol / getBybitCategory (Bybit ticker mapping SSOT)', () => {
  it('maps the 7 non-Bybit-listed pairs to their Bybit instruments (spot)', () => {
    expect(getBybitSymbol('GOLDUSDC')).toBe('XAUTUSDT');
    expect(getBybitCategory('GOLDUSDC')).toBe('spot');

    expect(getBybitSymbol('TSLAXUSDC')).toBe('TSLAXUSDT');
    expect(getBybitCategory('TSLAXUSDC')).toBe('spot');

    expect(getBybitSymbol('AAPLXUSDC')).toBe('AAPLXUSDT');
    expect(getBybitCategory('AAPLXUSDC')).toBe('spot');

    expect(getBybitSymbol('NVDAXUSDC')).toBe('NVDAXUSDT');
    expect(getBybitCategory('NVDAXUSDC')).toBe('spot');

    expect(getBybitSymbol('MCDXUSDC')).toBe('MCDXUSDT');
    expect(getBybitCategory('MCDXUSDC')).toBe('spot');

    expect(getBybitSymbol('GOOGLXUSDC')).toBe('GOOGLXUSDT');
    expect(getBybitCategory('GOOGLXUSDC')).toBe('spot');

    expect(getBybitSymbol('SPCXXUSDC')).toBe('SPCXXUSDT');
    expect(getBybitCategory('SPCXXUSDC')).toBe('spot');
  });

  it('the 4 new Backed xStock pairs carry full token metadata (mint, decimals 8)', () => {
    expect(getTokenInfo('NVDAXUSDC')).toMatchObject({
      symbol: 'NVDAx',
      quote: 'USDC',
      name: 'NVIDIA Corp. (xStock)',
      mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
      decimals: 8,
      bybitSymbol: 'NVDAXUSDT',
      bybitCategory: 'spot',
    });
    expect(getTokenInfo('MCDXUSDC')).toMatchObject({
      symbol: 'MCDx',
      quote: 'USDC',
      mint: 'XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2',
      decimals: 8,
      bybitSymbol: 'MCDXUSDT',
      bybitCategory: 'spot',
    });
    expect(getTokenInfo('GOOGLXUSDC')).toMatchObject({
      symbol: 'GOOGLx',
      quote: 'USDC',
      mint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN',
      decimals: 8,
      bybitSymbol: 'GOOGLXUSDT',
      bybitCategory: 'spot',
    });
    expect(getTokenInfo('SPCXXUSDC')).toMatchObject({
      symbol: 'SPCXx',
      quote: 'USDC',
      mint: 'Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8',
      decimals: 8,
      bybitSymbol: 'SPCXXUSDT',
      bybitCategory: 'spot',
    });
  });

  it('SPYUSDC maps to the Bybit S&P 500 linear perpetual (SPYUSDT/linear)', () => {
    // Bybit has no spot S&P 500 instrument — SPYUSDT is a live linear perp,
    // same category as the 7 legacy crypto pairs, NOT the spot xStocks.
    expect(getBybitSymbol('SPYUSDC')).toBe('SPYUSDT');
    expect(getBybitCategory('SPYUSDC')).toBe('linear');
  });

  it('SPYUSDC carries full token metadata (mint, decimals 8, linear bybit mapping)', () => {
    expect(getTokenInfo('SPYUSDC')).toMatchObject({
      symbol: 'SPYx',
      quote: 'USDC',
      pairSymbol: 'SPYUSDC',
      name: 'S&P 500 xStock (Backed)',
      mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W',
      decimals: 8,
      bybitSymbol: 'SPYUSDT',
      bybitCategory: 'linear',
    });
  });

  it('legacy 7 pairs map to identity + linear (byte-identical Bybit requests)', () => {
    const legacy = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT'];
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

  it('TRADABLE_PAIRS is exactly the 15 SSoT pairs (7 legacy + 7 spot-mapped + SPYUSDC linear)', () => {
    // Order + content locked against the constant; the count derives from it,
    // so a future pair addition updates ONE list, never a magic number.
    expect([...TRADABLE_PAIRS]).toEqual([...EXPECTED_SOOT_PAIRS]);
    expect(TRADABLE_PAIRS.length).toBe(EXPECTED_SOOT_PAIRS.length);
    // Consumer-facing helper stays byte-identical to the SSoT array.
    expect(getTradablePairs()).toEqual(TRADABLE_PAIRS);
  });
});
