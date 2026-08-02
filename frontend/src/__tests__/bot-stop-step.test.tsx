/**
 * Regression tests: after a normal (non-emergency) stop, the SetupWizard must
 * land on the 'review' step — not the 'wallet' (import) step.
 *
 * Root cause: LiveDashboard only re-fetched config (not wallet status) on
 * Idle/Stopped, and the wizard's recovery-to-review logic only handled the
 * 'config' step — so a stale/failed wallet fetch stranded the user on the
 * import-wallet step after a stop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveDashboard, type BotStatusSnapshot } from '../components/TradingBotPanel';

const BACKEND = 'http://test:8081';

function statusSnapshot(state: BotStatusSnapshot['state']): BotStatusSnapshot {
  return {
    state,
    strategyName: 'Simple EMA Cross Strategy',
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

const CONFIG_OK = {
  strategySource: '//@version=5\nstrategy("x")',
  dex: 'jupiter-swap',
  risk: { maxDailyLoss: 50 },
  autoSelect: true,
  pairs: [{ symbol: 'SOLUSDT', timeframe: '15' }],
};

describe('LiveDashboard stop flow', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const path = new URL(url, BACKEND).pathname;
      if (path.endsWith('/api/bot/wallet/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(WALLET_STATUS_OK) } as Response);
      }
      if (path.endsWith('/api/bot/config') && (!init || init.method === 'GET' || init.method === undefined)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(CONFIG_OK) } as Response);
      }
      if (path.endsWith('/api/bot/stop') || path.endsWith('/api/bot/emergency-stop')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);
      }
      if (path.endsWith('/api/bot/wallet/balance')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, balance: 100 }) } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    onClose = vi.fn();
  });

  it('lands on REVIEW after a normal stop when wallet + config exist', async () => {
    const { rerender } = render(
      <LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Running')} logs={[]} onClose={onClose} />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/bot/wallet/status')));

    const stopBtn = await screen.findByRole('button', { name: /^Stop$/ });
    await userEvent.click(stopBtn);
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND}/api/bot/stop`, { method: 'POST' });

    rerender(<LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Stopping')} logs={[]} onClose={onClose} />);
    rerender(<LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Stopped')} logs={[]} onClose={onClose} />);

    await screen.findByText(/Review & Start/);
    expect(screen.queryByPlaceholderText(/Paste 12 or 24 word seed phrase/)).toBeNull();
  });

  it('recovers from the import-wallet step to REVIEW after a failed mount wallet fetch', async () => {
    let walletCalls = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = new URL(url, BACKEND).pathname;
      if (path.endsWith('/api/bot/wallet/status')) {
        walletCalls++;
        // First (mount) fetch fails — leaves LiveDashboard wallet state stale
        if (walletCalls === 1) return Promise.reject(new Error('network'));
        return Promise.resolve({ ok: true, json: () => Promise.resolve(WALLET_STATUS_OK) } as Response);
      }
      if (path.endsWith('/api/bot/config') && (!init || init.method === 'GET' || init.method === undefined)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(CONFIG_OK) } as Response);
      }
      if (path.endsWith('/api/bot/wallet/balance')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, balance: 100 }) } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    });

    // Dashboard opens while the bot is already stopped
    render(<LiveDashboard backendUrl={BACKEND} status={statusSnapshot('Stopped')} logs={[]} onClose={onClose} />);

    // Stale wallet -> wizard initially shows the import-wallet step
    await screen.findByPlaceholderText(/Paste 12 or 24 word seed phrase/);

    // The idle/stopped re-fetch recovers wallet+config -> advance to review
    await screen.findByText(/Review & Start/);
    expect(screen.queryByPlaceholderText(/Paste 12 or 24 word seed phrase/)).toBeNull();
  });
});
