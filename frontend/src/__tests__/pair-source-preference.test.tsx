/**
 * Pair-source preference tests (fix-chaos-live-invisibility 5.2):
 * the mini chart's activePair prefers ENGINE truth (`status.pairs[0]`, carried
 * by the bot:snapshot) over the persisted disk config (`pairs[0]`). When the
 * snapshot carries no running pairs, it falls back to the disk config.
 *
 * LiveDashboard is rendered with the MiniChart + useBotMiniChartData mocked so
 * the canvas pipeline never runs; the assertion is on the arguments
 * useBotMiniChartData receives.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { LiveDashboard, type BotStatusSnapshot } from '../components/TradingBotPanel';

const { useBotMiniChartDataMock } = vi.hoisted(() => ({
  useBotMiniChartDataMock: vi.fn((_backendUrl: string, _symbol: string, _timeframe: string) => ({
    displayCandles: [],
    displayScriptResult: null,
    dataVersion: 0,
    loading: false,
  })),
}));

vi.mock('../hooks/useMiniChartData', () => ({
  useBotMiniChartData: useBotMiniChartDataMock,
}));

vi.mock('../components/MiniChart', () => ({
  MiniChart: () => <div data-testid="mini-chart" />,
}));

const BACKEND = 'http://test:8081';

let wsInstances: MockWS[] = [];

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
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
}

function statusSnapshot(overrides: Partial<BotStatusSnapshot> = {}): BotStatusSnapshot {
  return {
    state: 'Running',
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
    lastTransition: null,
    chaosMode: { enabled: true, executionMode: 'live' },
    totalCandleErrors: 0,
    chaosHeartbeat: null,
    warmUpComplete: true,
    ...overrides,
  } as BotStatusSnapshot;
}

function jsonRes(data: unknown, ok = true): Promise<Response> {
  return Promise.resolve({ ok, json: () => Promise.resolve(data) } as Response);
}

function makeFetch(diskPairs: Array<{ symbol: string; timeframe: string }>) {
  return vi.fn((url: string) => {
    const path = new URL(url, BACKEND).pathname;
    if (path.endsWith('/api/bot/wallet/status')) {
      return jsonRes({ success: true, hasWallet: true, locked: false, publicKey: 'pubkey' });
    }
    if (path.endsWith('/api/bot/config')) {
      return jsonRes({
        strategySource: '//@version=5\nstrategy("x")',
        dex: 'jupiter-swap',
        risk: { maxDailyLoss: 50 },
        pairs: diskPairs,
      });
    }
    if (path.endsWith('/api/bot/wallet/balance')) {
      return jsonRes({ success: true, balance: 100 });
    }
    return jsonRes({});
  });
}

describe('LiveDashboard activePair pair-source preference', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
    wsInstances = [];
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
    useBotMiniChartDataMock.mockClear();
  });

  it('prefers the engine running pair (status.pairs[0]) over the disk config', async () => {
    // Disk config says BTCUSDT:60; engine truth says ETHUSDT:15.
    global.fetch = makeFetch([{ symbol: 'BTCUSDT', timeframe: '60' }]) as unknown as typeof fetch;

    render(
      <LiveDashboard
        backendUrl={BACKEND}
        status={statusSnapshot({ pairs: [{ symbol: 'ETHUSDT', timeframe: '15' }] })}
        logs={[]}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(useBotMiniChartDataMock).toHaveBeenCalled());

    const calls = useBotMiniChartDataMock.mock.calls;
    const lastCall = calls[calls.length - 1]!;
    // useBotMiniChartData(backendUrl, symbol, interval, ...)
    expect(lastCall[1]).toBe('ETHUSDT');
    expect(lastCall[2]).toBe('15');
  });

  it('falls back to the disk config pairs[0] when the snapshot carries no running pairs', async () => {
    global.fetch = makeFetch([{ symbol: 'BTCUSDT', timeframe: '60' }]) as unknown as typeof fetch;

    render(
      <LiveDashboard
        backendUrl={BACKEND}
        status={statusSnapshot()} // no status.pairs
        logs={[]}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(useBotMiniChartDataMock).toHaveBeenCalled());

    const calls = useBotMiniChartDataMock.mock.calls;
    const lastCall = calls[calls.length - 1]!;
    expect(lastCall[1]).toBe('BTCUSDT');
    expect(lastCall[2]).toBe('60');
  });
});
