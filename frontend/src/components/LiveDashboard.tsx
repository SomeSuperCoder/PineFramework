import React, { useState, useEffect, useRef } from 'react';
import type { BotStatusSnapshot, WalletInfo, LogEntry } from '../types/bot';
import { MiniChart } from './MiniChart';
import { useBotMiniChartData } from '../hooks/useMiniChartData';
import { ChaosModeWarning } from './ChaosModeWarning';
import { TradeHistoryTab } from './TradeHistoryTab';
import { StatisticsTab } from './StatisticsTab';
import { DASH, fmtBaseSymbol, fmtDur, fmtPnl, fmtSize, fmtUsd } from '../utils/format';
import type { TradeRecord } from '../types/trade';
import type { ChaosSignalRecord, ChaosHeartbeatRecord, CandleErrorRecord, ChaosModeSnapshot, FeedStatus } from '../types';
import { AutoSelectGrid } from './bot/AutoSelectGrid';
import { MetricValue } from './bot/MetricValue';
import { SetupWizard } from './bot/BotControls';

// Stable empty array references for optional chaos props. A fresh `[]` literal
// (default parameter or `?? []`) would create a new array every render and,
// being part of the chaos effect's dependency array, retrigger the effect
// infinitely.
const EMPTY_CHAOS_SIGNALS: ChaosSignalRecord[] = [];
const EMPTY_CHAOS_HEARTBEATS: ChaosHeartbeatRecord[] = [];
const EMPTY_TRADES: TradeRecord[] = [];

// ---- Live Dashboard (Status / Metrics / Logs) ----

function UnlockScreen({ backendUrl, onUnlock }: { backendUrl: string; onUnlock: (publicKey: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const handleUnlock = async () => {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/bot/wallet/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid password');
      } else {
        onUnlock(data.publicKey);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!confirm('This will delete your encrypted wallet. You can re-import with your seed phrase later. Continue?')) return;
    setLoading(true);
    try {
      await fetch(`${backendUrl}/api/bot/wallet/forgot-password`, { method: 'POST' });
      window.location.reload();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flex: 1, gap: 16, padding: 32,
    }}>
      <div style={{ fontSize: 48, opacity: 0.3 }}>🔒</div>
      <div style={{ color: '#888', fontSize: 14, fontWeight: 600 }}>Wallet Locked</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 280 }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          placeholder="Enter password to unlock"
          autoFocus
          style={{
            width: '100%', background: '#111128', color: '#e0e0e0',
            border: '1px solid #333', borderRadius: 4, padding: '8px 12px',
            fontSize: 12, boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleUnlock}
          disabled={loading || !password}
          style={{
            padding: '8px 16px', background: '#1a3328', color: '#4caf50',
            border: '1px solid #4caf50', borderRadius: 4, cursor: loading ? 'wait' : 'pointer',
            fontSize: 12, fontWeight: 600, opacity: loading || !password ? 0.6 : 1,
          }}
        >
          {loading ? 'Unlocking...' : 'Unlock'}
        </button>
        {error && <div style={{ color: '#e94560', fontSize: 11, textAlign: 'center' }}>{error}</div>}
        <button
          onClick={() => setShowForgot(!showForgot)}
          style={{
            background: 'none', border: 'none', color: '#666',
            cursor: 'pointer', fontSize: 10, marginTop: 8,
          }}
        >
          Forgot password?
        </button>
        {showForgot && (
          <button
            onClick={handleForgotPassword}
            disabled={loading}
            style={{
              padding: '6px 12px', background: '#2a1520', color: '#e94560',
              border: '1px solid #e94560', borderRadius: 4, cursor: 'pointer',
              fontSize: 10,
            }}
          >
            Erase wallet and start fresh
          </button>
        )}
      </div>
    </div>
  );
}

function LiveBotView({
  backendUrl,
  activePair,
  strategySource,
  chaosMode,
  chaosSignals,
  chaosHeartbeats,
}: {
  backendUrl: string;
  activePair: { symbol: string; timeframe: string } | null;
  strategySource: string | null;
  chaosMode: boolean;
  chaosSignals: ChaosSignalRecord[];
  chaosHeartbeats: ChaosHeartbeatRecord[];
}) {
  // Mini chart data — fetch OHLCV + execute script for the first configured pair.
  // Lives in a component that only mounts in Running/Stopping/Error states, so the
  // data pipeline (OHLCV fetch, /api/execute, kline WS subscription) never runs
  // while the bot is Idle/Stopped (SetupWizard view).
  const miniChartData = useBotMiniChartData(
    backendUrl,
    activePair?.symbol ?? null,
    activePair?.timeframe ?? null,
    strategySource ?? null,
    chaosMode,
    chaosSignals,
    chaosHeartbeats,
  );

  if (!activePair) return null;

  return (
    <div style={{ marginBottom: 12, borderBottom: '1px solid #1a1a2e', paddingBottom: 12 }}>
      <div style={{ color: '#888', fontWeight: 600, marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{activePair.symbol}</span>
        <span style={{ color: '#555', fontWeight: 400 }}>{activePair.timeframe}</span>
        {miniChartData.loading && (
          <span style={{ color: '#ff9800', fontSize: 10, fontWeight: 400 }}>loading…</span>
        )}
      </div>
      <MiniChart
        data={miniChartData.displayCandles}
        scriptResult={miniChartData.displayScriptResult}
        dataVersion={miniChartData.dataVersion}
        height={180}
      />
    </div>
  );
}

// ---- Chaos observability helpers ----

/** Short human-readable label for the last chaos candle outcome. */
function formatChaosHeartbeat(h: ChaosHeartbeatRecord | null | undefined): string {
  if (!h) return '\u2014';
  switch (h.outcome) {
    case 'signal':
      return `signal${h.action ? ` (${h.action})` : ''}`;
    case 'noop':
      return `no-op${h.reason ? ` (${h.reason})` : ''}`;
    case 'error':
      return `error${h.reason ? `: ${h.reason.length > 48 ? `${h.reason.slice(0, 48)}…` : h.reason}` : ''}`;
  }
}

function chaosHeartbeatColor(h: ChaosHeartbeatRecord | null | undefined): string | undefined {
  if (!h) return undefined;
  if (h.outcome === 'signal') return '#4caf50';
  if (h.outcome === 'noop') return '#ff9800';
  return '#e94560';
}

/** Human-readable feed status for the dashboard: connected / disconnected /
 *  connected-but-silent, with last-candle + candle-count detail in the title. */
function formatFeedStatus(feed: FeedStatus | null | undefined): { text: string; color?: string; title?: string } {
  if (!feed) return { text: '\u2014' };
  const parts: string[] = [];
  if (feed.lastCandleAt != null) {
    parts.push(`last candle ${new Date(feed.lastCandleAt).toLocaleTimeString()}`);
  }
  parts.push(`${feed.candleCount} candles`);
  if (feed.silentSince != null) {
    parts.push(`silent since ${new Date(feed.silentSince).toLocaleTimeString()}`);
  }
  if (!feed.connected) {
    return { text: 'Disconnected', color: '#e94560', title: parts.join(' · ') };
  }
  if (feed.silentSince != null) {
    return { text: 'Connected · silent', color: '#ff9800', title: parts.join(' · ') };
  }
  return { text: 'Connected', color: '#4caf50', title: parts.join(' · ') };
}

// ---- Dashboard tabs (design D6 — Overview | Trade History | Statistics) ----

type DashboardTabId = 'overview' | 'history' | 'stats';

function DashboardTabs({
  active,
  onChange,
}: {
  active: DashboardTabId;
  onChange: (tab: DashboardTabId) => void;
}) {
  const tabs: Array<{ id: DashboardTabId; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'history', label: 'Trade History' },
    { id: 'stats', label: 'Statistics' },
  ];
  return (
    <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid #1a1a2e', background: '#0d0d18' }}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              padding: '9px 16px 7px',
              background: 'transparent',
              color: isActive ? '#64b5f6' : '#888',
              border: 'none',
              borderBottom: `2px solid ${isActive ? '#64b5f6' : 'transparent'}`,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function LiveDashboard({
  backendUrl,
  status,
  logs,
  onClose,
  autoSelectProgress,
  autoSelectResult,
  chaosMode,
  engineChaosMode = null,
  chaosError = null,
  chaosHeartbeat = null,
  totalCandleErrors = 0,
  lastCandleError = null,
  chaosSignals,
  chaosHeartbeats = EMPTY_CHAOS_HEARTBEATS,
  feedStatus = null,
  liveTrades = EMPTY_TRADES,
  connectionEpoch = 0,
}: {
  backendUrl: string;
  status: BotStatusSnapshot;
  logs: LogEntry[];
  onClose: () => void;
  autoSelectProgress?: { current: number; total: number; pair: { symbol: string; timeframe: string }; phase: string; statuses: Record<string, { phase: string; status: 'pending' | 'active' | 'done' | 'failed' }>; candleProgress?: { fetched: number; total: number }; ranking?: Array<{ label: string; metrics: Record<string, number> }> } | null;
  autoSelectResult?: {
    best: { pair: { symbol: string; timeframe: string }; label: string; metrics: Record<string, number> };
    ranking: Array<{ pair: { symbol: string; timeframe: string }; label: string; metrics: Record<string, number> }>;
    evaluatedCount: number;
    failedCount: number;
  } | null;
  chaosMode?: boolean;
  engineChaosMode?: ChaosModeSnapshot | null;
  /** Non-null when the last chaos toggle failed — the operator must be warned and Start blocked. */
  chaosError?: string | null;
  chaosHeartbeat?: ChaosHeartbeatRecord | null;
  totalCandleErrors?: number;
  lastCandleError?: CandleErrorRecord | null;
  chaosSignals?: ChaosSignalRecord[];
  chaosHeartbeats?: ChaosHeartbeatRecord[];
  feedStatus?: FeedStatus | null;
  /** Live closed trades from `bot:trade` WS events (bounded ring). */
  liveTrades?: TradeRecord[];
  /** Increments on every WS reconnect — history/stats refetch when it changes. */
  connectionEpoch?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [chaosWarningAcknowledged, setChaosWarningAcknowledged] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTabId>('overview');
  const [wallet, setWallet] = useState<WalletInfo>({
    hasWallet: false,
    publicKey: undefined,
  });
  const [walletLocked, setWalletLocked] = useState(false);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [persistedConfig, setPersistedConfig] = useState<{
    strategySource: string;
    dex: string;
    risk: { maxDailyLoss: number };
    autoSelect?: boolean;
    pairs?: Array<{ symbol: string; timeframe: string }>;
    walletPublicKey?: string;
  } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Fetch wallet status on mount — don't assume anything until we know
  useEffect(() => {
    Promise.all([
      fetch(`${backendUrl}/api/bot/wallet/status`).then(r => r.json()),
      fetch(`${backendUrl}/api/bot/config`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([walletData, configData]) => {
      if (walletData.success) {
        setWallet({ hasWallet: walletData.hasWallet, publicKey: walletData.publicKey });
        setWalletLocked(walletData.locked);
      }
      if (configData) {
        setPersistedConfig(configData);
      }
    }).catch((err) => {
      console.error('[LiveDashboard] Failed to fetch wallet/config status:', err);
    }).finally(() => setWalletLoaded(true));
  }, [backendUrl]);

  // Re-fetch wallet status + persisted config when the bot transitions to idle/stopped,
  // and refresh persisted config when it starts running. Keeping persistedConfig.pairs
  // in sync with the backend (the SSOT for the active pair) ensures the mini chart's
  // activePair resolves on the first start — not only after a stop/start or reload.
  useEffect(() => {
    const isIdle = status.state === 'Idle' || status.state === 'Stopped';
    const isRunning = status.state === 'Starting' || status.state === 'Running';
    if (!isIdle && !isRunning) return;

    const refreshConfig = fetch(`${backendUrl}/api/bot/config`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);

    if (isIdle) {
      // Idle/Stopped: also re-fetch wallet status so a failed mount fetch doesn't
      // strand the wizard on the import-wallet step instead of review.
      Promise.all([
        fetch(`${backendUrl}/api/bot/wallet/status`).then(r => r.json()).catch(() => null),
        refreshConfig,
      ]).then(([walletData, configData]) => {
        if (walletData && walletData.success) {
          setWallet({ hasWallet: walletData.hasWallet, publicKey: walletData.publicKey });
          setWalletLocked(walletData.locked);
        }
        setPersistedConfig(configData ?? null);
      }).catch(() => setPersistedConfig(null));
    } else {
      // Starting/Running: refresh only the config — the mini chart's activePair
      // depends on it. Do not touch wallet/lock state (already current), and keep
      // the last known config on a transient fetch failure so the chart isn't hidden.
      refreshConfig.then((configData) => {
        if (configData) setPersistedConfig(configData);
      });
    }
  }, [status.state, backendUrl]);

  // Auto-scroll logs — use scrollTop on the container ref so ONLY the logs
  // container scrolls, not the entire page. scrollIntoView scrolls ALL
  // scrollable ancestors which breaks the dashboard layout.
  useEffect(() => {
    const container = logContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs]);

  // Timer for live duration updates (updates every second)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const sendCommand = async (command: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/bot/${command}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Bot ${command} failed (${res.status})`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLock = async () => {
    try {
      await fetch(`${backendUrl}/api/bot/wallet/lock`, { method: 'POST' });
      setWalletLocked(true);
    } catch { /* ignore */ }
  };

  const handleUnlock = (publicKey: string) => {
    setWalletLocked(false);
    setWallet({ hasWallet: true, publicKey });
  };

  // Feed connectivity for the left Status panel — live `bot:feedStatus` state
  // wins over the snapshot-carried `status.feedState`.
  const feedDisplay = formatFeedStatus(feedStatus ?? status.feedState);

  const isIdle = status.state === 'Idle' || status.state === 'Stopped';
  const isRunning = status.state === 'Running';
  const isError = status.state === 'Error';
  const transitioning = status.state === 'Starting' || status.state === 'Stopping';

  const stateColor =
    status.state === 'Running' ? '#4caf50' :
    status.state === 'Error' ? '#e94560' :
    status.state === 'Idle' ? '#888' : '#ff9800';

  const engineChaosModeTitle = engineChaosMode?.executionMode
    ? engineChaosMode.executionMode === 'simulated'
      ? `Simulated execution${engineChaosMode.reason ? ` — ${engineChaosMode.reason}` : ''}`
      : 'Live execution'
    : 'Chaos mode active';

  // Reset chaos warning acknowledgment when chaos mode is toggled
  useEffect(() => {
    setChaosWarningAcknowledged(false);
  }, [chaosMode]);

  const rootStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    fontSize: '12px',
    overflow: 'hidden',
  };

  // Idle/Stopped view — centered setup wizard
  if (isIdle) {
    // Show a minimal loading state while wallet status is being fetched
    if (!walletLoaded) {
      return (
        <div style={rootStyle}>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a2e', padding: '8px 16px' }}>
            <span style={{ color: '#888', fontSize: 14, fontWeight: 600 }}>Bot Dashboard</span>
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={{
              padding: '4px 10px', background: 'transparent', color: '#888',
              border: 'none', cursor: 'pointer', fontSize: 14,
            }}>✕</button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 12 }}>
            Loading wallet status…
          </div>
        </div>
      );
    }
    return (
      <div style={rootStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a2e', padding: '8px 16px' }}>
          <span style={{ color: '#888', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Bot Dashboard
            <span style={{ padding: '2px 8px', background: '#111128', borderRadius: 4, fontSize: 11 }}>
              {status.state}
            </span>
            {wallet.hasWallet && (
              <span
                style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10,
                  background: walletLocked ? '#2a1520' : '#1a3328',
                  color: walletLocked ? '#e94560' : '#4caf50',
                  cursor: 'pointer',
                }}
                onClick={walletLocked ? undefined : handleLock}
                title={walletLocked ? 'Wallet is locked' : 'Click to lock wallet'}
              >
                {walletLocked ? '🔒 Locked' : '🔓 Unlocked'}
              </span>
            )}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: '4px 10px', background: 'transparent', color: '#888',
              border: 'none', cursor: 'pointer', fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs — history/stats stay browsable while the bot is stopped */}
        <DashboardTabs active={activeTab} onChange={setActiveTab} />

        {activeTab === 'overview' && (
          <>
            {/* Show unlock screen if wallet exists and is locked, otherwise show setup wizard */}
            {wallet.hasWallet && walletLocked ? (
              <UnlockScreen backendUrl={backendUrl} onUnlock={handleUnlock} />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
                <div style={{ maxWidth: 600, width: '100%', padding: 16 }}>
              <SetupWizard
                backendUrl={backendUrl}
                initialWallet={wallet}
                persistedConfig={persistedConfig}
                onStart={async () => { await sendCommand('start'); }}
                onClose={onClose}
                chaosError={chaosError}
                autoSelectProgress={autoSelectProgress}
                autoSelectResult={autoSelectResult}
                onConfigReset={() => setPersistedConfig(null)}
                onBacktestStarted={() => {
                  // Re-fetch config after backtest to update persistedConfig with resolved pairs
                  fetch(`${backendUrl}/api/bot/config`)
                    .then(r => r.ok ? r.json() : null)
                    .then(configData => {
                      if (configData) setPersistedConfig(configData);
                    })
                    .catch(() => {});
                }}
              />
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            <TradeHistoryTab
              backendUrl={backendUrl}
              liveTrades={liveTrades}
              reconnectEpoch={connectionEpoch}
            />
          </div>
        )}

        {activeTab === 'stats' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            <StatisticsTab
              backendUrl={backendUrl}
              liveTrades={liveTrades}
              reconnectEpoch={connectionEpoch}
            />
          </div>
        )}
      </div>
    );
  }

  // Running/Stopping/Error view — three-column layout
  return (
    <div style={rootStyle}>
      {/* Chaos mode warning overlay */}
      <ChaosModeWarning
        isActive={chaosMode === true && !chaosWarningAcknowledged}
        onAcknowledge={() => setChaosWarningAcknowledged(true)}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a2e', padding: '8px 16px' }}>
        <span style={{ color: '#888', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          Bot Dashboard
          <span style={{ padding: '2px 8px', background: '#111128', borderRadius: 4, fontSize: 11, color: stateColor, fontWeight: 600 }}>
            {status.state}
          </span>
          {chaosMode && (
            <span
              style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 10,
                background: '#e94560', color: '#fff', fontWeight: 700, cursor: 'help',
              }}
              title={engineChaosModeTitle}
            >
              ⚡ CHAOS{engineChaosMode?.executionMode
                ? ` · ${engineChaosMode.executionMode === 'simulated' ? 'SIM' : 'LIVE'}`
                : ''}
            </span>
          )}
          {wallet.hasWallet && (
            <span
              style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 10,
                background: walletLocked ? '#2a1520' : '#1a3328',
                color: walletLocked ? '#e94560' : '#4caf50',
                cursor: 'pointer',
              }}
              onClick={walletLocked ? undefined : handleLock}
              title={walletLocked ? 'Wallet is locked' : 'Click to lock wallet'}
            >
              {walletLocked ? '🔒 Locked' : '🔓 Unlocked'}
            </span>
          )}
        </span>
        <div style={{ flex: 1 }} />
        {/* Action buttons */}
        {isRunning && (
          <>
            <button
              onClick={() => sendCommand('stop')}
              disabled={loading}
              style={{
                padding: '5px 12px', background: '#e94560', color: '#fff',
                border: 'none', borderRadius: 4, cursor: loading ? 'wait' : 'pointer',
                fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1" y="1" width="8" height="8" rx="1" />
              </svg>
              Stop
            </button>
            <button
              onClick={() => sendCommand('emergency-stop')}
              disabled={loading}
              title="Emergency Stop"
              style={{
                padding: '5px 8px', marginLeft: 4, background: '#ff1744', color: '#fff',
                border: 'none', borderRadius: 4, cursor: loading ? 'wait' : 'pointer',
                fontSize: 11, fontWeight: 700,
              }}
            >
              ⚠
            </button>
          </>
        )}
        {isError && (
          <button
            onClick={() => sendCommand('reset')}
            disabled={loading}
            style={{
              padding: '5px 10px', background: '#2a1520', color: '#ff9800',
              border: '1px solid #ff9800', borderRadius: 4, cursor: loading ? 'wait' : 'pointer',
              fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            ⟳ Reset
          </button>
        )}
        {transitioning && (
          <span style={{ color: '#ff9800', fontSize: 11, fontStyle: 'italic', marginRight: 8 }}>
            {status.state}...
          </span>
        )}
        <button
          onClick={onClose}
          style={{
            padding: '4px 10px', background: 'transparent', color: '#888',
            border: 'none', cursor: 'pointer', fontSize: 14, marginLeft: 4,
          }}
        >
          ✕
        </button>
      </div>

      {/* Tabs — Overview keeps the 3-column grid byte-identical */}
      <DashboardTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        // Three-column body (byte-identical to the pre-tabs layout)
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '240px 1fr minmax(300px, 400px)', gridTemplateRows: '1fr', gap: 1, overflow: 'hidden' }}>
        {/* Left: Status Panel */}
        <div style={{ borderRight: '1px solid #1a1a2e', padding: 12, overflow: 'auto' }}>
          <div style={{ color: '#888', fontWeight: 600, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <MetricValue label="State" value={status.state} color={stateColor} />
            {wallet.publicKey && (
              <MetricValue
                label="Wallet"
                value={`${wallet.publicKey.slice(0, 8)}...${wallet.publicKey.slice(-4)}`}
                color="#4caf50"
              />
            )}
            <MetricValue label="Strategy" value={status.strategyName} />
            <MetricValue label="DEX" value={status.dex} />
            <MetricValue label="Duration" value={status.startedAt != null ? fmtDur(now - status.startedAt) : DASH} />
            <MetricValue label="Balance" value={`$${status.balance.toFixed(2)}`} />
            <MetricValue label="Realized PnL" value={fmtPnl(status.realizedPnl).text} color={fmtPnl(status.realizedPnl).color} />
            <MetricValue label="Unrealized PnL" value={fmtPnl(status.unrealizedPnl).text} color={fmtPnl(status.unrealizedPnl).color} />
            <MetricValue label="Exposure" value={`${(status.exposure * 100).toFixed(1)}%`} />

            {chaosMode && (
              <MetricValue
                label="Chaos Last Candle"
                value={formatChaosHeartbeat(chaosHeartbeat)}
                color={chaosHeartbeatColor(chaosHeartbeat)}
              />
            )}
            <MetricValue
              label="Candle Errors"
              value={String(totalCandleErrors)}
              color={totalCandleErrors > 0 ? '#e94560' : undefined}
              title={lastCandleError
                ? `${lastCandleError.pair} ${lastCandleError.timeframe}: ${lastCandleError.message}`
                : undefined}
            />
            <MetricValue
              label="Feed"
              value={feedDisplay.text}
              color={feedDisplay.color}
              title={feedDisplay.title}
            />

            {status.errors.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <span style={{ color: '#e94560', fontWeight: 600, fontSize: 11 }}>Errors ({status.errors.length}):</span>
                {status.errors.slice(-3).map((err, i) => (
                  <div key={i} style={{ color: '#e94560', fontSize: 10, marginTop: 2 }}>
                    [{err.code}] {err.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: Mini Chart + Metrics + Positions */}
        <div style={{ borderRight: '1px solid #1a1a2e', padding: 12, overflow: 'auto' }}>
          {/* Mini Chart — only mounted in running states; never while Idle/Stopped */}
          <LiveBotView
            backendUrl={backendUrl}
            activePair={status.pairs?.[0] ?? persistedConfig?.pairs?.[0] ?? null}
            strategySource={persistedConfig?.strategySource ?? null}
            chaosMode={chaosMode === true}
            chaosSignals={chaosSignals ?? EMPTY_CHAOS_SIGNALS}
            chaosHeartbeats={chaosHeartbeats ?? EMPTY_CHAOS_HEARTBEATS}
          />

          <div style={{ color: '#888', fontWeight: 600, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
            <MetricValue label="Total Trades" value={status.totalTrades != null ? String(status.totalTrades) : DASH} />
            <MetricValue label="Winning" value={status.winningTrades != null ? String(status.winningTrades) : DASH} color="#4caf50" />
            <MetricValue label="Losing" value={status.losingTrades != null ? String(status.losingTrades) : DASH} color="#e94560" />
            <MetricValue label="Win Rate" value={status.winRate != null ? `${(status.winRate * 100).toFixed(1)}%` : DASH} />
            <MetricValue label="Avg Win" value={status.avgWin != null ? `$${status.avgWin.toFixed(2)}` : DASH} color={status.avgWin != null && status.avgWin > 0 ? '#4caf50' : undefined} />
            <MetricValue label="Avg Loss" value={status.avgLoss != null ? `-$${Math.abs(status.avgLoss).toFixed(2)}` : DASH} color={status.avgLoss != null && status.avgLoss < 0 ? '#e94560' : undefined} />
            <MetricValue label="Profit Factor" value={status.profitFactor != null ? status.profitFactor.toFixed(2) : DASH}
              color={status.profitFactor != null ? status.profitFactor >= 1.5 ? '#4caf50' : status.profitFactor >= 1 ? '#ff9800' : '#e94560' : undefined}
            />
            <MetricValue label="Max Drawdown" value={status.maxDrawdown != null ? `${(status.maxDrawdown * 100).toFixed(1)}%` : DASH} color="#e94560" />
            <MetricValue label="Total Fees" value={status.totalFees != null ? `$${status.totalFees.toFixed(2)}` : DASH} />
            <MetricValue label="Avg Latency" value={status.avgLatency != null ? `${status.avgLatency.toFixed(0)}ms` : DASH} />
          </div>

          {/* Positions */}
          <>
              <div style={{ color: '#888', fontWeight: 600, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Positions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {status.positions.length === 0 && (
                  <div style={{ padding: '8px 12px', background: '#111128', borderRadius: 4, color: '#666', fontSize: 11, fontStyle: 'italic' }}>
                    No open positions
                  </div>
                )}
                {status.positions.map((pos, i) => {
                  const pnl = pos.unrealizedPnl ?? 0;
                  const pnlPercent = pos.entryPrice > 0 && pos.quantity > 0
                    ? (pnl / (pos.entryPrice * pos.quantity)) * 100
                    : 0;
                  const pnlColor = pnl >= 0 ? '#4caf50' : '#e94560';
                  const duration = now - pos.entryTime;
                  const isLong = pos.direction !== 'flat';
                  return (
                    <div key={i} style={{ padding: '8px 12px', background: '#111128', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 12 }}>{pos.symbol}</span>
                        {pos.timeframe && (
                          <span style={{ color: '#555', fontSize: 10 }}>{pos.timeframe}</span>
                        )}
                        <span style={{ color: isLong ? '#4caf50' : '#888', fontSize: 11, fontWeight: 600 }}>
                          {isLong ? 'LONG' : 'FLAT'}
                        </span>
                        {pos.direction === 'flat' ||
                        !isFinite(pos.quantity) ||
                        pos.quantity <= 0 ||
                        !isFinite(pos.entryPrice) ? (
                          <span style={{ color: '#666', fontSize: 11 }}>{'\u2014'}</span>
                        ) : (
                          <>
                            <span style={{ color: '#d0d0d0', fontWeight: 600, fontSize: 12 }}>
                              {fmtSize(pos.quantity)} {fmtBaseSymbol(pos.symbol)}
                            </span>
                            {/* Notional = entry size in USD (qty × entry price, not live mark). */}
                            <span style={{ color: '#aaa', fontSize: 11 }}>
                              {'\u2248'} {fmtUsd(pos.quantity * pos.entryPrice)}
                            </span>
                            <span style={{ color: '#888', fontSize: 11 }}>
                              @ ${pos.entryPrice.toFixed(2)}
                            </span>
                          </>
                        )}
                        <span style={{ color: '#888', fontSize: 11, marginLeft: 'auto' }}>
                          {pos.unrealizedPnl != null ? `$${pos.unrealizedPnl.toFixed(2)}` : '\u2014'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 }}>
                        <span style={{ color: pnlColor, fontWeight: 600 }}>
                          {fmtPnl(pnl).text}
                        </span>
                        <span style={{ color: pnlColor, fontWeight: 600 }}>
                          ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                        </span>
                        <span style={{ color: '#666', marginLeft: 'auto' }}>
                          {fmtDur(duration)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>

          {/* Auto-Select Results */}
          {autoSelectResult && (
            <div style={{ marginTop: 16 }}>
              <div style={{ color: '#4caf50', fontWeight: 600, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Auto-Select Results</div>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                Evaluated {autoSelectResult.evaluatedCount} pair{autoSelectResult.evaluatedCount !== 1 ? 's' : ''}
                {autoSelectResult.failedCount > 0 && `, ${autoSelectResult.failedCount} failed`}
              </div>
              <AutoSelectGrid
                statuses={Object.fromEntries(
                  autoSelectResult.ranking.map(r => [r.label, { phase: 'done', status: 'done' as const }])
                )}
                ranking={autoSelectResult.ranking}
              />
              <div style={{ marginTop: 6, padding: '6px 8px', background: '#1a3328', borderRadius: 3 }}>
                <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 11 }}>
                  ★ Best: {autoSelectResult.best.label}
                </span>
                <span style={{ color: '#888', fontSize: 10, marginLeft: 8 }}>
                  PF: {autoSelectResult.best.metrics.profitFactor?.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Logs Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', minHeight: 0 }}>
          <div style={{ color: '#888', fontWeight: 600, padding: '12px 12px 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0 }}>
            Logs ({logs.length})
          </div>
          <div ref={logContainerRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 12px 12px', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6, minHeight: 0 }}>
            {logs.length === 0 && (
              <span style={{ color: '#888', fontStyle: 'italic' }}>No log entries yet...</span>
            )}
            {logs.slice(-500).map((log, i) => (
              <div key={i} style={{
                color: log.level === 'error' ? '#e94560' :
                       log.level === 'warn' ? '#ff9800' :
                       log.level === 'debug' ? '#666' : '#aaa',
              }}>
                <span style={{ color: '#555' }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                {' '}
                <span style={{ fontWeight: log.level === 'error' ? 600 : 400 }}>
                  [{log.level.toUpperCase()}]
                </span>
                {' '}
                {log.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
      )}

      {activeTab === 'history' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <TradeHistoryTab
            backendUrl={backendUrl}
            liveTrades={liveTrades}
            reconnectEpoch={connectionEpoch}
          />
        </div>
      )}

      {activeTab === 'stats' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <StatisticsTab
            backendUrl={backendUrl}
            liveTrades={liveTrades}
            reconnectEpoch={connectionEpoch}
          />
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #1a1a2e', padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: '#555' }}>
        <span>Connected: <span style={{ color: '#4caf50' }}>●</span></span>
        <span>Last update: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
