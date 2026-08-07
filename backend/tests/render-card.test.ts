/**
 * render-card.test.ts — Unit test for renderGlobalPnlCard's localized-label
 * wiring.
 *
 * The card renderer is PURE w.r.t. i18n: it imports no dictionary and resolves
 * every user-facing label from the `PnlCardLabels` argument. This test pins
 * that contract — every label the caller passes must land verbatim in the SVG
 * the renderer feeds to sharp (so a caller's localization actually reaches the
 * pixels), and a full valid labels map must not throw.
 *
 * sharp is mocked so the SVG string is captured for assertion and no real
 * rasterization happens in the unit layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderGlobalPnlCard, type PnlCardLabels } from '../src/telegram/report/renderCard.js';
import { buildGlobalPnlSnapshot } from '../src/services/globalPnl.js';
import { t } from '../src/telegram/i18n.js';

// Capture the SVG string the renderer hands to sharp so we assert the localized
// label VALUES appear in the markup (not just "didn't throw").
const capturedSvg: { value: string } = { value: '' };

vi.mock('sharp', () => ({
  default: (input: string | Buffer) => {
    capturedSvg.value = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
    return {
      resize: () => ({ png: () => ({ toBuffer: async () => Buffer.from('fake-png') }) }),
    };
  },
}));

const NOW = Date.UTC(2026, 7, 7, 14, 32);

/** A complete, valid labels map (English), matching the full PnlCardLabels shape. */
function enLabels(): PnlCardLabels {
  return {
    brand: t('en', 'cardBrand'),
    global: t('en', 'cardGlobal'),
    netRealizedUnrealized: t('en', 'cardNetRealizedUnrealized'),
    realized: t('en', 'cardRealized'),
    unrealized: t('en', 'cardUnrealized'),
    symbolPnl: t('en', 'cardSymbolPnl'),
    topMovers: t('en', 'cardTopMovers'),
    winRate: t('en', 'cardWinRate'),
    profitFactor: t('en', 'cardProfitFactor'),
    avgTrade: t('en', 'cardAvgTrade'),
    maxDrawdown: t('en', 'cardMaxDrawdown'),
    openPositions: t('en', 'cardOpenPositions'),
    generated: t('en', 'cardGenerated', { time: 'Aug 7, 2026 · 14:32 UTC' }),
    emptyState: t('en', 'cardEmptyState'),
    engineState: {
      running: t('en', 'cardEngineRunning'),
      stopped: t('en', 'cardEngineStopped'),
      error: t('en', 'cardEngineError'),
      unknown: t('en', 'cardEngineUnknown'),
    },
    footer: t('en', 'cardFooter', { report: t('en', 'cardReportWord') }),
  };
}

/** Build a snapshot with a fixed clock; positions/summary make realized+unrealized non-zero. */
function buildSnapshot(overrides: { engineState?: string | null } = {}): ReturnType<typeof buildGlobalPnlSnapshot> {
  return buildGlobalPnlSnapshot({
    summary: {
      totalTrades: 2,
      winRate: 0.5,
      netPnl: 100,
      totalFees: 5,
      profitFactor: 1.5,
      bestTrade: 60,
      worstTrade: -10,
      maxDrawdown: 15,
      recent: [],
    },
    positions: [
      { symbol: 'BTCUSDC', unrealizedPnl: 60 },
      { symbol: 'ETHUSDC', unrealizedPnl: 40 },
    ],
    engineState: overrides.engineState ?? 'running',
    now: NOW,
  });
}

describe('renderGlobalPnlCard label injection', () => {
  beforeEach(() => {
    capturedSvg.value = '';
  });

  it('injects every label value into the SVG (labels reach the rendered card)', async () => {
    const labels = enLabels();
    const buf = await renderGlobalPnlCard(buildSnapshot(), labels);
    expect(buf).toBeInstanceOf(Buffer);
    expect(capturedSvg.value.length).toBeGreaterThan(0);

    expect(capturedSvg.value).toContain(labels.brand);
    expect(capturedSvg.value).toContain(labels.global); // e.g. 'GLOBAL PNL'
    expect(capturedSvg.value).toContain(labels.realized);
    expect(capturedSvg.value).toContain(labels.unrealized);
    expect(capturedSvg.value).toContain(labels.symbolPnl);
    expect(capturedSvg.value).toContain(labels.topMovers);
    expect(capturedSvg.value).toContain(labels.winRate);
    expect(capturedSvg.value).toContain(labels.profitFactor);
    expect(capturedSvg.value).toContain(labels.avgTrade);
    expect(capturedSvg.value).toContain(labels.maxDrawdown);
    expect(capturedSvg.value).toContain(labels.openPositions);
    expect(capturedSvg.value).toContain(labels.generated);
    expect(capturedSvg.value).toContain(labels.emptyState);
    expect(capturedSvg.value).toContain(labels.footer);
  });

  it('injects the localized engine-state word into the SVG pill', async () => {
    const labels = enLabels();
    await renderGlobalPnlCard(buildSnapshot({ engineState: 'stopped' }), labels);
    expect(capturedSvg.value).toContain(labels.engineState.stopped);
  });

  it('does not throw with a full valid labels map (raster returns a Buffer)', async () => {
    const labels = enLabels();
    const buf = await renderGlobalPnlCard(buildSnapshot(), labels);
    expect(buf).toBeInstanceOf(Buffer);
  });
});
