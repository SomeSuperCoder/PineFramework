import React, { useState, useEffect, useRef } from 'react';
import type { BotStatusSnapshot, WalletInfo, LogEntry } from '../types/bot';
import { ChaosModeWarning } from './ChaosModeWarning';
import { TradeHistoryTab } from './TradeHistoryTab';
import { StatisticsTab } from './StatisticsTab';
import type { TradeRecord } from '../types/trade';
import type { ChaosSignalRecord, ChaosHeartbeatRecord, CandleErrorRecord, ChaosModeSnapshot, FeedStatus } from '../types';
import { SetupWizard } from './bot/BotControls';
import { BotStatusPanel } from './bot/BotStatusPanel';
import { BotMetrics } from './bot/BotMetrics';

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
        <BotStatusPanel
          status={status}
          stateColor={stateColor}
          now={now}
          wallet={wallet}
          chaosMode={chaosMode}
          chaosHeartbeat={chaosHeartbeat}
          totalCandleErrors={totalCandleErrors}
          lastCandleError={lastCandleError}
          feedStatus={feedStatus}
        />

        {/* Center: Mini Chart + Metrics + Positions */}
        <BotMetrics
          backendUrl={backendUrl}
          status={status}
          activePair={status.pairs?.[0] ?? persistedConfig?.pairs?.[0] ?? null}
          strategySource={persistedConfig?.strategySource ?? null}
          chaosMode={chaosMode === true}
          chaosSignals={chaosSignals ?? EMPTY_CHAOS_SIGNALS}
          chaosHeartbeats={chaosHeartbeats ?? EMPTY_CHAOS_HEARTBEATS}
          autoSelectResult={autoSelectResult}
          now={now}
        />

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
