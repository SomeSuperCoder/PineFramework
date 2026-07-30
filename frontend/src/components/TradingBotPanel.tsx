import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StrategySelector } from './StrategySelector';
import { ProgressBar } from './ProgressBar';
import { useAutoSelectProgress } from '../hooks/useAutoSelectProgress';

// ---- Types ----

export type BotStateT = 'Idle' | 'Starting' | 'Running' | 'Stopping' | 'Stopped' | 'Error';

export interface BotStatusSnapshot {
  state: BotStateT;
  strategyName: string;
  dex: string;
  walletPublicKey: string | null;
  startedAt: number | null;
  uptimeMs: number;
  balance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: PositionSummary[];
  exposure: number;
  errors: Array<{ code: string; message: string; severity: string }>;
  lastTransition?: { from: BotStateT; to: BotStateT; reason: string; timestamp: number } | null;
  totalTrades?: number;
  winningTrades?: number;
  losingTrades?: number;
  winRate?: number;
  totalFees?: number;
  avgWin?: number;
  avgLoss?: number;
  profitFactor?: number;
  maxDrawdown?: number;
  avgLatency?: number;
}

export interface WalletInfo {
  hasWallet: boolean;
  publicKey?: string;
}

export interface PositionSummary {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  openedAt: number;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

// ---- WebSocket hook ----

export function useBotWebSocket(backendUrl: string) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<BotStatusSnapshot | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [connectionFailed, setConnectionFailed] = useState(false);
  const connectAttemptsRef = useRef(0);

  // Auto-select progress — delegated to shared hook
  const autoSelect = useAutoSelectProgress();

  const connect = useCallback(() => {
    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/bot';
    const ws = new WebSocket(wsUrl);
    connectAttemptsRef.current++;

    ws.onopen = () => {
      setConnected(true);
      setConnectionFailed(false);
      connectAttemptsRef.current = 0;
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.channel === 'bot:snapshot' && msg.type === 'snapshot') {
          setStatus(msg.data.status);
        } else if (msg.channel === 'bot:state') {
          setStatus((prev) => prev ? { ...prev, state: msg.data.current } : null);
        } else if (msg.channel === 'bot:log') {
          setLogs((prev) => [...prev.slice(-999), msg.data]);
        } else if (msg.channel === 'bot:position') {
          setStatus((prev) => {
            if (!prev) return null;
            const pos = msg.data.position;
            if (msg.data.type === 'opened') {
              return { ...prev, positions: [...prev.positions, pos] };
            } else if (msg.data.type === 'closed') {
              return { ...prev, positions: prev.positions.filter((p) => p.symbol !== pos.symbol) };
            } else if (msg.data.type === 'updated') {
              return {
                ...prev,
                positions: prev.positions.map((p) => p.symbol === pos.symbol ? pos : p),
              };
            }
            return prev;
          });
        } else if (msg.channel === 'bot:metrics') {
          setStatus((prev) => prev ? { ...prev, ...msg.data } : null);
        } else {
          // Delegate to auto-select hook for other channels
          autoSelect.handleMessage(msg);
        }
      } catch { /* ignore parse errors */ }
    };
    ws.onclose = () => {
      setConnected(false);
      // After 5 failed attempts (~15 seconds), show connection failed
      if (connectAttemptsRef.current >= 5) {
        setConnectionFailed(true);
      }
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [backendUrl, autoSelect.handleMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Reset auto-select state when status changes to non-idle (bot started)
  useEffect(() => {
    if (status?.state === 'Running' || status?.state === 'Starting') {
      autoSelect.reset();
    }
  }, [status?.state, autoSelect.reset]);

  return {
    connected,
    status,
    logs,
    autoSelectProgress: autoSelect.progress,
    autoSelectResult: autoSelect.result,
    connectionFailed,
  };
}

// ---- Auto-Select Progress Grid ----

type CandidateStatus = { phase: string; status: 'pending' | 'active' | 'done' | 'failed'; error?: string };

function StatusIcon({ status }: { status: CandidateStatus['status'] }) {
  switch (status) {
    case 'pending':
      return <span style={{ color: '#555', fontSize: 11 }}>—</span>;
    case 'active':
      return <span style={{ color: '#ff9800', fontSize: 11, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>;
    case 'done':
      return <span style={{ color: '#4caf50', fontSize: 11 }}>✓</span>;
    case 'failed':
      return <span style={{ color: '#e94560', fontSize: 11 }}>✗</span>;
  }
}

function AutoSelectGrid({
  statuses,
  ranking,
  candleProgress,
  currentPair,
}: {
  statuses: Record<string, CandidateStatus>;
  ranking?: Array<{ label: string; metrics: Record<string, number> }>;
  candleProgress?: { fetched: number; total: number };
  currentPair?: string;
}) {
  const entries = Object.entries(statuses);

  const formatTimeframe = (tf: string) => {
    if (tf === '5') return '5m';
    if (tf === '15') return '15m';
    if (tf === '60') return '1h';
    if (tf === '240') return '4h';
    return tf;
  };

  const formatPairLabel = (label: string) => {
    const match = label.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) {
      return `${match[1]} · ${formatTimeframe(match[2])}`;
    }
    return label;
  };

  return (
    <div style={{
      marginTop: 8, padding: 8, background: '#111128', borderRadius: 6,
      border: '1px solid #333', maxHeight: 200, overflow: 'auto',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 60px 60px',
        gap: '2px 8px',
        fontSize: 10,
      }}>
        <div style={{ color: '#666', fontWeight: 600 }}>Pair</div>
        <div style={{ color: '#666', fontWeight: 600 }}>Phase</div>
        <div style={{ color: '#666', fontWeight: 600 }}>Status</div>
        <div style={{ color: '#666', fontWeight: 600 }}>PnL</div>
        {entries.map(([key, st]) => {
          const rankEntry = ranking?.find(r => r.label === key);
          const isCurrentPair = currentPair === key && st.status === 'active';
          const showCandleProgress = isCurrentPair && st.phase === 'fetching' && candleProgress;
          const displayPhase = st.status === 'done' ? 'done' : st.phase;

          return (
            <React.Fragment key={key}>
              <div style={{ color: '#e0e0e0' }}>{formatPairLabel(key)}</div>
              <div style={{ color: '#888' }}>
                {showCandleProgress
                  ? `${candleProgress.fetched}/${candleProgress.total}`
                  : displayPhase}
              </div>
              <div title={st.error}>
                <StatusIcon status={st.status} />
              </div>
              <div style={{ color: rankEntry?.metrics.totalPnlPercent != null && rankEntry.metrics.totalPnlPercent >= 0 ? '#4caf50' : '#e94560' }}>
                {rankEntry?.metrics.totalPnlPercent != null ? `${rankEntry.metrics.totalPnlPercent >= 0 ? '+' : ''}${rankEntry.metrics.totalPnlPercent.toFixed(2)}%` : ''}
              </div>
              {st.error && st.status === 'failed' && (
                <div style={{ gridColumn: '1 / -1', color: '#e94560', fontSize: 9, marginTop: 1, opacity: 0.8 }}>
                  {st.error.length > 80 ? st.error.slice(0, 80) + '...' : st.error}
                </div>
              )}
              {showCandleProgress && (
                <div style={{ gridColumn: '1 / -1', marginTop: 2 }}>
                  <div style={{
                    width: '100%', height: 4, background: '#222', borderRadius: 2, overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${(candleProgress.fetched / Math.max(candleProgress.total, 1)) * 100}%`,
                      height: '100%', background: '#2196f3', borderRadius: 2,
                      transition: 'width 0.2s ease',
                    }} />
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ---- Wallet Import Panel ----

function WalletImportPanel({ backendUrl, wallet, onWalletChange }: {
  backendUrl: string;
  wallet: WalletInfo;
  onWalletChange: (w: WalletInfo) => void;
}) {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [previewPublicKey, setPreviewPublicKey] = useState<string | null>(null);
  const [previewBalance, setPreviewBalance] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importedBalance, setImportedBalance] = useState<number | null>(null);
  const [importedBalanceLoading, setImportedBalanceLoading] = useState(false);

  // Fetch balance for already-imported wallet on mount
  useEffect(() => {
    if (wallet.hasWallet && wallet.publicKey) {
      setImportedBalanceLoading(true);
      fetch(`${backendUrl}/api/bot/wallet/balance`)
        .then(r => r.json())
        .then(data => { if (data.success) setImportedBalance(data.balance); })
        .catch(() => {})
        .finally(() => setImportedBalanceLoading(false));
    }
  }, [wallet.hasWallet, wallet.publicKey, backendUrl]);

  // Fetch preview (public key + balance) when seed phrase changes
  const fetchPreview = async (phrase: string) => {
    const words = phrase.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setPreviewPublicKey(null);
      setPreviewBalance(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/bot/wallet/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedPhrase: phrase.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setPreviewPublicKey(data.publicKey);
        setPreviewBalance(data.balance);
      } else {
        setPreviewPublicKey(null);
        setPreviewBalance(null);
      }
    } catch {
      setPreviewPublicKey(null);
      setPreviewBalance(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError('Seed phrase must be 12 or 24 words');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/bot/wallet/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedPhrase: seedPhrase.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
      } else {
        onWalletChange({ hasWallet: true, publicKey: data.publicKey });
        setSeedPhrase('');
        setPassword('');
      }
    } catch {
      setError('Network error — is the backend running?');
    } finally {
      setImporting(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remove wallet? This cannot be undone.')) return;
    setImporting(true);
    try {
      const res = await fetch(`${backendUrl}/api/bot/wallet?confirm=true`, { method: 'DELETE' });
      if (res.ok) {
        onWalletChange({ hasWallet: false });
      }
    } catch { /* ignore */ } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
        Wallet {wallet.hasWallet ? '✓ Imported' : '— Not Imported'}
      </div>
      {wallet.hasWallet ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#4caf50', fontSize: 11, fontFamily: 'monospace' }}>
            {wallet.publicKey?.slice(0, 8)}...{wallet.publicKey?.slice(-4)}
          </span>
          <span style={{ color: '#888', fontSize: 11 }}>
            {importedBalanceLoading ? (
              'Loading balance...'
            ) : importedBalance !== null ? (
              <span style={{ color: '#64b5f6' }}>
                USDC: {importedBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            ) : null}
          </span>
          <button
            onClick={handleRemove}
            disabled={importing}
            style={{
              padding: '3px 8px', background: '#2a1520', color: '#e94560',
              border: '1px solid #e94560', borderRadius: 3, cursor: 'pointer',
              fontSize: 10,
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            value={seedPhrase}
            onChange={(e) => {
              setSeedPhrase(e.target.value);
              // Debounced preview fetch
              const val = e.target.value;
              setTimeout(() => fetchPreview(val), 500);
            }}
            placeholder="Paste 12 or 24 word seed phrase..."
            rows={2}
            style={{
              width: '100%', background: '#111128', color: '#e0e0e0',
              border: '1px solid #333', borderRadius: 4, padding: '6px 8px',
              fontSize: 11, fontFamily: 'monospace', resize: 'vertical',
            }}
          />

          {/* Balance preview — shown after valid seed phrase */}
          {(previewLoading || previewPublicKey) && (
            <div style={{
              padding: '8px 10px', background: '#0d1a10', borderRadius: 4,
              border: '1px solid #333',
            }}>
              {previewLoading ? (
                <span style={{ color: '#888', fontSize: 11 }}>Checking wallet...</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ color: '#4caf50', fontSize: 11, fontFamily: 'monospace' }}>
                    {previewPublicKey?.slice(0, 8)}...{previewPublicKey?.slice(-4)}
                  </span>
                  <span style={{ color: '#64b5f6', fontSize: 11 }}>
                    USDC: {(previewBalance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set encryption password (min 8 chars)"
            style={{
              width: '100%', background: '#111128', color: '#e0e0e0',
              border: '1px solid #333', borderRadius: 4, padding: '6px 8px',
              fontSize: 11, boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleImport}
              disabled={importing || !seedPhrase.trim() || !password}
              style={{
                padding: '4px 12px', background: '#1a3328', color: '#4caf50',
                border: '1px solid #4caf50', borderRadius: 3, cursor: importing ? 'wait' : 'pointer',
                fontSize: 10, fontWeight: 600, opacity: importing || !seedPhrase.trim() || !password ? 0.6 : 1,
              }}
            >
              {importing ? 'Importing...' : 'Import Wallet'}
            </button>
          </div>
          {error && <div style={{ color: '#e94560', fontSize: 10 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

/** Check strategy source for patterns that are incompatible with live spot trading. */
function checkStrategyCompatibility(source: string): string[] {
  const warnings: string[] = [];

  // Remove comments and strings to avoid false positives
  let cleaned = source
    // Remove single-line comments
    .replace(/\/\/.*$/gm, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove template literals
    .replace(/`[^`]*`/g, '')
    // Remove single-quoted strings
    .replace(/'[^']*'/g, '')
    // Remove double-quoted strings
    .replace(/"[^"]*"/g, '');

  if (/strategy\.short\b/.test(cleaned)) {
    warnings.push('This strategy uses short positions (strategy.short). Spot trading only supports long positions.');
  }

  if (/strategy\.entry\s*\([^)]*\blimit\s*=/.test(cleaned)) {
    warnings.push('Limit orders (limit=) are not supported by DEX swaps. Market orders will be used.');
  }

  if (/strategy\.exit\s*\([^)]*\bshort\b/.test(cleaned)) {
    warnings.push('This strategy uses short exits (strategy.exit with short). Spot trading does not support short positions.');
  }

  if (/\bstrategy\.openprofit\b/.test(cleaned)) {
    warnings.push('strategy.openprofit may report different values in live trading vs backtesting.');
  }

  return warnings;
}

export interface ConfigValues {
  strategySource: string;
  dex: string;
  maxDailyLoss: number;
  timezone: string;
  closeOnLoss: boolean;
}

/** Calculate max daily loss: min($1, 10% × USDC balance) */
function calcMaxDailyLoss(usdcBalance: number): number {
  return Math.min(1, usdcBalance * 0.10);
}

function BotConfigPanel({ backendUrl, onConfigured, onConfigValues, selectedTimeframes, usdcBalance }: {
  backendUrl: string;
  onConfigured: () => void;
  onConfigValues?: (values: ConfigValues) => void;
  selectedTimeframes: string[];
  usdcBalance: number | null;
}) {
  const [strategySource, setStrategySource] = useState('');
  const [dex, setDex] = useState<'jupiter-swap' | 'jupiter-ultra'>('jupiter-swap');
  const [timezone, setTimezone] = useState('UTC');
  const [closeOnLoss, setCloseOnLoss] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState('');

  const maxDailyLoss = calcMaxDailyLoss(usdcBalance ?? 0);

  const compatibilityWarnings = useMemo(
    () => checkStrategyCompatibility(strategySource),
    [strategySource]
  );

  const handleConfigure = async () => {
    if (!strategySource.trim()) {
      setError('Select a strategy or paste your Pine Script strategy source code');
      return;
    }
    setConfiguring(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/bot/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategySource: strategySource.trim(),
          dex,
          risk: { maxDailyLoss, dailyLossTimezone: timezone, closeOnDailyLoss: closeOnLoss },
          autoSelect: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Configuration failed');
      } else {
        // Trigger backtest after successful configure
        const backtestRes = await fetch(`${backendUrl}/api/bot/backtest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeframes: selectedTimeframes }),
        });
        if (!backtestRes.ok) {
          const backtestData = await backtestRes.json();
          console.error('Backtest trigger failed:', backtestData.error);
        }
        onConfigValues?.({
          strategySource: strategySource.trim(),
          dex,
          maxDailyLoss,
          timezone,
          closeOnLoss,
        });
        onConfigured();
      }
    } catch {
      setError('Network error');
    } finally {
      setConfiguring(false);
    }
  };

  return (
    <div>
      <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
        Configuration
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <StrategySelector
          backendUrl={backendUrl}
          value={strategySource}
          onChange={(src) => { setStrategySource(src); }}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ color: '#888', fontSize: 11 }}>
            DEX:{' '}
            <select
              value={dex}
              onChange={(e) => setDex(e.target.value as 'jupiter-swap' | 'jupiter-ultra')}
              style={{
                background: '#111128', color: '#e0e0e0', border: '1px solid #333',
                borderRadius: 3, padding: '2px 6px', fontSize: 11, marginLeft: 4,
              }}
            >
              <option value="jupiter-swap">Jupiter Swap</option>
              <option value="jupiter-ultra">Jupiter Ultra</option>
            </select>
          </label>
          <label style={{ color: '#888', fontSize: 11 }}>
            Max Daily Loss:{' '}
            <span style={{ color: '#64b5f6', fontWeight: 600 }}>
              ${maxDailyLoss.toFixed(2)}
            </span>
            <span style={{ color: '#666', fontSize: 10, marginLeft: 4 }}>
              (10% × ${usdcBalance?.toFixed(2) ?? '0.00'})
            </span>
          </label>
          <label style={{ color: '#888', fontSize: 11 }}>
            Timezone:{' '}
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              style={{
                width: 100, background: '#111128', color: '#e0e0e0',
                border: '1px solid #333', borderRadius: 3, padding: '2px 6px',
                fontSize: 11, marginLeft: 4,
              }}
            />
          </label>
          <label style={{ color: '#888', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={closeOnLoss}
              onChange={(e) => setCloseOnLoss(e.target.checked)}
            />
            Close all on loss
          </label>
        </div>
        {error && <div style={{ color: '#e94560', fontSize: 10 }}>{error}</div>}
        {compatibilityWarnings.length > 0 && (
          <div style={{
            background: '#2a2010', border: '1px solid #ff9800', borderRadius: 4,
            padding: '6px 10px', marginTop: 4,
          }}>
            <div style={{ color: '#ff9800', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
              ⚠ Live Trading Compatibility Notes
            </div>
            {compatibilityWarnings.map((w, i) => (
              <div key={i} style={{ color: '#e0a040', fontSize: 10 }}>{w}</div>
            ))}
          </div>
        )}
        <button
          onClick={handleConfigure}
          disabled={configuring}
          style={{
            padding: '6px 16px', background: '#1a3a6a', color: '#64b5f6',
            border: '1px solid #64b5f6', borderRadius: 4, cursor: configuring ? 'wait' : 'pointer',
            fontSize: 11, fontWeight: 600, alignSelf: 'flex-start',
            opacity: configuring ? 0.7 : 1,
          }}
        >
          {configuring ? 'Configuring...' : 'Apply Configuration'}
        </button>
      </div>
    </div>
  );
}

export function TradingBotControlButton({
  backendUrl,
  botState,
  connected,
  onToggleDashboard,
  dashboardOpen,
}: {
  backendUrl: string;
  botState: BotStateT;
  connected: boolean;
  onToggleDashboard: () => void;
  dashboardOpen: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const sendCommand = async (command: string) => {
    setLoading(true);
    try {
      await fetch(`${backendUrl}/api/bot/${command}`, { method: 'POST' });
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const isRunning = botState === 'Running';
  const isStopped = botState === 'Idle' || botState === 'Stopped';
  const isError = botState === 'Error';
  const transitioning = botState === 'Starting' || botState === 'Stopping';

  return (
    <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
      <button
        onClick={isStopped && dashboardOpen ? () => sendCommand('start') : onToggleDashboard}
        disabled={loading}
        title={isStopped && dashboardOpen ? 'Start Live Trading Bot' : dashboardOpen ? 'Hide Dashboard' : 'Show Bot Dashboard'}
        style={{
          padding: '5px 10px',
          background: dashboardOpen ? '#1a3328' : '#111128',
          color: dashboardOpen ? '#4caf50' : '#888',
          border: `1px solid ${dashboardOpen ? '#4caf50' : '#333'}`,
          borderRadius: '4px',
          cursor: loading ? 'wait' : 'pointer',
          fontSize: '11px',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          opacity: loading ? 0.7 : 1,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <polygon points="2,0 9,5 2,10" />
        </svg>
        Bot Dashboard
      </button>
      {isRunning && (
        <>
          <button
            onClick={() => sendCommand('stop')}
            disabled={loading}
            title="Stop Bot"
            style={{
              padding: '5px 10px',
              background: '#e94560',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect x="1" y="1" width="8" height="8" rx="1" />
            </svg>
            Stop Bot
          </button>
          <button
            onClick={() => sendCommand('emergency-stop')}
            disabled={loading}
            title="Emergency Stop"
            style={{
              padding: '5px 8px',
              background: '#ff1744',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              opacity: loading ? 0.7 : 1,
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
          title="Reset Bot"
          style={{
            padding: '5px 10px',
            background: '#2a1520',
            color: '#ff9800',
            border: '1px solid #ff9800',
            borderRadius: '4px',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: '11px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          ⟳ Reset
        </button>
      )}
      {transitioning && (
        <span style={{ color: '#ff9800', fontSize: '11px', fontStyle: 'italic' }}>{botState}...</span>
      )}
      {!connected && (botState !== 'Idle' || dashboardOpen) && (
        <span style={{ color: '#ff9800', fontSize: '10px', marginLeft: '2px' }} title="Reconnecting...">
          ○
        </span>
      )}
    </div>
  );
}

// ---- Setup Wizard ----

function SetupWizard({
  backendUrl,
  initialWallet,
  onStart,
  onClose,
  autoSelectProgress,
  autoSelectResult,
}: {
  backendUrl: string;
  initialWallet: WalletInfo;
  onStart: () => Promise<void>;
  onClose: () => void;
  autoSelectProgress?: { current: number; total: number; pair: { symbol: string; timeframe: string }; phase: string; statuses: Record<string, { phase: string; status: 'pending' | 'active' | 'done' | 'failed' }>; candleProgress?: { fetched: number; total: number }; ranking?: Array<{ label: string; metrics: Record<string, number> }> } | null;
  autoSelectResult?: {
    best: { pair: { symbol: string; timeframe: string }; label: string; metrics: Record<string, number> };
    ranking: Array<{ pair: { symbol: string; timeframe: string }; label: string; metrics: Record<string, number> }>;
    evaluatedCount: number;
    failedCount: number;
  } | null;
}) {
  const [step, setStep] = useState<'wallet' | 'config' | 'backtest' | 'review'>(
    initialWallet.hasWallet ? 'config' : 'wallet'
  );
  const [wallet, setWallet] = useState<WalletInfo>(initialWallet);
  const [configValues, setConfigValues] = useState<ConfigValues | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(() => {
    const saved = localStorage.getItem('autoSelectTimeframes');
    return saved ? JSON.parse(saved) : ['5', '15', '60', '240'];
  });
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem('autoSelectTimeframes', JSON.stringify(selectedTimeframes));
  }, [selectedTimeframes]);

  // Fetch USDC balance when wallet is imported
  useEffect(() => {
    if (wallet.hasWallet) {
      fetch(`${backendUrl}/api/bot/wallet/balance`)
        .then(r => r.json())
        .then(data => { if (data.success) setUsdcBalance(data.balance); })
        .catch(() => {});
    } else {
      setUsdcBalance(null);
    }
  }, [wallet.hasWallet, backendUrl]);

  const handleStart = async () => {
    setStarting(true);
    setStartError('');
    try {
      await onStart();
    } catch {
      setStartError('Failed to start bot');
    } finally {
      setStarting(false);
    }
  };

  const StepDot = ({ s, label }: { s: typeof step; label: string }) => {
    const steps = ['wallet', 'config', 'backtest', 'review'];
    const idx = steps.indexOf(s) + 1;
    const active = step === s;
    const done = steps.indexOf(s) < steps.indexOf(step);
    return (
      <span
        onClick={done ? () => setStep(s) : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          color: active ? '#fff' : done ? '#4caf50' : '#555',
          cursor: done ? 'pointer' : 'default',
          fontSize: 11, fontWeight: active ? 600 : 400,
          padding: '4px 8px',
        }}
      >
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: active ? '#1a3a6a' : done ? '#1a3328' : '#222',
          border: `1px solid ${active ? '#64b5f6' : done ? '#4caf50' : '#333'}`,
          fontSize: 10, fontWeight: 700, color: active ? '#64b5f6' : done ? '#4caf50' : '#555',
        }}>
          {done ? '✓' : idx}
        </span>
        {label}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a2e', paddingBottom: 8 }}>
        <StepDot s="wallet" label="Wallet" />
        <span style={{ color: '#333', margin: '0 2px' }}>→</span>
        <StepDot s="config" label="Config" />
        <span style={{ color: '#333', margin: '0 2px' }}>→</span>
        <StepDot s="backtest" label="Backtest" />
        <span style={{ color: '#333', margin: '0 2px' }}>→</span>
        <StepDot s="review" label="Review" />
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          padding: '4px 10px', background: 'transparent', color: '#888',
          border: 'none', cursor: 'pointer', fontSize: 14,
        }}>
          ✕
        </button>
      </div>

      {/* Step 1: Wallet */}
      {step === 'wallet' && (
        <div>
          <WalletImportPanel backendUrl={backendUrl} wallet={wallet} onWalletChange={setWallet} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              onClick={() => setStep('config')}
              disabled={!wallet.hasWallet}
              style={{
                padding: '6px 20px', background: wallet.hasWallet ? '#1a3a6a' : '#111',
                color: wallet.hasWallet ? '#64b5f6' : '#555',
                border: `1px solid ${wallet.hasWallet ? '#64b5f6' : '#333'}`,
                borderRadius: 4, cursor: wallet.hasWallet ? 'pointer' : 'default',
                fontSize: 11, fontWeight: 600,
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Config */}
      {step === 'config' && (
        <div>
          <BotConfigPanel
            backendUrl={backendUrl}
            onConfigured={() => { setStep('backtest'); }}
            onConfigValues={(v) => setConfigValues(v)}
            selectedTimeframes={selectedTimeframes}
            usdcBalance={usdcBalance}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <button
              onClick={() => setStep('wallet')}
              style={{
                padding: '6px 14px', background: 'transparent', color: '#888',
                border: '1px solid #333', borderRadius: 4, cursor: 'pointer',
                fontSize: 11,
              }}
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Backtest */}
      {step === 'backtest' && (
        <div>
          <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
            Auto-Select Backtest
          </div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
            Evaluating candidate pairs sequentially...
          </div>

          {/* Timeframe Selection */}
          {!autoSelectProgress && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6 }}>Select Timeframes:</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['5', '15', '60', '240'].map(tf => (
                  <label key={tf} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedTimeframes.includes(tf)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTimeframes(prev => [...prev, tf]);
                        } else {
                          setSelectedTimeframes(prev => prev.filter(t => t !== tf));
                        }
                      }}
                      style={{ accentColor: '#64b5f6' }}
                    />
                    <span style={{ fontSize: 11, color: '#ccc' }}>
                      {tf === '5' ? '5m' : tf === '15' ? '15m' : tf === '60' ? '1h' : '4h'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Auto-Select Progress */}
          {autoSelectProgress && (
            <div style={{
              padding: 12, background: '#111128', borderRadius: 6,
              border: '1px solid #ff9800',
            }}>
              <ProgressBar
                progress={(autoSelectProgress.current / Math.max(autoSelectProgress.total, 1)) * 100}
                phase="Evaluating"
                variant="inline"
                status="running"
              />
              <div style={{ marginTop: 8 }}>
                <AutoSelectGrid
                  statuses={autoSelectProgress.statuses}
                  ranking={autoSelectProgress.ranking}
                  candleProgress={autoSelectProgress.candleProgress}
                  currentPair={`${autoSelectProgress.pair.symbol} (${autoSelectProgress.pair.timeframe})`}
                />
              </div>
            </div>
          )}

          {/* Auto-Select Results */}
          {autoSelectResult && (
            <div style={{
              marginTop: 12, padding: 12, background: '#0d1a10', borderRadius: 6,
              border: '1px solid #4caf50',
            }}>
              <div style={{ color: '#4caf50', fontWeight: 600, fontSize: 11, marginBottom: 4 }}>
                Auto-Select Complete
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                Evaluated {autoSelectResult.evaluatedCount} pair
                {autoSelectResult.evaluatedCount !== 1 ? 's' : ''}
                {autoSelectResult.failedCount > 0 && `, ${autoSelectResult.failedCount} failed`}
              </div>
              <AutoSelectGrid
                statuses={Object.fromEntries(
                  autoSelectResult.ranking.map(r => [r.label, { phase: 'done', status: 'done' as const }])
                )}
                ranking={autoSelectResult.ranking}
              />
              <div style={{ marginTop: 8, padding: '6px 8px', background: '#1a3328', borderRadius: 3 }}>
                <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 11 }}>
                  ★ Best: {autoSelectResult.best.label}
                </span>
                <span style={{ color: '#888', fontSize: 10, marginLeft: 8 }}>
                  PF: {autoSelectResult.best.metrics.profitFactor?.toFixed(2)}
                  {' '}Sharpe: {autoSelectResult.best.metrics.sharpeRatio?.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button
              onClick={() => setStep('config')}
              disabled={!!autoSelectProgress}
              style={{
                padding: '6px 14px', background: 'transparent', color: '#888',
                border: '1px solid #333', borderRadius: 4, cursor: autoSelectProgress ? 'default' : 'pointer',
                fontSize: 11,
              }}
            >
              ← Back
            </button>
            <button
              onClick={() => setStep('review')}
              disabled={!autoSelectResult}
              style={{
                padding: '8px 24px', background: autoSelectResult ? '#1a3328' : '#222',
                color: autoSelectResult ? '#4caf50' : '#555', border: `1px solid ${autoSelectResult ? '#4caf50' : '#333'}`,
                borderRadius: 4, cursor: autoSelectResult ? 'pointer' : 'default',
                fontSize: 12, fontWeight: 700,
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Start */}
      {step === 'review' && (
        <div>
          <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
            Review & Start
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
            <div>
              <span style={{ color: '#888' }}>Wallet: </span>
              <span style={{ color: '#4caf50' }}>
                {wallet.publicKey ? `${wallet.publicKey.slice(0, 8)}...${wallet.publicKey.slice(-4)}` : '(none)'}
              </span>
            </div>
            {configValues && (
              <>
                <div>
                  <span style={{ color: '#888' }}>Strategy: </span>
                  <span style={{ color: '#e0e0e0' }}>
                    {configValues.strategySource.split('\n')[0]?.substring(0, 60) || '(pasted)'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>DEX: </span>
                  <span style={{ color: '#e0e0e0' }}>{configValues.dex}</span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Selected Pair: </span>
                  <span style={{ color: '#4caf50', fontWeight: 600 }}>
                    {autoSelectResult?.best?.label ?? 'Pending...'}
                  </span>
                </div>
                {autoSelectResult && (
                  <div style={{ fontSize: 10, color: '#888', marginLeft: 60 }}>
                    PF: {autoSelectResult.best.metrics.profitFactor?.toFixed(2)}
                    {' '}Sharpe: {autoSelectResult.best.metrics.sharpeRatio?.toFixed(2)}
                  </div>
                )}
                <div>
                  <span style={{ color: '#888' }}>Max Daily Loss: </span>
                  <span style={{ color: '#e0e0e0' }}>${configValues.maxDailyLoss}</span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Timezone: </span>
                  <span style={{ color: '#e0e0e0' }}>{configValues.timezone}</span>
                </div>
              </>
            )}
          </div>

          {startError && (
            <div style={{ color: '#e94560', fontSize: 11, marginTop: 8 }}>{startError}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button
              onClick={() => setStep('config')}
              disabled={!!autoSelectProgress}
              style={{
                padding: '6px 14px', background: 'transparent', color: '#888',
                border: '1px solid #333', borderRadius: 4, cursor: autoSelectProgress ? 'default' : 'pointer',
                fontSize: 11,
              }}
            >
              ← Back
            </button>
            <button
              onClick={handleStart}
              disabled={starting || !!autoSelectProgress}
              style={{
                padding: '8px 24px', background: starting ? '#1a3328' : '#1a3328',
                color: '#4caf50', border: '1px solid #4caf50', borderRadius: 4,
                cursor: (starting || !!autoSelectProgress) ? 'wait' : 'pointer',
                fontSize: 12, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: (starting || !!autoSelectProgress) ? 0.7 : 1,
              }}
            >
              {starting ? 'Starting...' : (
                <>
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="#4caf50">
                    <polygon points="2,0 9,5 2,10" />
                  </svg>
                  Start Bot
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Live Dashboard (Status / Metrics / Logs) ----

function MetricValue({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span style={{ color: '#888' }}>{label}: </span>
      <span style={{ color: color ?? '#e0e0e0', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

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

export function LiveDashboard({
  backendUrl,
  status,
  logs,
  onClose,
  autoSelectProgress,
  autoSelectResult,
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
}) {
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo>({
    hasWallet: false,
    publicKey: undefined,
  });
  const [walletLocked, setWalletLocked] = useState(false);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(() => {
    return localStorage.getItem('pine-bot-dashboard-pinned') === 'true';
  });
  const logEndRef = useRef<HTMLDivElement>(null);

  // Fetch wallet status on mount — don't assume anything until we know
  useEffect(() => {
    fetch(`${backendUrl}/api/bot/wallet/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setWallet({ hasWallet: data.hasWallet, publicKey: data.publicKey });
          setWalletLocked(data.locked);
        }
      })
      .catch((err) => {
        console.error('[LiveDashboard] Failed to fetch wallet status:', err);
      })
      .finally(() => setWalletLoaded(true));
  }, [backendUrl]);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const sendCommand = async (command: string) => {
    setLoading(true);
    try {
      await fetch(`${backendUrl}/api/bot/${command}`, { method: 'POST' });
    } catch { /* ignore */ } finally {
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

  const togglePin = () => {
    setPinnedToBottom((prev) => {
      const next = !prev;
      localStorage.setItem('pine-bot-dashboard-pinned', String(next));
      return next;
    });
  };

  const fmtDur = (ms: number): string => {
    if (ms <= 0) return '\u2014';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
  };

  const fmtPnl = (pnl: number) => ({
    text: pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`,
    color: pnl >= 0 ? '#4caf50' : '#e94560' as string,
  });

  const na = '\u2014';

  const isIdle = status.state === 'Idle' || status.state === 'Stopped';
  const isRunning = status.state === 'Running';
  const isError = status.state === 'Error';
  const transitioning = status.state === 'Starting' || status.state === 'Stopping';

  const stateColor =
    status.state === 'Running' ? '#4caf50' :
    status.state === 'Error' ? '#e94560' :
    status.state === 'Idle' ? '#888' : '#ff9800';

  const isReady = wallet.hasWallet && !walletLocked;

  const rootStyle: React.CSSProperties = pinnedToBottom
    ? {
        background: '#0d0d18',
        borderTop: '1px solid #222',
        borderBottom: '1px solid #222',
        fontSize: '12px',
        height: '320px',
        display: 'flex',
        flexDirection: 'column',
      }
    : {
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
            onClick={() => sendCommand('start')}
            disabled={loading || !isReady}
            title={!wallet.hasWallet ? 'Import a wallet first' : walletLocked ? 'Unlock wallet first' : 'Start Live Trading Bot'}
            style={{
              padding: '6px 16px', background: isReady ? '#1a3328' : '#111',
              color: isReady ? '#4caf50' : '#555',
              border: `1px solid ${isReady ? '#4caf50' : '#333'}`,
              borderRadius: 4, cursor: loading ? 'wait' : isReady ? 'pointer' : 'default',
              fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: loading ? 0.7 : 1,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <polygon points="2,0 9,5 2,10" />
            </svg>
            Start Bot
          </button>
          <button
            onClick={togglePin}
            title={pinnedToBottom ? 'Pin to full screen' : 'Pin to bottom bar'}
            style={{
              padding: '4px 8px', background: 'transparent', color: '#666',
              border: 'none', cursor: 'pointer', fontSize: 12, marginLeft: 4,
            }}
          >
            {pinnedToBottom ? '⛶' : '📌'}
          </button>
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

        {/* Show unlock screen if wallet exists and is locked, otherwise show setup wizard */}
        {wallet.hasWallet && walletLocked ? (
          <UnlockScreen backendUrl={backendUrl} onUnlock={handleUnlock} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
            <div style={{ maxWidth: 600, width: '100%', padding: 16 }}>
              <SetupWizard
                backendUrl={backendUrl}
                initialWallet={wallet}
                onStart={async () => { await sendCommand('start'); }}
                onClose={onClose}
                autoSelectProgress={autoSelectProgress}
                autoSelectResult={autoSelectResult}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Running/Stopping/Error view — three-column layout
  return (
    <div style={rootStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a2e', padding: '8px 16px' }}>
        <span style={{ color: '#888', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          Bot Dashboard
          <span style={{ padding: '2px 8px', background: '#111128', borderRadius: 4, fontSize: 11, color: stateColor, fontWeight: 600 }}>
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
          onClick={togglePin}
          title={pinnedToBottom ? 'Pin to full screen' : 'Pin to bottom bar'}
          style={{
            padding: '4px 8px', background: 'transparent', color: '#666',
            border: 'none', cursor: 'pointer', fontSize: 12, marginLeft: 4,
          }}
        >
          {pinnedToBottom ? '⛶' : '📌'}
        </button>
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

      {/* Three-column body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '240px 1fr minmax(300px, 400px)', gap: 1, overflow: 'hidden' }}>
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
            <MetricValue label="Duration" value={fmtDur(status.uptimeMs)} />
            <MetricValue label="Balance" value={`$${status.balance.toFixed(2)}`} />
            <MetricValue label="Realized PnL" value={fmtPnl(status.realizedPnl).text} color={fmtPnl(status.realizedPnl).color} />
            <MetricValue label="Unrealized PnL" value={fmtPnl(status.unrealizedPnl).text} color={fmtPnl(status.unrealizedPnl).color} />
            <MetricValue label="Exposure" value={`${(status.exposure * 100).toFixed(1)}%`} />

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

        {/* Center: Metrics + Positions */}
        <div style={{ borderRight: '1px solid #1a1a2e', padding: 12, overflow: 'auto' }}>
          <div style={{ color: '#888', fontWeight: 600, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
            <MetricValue label="Total Trades" value={status.totalTrades != null ? String(status.totalTrades) : na} />
            <MetricValue label="Winning" value={status.winningTrades != null ? String(status.winningTrades) : na} color="#4caf50" />
            <MetricValue label="Losing" value={status.losingTrades != null ? String(status.losingTrades) : na} color="#e94560" />
            <MetricValue label="Win Rate" value={status.winRate != null ? `${(status.winRate * 100).toFixed(1)}%` : na} />
            <MetricValue label="Avg Win" value={status.avgWin != null ? `$${status.avgWin.toFixed(2)}` : na} color={status.avgWin != null && status.avgWin > 0 ? '#4caf50' : undefined} />
            <MetricValue label="Avg Loss" value={status.avgLoss != null ? `-$${Math.abs(status.avgLoss).toFixed(2)}` : na} color={status.avgLoss != null && status.avgLoss < 0 ? '#e94560' : undefined} />
            <MetricValue label="Profit Factor" value={status.profitFactor != null ? status.profitFactor.toFixed(2) : na}
              color={status.profitFactor != null ? status.profitFactor >= 1.5 ? '#4caf50' : status.profitFactor >= 1 ? '#ff9800' : '#e94560' : undefined}
            />
            <MetricValue label="Max Drawdown" value={status.maxDrawdown != null ? `${(status.maxDrawdown * 100).toFixed(1)}%` : na} color="#e94560" />
            <MetricValue label="Total Fees" value={status.totalFees != null ? `$${status.totalFees.toFixed(2)}` : na} />
            <MetricValue label="Avg Latency" value={status.avgLatency != null ? `${status.avgLatency.toFixed(0)}ms` : na} />
          </div>

          {/* Positions */}
          {status.positions.length > 0 && (
            <>
              <div style={{ color: '#888', fontWeight: 600, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Positions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {status.positions.map((pos, i) => (
                  <div key={i} style={{ padding: '6px 10px', background: '#111128', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 12 }}>{pos.symbol}</span>
                    <span style={{ color: pos.side === 'long' ? '#4caf50' : '#e94560', fontSize: 11, fontWeight: 600 }}>
                      {pos.side.toUpperCase()}
                    </span>
                    <span style={{ color: '#888', fontSize: 11 }}>
                      {pos.size} @ ${pos.entryPrice.toFixed(2)}
                    </span>
                    <span style={{ color: fmtPnl(pos.unrealizedPnl).color, fontSize: 11, marginLeft: 'auto' }}>
                      {fmtPnl(pos.unrealizedPnl).text}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

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
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ color: '#888', fontWeight: 600, padding: '12px 12px 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
            Logs ({logs.length})
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6 }}>
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

      {/* Footer */}
      <div style={{ borderTop: '1px solid #1a1a2e', padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: '#555' }}>
        <span>Connected: <span style={{ color: '#4caf50' }}>●</span></span>
        <span>Last update: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
