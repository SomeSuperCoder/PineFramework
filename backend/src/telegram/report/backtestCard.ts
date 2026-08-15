/**
 * backtestCard.ts — Backtest result card renderer (SVG template -> PNG buffer).
 *
 * Renders a concise backtest summary as an 800x440 PNG, mirroring the visual
 * grammar of renderCard.ts (global PnL card): same navy gradient, dot grid,
 * hairline border, panels, and Inter + JetBrains Mono stacks. The template is
 * embedded verbatim below (no backticks, no `${` sequences) and values, colors
 * AND localized labels are injected via plain `{{...}}` string replacement —
 * never `${}` interpolation, per the design artifact.
 *
 * SIGN RULE (one rule, applied everywhere by this renderer):
 *   pnl >= 0          -> green #35D07F
 *   pnl <  0          -> red   #F6465D
 *   no trades         -> neutral #A6AEBF on EVERY value (mirrors renderCard's
 *                        empty-state rule)
 *   max drawdown      -> red #F6465D ALWAYS (a drawdown is a loss; the engine
 *                        stores it positive, so signColor alone would render
 *                        it green)
 *
 * PERCENT SEMANTICS — do NOT feed backtest percent values to formatRate():
 * the engine computes winRate / totalPnlPercent / maxDrawdownPercent /
 * buyHoldReturn as PERCENT VALUES (68.4 = 68.4%, strategy-metrics.ts), and
 * toApiResult passes them through RAW (backtest-result.ts). formatRate()
 * expects a 0..1 FRACTION (0.684) and would render 68.4 as 6840%. This card
 * uses its own formatPercentValue() for percent values, matching the CLI
 * display convention (multi-symbol-runner.ts: winRate.toFixed(1) + '%').
 *
 * Pure by design: BacktestApiResult + localized labels in -> PNG Buffer out.
 * No fs, no telegram, no i18n imports — the caller resolves every label
 * through t(lang, ...) and passes the finished strings in (same contract as
 * PnlCardLabels, including a fully-resolved generated-at stamp; format.ts
 * formatGeneratedAt is NOT reused so the renderer keeps zero dependency on
 * i18n, not even a type import). Emoji is intentionally absent from card
 * strings (SVG text does not render color emoji); sign colors carry the
 * semantic signal.
 */

import sharp from 'sharp';
import type { BacktestApiResult } from '../../backtest-contract.js';
import { formatAmount, formatMoney, formatProfitFactor } from './format.js';

// ── Palette tokens (single source of truth for the sign rule) ────────────────
const GREEN = '#35D07F';
const RED = '#F6465D';
const NEUTRAL = '#A6AEBF';

/** Sign rule: pnl >= 0 green, pnl < 0 red. */
function signColor(n: number): string {
  return n >= 0 ? GREEN : RED;
}

/** Minimal XML escaping so adversarial symbols can't break the SVG markup. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a PERCENT VALUE (68.4 = 68.4%) with 1 decimal and an optional +/−
 * sign. Zero renders unsigned ('0.0%'), matching formatMoney's zero
 * convention. NOT formatRate(): the backtest metrics are percent values, not
 * 0..1 fractions (see module header).
 */
function formatPercentValue(pct: number, signed = false): string {
  const r = Math.round(pct * 10) / 10;
  // Use Math.abs(r) so the sign is applied only via the `sign` variable,
  // preventing double-minus when r is negative (e.g. --5.2%).
  const body = Math.abs(r).toFixed(1).replace(/\.0$/, '');
  const sign = signed ? (r > 0 ? '+' : r < 0 ? '-' : '') : '';
  return `${sign}${body}%`;
}

/**
 * The card template, embedded VERBATIM from the renderCard visual grammar
 * (svg element only; geometry + design formulas live in this file's header
 * comment). A set of {{...}} placeholders — do not add `${` interpolation.
 *
 * Geometry:
 *   header eyebrow y=41, engine pill y=28..50 (right)
 *   headline: "NET PNL" y=78, hero money y=124 (46px), hero % y=154 (20px)
 *   settings panel x=486..768 y=62..180, 5 key/value rows y=110..174
 *   performance header y=208, grid rows centered cy=250 / cy=302
 *     (labels cy-24, values cy+4, drawdown money sub-line cy+26)
 *   bottom strip y=356..396, 3 columns x=192 / 400 / 608
 *   footer meta y=414
 */
const BACKTEST_CARD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="440" viewBox="0 0 800 440" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0A0E16"/>
      <stop offset="1" stop-color="#101726"/>
    </linearGradient>
    <radialGradient id="glowGreen" cx="0.12" cy="0" r="1.1" fx="0.12" fy="0">
      <stop offset="0" stop-color="#35D07F" stop-opacity="0.10"/>
      <stop offset="0.55" stop-color="#35D07F" stop-opacity="0.02"/>
      <stop offset="1" stop-color="#35D07F" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dotGrid" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#FFFFFF" opacity="0.035"/>
    </pattern>
    <linearGradient id="gradGreen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3BEC8E"/>
      <stop offset="1" stop-color="#0FAE72"/>
    </linearGradient>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.07"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.02"/>
    </linearGradient>
  </defs>

  <!-- Background: deep navy gradient + faint green glow + dotted grid + hairline border -->
  <rect width="800" height="440" fill="url(#bgGrad)"/>
  <rect width="800" height="440" fill="url(#glowGreen)"/>
  <rect width="800" height="440" fill="url(#dotGrid)"/>
  <rect x="0.5" y="0.5" width="799" height="439" fill="none" stroke="#FFFFFF" stroke-opacity="0.06"/>

  <!-- Header: brand eyebrow (left) + engine pill (right) -->
  <g>
    <rect x="32" y="33" width="6" height="6" rx="3" fill="url(#gradGreen)"/>
    <text x="44" y="41" font-size="11" font-weight="700" letter-spacing="2.2" fill="#8A93A6">{{lblBrand}}</text>

    <rect x="668" y="28" width="100" height="22" rx="11" fill="url(#panelGrad)" stroke="#FFFFFF" stroke-opacity="0.08"/>
    <circle cx="688" cy="39" r="3" fill="#35D07F"/>
    <text x="700" y="43.5" font-size="11" font-weight="600" fill="#E6E9F0">{{lblEngine}}</text>
  </g>

  <!-- Headline zone: NET PNL hero (left) + effective settings panel (right) -->
  <g>
    <text x="32" y="78" font-size="12" font-weight="700" letter-spacing="2.4" fill="#8A93A6">{{lblNet}}</text>
    <text x="32" y="124" font-size="46" font-weight="800" letter-spacing="-1" fill="{{headlineColor}}" font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">{{totalPnl}}</text>
    <text x="32" y="154" font-size="20" font-weight="700" fill="{{headlineColor}}" font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">{{totalPnlPercent}}</text>

    <rect x="486" y="62" width="282" height="118" rx="16" fill="url(#panelGrad)" stroke="#FFFFFF" stroke-opacity="0.08"/>
    <text x="500" y="82" font-size="10" font-weight="700" letter-spacing="1.4" fill="#6B7386">{{lblSettings}}</text>
    <line x1="498" y1="90" x2="756" y2="90" stroke="#FFFFFF" stroke-opacity="0.06"/>
    <g font-size="10" font-weight="500" fill="#6B7386">
      <text x="500" y="110">{{lblSetSymbol}}</text>
      <text x="500" y="126">{{lblSetTimeframe}}</text>
      <text x="500" y="142">{{lblSetRange}}</text>
      <text x="500" y="158">{{lblSetMethod}}</text>
      <text x="500" y="174">{{lblSetCapital}}</text>
    </g>
    <g font-size="12" font-weight="600" fill="#E6E9F0" text-anchor="end" font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">
      <text x="756" y="110">{{setSymbol}}</text>
      <text x="756" y="126">{{setTimeframe}}</text>
      <text x="756" y="142">{{setRange}}</text>
      <text x="756" y="158">{{setMethod}}</text>
      <text x="756" y="174">{{setCapital}}</text>
    </g>
  </g>

  <!-- Performance section header -->
  <g>
    <text x="32" y="208" font-size="11" font-weight="700" letter-spacing="2" fill="#8A93A6">{{lblPerformance}}</text>
    <text x="768" y="208" font-size="10.5" font-weight="500" fill="#5E6678" text-anchor="end">{{lblBarsAnnotation}}</text>
  </g>

  <!-- Performance grid: 2 rows x 3 columns (cy=250, 302; x=160, 400, 640) -->
  <g font-size="10" font-weight="700" letter-spacing="1.2" fill="#6B7386" text-anchor="middle">
    <text x="160" y="226">{{lblTrades}}</text>
    <text x="400" y="226">{{lblWinRate}}</text>
    <text x="640" y="226">{{lblProfitFactor}}</text>
    <text x="160" y="278">{{lblMaxDrawdown}}</text>
    <text x="400" y="278">{{lblSharpe}}</text>
    <text x="640" y="278">{{lblBuyHold}}</text>
  </g>
  <g font-size="17" font-weight="700" text-anchor="middle" font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">
    <text x="160" y="254" fill="#E6E9F0">{{trades}}</text>
    <text x="400" y="254" fill="#E6E9F0">{{winRate}}</text>
    <text x="640" y="254" fill="#E6E9F0">{{profitFactor}}</text>
    <text x="160" y="306" fill="{{maxDrawdownColor}}">{{maxDrawdown}}</text>
    <text x="400" y="306" fill="#E6E9F0">{{sharpe}}</text>
    <text x="640" y="306" fill="{{buyHoldColor}}">{{buyHold}}</text>
  </g>
  <g font-size="11" font-weight="600" text-anchor="middle" font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">
    <text x="160" y="328" fill="{{maxDrawdownColor}}">{{maxDrawdownMoney}}</text>
  </g>

  <!-- Bottom metrics strip -->
  <g>
    <rect x="32" y="356" width="736" height="40" rx="14" fill="url(#panelGrad)" stroke="#FFFFFF" stroke-opacity="0.08"/>
    <g font-size="10" font-weight="700" letter-spacing="1" fill="#6B7386" text-anchor="middle">
      <text x="192" y="374">{{lblCommission}}</text>
      <text x="400" y="374">{{lblBars}}</text>
      <text x="608" y="374">{{lblAvgTrade}}</text>
    </g>
    <g font-size="15" font-weight="600" text-anchor="middle" font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">
      <text x="192" y="390" fill="#E6E9F0">{{commission}}</text>
      <text x="400" y="390" fill="#E6E9F0">{{bars}}</text>
      <text x="608" y="390" fill="{{avgTradeColor}}">{{avgTrade}}</text>
    </g>
  </g>

  <!-- Footer meta: generated-at timestamp (left) + brand (right) -->
  <g>
    <text x="32" y="414" font-size="10.5" font-weight="500" fill="#5E6678" font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">{{generated}}</text>
    <text x="768" y="414" font-size="10.5" font-weight="500" fill="#5E6678" text-anchor="end">{{lblFooter}}</text>
  </g>
</svg>`;

/**
 * Localized label set for the backtest card. The renderer stays PURE: it
 * imports no i18n — the caller resolves every label through t(lang, ...) and
 * passes the finished strings in. Emoji is intentionally absent from these
 * card strings (SVG text does not render color emoji); the sign colors carry
 * the semantic signal.
 *
 * `settingsValues` are the settings the API payload does NOT carry (timeframe,
 * lookback, commission-method label — they live on the run job) plus fallbacks
 * for symbol/capital. Where the payload DOES carry a value (effectiveConfig),
 * the renderer prefers it: symbol <- effectiveConfig.symbol, capital <-
 * formatAmount(effectiveConfig.initialCapital).
 */
export interface BacktestCardLabels {
  /** Header brand eyebrow, e.g. "PINE FRAMEWORK". */
  brand: string;
  /** Engine pill label, e.g. "BACKTEST". */
  engine: string;
  /** Headline "NET PNL". */
  netPnl: string;
  /** Settings panel header. */
  settings: string;
  /** Settings row keys (left column of the settings panel). */
  settingsKeys: {
    symbol: string;
    timeframe: string;
    range: string;
    method: string;
    capital: string;
  };
  /** Settings row values the caller resolves from the run job + i18n
   *  (e.g. "SOLUSDT", "60m", "90d", "Jupiter Swap", "$10,000.00"). */
  settingsValues: {
    symbol: string;
    timeframe: string;
    range: string;
    method: string;
    capital: string;
  };
  /** Performance section header. */
  performance: string;
  /** Right of the performance header, e.g. "1,234 bars". */
  barsAnnotation: string;
  /** Performance metric labels. */
  trades: string;
  winRate: string;
  profitFactor: string;
  maxDrawdown: string;
  sharpe: string;
  buyHold: string;
  /** Bottom strip labels. */
  commission: string;
  bars: string;
  avgTrade: string;
  /** Fully-resolved generated-at stamp, e.g. t(lang,'cardGenerated',{time}). */
  generated: string;
  /** Footer brand line, e.g. "PineFramework · backtest". */
  footer: string;
}

/**
 * Render the backtest result card as an 800x440 PNG buffer.
 *
 * Pure: BacktestApiResult + localized labels in -> Buffer out. No fs, no
 * telegram. The no-trades state (totalTrades === 0) forces every value color
 * to neutral, mirroring renderCard's empty-state rule.
 */
export async function renderBacktestCard(
  result: BacktestApiResult,
  labels: BacktestCardLabels,
): Promise<Buffer> {
  const m = result.metrics;
  const empty = m.totalTrades === 0;

  // Colors: empty state -> every value neutral; otherwise the sign rule.
  const headlineColor = empty ? NEUTRAL : signColor(m.totalPnl);
  const maxDrawdownColor = empty ? NEUTRAL : RED;
  const buyHoldColor = empty ? NEUTRAL : signColor(result.buyHoldReturn);
  const avgTrade = m.totalTrades > 0 ? m.totalPnl / m.totalTrades : 0;
  const avgTradeColor = empty ? NEUTRAL : signColor(avgTrade);

  // Effective settings: prefer the payload's effectiveConfig (what actually
  // ran), else the caller-resolved label fallbacks.
  const symbol = result.effectiveConfig.symbol ?? labels.settingsValues.symbol;
  // Capital is an AMOUNT, not PnL — unsigned (no leading '+').
  const capital = formatAmount(result.effectiveConfig.initialCapital);

  const svg = BACKTEST_CARD_SVG
    // Hero.
    .replaceAll('{{totalPnl}}', escapeXml(formatMoney(m.totalPnl)))
    .replaceAll('{{totalPnlPercent}}', escapeXml(formatPercentValue(m.totalPnlPercent, true)))
    // Performance grid.
    .replaceAll('{{trades}}', escapeXml(String(m.totalTrades)))
    .replaceAll('{{winRate}}', escapeXml(formatPercentValue(m.winRate)))
    .replaceAll('{{profitFactor}}', escapeXml(m.profitFactor === null ? '∞' : formatProfitFactor(m.profitFactor)))
    .replaceAll('{{maxDrawdown}}', escapeXml(formatPercentValue(m.maxDrawdownPercent)))
    .replaceAll('{{maxDrawdownMoney}}', escapeXml(formatMoney(-m.maxDrawdown)))
    .replaceAll('{{sharpe}}', escapeXml(m.sharpeRatio === null ? '—' : m.sharpeRatio.toFixed(2)))
    .replaceAll('{{buyHold}}', escapeXml(formatPercentValue(result.buyHoldReturn, true)))
    // Bottom strip.
    .replaceAll('{{commission}}', escapeXml(formatAmount(m.commission)))
    .replaceAll('{{bars}}', escapeXml(String(result.barCount)))
    .replaceAll('{{avgTrade}}', escapeXml(m.totalTrades > 0 ? formatMoney(avgTrade) : '—'))
    // Settings panel (adversarial symbols/method labels are escaped).
    .replaceAll('{{setSymbol}}', escapeXml(symbol))
    .replaceAll('{{setTimeframe}}', escapeXml(labels.settingsValues.timeframe))
    .replaceAll('{{setRange}}', escapeXml(labels.settingsValues.range))
    .replaceAll('{{setMethod}}', escapeXml(labels.settingsValues.method))
    .replaceAll('{{setCapital}}', escapeXml(capital))
    // Localized labels.
    .replaceAll('{{lblBrand}}', escapeXml(labels.brand))
    .replaceAll('{{lblEngine}}', escapeXml(labels.engine))
    .replaceAll('{{lblNet}}', escapeXml(labels.netPnl))
    .replaceAll('{{lblSettings}}', escapeXml(labels.settings))
    .replaceAll('{{lblSetSymbol}}', escapeXml(labels.settingsKeys.symbol))
    .replaceAll('{{lblSetTimeframe}}', escapeXml(labels.settingsKeys.timeframe))
    .replaceAll('{{lblSetRange}}', escapeXml(labels.settingsKeys.range))
    .replaceAll('{{lblSetMethod}}', escapeXml(labels.settingsKeys.method))
    .replaceAll('{{lblSetCapital}}', escapeXml(labels.settingsKeys.capital))
    .replaceAll('{{lblPerformance}}', escapeXml(labels.performance))
    .replaceAll('{{lblBarsAnnotation}}', escapeXml(labels.barsAnnotation))
    .replaceAll('{{lblTrades}}', escapeXml(labels.trades))
    .replaceAll('{{lblWinRate}}', escapeXml(labels.winRate))
    .replaceAll('{{lblProfitFactor}}', escapeXml(labels.profitFactor))
    .replaceAll('{{lblMaxDrawdown}}', escapeXml(labels.maxDrawdown))
    .replaceAll('{{lblSharpe}}', escapeXml(labels.sharpe))
    .replaceAll('{{lblBuyHold}}', escapeXml(labels.buyHold))
    .replaceAll('{{lblCommission}}', escapeXml(labels.commission))
    .replaceAll('{{lblBars}}', escapeXml(labels.bars))
    .replaceAll('{{lblAvgTrade}}', escapeXml(labels.avgTrade))
    .replaceAll('{{generated}}', escapeXml(labels.generated))
    .replaceAll('{{lblFooter}}', escapeXml(labels.footer))
    // Colors (fixed token set — safe).
    .replaceAll('{{headlineColor}}', headlineColor)
    .replaceAll('{{maxDrawdownColor}}', maxDrawdownColor)
    .replaceAll('{{buyHoldColor}}', buyHoldColor)
    .replaceAll('{{avgTradeColor}}', avgTradeColor);

  // Rasterize at the SVG's native 800x440, then enforce the exact output size
  // (same as renderCard — the explicit resize guarantees exactly 800x440).
  return sharp(Buffer.from(svg)).resize({ width: 800, height: 440 }).png().toBuffer();
}
