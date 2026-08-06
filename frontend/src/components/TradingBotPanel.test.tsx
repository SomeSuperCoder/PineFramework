import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveDashboard } from './TradingBotPanel';
import type { BotStatusSnapshot } from './TradingBotPanel';
import type { PositionInfo } from '../types';

// LiveDashboard mounts LiveBotView (mini chart) in running states. LiveBotView
// always calls useBotMiniChartData even when it early-returns null (no
// activePair), and the real hook kicks off OHLCV/execute/WS work. Stub it so
// the position-format contract is tested hermetically — no network, no waits.
vi.mock('../hooks/useMiniChartData', () => ({
  useBotMiniChartData: () => ({
    candles: [],
    displayCandles: [],
    displayScriptResult: null,
    loading: false,
    error: null,
  }),
}));

/** LiveDashboard fetches wallet/config on mount — never let it touch the network. */
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ success: false }), { status: 200 }),
  );
  // jsdom does not implement scrollIntoView; LiveDashboard's auto-scroll logs
  // effect calls it on mount. Same stub as existing repo tests.
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

const DASH = '\u2014';
const APPROX = '\u2248';

function makePosition(overrides: Partial<PositionInfo> = {}): PositionInfo {
  return {
    pair: 'ETHUSDT:15m',
    symbol: 'ETHUSDT',
    timeframe: '15m',
    direction: 'long',
    quantity: 0.2,
    entryPrice: 510,
    entryTime: Date.now() - 60_000,
    ...overrides,
  };
}

function makeStatus(positions: PositionInfo[]): BotStatusSnapshot {
  return {
    state: 'Running',
    strategyName: 'Test strategy',
    dex: 'uniswap',
    walletPublicKey: null,
    startedAt: Date.now() - 1_000,
    uptimeMs: 1_000,
    balance: 1_000,
    realizedPnl: 0,
    unrealizedPnl: 0,
    positions,
    exposure: 0.5,
    errors: [],
  };
}

function renderDashboard(positions: PositionInfo[]) {
  return render(
    <LiveDashboard
      backendUrl="http://localhost:8081"
      status={makeStatus(positions)}
      logs={[]}
      onClose={() => {}}
    />,
  );
}

describe('LiveDashboard Positions panel — position row formatting', () => {
  it('shows the target-currency size with its base symbol (not a bare number)', () => {
    renderDashboard([makePosition()]);
    // fmtSize(0.2) + fmtBaseSymbol('ETHUSDT') render as one composed label.
    expect(screen.getByText('0.2 ETH')).toBeInTheDocument();
    // The quantity must not appear as a bare number without its token label.
    expect(screen.queryByText('0.2')).not.toBeInTheDocument();
  });

  it('shows USD notional = quantity × entry price, with thousands separator', () => {
    renderDashboard([
      makePosition({ symbol: 'ETHUSDT', quantity: 0.2, entryPrice: 510 }),
      makePosition({ symbol: 'BTCUSDT', quantity: 1.5, entryPrice: 1000 }),
    ]);
    expect(screen.getByText(`${APPROX} $102.00`)).toBeInTheDocument();
    expect(screen.getByText(`${APPROX} $1,500.00`)).toBeInTheDocument();
  });

  it('keeps the tertiary entry price label', () => {
    renderDashboard([makePosition({ symbol: 'ETHUSDT', entryPrice: 510 })]);
    expect(screen.getByText('@ $510.00')).toBeInTheDocument();
  });

  it('strips the quote currency from the symbol (fmtBaseSymbol contract)', () => {
    renderDashboard([
      makePosition({ symbol: 'ETHUSDT', quantity: 0.2 }),
      makePosition({ symbol: 'BTCUSDC', quantity: 0.5 }),
      makePosition({ symbol: 'SOLUSD', quantity: 1.2 }),
      // Unknown symbol with no quote suffix must fall back to itself.
      makePosition({ symbol: 'FOOBAR', quantity: 3 }),
    ]);
    expect(screen.getByText('0.2 ETH')).toBeInTheDocument();
    expect(screen.getByText('0.5 BTC')).toBeInTheDocument();
    expect(screen.getByText('1.2 SOL')).toBeInTheDocument();
    expect(screen.getByText('3 FOOBAR')).toBeInTheDocument();
  });

  it('formats size to 4 significant figures (fmtSize contract)', () => {
    renderDashboard([
      makePosition({ symbol: 'AAAUSDT', quantity: 0.2 }),
      // toPrecision(4) → 0.00004523, then max 6 fraction digits → 0.000045.
      makePosition({ symbol: 'BBBUSDT', quantity: 0.0000452345 }),
      makePosition({ symbol: 'CCCUSDT', quantity: 452600 }),
      // Distinguishing case: without toPrecision this would be 12,345.68.
      makePosition({ symbol: 'DDDUSDT', quantity: 12345.6789 }),
    ]);
    expect(screen.getByText('0.2 AAA')).toBeInTheDocument();
    expect(screen.getByText('0.000045 BBB')).toBeInTheDocument();
    expect(screen.getByText('452,600 CCC')).toBeInTheDocument();
    expect(screen.getByText('12,350 DDD')).toBeInTheDocument();
  });

  it('formats USD notional to exactly 2 decimals (fmtUsd contract)', () => {
    renderDashboard([
      makePosition({ symbol: 'ETHUSDT', quantity: 102, entryPrice: 1 }),
      makePosition({ symbol: 'BTCUSDT', quantity: 1500, entryPrice: 1 }),
      makePosition({ symbol: 'SOLUSDT', quantity: 0.004, entryPrice: 1 }),
    ]);
    expect(screen.getByText(`${APPROX} $102.00`)).toBeInTheDocument();
    expect(screen.getByText(`${APPROX} $1,500.00`)).toBeInTheDocument();
    expect(screen.getByText(`${APPROX} $0.00`)).toBeInTheDocument();
  });

  it('renders a single em-dash instead of size/notional when the notional is not positive (fmtUsd guard)', () => {
    // qty > 0 but entryPrice 0 → notional 0 → fmtUsd returns the em-dash.
    renderDashboard([makePosition({ symbol: 'ETHUSDT', quantity: 0.2, entryPrice: 0 })]);
    expect(screen.getByText(`${APPROX} ${DASH}`)).toBeInTheDocument();
    expect(screen.queryByText(`${APPROX} $0.00`)).not.toBeInTheDocument();
  });

  it('renders a single em-dash, not "0 ETH ≈ $0.00", for a flat position', () => {
    renderDashboard([makePosition({ symbol: 'ETHUSDT', quantity: 0.2, entryPrice: 510, direction: 'flat' })]);
    expect(screen.getAllByText(DASH).length).toBeGreaterThan(0);
    expect(screen.queryByText('0.2 ETH')).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`${APPROX} \\$`))).not.toBeInTheDocument();
    expect(screen.queryByText('@ $510.00')).not.toBeInTheDocument();
  });

  it('renders a single em-dash, not a size label, when quantity is 0', () => {
    renderDashboard([makePosition({ symbol: 'ETHUSDT', quantity: 0, entryPrice: 510 })]);
    expect(screen.getAllByText(DASH).length).toBeGreaterThan(0);
    expect(screen.queryByText('0 ETH')).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`${APPROX} \\$`))).not.toBeInTheDocument();
  });

  it('renders a single em-dash, not a size label, when quantity is non-finite', () => {
    renderDashboard([makePosition({ symbol: 'ETHUSDT', quantity: Infinity, entryPrice: 510 })]);
    expect(screen.getAllByText(DASH).length).toBeGreaterThan(0);
    expect(screen.queryByText('0.2 ETH')).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`${APPROX} \\$`))).not.toBeInTheDocument();
  });

  it('renders a single em-dash, not an entry label, when entry price is non-finite', () => {
    renderDashboard([makePosition({ symbol: 'ETHUSDT', quantity: 0.2, entryPrice: NaN })]);
    expect(screen.getAllByText(DASH).length).toBeGreaterThan(0);
    expect(screen.queryByText('0.2 ETH')).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`${APPROX} \\$`))).not.toBeInTheDocument();
    expect(screen.queryByText('@ ')).not.toBeInTheDocument();
  });
});
