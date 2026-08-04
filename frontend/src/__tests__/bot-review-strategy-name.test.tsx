/**
 * Review step strategy-name tests: the Strategy row must show the name derived
 * from the strategy declaration (shared extractScriptName), never the raw first
 * line of the source (e.g. `//@version=...`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveDashboard, type BotStatusSnapshot } from '../components/TradingBotPanel';

// jsdom has no canvas — the mini chart's PineChart would throw 'Canvas 2D not
// supported'. The Review step doesn't render the chart, but the component tree
// would try; stub the mini chart.
vi.mock('../components/MiniChart', () => ({
  MiniChart: () => <div data-testid="mini-chart" />,
}));

const BACKEND = 'http://test:8081';

let wsInstances: MockWS[] = [];

// Minimal WebSocket stub — matches the pattern in bot-stop-step.test.tsx
class MockWS {
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

function statusSnapshot(state: BotStatusSnapshot['state']): BotStatusSnapshot {
  return {
    state,
    strategyName: 'x',
    dex: 'jupiter-swap',
    walletPublicKey: 'DqxdMe458TuhjYXf4Q7VBS4WgBeNne5fHwMT16SkN9mw',
    startedAt: Date.now() - 60000,
    uptimeMs: 60000,
    balance: 100,
    realizedPnl: 10,
    unrealizedPnl: -2,
    positions: [],
    exposure: 0,
    errors: [],
  };
}

const WALLET_STATUS_OK = {
  success: true,
  hasWallet: true,
  locked: false,
  publicKey: 'DqxdMe458TuhjYXf4Q7VBS4WgBeNne5fHwMT16SkN9mw',
};

function jsonRes(data: unknown, ok = true): Promise<Response> {
  return Promise.resolve({ ok, json: () => Promise.resolve(data) } as Response);
}

function makeFetch(config: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const path = new URL(url, BACKEND).pathname;
    if (path.endsWith('/api/bot/wallet/status')) return jsonRes(WALLET_STATUS_OK);
    if (path.endsWith('/api/bot/wallet/balance')) return jsonRes({ success: true, balance: 100 });
    if (path.endsWith('/api/bot/config')) return jsonRes(config);
    return jsonRes({});
  });
}

describe('Review step strategy name', () => {
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
    wsInstances = [];
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
    onClose = vi.fn();
  });

  it('shows the derived strategy name from the declaration', async () => {
    const fetchMock = makeFetch({
      strategySource: '//@version=5\nstrategy("MA Crossover", overlay=true)',
      dex: 'jupiter-swap',
      risk: { maxDailyLoss: 50 },
      autoSelect: true,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <LiveDashboard
        backendUrl={BACKEND}
        status={statusSnapshot('Stopped')}
        logs={[]}
        onClose={onClose}
      />,
    );

    await screen.findByText(/Review & Start/);

    // The Strategy row shows the derived name, not the first line of source.
    expect(screen.getByText('MA Crossover')).toBeTruthy();
    expect(screen.queryByText(/@version/)).toBeNull();
  });

  it('shows a neutral fallback when no name is derivable', async () => {
    const fetchMock = makeFetch({
      strategySource: '//@version=6\nplot(close)',
      dex: 'jupiter-swap',
      risk: { maxDailyLoss: 50 },
      autoSelect: true,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <LiveDashboard
        backendUrl={BACKEND}
        status={statusSnapshot('Stopped')}
        logs={[]}
        onClose={onClose}
      />,
    );

    await screen.findByText(/Review & Start/);

    // No derivable name -> neutral fallback, never the first line of source.
    expect(screen.getByText('(unnamed strategy)')).toBeTruthy();
    expect(screen.queryByText(/@version/)).toBeNull();
  });
});
