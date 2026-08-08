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
import { tokens } from '../theme/tokens';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
      <div className="text-sm font-semibold" style={{ color: tokens.colors.steel.muted }}>Wallet Locked</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 280 }}>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          placeholder="Enter password to unlock"
          autoFocus
          className="w-full"
        />
        <Button
          onClick={handleUnlock}
          disabled={loading || !password}
          className="border border-[color:var(--pf-semantic-success)] bg-[color:var(--pf-semantic-success-bg)] text-[color:var(--pf-semantic-success)]"
        >
          {loading ? 'Unlocking...' : 'Unlock'}
        </Button>
        {error && (
          <div className="text-center text-[11px] text-[color:var(--pf-semantic-error)]">{error}</div>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowForgot(!showForgot)}
          className="mt-2 h-auto p-0 text-xs"
          style={{ color: tokens.colors.ink['3'] }}
        >
          Forgot password?
        </Button>
        {showForgot && (
          <Button
            onClick={handleForgotPassword}
            disabled={loading}
            variant="destructive"
            size="sm"
            className="text-xs"
          >
            Erase wallet and start fresh
          </Button>
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
    <div style={{ display: 'flex', padding: '0 16px', borderBottom: `1px solid ${tokens.colors.surface['1']}`, background: tokens.colors.canvas }}>
      <Tabs value={active} onValueChange={(v) => onChange(v as DashboardTabId)}>
        <TabsList variant="line" className="h-10 w-full justify-start gap-2 bg-transparent">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="h-10 px-3 text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
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
  const isError = status.state === 'Error';
  const transitioning = status.state === 'Starting' || status.state === 'Stopping';

  const stateColor =
    status.state === 'Running' ? tokens.colors.semantic.success :
    status.state === 'Error' ? tokens.colors.semantic.error :
    status.state === 'Idle' ? tokens.colors.steel.muted : tokens.colors.semantic.warning;

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
        <div style={rootStyle} aria-busy={true}>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${tokens.colors.surface['1']}`, padding: '8px 16px' }}>
            <span style={{ color: tokens.colors.steel.muted, fontSize: 14, fontWeight: 600 }}>Bot Dashboard</span>
            <div style={{ flex: 1 }} />
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close dashboard" className="text-sm">
              ✕
            </Button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.colors.steel.disabled, fontSize: 12 }}>
            Loading wallet status…
          </div>
        </div>
      );
    }
    return (
      <div style={rootStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${tokens.colors.surface['1']}`, padding: '8px 16px' }}>
          <span style={{ color: tokens.colors.steel.muted, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Bot Dashboard
            <span style={{ padding: '2px 8px', background: tokens.colors.hairline.default, borderRadius: 4, fontSize: 11 }}>
              {status.state}
            </span>
            {wallet.hasWallet && (
              <Button
                type="button"
                variant="ghost"
                disabled={walletLocked}
                onClick={handleLock}
                aria-pressed={walletLocked}
                title={walletLocked ? 'Wallet is locked' : 'Click to lock wallet'}
                className="h-auto px-2 py-0.5 text-[10px]"
                style={{
                  background: walletLocked ? tokens.colors.semantic.errorBg : tokens.colors.semantic.successBg,
                  color: walletLocked ? tokens.colors.semantic.error : tokens.colors.semantic.success,
                }}
              >
                {walletLocked ? '🔒 Locked' : '🔓 Unlocked'}
              </Button>
            )}
          </span>
          <div style={{ flex: 1 }} />
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close dashboard" className="text-xs">
            ✕
          </Button>
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
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${tokens.colors.surface['1']}`, padding: '8px 16px' }}>
        <span style={{ color: tokens.colors.steel.muted, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          Bot Dashboard
          <span style={{ padding: '2px 8px', background: tokens.colors.hairline.default, borderRadius: 4, fontSize: 11, color: stateColor, fontWeight: 600 }}>
            {status.state}
          </span>
          {chaosMode && (
            <span
              style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 10,
                background: tokens.colors.semantic.error, color: tokens.colors.ink.default, fontWeight: 600, cursor: 'help',
              }}
              title={engineChaosModeTitle}
            >
              ⚡ CHAOS{engineChaosMode?.executionMode
                ? ` · ${engineChaosMode.executionMode === 'simulated' ? 'SIM' : 'LIVE'}`
                : ''}
            </span>
          )}
          {wallet.hasWallet && (
            <Button
              type="button"
              variant="ghost"
              disabled={walletLocked}
              onClick={handleLock}
              aria-pressed={walletLocked}
              title={walletLocked ? 'Wallet is locked' : 'Click to lock wallet'}
              className="h-auto px-2 py-0.5 text-[10px]"
              style={{
                background: walletLocked ? tokens.colors.semantic.errorBg : tokens.colors.semantic.successBg,
                color: walletLocked ? tokens.colors.semantic.error : tokens.colors.semantic.success,
              }}
            >
              {walletLocked ? '🔒 Locked' : '🔓 Unlocked'}
            </Button>
          )}
        </span>
        <div style={{ flex: 1 }} />
        {/* Action buttons */}
        {status.state === 'Running' && (
          <>
            <Button
              type="button"
              variant="destructive"
              onClick={() => sendCommand('stop')}
              disabled={loading}
              className="text-[11px]"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="mr-1">
                <rect x="1" y="1" width="8" height="8" rx="1" />
              </svg>
              Stop
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => sendCommand('emergency-stop')}
              disabled={loading}
              title="Emergency Stop"
              className="ml-1 text-[11px] font-semibold"
            >
              ⚠
            </Button>
          </>
        )}
        {isError && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => sendCommand('reset')}
            disabled={loading}
            className="text-[11px]"
          >
            ⟳ Reset
          </Button>
        )}
        {transitioning && (
          <span style={{ color: tokens.colors.semantic.warning, fontSize: 11, fontStyle: 'italic', marginRight: 8 }}>
            {status.state}...
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close dashboard"
          className="ml-1 text-xs"
        >
          ✕
        </Button>
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
            <div style={{ color: tokens.colors.steel.muted, fontWeight: 600, padding: '12px 12px 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0 }}>
              Logs ({logs.length})
            </div>
            <div ref={logContainerRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 12px 12px', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6, minHeight: 0 }}>
              {logs.length === 0 && (
                <span style={{ color: tokens.colors.steel.muted, fontStyle: 'italic' }}>No log entries yet...</span>
              )}
              {logs.slice(-500).map((log, i) => (
                <div key={i} style={{
                  color: log.level === 'error' ? tokens.colors.semantic.error :
                         log.level === 'warn' ? tokens.colors.semantic.warning :
                         log.level === 'debug' ? tokens.colors.ink['3'] : tokens.colors.ink['2'],
                }}>
                  <span style={{ color: tokens.colors.steel.disabled }}>
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
      <div style={{ borderTop: `1px solid ${tokens.colors.surface['1']}`, padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: tokens.colors.steel.disabled }}>
        <span>Connected: <span style={{ color: tokens.colors.semantic.success }}>●</span></span>
        <span>Last update: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}