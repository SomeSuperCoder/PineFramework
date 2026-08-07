/**
 * renderCard.ts — Global PnL card renderer (SVG template -> PNG buffer).
 *
 * The card template (pnl-card.template.svg) is embedded verbatim below as a
 * static template literal: it contains NO backticks and NO `${` sequences, so
 * pasting it is safe. Values, colors AND localized labels are injected via
 * plain `{{...}}` string replacement — never `${}` interpolation — per the
 * design artifact. All user-facing label text is a `{{lbl...}}` placeholder
 * resolved from the `PnlCardLabels` argument (the caller localizes via i18n);
 * only geometry/colors stay literal.
 *
 * SIGN RULE (one rule, applied everywhere by this renderer):
 *   pnl >= 0  -> green #35D07F  (bar gradient url(#gradGreen))
 *   pnl <  0  -> red   #F6465D  (bar gradient url(#gradRed))
 *   no trades -> neutral #A6AEBF on EVERY value; {{symbolRows}} becomes the
 *                empty-state group.
 *
 * ENGINE STATE:
 *   running -> color #35D07F  bg rgba(53,208,127,0.14)
 *   stopped -> color #F59E0B  bg rgba(245,158,11,0.14)
 *   error   -> color #F6465D  bg rgba(246,70,93,0.14)
 *   unknown -> color #A6AEBF  bg rgba(166,174,191,0.14)  (renderer default;
 *              the artifact defines running/stopped/error only — unknown falls
 *              back to the neutral palette, same as no-trades).
 *
 * PER-SYMBOL BAR ROW (replaces {{symbolRows}}), from the template header:
 *   Row i center cy = 201 + i*26 (i = 0..5). Axis x = 392, max half width 240.
 *   w = max(3, round(|pnl| / maxAbsPnl * 240)) when |pnl| > 0 else 0.
 *   Positive grows right, negative grows left (rounded Q end); zero = center
 *   dot r2.5 #5E6678. Value text x=768 anchor=end, symbol x=32, mono 13px.
 *   Rows are sorted by |pnl| DESC (top movers), capped at 6.
 *
 * Pure-ish by design: snapshot in -> PNG Buffer out. No fs, no telegram
 * imports — the caller decides where the buffer goes.
 */

import sharp from 'sharp';
import type { GlobalPnlSnapshot, GlobalPnlSymbol } from '../../services/globalPnl.js';
import {
  formatMoney,
  formatRate,
  formatProfitFactor,
} from './format.js';

// ── Palette tokens (single source of truth for the sign rule) ────────────────
const GREEN = '#35D07F';
const RED = '#F6465D';
const NEUTRAL = '#A6AEBF';
const DOT = '#5E6678';
const SYMBOL_TEXT = '#C6CDDB';
const TRACK_FILL = '#FFFFFF';

// Font stack used by generated rows — matches the template's hardcoded stacks.
const MONO_FONT =
  "'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', " +
  'Consolas, \'Liberation Mono\', Menlo, monospace';

/** Engine-state pill tokens (color + background). The word is localized by the
 *  caller and injected through `PnlCardLabels.engineState`. */
const ENGINE_STATE_TOKENS: Record<
  GlobalPnlSnapshot['engineState'],
  { color: string; bg: string }
> = {
  running: { color: GREEN, bg: 'rgba(53,208,127,0.14)' },
  stopped: { color: '#F59E0B', bg: 'rgba(245,158,11,0.14)' },
  error: { color: RED, bg: 'rgba(246,70,93,0.14)' },
  unknown: { color: NEUTRAL, bg: 'rgba(166,174,191,0.14)' },
};

/** Empty-state group shown when there are no per-symbol rows. */
function emptyStateGroup(label: string): string {
  return `<g>
    <text x="392" y="266" text-anchor="middle" font-size="13" font-weight="500" fill="#6B7386">${escapeXml(label)}</text>
  </g>`;
}

/**
 * The card template, embedded VERBATIM from pnl-card.template.svg (svg element
 * only; the design formulas live in this file's header comment). A set of
 * {{...}} placeholders — do not add `${` interpolation here.
 */
const PNL_CARD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="440" viewBox="0 0 800 440" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">
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
    <linearGradient id="gradRed" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#FF7A85"/>
      <stop offset="1" stop-color="#E53950"/>
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

  <!-- Header: brand eyebrow (left) + engine state pill (right) -->
  <g>
    <rect x="32" y="33" width="6" height="6" rx="3" fill="url(#gradGreen)"/>
    <text x="44" y="41" font-size="11" font-weight="700" letter-spacing="2.2" fill="#8A93A6">{{lblBrand}}</text>

    <rect x="668" y="28" width="100" height="22" rx="11" fill="{{engineStateBg}}" stroke="#FFFFFF" stroke-opacity="0.08"/>
    <circle cx="688" cy="39" r="3" fill="{{engineStateColor}}"/>
    <text x="700" y="43.5" font-size="11" font-weight="600" fill="{{engineStateColor}}">{{engineState}}</text>
  </g>

  <!-- Headline zone: Global PnL hero number (left) + Realized/Unrealized split panel (right) -->
  <g>
    <text x="32" y="78" font-size="12" font-weight="700" letter-spacing="2.4" fill="#8A93A6">{{lblGlobal}}</text>
    <text x="32" y="124" font-size="46" font-weight="800" letter-spacing="-1" fill="{{headlineColor}}" font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">{{totalPnl}}</text>
    <text x="32" y="146" font-size="11.5" font-weight="500" fill="#6B7386">{{lblNet}}</text>

    <rect x="486" y="62" width="282" height="84" rx="16" fill="url(#panelGrad)" stroke="#FFFFFF" stroke-opacity="0.08"/>
    <line x1="627" y1="74" x2="627" y2="134" stroke="#FFFFFF" stroke-opacity="0.08"/>
    <text x="556.5" y="84" font-size="10" font-weight="700" letter-spacing="1.2" fill="#6B7386" text-anchor="middle">{{lblRealized}}</text>
    <g font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">
      <text x="556.5" y="122" font-size="20" font-weight="700" fill="{{realizedColor}}" text-anchor="middle">{{realizedPnl}}</text>
      <text x="697.5" y="122" font-size="20" font-weight="700" fill="{{unrealizedColor}}" text-anchor="middle">{{unrealizedPnl}}</text>
    </g>
    <text x="697.5" y="84" font-size="10" font-weight="700" letter-spacing="1.2" fill="#6B7386" text-anchor="middle">{{lblUnrealized}}</text>
  </g>

  <!-- Per-symbol section header -->
  <g>
    <text x="32" y="174" font-size="11" font-weight="700" letter-spacing="2" fill="#8A93A6">{{lblSymbolPnl}}</text>
    <text x="768" y="174" font-size="10.5" font-weight="500" fill="#5E6678" text-anchor="end">{{lblTopMovers}}</text>
  </g>

  <!-- Per-symbol bars: backend generates 0..6 row groups (see comment header for
       formula + example) and injects them here. Row i vertical center cy = 201 + i*26. -->
  <g id="symbol-rows">{{symbolRows}}</g>

  <!-- Footer metrics strip -->
  <g>
    <rect x="32" y="356" width="736" height="40" rx="14" fill="url(#panelGrad)" stroke="#FFFFFF" stroke-opacity="0.08"/>
    <g font-size="10" font-weight="700" letter-spacing="1" fill="#6B7386" text-anchor="middle">
      <text x="105.6" y="374">{{lblWinRate}}</text>
      <text x="252.8" y="374">{{lblProfitFactor}}</text>
      <text x="400" y="374">{{lblAvgTrade}}</text>
      <text x="547.2" y="374">{{lblMaxDrawdown}}</text>
      <text x="694.4" y="374">{{lblOpenPositions}}</text>
    </g>
    <g font-size="15" font-weight="600" text-anchor="middle" font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">
      <text x="105.6" y="390" fill="#E6E9F0">{{winRate}}</text>
      <text x="252.8" y="390" fill="#E6E9F0">{{profitFactor}}</text>
      <text x="400" y="390" fill="{{avgTradeColor}}">{{avgTrade}}</text>
      <text x="547.2" y="390" fill="{{maxDrawdownColor}}">{{maxDrawdown}}</text>
      <text x="694.4" y="390" fill="#E6E9F0">{{openPositions}}</text>
    </g>
  </g>

  <!-- Footer meta: generated-at timestamp (left) + brand (right) -->
  <g>
    <text x="32" y="414" font-size="10.5" font-weight="500" fill="#5E6678" font-family="'JetBrains Mono', 'SF Mono', 'Roboto Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace">{{generated}}</text>
    <text x="768" y="414" font-size="10.5" font-weight="500" fill="#5E6678" text-anchor="end">{{lblFooter}}</text>
  </g>
</svg>`;

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
 * Build one bar-row group. `cy` is the row's vertical center
 * (201 + index*26 per the design artifact).
 */
function renderRow(symbol: GlobalPnlSymbol, index: number, maxAbs: number): string {
  const cy = 201 + index * 26;
  const { pnl } = symbol;
  const abs = Math.abs(pnl);
  const name = escapeXml(symbol.symbol);
  const value = formatMoney(pnl);

  const track = `<rect x="152" y="${cy - 4}" width="480" height="8" rx="4" fill="${TRACK_FILL}" fill-opacity="0.05"/>`;
  const symbolText = `<text x="32" y="${cy + 4.5}" font-size="13" font-weight="600" fill="${SYMBOL_TEXT}" font-family="${MONO_FONT}">${name}</text>`;
  const valueText = `<text x="768" y="${cy + 4.5}" text-anchor="end" font-size="13" font-weight="700" fill="${signColor(pnl)}" font-family="${MONO_FONT}">${value}</text>`;

  // Zero row: center dot only (no bar).
  if (abs === 0) {
    const dot = `<circle cx="392" cy="${cy}" r="2.5" fill="${DOT}"/>`;
    return `<g>\n${symbolText}\n${track}\n${dot}\n${valueText}\n</g>`;
  }

  // w = max(3, round(|pnl| / maxAbsPnl * 240)); positive grows right, negative left.
  const w = Math.max(3, Math.round((abs / maxAbs) * 240));
  const gradient = pnl >= 0 ? 'url(#gradGreen)' : 'url(#gradRed)';
  const path =
    pnl >= 0
      ? `M 392 ${cy - 4} L ${392 + w - 4} ${cy - 4} Q ${392 + w} ${cy - 4} ${392 + w} ${cy} Q ${392 + w} ${cy + 4} ${392 + w - 4} ${cy + 4} L 392 ${cy + 4} Z`
      : `M 392 ${cy - 4} L ${392 - w + 4} ${cy - 4} Q ${392 - w} ${cy - 4} ${392 - w} ${cy} Q ${392 - w} ${cy + 4} ${392 - w + 4} ${cy + 4} L 392 ${cy + 4} Z`;

  return `<g>\n${symbolText}\n${track}\n<path d="${path}" fill="${gradient}"/>\n${valueText}\n</g>`;
}

/**
 * Build the {{symbolRows}} markup: rows sorted by |pnl| DESC (top movers),
 * capped at 6, OR the empty-state group when there are no symbols.
 * Returns the row markup; the caller already decides neutral colors for the
 * empty case.
 */
function buildSymbolRows(symbols: GlobalPnlSymbol[], emptyLabel: string): string {
  if (symbols.length === 0) return emptyStateGroup(emptyLabel);

  const rows = [...symbols]
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 6);
  const maxAbs = Math.max(...rows.map((s) => Math.abs(s.pnl)));
  return rows.map((s, i) => renderRow(s, i, maxAbs)).join('\n');
}

/**
 * Localized label set for the global PnL card. The renderer stays PURE: it
 * imports no i18n — the caller resolves every label through `t(lang, ...)`
 * and passes the finished strings in. Emoji is intentionally absent from
 * these card strings (SVG text does not render color emoji); the pill dot and
 * sign colors carry the semantic signal.
 */
export interface PnlCardLabels {
  /** Header brand eyebrow, e.g. "PINE FRAMEWORK". */
  brand: string;
  /** Headline "GLOBAL PNL". */
  global: string;
  /** Subtitle under the hero number. */
  netRealizedUnrealized: string;
  /** "REALIZED" split label. */
  realized: string;
  /** "UNREALIZED" split label. */
  unrealized: string;
  /** Per-symbol section header. */
  symbolPnl: string;
  /** Top-movers annotation (may include the "· |PnL|" axis hint). */
  topMovers: string;
  /** Footer metric labels. */
  winRate: string;
  profitFactor: string;
  avgTrade: string;
  maxDrawdown: string;
  openPositions: string;
  /** Fully-resolved generated-at stamp, e.g. t(lang,'cardGenerated',{time}). */
  generated: string;
  /** Empty-state message when there are no trades. */
  emptyState: string;
  /** Localized engine-state words (pill dot carries color). */
  engineState: Record<GlobalPnlSnapshot['engineState'], string>;
  /** Footer brand line, e.g. "PineFramework · report". */
  footer: string;
}

/**
 * Render the global PnL card as an 800x440 PNG buffer.
 *
 * Pure-ish: snapshot + localized labels in -> Buffer out. No fs, no telegram.
 * The empty state (no per-symbol rows) forces every value color to neutral
 * and injects the localized "No trades yet" group, per the design artifact.
 */
export async function renderGlobalPnlCard(
  snapshot: GlobalPnlSnapshot,
  labels: PnlCardLabels,
): Promise<Buffer> {
  const empty = snapshot.perSymbol.length === 0;

  // Colors: empty state -> every value neutral; otherwise the sign rule.
  const headlineColor = empty ? NEUTRAL : signColor(snapshot.totalPnl);
  const realizedColor = empty ? NEUTRAL : signColor(snapshot.realizedPnl);
  const unrealizedColor = empty ? NEUTRAL : signColor(snapshot.unrealizedPnl);
  const avgTradeColor = empty ? NEUTRAL : signColor(snapshot.avgTrade);
  const maxDrawdownColor = empty ? NEUTRAL : signColor(snapshot.maxDrawdown);

  const engine = ENGINE_STATE_TOKENS[snapshot.engineState];

  const svg = PNL_CARD_SVG
    .replaceAll('{{totalPnl}}', formatMoney(snapshot.totalPnl))
    .replaceAll('{{realizedPnl}}', formatMoney(snapshot.realizedPnl))
    .replaceAll('{{unrealizedPnl}}', formatMoney(snapshot.unrealizedPnl))
    .replaceAll('{{winRate}}', formatRate(snapshot.winRate))
    .replaceAll('{{profitFactor}}', formatProfitFactor(snapshot.profitFactor))
    .replaceAll('{{avgTrade}}', formatMoney(snapshot.avgTrade))
    .replaceAll('{{maxDrawdown}}', formatMoney(snapshot.maxDrawdown))
    .replaceAll('{{openPositions}}', String(snapshot.openPositionsCount))
    .replaceAll('{{engineState}}', labels.engineState[snapshot.engineState])
    .replaceAll('{{symbolRows}}', buildSymbolRows(snapshot.perSymbol, labels.emptyState))
    .replaceAll('{{lblBrand}}', labels.brand)
    .replaceAll('{{lblGlobal}}', labels.global)
    .replaceAll('{{lblNet}}', labels.netRealizedUnrealized)
    .replaceAll('{{lblRealized}}', labels.realized)
    .replaceAll('{{lblUnrealized}}', labels.unrealized)
    .replaceAll('{{lblSymbolPnl}}', labels.symbolPnl)
    .replaceAll('{{lblTopMovers}}', labels.topMovers)
    .replaceAll('{{lblWinRate}}', labels.winRate)
    .replaceAll('{{lblProfitFactor}}', labels.profitFactor)
    .replaceAll('{{lblAvgTrade}}', labels.avgTrade)
    .replaceAll('{{lblMaxDrawdown}}', labels.maxDrawdown)
    .replaceAll('{{lblOpenPositions}}', labels.openPositions)
    .replaceAll('{{generated}}', labels.generated)
    .replaceAll('{{lblFooter}}', labels.footer)
    .replaceAll('{{headlineColor}}', headlineColor)
    .replaceAll('{{realizedColor}}', realizedColor)
    .replaceAll('{{unrealizedColor}}', unrealizedColor)
    .replaceAll('{{avgTradeColor}}', avgTradeColor)
    .replaceAll('{{maxDrawdownColor}}', maxDrawdownColor)
    .replaceAll('{{engineStateColor}}', engine.color)
    .replaceAll('{{engineStateBg}}', engine.bg);

  // Rasterize at the SVG's native 800x440, then enforce the exact output size.
  // NOTE: `{ density: 144 }` was the original snippet but libvips scales by
  // density/72 (144 -> 2x = 1600x880), violating the 800x440 contract. The
  // explicit resize guarantees exactly 800x440 (a same-size no-op -> crisp).
  return sharp(Buffer.from(svg)).resize({ width: 800, height: 440 }).png().toBuffer();
}
