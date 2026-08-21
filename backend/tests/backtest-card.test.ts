/**
 * backtest-card.test.ts — Unit tests for the Telegram backtest result card
 * renderer (OpenSpec telegram-backtest-flow, contract M1):
 * `renderBacktestCard(result, labels) → Promise<Buffer>` — a pure, fully
 * localized 800×440 PNG renderer.
 *
 * sharp is mocked (repo convention, same as render-card.test.ts): the SVG
 * source string is captured so assertions inspect exactly what the card
 * would rasterize — escaping, sign colors and no-trade placeholders included.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderBacktestCard, type BacktestCardLabels } from '../src/telegram/report/backtestCard.js';
import type { BacktestApiResult, BacktestApiMetrics } from '../src/backtest-contract.js';
import { t } from '../src/telegram/i18n.js';
import { DEFAULT_STRATEGY_CONFIG } from 'pine-framework';

// ── sharp mock: capture the SVG string + resize args (mock*-prefixed so
//    vitest hoisting is respected). ────────────────────────────────────────
const mockCaptured: { svg: string; resize?: { width: number; height: number } } = { svg: '' };
vi.mock('sharp', () => ({
  default: (input: string | Buffer) => {
    mockCaptured.svg = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
    return {
      resize: (args: { width: number; height: number }) => {
        mockCaptured.resize = args;
        return { png: () => ({ toBuffer: async () => Buffer.from('fake-png') }) };
      },
    };
  },
}));

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function makeLabels(overrides: Partial<BacktestCardLabels> = {}): BacktestCardLabels {
  return {
    brand: t('en', 'cardBrand'),
    engine: t('en', 'backtestCardEngine'),
    netPnl: t('en', 'backtestCardNet'),
    settings: t('en', 'backtestCardSettings'),
    settingsKeys: {
      symbol: t('en', 'backtestCardSetSymbol'),
      timeframe: t('en', 'backtestCardSetTimeframe'),
      range: t('en', 'backtestCardSetRange'),
      method: t('en', 'backtestCardSetMethod'),
      capital: t('en', 'backtestCardSetCapital'),
    },
    settingsValues: {
      symbol: 'BTCUSDT',
      timeframe: '60m',
      range: '30d',
      method: 'Manual',
      capital: '$10,000.00',
    },
    performance: t('en', 'backtestCardPerformance'),
    barsAnnotation: t('en', 'backtestCardBarsAnnotation', { bars: '120' }),
    trades: t('en', 'backtestCardTrades'),
    winRate: t('en', 'backtestCardWinRate'),
    profitFactor: t('en', 'backtestCardProfitFactor'),
    maxDrawdown: t('en', 'backtestCardMaxDrawdown'),
    sharpe: t('en', 'backtestCardSharpe'),
    buyHold: t('en', 'backtestCardBuyHold'),
    commission: t('en', 'backtestCardCommission'),
    bars: t('en', 'backtestCardBars'),
    avgTrade: t('en', 'backtestCardAvgTrade'),
    generated: t('en', 'backtestCardGenerated', { time: 'Aug 7, 2026 · 14:32 UTC' }),
    footer: t('en', 'backtestCardFooter'),
    ...overrides,
  };
}

function makeResult(
  overrides: {
    metrics?: Partial<BacktestApiMetrics>;
    effectiveConfig?: Partial<BacktestApiResult['effectiveConfig']>;
    buyHoldReturn?: number;
    barCount?: number;
  } = {},
): BacktestApiResult {
  const metrics: BacktestApiMetrics = {
    totalTrades: 4,
    winningTrades: 3,
    losingTrades: 1,
    winRate: 75,
    profitFactor: 2.5,
    totalPnl: 250,
    totalPnlPercent: 2.5,
    maxDrawdown: 40,
    maxDrawdownPercent: 4,
    sharpeRatio: 1.25,
    sortinoRatio: 1.1,
    averageWin: 90,
    averageLoss: -20,
    largestWin: 120,
    largestLoss: -30,
    averageTradeDuration: 120,
    commission: 3.5,
    ...overrides.metrics,
  };
  return {
    metrics,
    equityCurve: [],
    drawdownCurve: [],
    trades: [],
    orders: [],
    equityPoints: [],
    monthlyReturns: {},
    buyHoldReturn: overrides.buyHoldReturn ?? 8,
    barCount: overrides.barCount ?? 120,
    effectiveConfig: {
      ...DEFAULT_STRATEGY_CONFIG,
      symbol: 'BTCUSDT',
      commissionMethod: 'jupiter_manual',
      ...overrides.effectiveConfig,
    },
    warnings: [],
  };
}

describe('renderBacktestCard', () => {
  it('renders an 800×440 PNG Buffer', async () => {
    const buf = await renderBacktestCard(makeResult(), makeLabels());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(mockCaptured.resize).toEqual({ width: 800, height: 440 });
    expect(mockCaptured.svg.length).toBeGreaterThan(100);
  });

  it('injects the localized labels into the SVG', async () => {
    const labels = makeLabels();
    await renderBacktestCard(makeResult(), labels);
    const svg = mockCaptured.svg;
    for (const needle of [
      labels.brand,
      labels.engine,
      labels.netPnl,
      labels.performance,
      labels.trades,
      labels.winRate,
      labels.profitFactor,
      labels.maxDrawdown,
      labels.buyHold.replace('&', '&amp;'), // 'Buy & hold' is XML-escaped in the SVG
      labels.generated,
      labels.footer,
    ]) {
      expect(svg).toContain(needle);
    }
  });

  it('escapes adversarial symbol and label values (no raw HTML can reach the SVG)', async () => {
    await renderBacktestCard(
      makeResult({ effectiveConfig: { symbol: '<evil>&"' } }),
      makeLabels({ settings: 'Set "tings"' }),
    );
    const svg = mockCaptured.svg;
    expect(svg).toContain('&lt;evil&gt;&amp;&quot;');
    expect(svg).not.toContain('<evil>');
    expect(svg).toContain('Set &quot;tings&quot;');
    expect(svg).not.toContain('Set "tings"');
  });

  it('no-trade card shows neutral colors and dashes, never NaN', async () => {
    await renderBacktestCard(
      makeResult({
        metrics: {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          profitFactor: null,
          totalPnl: 0,
          totalPnlPercent: 0,
          maxDrawdown: 0,
          maxDrawdownPercent: 0,
          sharpeRatio: null,
          sortinoRatio: null,
          averageWin: 0,
          averageLoss: 0,
          largestWin: 0,
          largestLoss: 0,
          averageTradeDuration: 0,
          commission: 0,
        },
      }),
      makeLabels(),
    );
    const svg = mockCaptured.svg;
    expect(svg).toContain('∞'); // profitFactor placeholder
    expect(svg).toContain('—'); // sharpe + avgTrade placeholders
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('#A6AEBF'); // neutral color used
    expect(svg).not.toContain('#F6465D'); // no red anywhere on an empty card
  });

  it('negative PnL paints the headline/buy-hold red; positive stays red only for drawdown', async () => {
    const negative = makeResult({ metrics: { totalPnl: -250, totalPnlPercent: -2.5 }, buyHoldReturn: -8 });
    await renderBacktestCard(negative, makeLabels());
    const redSvg = mockCaptured.svg;
    expect(redSvg).toContain('-$250.00');
    // RED: headline + maxDrawdown (2 elements) + buyHold + avgTrade = 5
    expect(countOccurrences(redSvg, '#F6465D')).toBeGreaterThanOrEqual(4);

    const positive = makeResult({ metrics: { totalPnl: 250, totalPnlPercent: 2.5 }, buyHoldReturn: 8 });
    await renderBacktestCard(positive, makeLabels());
    const greenSvg = mockCaptured.svg;
    expect(greenSvg).toContain('+$250.00');
    // GREEN headline; RED only on maxDrawdown (value + money sub-line = 2)
    expect(countOccurrences(greenSvg, '#F6465D')).toBe(2);
  });

  it('prefers effectiveConfig values over label fallbacks', async () => {
    await renderBacktestCard(
      makeResult({ effectiveConfig: { symbol: 'ETHUSDT', initialCapital: 20000 } }),
      makeLabels(),
    );
    const svg = mockCaptured.svg;
    expect(svg).toContain('ETHUSDT');
    expect(svg).toContain('$20,000.00');

    // Fallback: no symbol in effectiveConfig → the localized settings value wins.
    await renderBacktestCard(
      makeResult({ effectiveConfig: { symbol: undefined as unknown as string } }),
      makeLabels(),
    );
    expect(mockCaptured.svg).toContain('BTCUSDT');
  });
});
