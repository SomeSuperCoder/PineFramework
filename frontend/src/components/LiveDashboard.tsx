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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
      <div className="text-sm font-semibold text-[var(--color-muted-foreground)]">Wallet Locked</div>
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
          className="border border-[#22c55e] bg-[rgba(34,197,94,0.12)] text-[#22c55e]"
        >
          {loading ? 'Unlocking...' : 'Unlock'}
        </Button>
        {error && (
          <div className="text-center text-[11px] text-[var(--color-destructive)]">{error}</div>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowForgot(!showForgot)}
          className="mt-2 h-auto p-0 text-xs text-[var(--color-muted-foreground)]"
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
    <div className="flex items-center border-b border-[var(--color-card)] px-4 bg-[var(--color-background)]">
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
    status.state === 'Running' ? '#22c55e' :
    status.state === 'Error' ? 'var(--color-destructive)' :
    status.state === 'Idle' ? 'var(--color-muted-foreground)' : '#eab308';

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
          <div className="flex items-center border-b border-[var(--color-card)] px-4 py-2">
            <span className="text-[var(--color-muted-foreground)] text-sm font-semibold">Bot Dashboard</span>
        <div className="flex-1" />
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close dashboard" className="text-sm">
              ✕
            </Button>
          </div>
          <div className="flex flex-1 items-center justify-center text-[var(--color-muted-foreground)] text-xs">
            Loading wallet status…
          </div>
        </div>
      );
    }
    return (
      <div style={rootStyle}>
        {/* Header */}
        <div className="flex items-center border-b border-[var(--color-card)] px-4 py-2">
          <span className="flex items-center gap-2 text-[var(--color-muted-foreground)] text-sm font-semibold">
            Bot Dashboard
            <Badge variant="secondary" className="text-[11px]">
              {status.state}
            </Badge>
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
                  background: walletLocked ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                  color: walletLocked ? 'var(--color-destructive)' : '#22c55e',
                }}
              >
                {walletLocked ? '🔒 Locked' : '🔓 Unlocked'}
              </Button>
            )}
          </span>
          <div className="flex-1" />
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
              <div className="flex flex-1 items-center justify-center overflow-auto">
                <div className="w-full max-w-[600px] p-4">
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
          <div className="flex-1 overflow-auto p-4">
            <TradeHistoryTab
              backendUrl={backendUrl}
              liveTrades={liveTrades}
              reconnectEpoch={connectionEpoch}
            />
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="flex-1 overflow-auto p-4">
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
      <div className="flex items-center border-b border-[var(--color-card)] px-4 py-2">
        <span className="flex items-center gap-2 text-[var(--color-muted-foreground)] text-sm font-semibold">
          Bot Dashboard
          <Badge
            variant={status.state === 'Error' ? 'destructive' : status.state === 'Running' ? 'default' : 'secondary'}
            className="text-[11px] font-semibold"
          >
            {status.state}
          </Badge>
          {chaosMode && (
            <Badge
              variant="destructive"
              className="text-[10px] font-semibold cursor-help"
              title={engineChaosModeTitle}
            >
              ⚡ CHAOS{engineChaosMode?.executionMode
                ? ` · ${engineChaosMode.executionMode === 'simulated' ? 'SIM' : 'LIVE'}`
                : ''}
            </Badge>
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
                background: walletLocked ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                color: walletLocked ? 'var(--color-destructive)' : '#22c55e',
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
          <span className="text-[#eab308] text-[11px] italic mr-2">
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
        // Three-column body wrapped in Card
        <Card className="flex-1 flex flex-col overflow-hidden border-0 rounded-none ring-0">
          <CardHeader className="px-4 py-3 border-b">
            <CardTitle className="text-sm font-semibold">Bot Cluster</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 grid grid-cols-[240px_1fr_minmax(300px,400px)] gap-0 overflow-hidden p-0">
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
            <div className="flex flex-col overflow-hidden h-full min-h-0 border-l border-[var(--color-card)]">
              <div className="text-[var(--color-muted-foreground)] font-semibold px-3 py-3 text-[11px] uppercase tracking-wider shrink-0">
                Logs ({logs.length})
              </div>
              <div ref={logContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 font-mono text-[11px] leading-relaxed min-h-0">
                {logs.length === 0 && (
                  <span className="text-[var(--color-muted-foreground)] italic">No log entries yet...</span>
                )}
                {logs.slice(-500).map((log, i) => (
                  <div key={i} style={{
                    color: log.level === 'error' ? 'var(--color-destructive)' :
                           log.level === 'warn' ? '#eab308' :
                           log.level === 'debug' ? 'var(--color-muted-foreground)' : 'var(--color-muted-foreground)',
                  }}>
                    <span className="text-[var(--color-muted-foreground)]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    {' '}
                    <span className={log.level === 'error' ? 'font-semibold' : 'font-normal'}>
                      [{log.level.toUpperCase()}]
                    </span>
                    {' '}
                    {log.message}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </CardContent>
        </Card>
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
      <div className="flex items-center gap-3 border-t border-[var(--color-card)] px-4 py-1 text-[10px] text-[var(--color-muted-foreground)]">
        <span>Connected: <span className="text-[#22c55e]">●</span></span>
        <span>Last update: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}