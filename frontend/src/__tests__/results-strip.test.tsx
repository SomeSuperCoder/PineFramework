import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EffectiveConfigSummary } from '../components/EffectiveConfigSummary';
import { WarningsStrip } from '../components/WarningsStrip';
import { BacktestResults } from '../components/BacktestResults';
import type {
  BacktestResultResponse,
  BacktestWarning,
  EffectiveBacktestConfig,
  EquityPoint,
} from '../types';

/**
 * Component tests for the results-panel strip (results-strip wave):
 *   - EffectiveConfigSummary — "what actually ran" echo of the engine's
 *     post-merge config; renders nothing when the backend hasn't shipped it.
 *   - WarningsStrip — per-run diagnostics via the StatusCallout notice
 *     pattern; amber when any long-only suppression occurred.
 *   - BacktestResults integration — strips slot between header and stat grid;
 *     legacy payloads (no new fields) still render the panel defensively.
 *
 * Assertions target user-visible behavior (labels, messages, tone classes),
 * not component internals. No timers, no network: the export flow only fires
 * on user interaction, which these tests never trigger.
 */

// ---------------------------------------------------------------------------
// Contract-type fixtures (scope item 4: conformant, representative records)
// ---------------------------------------------------------------------------

/** UTC-midnight aligned ms timestamps, per the EffectiveBacktestConfig contract. */
const START_MS = Date.UTC(2026, 0, 15);
const END_MS = Date.UTC(2026, 1, 1);

/** Full post-merge config — every StrategyConfig field + resolved date range. */
const fullConfig: EffectiveBacktestConfig = {
  initialCapital: 10000,
  commission: 0,
  slippage: 0,
  commissionType: 'percent',
  slippageType: 'ticks',
  defaultQty: 20,
  defaultQtyType: 'percent_of_equity',
  pyramiding: 2,
  calcOnOrderFills: true,
  calcOnEveryTick: false,
  processOrdersOnClose: false,
  maxBarsBack: 0,
  marginLong: 3,
  marginShort: 5,
  currency: 'USD',
  marketFillPrice: 'open',
  commissionMethod: 'jupiter_manual',
  commissionMethodSettings: { solPriceUsd: 180.5, dexFeeBps: 25 },
  startDate: START_MS,
  endDate: END_MS,
};

/** Representative long-only-suppression diagnostic (drives the amber tone). */
const suppressionWarning: BacktestWarning = {
  type: 'long-only-suppression',
  message: '2 short orders suppressed by the long-only rule',
  context: { suppressed: 2, reason: 'long_only_rule' },
};

/** Representative fee-decision diagnostic (info tone). */
const feeWarning: BacktestWarning = {
  type: 'fee-decision',
  message: 'Commission method resolved: jupiter_manual (Jupiter Swap)',
  context: { method: 'jupiter_manual' },
};

// ---------------------------------------------------------------------------
// Result fixture factory (same minimal metrics/trades shape as the existing
// BacktestResults component tests — keep the two fixtures consistent).
// ---------------------------------------------------------------------------

const TWO_POINTS: EquityPoint[] = [
  { time: 0, equity: 10000, drawdown: 0, balance: 10000 },
  { time: 1, equity: 10500, drawdown: 0, balance: 10500 },
];

/**
 * Result factory. `BacktestResultResponse` currently REQUIRES
 * effectiveConfig/warnings (BacktestResultExtension), but legacy payloads
 * (pre-extension backend) omit them at runtime — the components render
 * defensively in that case. Passing `null` for either field omits it from the
 * returned payload, so the defensive path is exercised through the real data
 * shape (cast documents the pre-extension contract).
 */
function makeResult(
  options: {
    effectiveConfig?: EffectiveBacktestConfig | null;
    warnings?: BacktestWarning[] | null;
  } = {},
): BacktestResultResponse {
  const { effectiveConfig = fullConfig, warnings = [suppressionWarning] } = options;
  const base = {
    metrics: {
      totalTrades: 30,
      winningTrades: 20,
      losingTrades: 10,
      winRate: 65,
      profitFactor: 2.61,
      totalPnl: 1234.56,
      totalPnlPercent: 12.35,
      maxDrawdown: 500,
      maxDrawdownPercent: 5,
      sharpeRatio: 1.5,
      sortinoRatio: 2.0,
      averageWin: 100,
      averageLoss: 76.5,
      largestWin: 250,
      largestLoss: -150,
      averageTradeDuration: 3.5,
      commission: 45.2,
    },
    equityCurve: [],
    drawdownCurve: [],
    trades: [],
    orders: [],
    equityPoints: TWO_POINTS,
    monthlyReturns: {},
    buyHoldReturn: 0,
    barCount: TWO_POINTS.length,
  };
  return {
    ...base,
    ...(effectiveConfig == null ? {} : { effectiveConfig }),
    ...(warnings == null ? {} : { warnings }),
  } as BacktestResultResponse;
}

// ---------------------------------------------------------------------------
// EffectiveConfigSummary
// ---------------------------------------------------------------------------

describe('EffectiveConfigSummary', () => {
  it('renders commission label, resolved date range, and key effective settings when config is present', () => {
    render(<EffectiveConfigSummary config={fullConfig} />);

    // Heading — the strip's identity.
    expect(screen.getByText('What actually ran')).toBeInTheDocument();

    // Commission method label (COMMISSION_METHOD_LABELS: jupiter_manual → "Jupiter Swap").
    expect(screen.getByText('Jupiter Swap')).toBeInTheDocument();

    // Resolved date range, same locale formatter the component uses.
    const expectedRange = `${new Date(START_MS).toLocaleDateString()} → ${new Date(END_MS).toLocaleDateString()}`;
    expect(screen.getByText(expectedRange)).toBeInTheDocument();

    // Key effective settings.
    expect(screen.getByText('Margin (L/S)')).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByText('Pyramiding')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Qty')).toBeInTheDocument();
    expect(screen.getByText('20 % equity')).toBeInTheDocument();
    expect(screen.getByText('Capital')).toBeInTheDocument();
    expect(screen.getByText((10000).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('SOL')).toBeInTheDocument();
    expect(screen.getByText('$180.50')).toBeInTheDocument();
  });

  it('renders the jupiter_ultra commission label', () => {
    render(<EffectiveConfigSummary config={{ ...fullConfig, commissionMethod: 'jupiter_ultra' }} />);

    expect(screen.getByText('Jupiter Ultra')).toBeInTheDocument();
  });

  it('renders nothing when config is undefined or null (defensive)', () => {
    const { unmount } = render(<EffectiveConfigSummary config={undefined} />);
    expect(screen.queryByText('What actually ran')).not.toBeInTheDocument();
    unmount();

    render(<EffectiveConfigSummary config={null} />);
    expect(screen.queryByText('What actually ran')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// WarningsStrip
// ---------------------------------------------------------------------------

describe('WarningsStrip', () => {
  it('renders each warning type badge, message, and context hint', () => {
    render(<WarningsStrip warnings={[suppressionWarning, feeWarning]} />);

    // Type badges (WARNING_LABELS).
    expect(screen.getByText('Long-only suppression')).toBeInTheDocument();
    expect(screen.getByText('Fee decision')).toBeInTheDocument();

    // Messages.
    expect(screen.getByText('2 short orders suppressed by the long-only rule')).toBeInTheDocument();
    expect(
      screen.getByText('Commission method resolved: jupiter_manual (Jupiter Swap)'),
    ).toBeInTheDocument();

    // Context hints ("key: value" pairs, ' · ' separator — the WHY for each warning).
    expect(screen.getByText('suppressed: 2 · reason: long_only_rule')).toBeInTheDocument();
    expect(screen.getByText('method: jupiter_manual')).toBeInTheDocument();
  });

  it('uses the amber/alert tone when long-only-suppression is present, neutral otherwise', () => {
    // Suppression present → warning tone (amber border).
    const { unmount, container } = render(
      <WarningsStrip warnings={[suppressionWarning, feeWarning]} />,
    );
    const callout = container.querySelector('[role="status"]');
    expect(callout).not.toBeNull();
    expect(callout!.className).toContain('border-yellow-500');
    unmount();

    // No suppression → info tone (neutral border).
    const { container: infoContainer } = render(<WarningsStrip warnings={[feeWarning]} />);
    const infoCallout = infoContainer.querySelector('[role="status"]');
    expect(infoCallout).not.toBeNull();
    expect(infoCallout!.className).toContain('border-border');
    expect(infoCallout!.className).not.toContain('border-yellow-500');
  });

  it('renders nothing when warnings is an empty array (no empty box)', () => {
    render(<WarningsStrip warnings={[]} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Long-only suppression')).not.toBeInTheDocument();
  });

  it('renders nothing when warnings is undefined (defensive)', () => {
    render(<WarningsStrip />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Long-only suppression')).not.toBeInTheDocument();
  });

  it('collapses exact-duplicate warnings (same type|message) into one row with a ×N badge', () => {
    const duplicate = {
      type: 'long-only-suppression' as const,
      message: '3 short orders suppressed by the long-only rule',
      context: { suppressed: 3, reason: 'long_only_rule' },
    };
    render(
      <WarningsStrip
        warnings={[
          duplicate,
          { ...duplicate, context: { suppressed: 3, reason: 'long_only_rule_alt' } },
          duplicate,
        ]}
      />,
    );

    // ONE row for the message — duplicates collapse (would be 3 matches otherwise).
    expect(screen.getAllByText('3 short orders suppressed by the long-only rule')).toHaveLength(1);
    // The ×N badge surfaces the collapsed count.
    expect(screen.getByText('×3')).toBeInTheDocument();
    // Context is NOT part of the dedup key — the first occurrence's hint is retained.
    expect(screen.getByText('suppressed: 3 · reason: long_only_rule')).toBeInTheDocument();
  });

  it('groups multiple baseline-applied warnings into one summary row with count and per-setting detail', () => {
    render(
      <WarningsStrip
        warnings={[
          {
            type: 'baseline-applied',
            message: 'initial_capital not declared',
            context: { setting: 'initial_capital', baseline: '10000' },
          },
          {
            type: 'baseline-applied',
            message: 'commission not declared',
            context: { setting: 'commission', baseline: '0' },
          },
          {
            type: 'baseline-applied',
            message: 'slippage not declared',
            context: { setting: 'slippage', baseline: '0' },
          },
        ]}
      />,
    );

    // ONE summary row — count in the message (pluralized).
    expect(
      screen.getByText('strategy() did not declare 3 settings — engine defaults applied'),
    ).toBeInTheDocument();
    // Per-setting compact detail: setting: baseline, ' · ' joined.
    expect(screen.getByText('initial_capital: 10000 · commission: 0 · slippage: 0')).toBeInTheDocument();
    // Only the single summary row renders — one 'Baseline applied' badge, no per-row messages.
    expect(screen.getAllByText('Baseline applied')).toHaveLength(1);
    expect(screen.queryByText('initial_capital not declared')).not.toBeInTheDocument();
    expect(screen.queryByText('commission not declared')).not.toBeInTheDocument();
  });

  it('pluralizes the baseline summary copy for a single undeclared setting', () => {
    render(
      <WarningsStrip
        warnings={[
          {
            type: 'baseline-applied',
            message: 'pyramiding not declared',
            context: { setting: 'pyramiding', baseline: '0' },
          },
        ]}
      />,
    );

    expect(screen.getByText('strategy() did not declare 1 setting — engine defaults applied')).toBeInTheDocument();
    expect(screen.getByText('pyramiding: 0')).toBeInTheDocument();
  });

  it('renders the full 4-key fee-decision context — effectiveSettings visible, not truncated', () => {
    render(
      <WarningsStrip
        warnings={[
          {
            type: 'fee-decision',
            message: 'Commission method resolved: jupiter_ultra (Jupiter Ultra)',
            context: {
              explicitMethod: 'jupiter_manual',
              effectiveMethod: 'jupiter_ultra',
              explicitSettings: { dexFeeBps: 25, solPriceUsd: 180.5 },
              effectiveSettings: { dexFeeBps: 25, solPriceUsd: 180.5 },
            },
          },
        ]}
      />,
    );

    // The 4th key renders — the old slice(0,3) would have dropped effectiveSettings entirely.
    expect(
      screen.getByText(/effectiveSettings: \{"dexFeeBps":25,"solPriceUsd":180\.5\}/),
    ).toBeInTheDocument();
    // Both effective settings values are visible in the rendered hint.
    expect(screen.getByText(/solPriceUsd":180\.5/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BacktestResults integration — strip placement + legacy defensive render
// ---------------------------------------------------------------------------

describe('BacktestResults (strip integration)', () => {
  it('places the strip sections between the header and the stat grid with a full result', () => {
    render(<BacktestResults result={makeResult()} />);

    // Header, strip, and stat grid all present.
    expect(screen.getByText('Backtest Results')).toBeInTheDocument();
    expect(screen.getByText('What actually ran')).toBeInTheDocument();
    expect(screen.getByText('Long-only suppression')).toBeInTheDocument();
    expect(screen.getByText('Net Profit')).toBeInTheDocument();

    // Ordering: header → EffectiveConfigSummary → WarningsStrip → StatGrid.
    const header = screen.getByText('Backtest Results');
    const config = screen.getByText('What actually ran');
    const warning = screen.getByText('2 short orders suppressed by the long-only rule');
    const stats = screen.getByText('Net Profit');
    const FOLLOWS = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(header.compareDocumentPosition(config) & FOLLOWS).toBeTruthy();
    expect(config.compareDocumentPosition(warning) & FOLLOWS).toBeTruthy();
    expect(warning.compareDocumentPosition(stats) & FOLLOWS).toBeTruthy();
  });

  it('renders a legacy result (no effectiveConfig/warnings) without crashing and without strip sections', () => {
    render(<BacktestResults result={makeResult({ effectiveConfig: null, warnings: null })} />);

    // Panel intact: header, stat grid, chart card.
    expect(screen.getByText('Backtest Results')).toBeInTheDocument();
    expect(screen.getByText('Net Profit')).toBeInTheDocument();
    expect(screen.getByText('Equity & Drawdown')).toBeInTheDocument();

    // No strip sections rendered (defensive path).
    expect(screen.queryByText('What actually ran')).not.toBeInTheDocument();
    expect(screen.queryByText(/suppressed by the long-only rule/)).not.toBeInTheDocument();
  });
});
