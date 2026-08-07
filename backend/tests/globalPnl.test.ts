import { describe, it, expect } from 'vitest';
import { buildGlobalPnlSnapshot, round2 } from '../src/services/globalPnl.js';
import type { SessionSummary } from '../src/services/StatsService.js';
import type { TradeStats } from 'pine-framework/trading/trade-history-store';

const NOW = 1_752_955_000_000; // fixed injectable clock

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    totalTrades: 0,
    winRate: 0,
    netPnl: 0,
    totalFees: 0,
    profitFactor: 0,
    bestTrade: 0,
    worstTrade: 0,
    maxDrawdown: 0,
    recent: [],
    ...overrides,
  };
}

function makeStats(overrides: Partial<TradeStats> = {}): TradeStats {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalPnl: 0,
    totalFees: 0,
    averageWin: 0,
    averageLoss: 0,
    netPnl: 0,
    profitFactor: 0,
    avgTrade: 0,
    bestTrade: 0,
    worstTrade: 0,
    maxDrawdown: 0,
    ...overrides,
  };
}

describe('buildGlobalPnlSnapshot', () => {
  it('builds a zeroed snapshot from a null summary + empty positions (never throws)', () => {
    const snap = buildGlobalPnlSnapshot({ summary: null, positions: [] });
    expect(snap.totalPnl).toBe(0);
    expect(snap.realizedPnl).toBe(0);
    expect(snap.unrealizedPnl).toBe(0);
    expect(snap.tradeCount).toBe(0);
    expect(snap.winRate).toBe(0);
    expect(snap.profitFactor).toBe(0);
    expect(snap.avgTrade).toBe(0);
    expect(snap.maxDrawdown).toBe(0);
    expect(snap.totalFees).toBe(0);
    expect(snap.bestTrade).toBe(0);
    expect(snap.worstTrade).toBe(0);
    expect(snap.openPositionsCount).toBe(0);
    expect(snap.perSymbol).toEqual([]);
  });

  it('never throws when positions is undefined (runtime guard combines with [])', () => {
    const snap = buildGlobalPnlSnapshot({
      summary: null,
      positions: undefined as unknown as { symbol: string; unrealizedPnl: number }[],
    });
    expect(snap.unrealizedPnl).toBe(0);
    expect(snap.openPositionsCount).toBe(0);
  });

  it('totalPnl = realizedPnl + unrealizedPnl (both rounded components add up)', () => {
    const snap = buildGlobalPnlSnapshot({
      summary: makeSummary({ netPnl: 10.004, totalTrades: 2, winRate: 0.5 }),
      positions: [{ symbol: 'BTCUSDC', unrealizedPnl: 5.006 }],
    });
    // 10.00 + 5.01 = 15.01 — the displayed arithmetic is exact.
    expect(snap.realizedPnl).toBe(10);
    expect(snap.unrealizedPnl).toBe(5.01);
    expect(snap.totalPnl).toBe(15.01);
    expect(snap.totalPnl).toBe(snap.realizedPnl + snap.unrealizedPnl);
  });

  it('realized is 0 when the summary is null even with open positions', () => {
    const snap = buildGlobalPnlSnapshot({
      summary: null,
      positions: [{ symbol: 'BTCUSDC', unrealizedPnl: 5 }],
    });
    expect(snap.realizedPnl).toBe(0);
    expect(snap.unrealizedPnl).toBe(5);
    expect(snap.totalPnl).toBe(5);
  });

  it('normalizes -0 to +0 so output is deterministic', () => {
    const snap = buildGlobalPnlSnapshot({
      summary: makeSummary({ netPnl: -0.001 }),
      positions: [],
    });
    expect(snap.realizedPnl).toBe(0);
    expect(Object.is(snap.realizedPnl, -0)).toBe(false);
    expect(snap.totalPnl).toBe(0);
  });

  it('round2 normalizes -0 to +0', () => {
    expect(round2(-0.001)).toBe(0);
    expect(Object.is(round2(-0.001), -0)).toBe(false);
    expect(round2(1.005)).toBe(1.01);
  });

  it('average trade = (netPnl + totalFees) / totalTrades, 2 decimals, 0 when no trades', () => {
    expect(
      buildGlobalPnlSnapshot({ summary: makeSummary({ netPnl: 10, totalFees: 2, totalTrades: 3 }), positions: [] }).avgTrade,
    ).toBe(4);
    expect(
      buildGlobalPnlSnapshot({ summary: makeSummary({ netPnl: 5, totalFees: 1, totalTrades: 2 }), positions: [] }).avgTrade,
    ).toBe(3);
    // 0 trades → 0, never division by zero.
    expect(
      buildGlobalPnlSnapshot({ summary: makeSummary({ netPnl: 5, totalFees: 1, totalTrades: 0 }), positions: [] }).avgTrade,
    ).toBe(0);
  });

  it('preserves the MAX_SAFE_INTEGER profitFactor sentinel verbatim (the ∞ marker)', () => {
    const snap = buildGlobalPnlSnapshot({
      summary: makeSummary({ profitFactor: Number.MAX_SAFE_INTEGER }),
      positions: [],
    });
    expect(snap.profitFactor).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rounds a finite profitFactor to 1 decimal and winRate to 1 decimal', () => {
    const snap = buildGlobalPnlSnapshot({
      summary: makeSummary({ profitFactor: 1.874, winRate: 0.684, totalTrades: 10 }),
      positions: [],
    });
    expect(snap.profitFactor).toBe(1.9);
    expect(snap.winRate).toBe(0.7);
  });

  it('caps perSymbol at the top 6 sorted by pnl desc', () => {
    const perSymbolStats = Array.from({ length: 8 }, (_, i) => ({
      key: `SYM${i}`,
      stats: makeStats({ netPnl: i * 10 }),
    }));
    const snap = buildGlobalPnlSnapshot({
      summary: null,
      positions: [],
      perSymbolStats,
    });
    expect(snap.perSymbol).toHaveLength(6);
    // Highest netPnl (70) first, descending.
    expect(snap.perSymbol[0]!.symbol).toBe('SYM7');
    expect(snap.perSymbol[0]!.pnl).toBe(70);
    expect(snap.perSymbol[5]!.symbol).toBe('SYM2');
  });

  it('perSymbol is empty when perSymbolStats is absent', () => {
    const snap = buildGlobalPnlSnapshot({ summary: null, positions: [] });
    expect(snap.perSymbol).toEqual([]);
  });

  it('rounds per-symbol pnl to 2 decimals', () => {
    const snap = buildGlobalPnlSnapshot({
      summary: null,
      positions: [],
      perSymbolStats: [{ key: 'BTC', stats: makeStats({ netPnl: 12.345 }) }],
    });
    expect(snap.perSymbol[0]!.pnl).toBe(12.35);
  });

  it('normalizes engine state case-insensitively', () => {
    expect(buildGlobalPnlSnapshot({ summary: null, positions: [], engineState: 'Running' }).engineState).toBe('running');
    expect(buildGlobalPnlSnapshot({ summary: null, positions: [], engineState: 'STOPPED' }).engineState).toBe('stopped');
    expect(buildGlobalPnlSnapshot({ summary: null, positions: [], engineState: 'error' }).engineState).toBe('error');
  });

  it('maps null/undefined/unknown engine state to unknown (never throws)', () => {
    expect(buildGlobalPnlSnapshot({ summary: null, positions: [] }).engineState).toBe('unknown');
    expect(buildGlobalPnlSnapshot({ summary: null, positions: [], engineState: null }).engineState).toBe('unknown');
    expect(buildGlobalPnlSnapshot({ summary: null, positions: [], engineState: 'oops' }).engineState).toBe('unknown');
  });

  it('uses the injected now for generatedAt', () => {
    const snap = buildGlobalPnlSnapshot({ summary: null, positions: [], now: NOW });
    expect(snap.generatedAt).toBe(NOW);
  });

  it('populates tradeCount, fees, best/worst and maxDrawdown from the summary', () => {
    const snap = buildGlobalPnlSnapshot({
      summary: makeSummary({
        totalTrades: 5,
        totalFees: 1.25,
        bestTrade: 20.001,
        worstTrade: -10.001,
        maxDrawdown: 15.001,
      }),
      positions: [],
    });
    expect(snap.tradeCount).toBe(5);
    expect(snap.totalFees).toBe(1.25);
    expect(snap.bestTrade).toBe(20);
    expect(snap.worstTrade).toBe(-10);
    expect(snap.maxDrawdown).toBe(15);
  });

  it('counts open positions and applies their unrealized pnl with sign', () => {
    const snap = buildGlobalPnlSnapshot({
      summary: null,
      positions: [
        { symbol: 'BTC', unrealizedPnl: 3.005 },
        { symbol: 'ETH', unrealizedPnl: -2.005 },
      ],
    });
    expect(snap.openPositionsCount).toBe(2);
    // 3.01 + -2.01 = 1.00
    expect(snap.unrealizedPnl).toBe(1);
  });
});