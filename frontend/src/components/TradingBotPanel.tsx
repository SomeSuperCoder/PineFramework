import { useState, useEffect, useRef, useCallback } from 'react';

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

  const connect = useCallback(() => {
    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/bot';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConnected(true);
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
        }
      } catch { /* ignore parse errors */ }
    };
    ws.onclose = () => {
      setConnected(false);
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [backendUrl]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, status, logs };
}

// ---- Wallet Import Panel ----

function WalletImportPanel({ backendUrl, wallet, onWalletChange }: {
  backendUrl: string;
  wallet: WalletInfo;
  onWalletChange: (w: WalletInfo) => void;
}) {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async () => {
    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError('Seed phrase must be 12 or 24 words');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/bot/wallet/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedPhrase: seedPhrase.trim(), confirmReplace }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsConfirm) {
          setError('Wallet already exists. Check "Replace existing wallet" to overwrite.');
        } else {
          setError(data.error || 'Import failed');
        }
      } else {
        onWalletChange({ hasWallet: true, publicKey: data.publicKey });
        setSeedPhrase('');
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#4caf50', fontSize: 11, fontFamily: 'monospace' }}>
            {wallet.publicKey?.slice(0, 8)}...{wallet.publicKey?.slice(-4)}
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
            onChange={(e) => setSeedPhrase(e.target.value)}
            placeholder="Paste 12 or 24 word seed phrase..."
            rows={2}
            style={{
              width: '100%', background: '#111128', color: '#e0e0e0',
              border: '1px solid #333', borderRadius: 4, padding: '6px 8px',
              fontSize: 11, fontFamily: 'monospace', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ color: '#888', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={confirmReplace}
                onChange={(e) => setConfirmReplace(e.target.checked)}
              />
              Replace existing
            </label>
            <button
              onClick={handleImport}
              disabled={importing || !seedPhrase.trim()}
              style={{
                padding: '4px 12px', background: '#1a3328', color: '#4caf50',
                border: '1px solid #4caf50', borderRadius: 3, cursor: importing ? 'wait' : 'pointer',
                fontSize: 10, fontWeight: 600, opacity: importing || !seedPhrase.trim() ? 0.6 : 1,
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

// ---- Bot Configuration Panel ----

function BotConfigPanel({ backendUrl, onConfigured }: {
  backendUrl: string;
  onConfigured: () => void;
}) {
  const [strategySource, setStrategySource] = useState('');
  const [dex, setDex] = useState<'jupiter-swap' | 'jupiter-ultra'>('jupiter-swap');
  const [pairsText, setPairsText] = useState('SOLUSDT\nBTCUSDT\nETHUSDT');
  const [maxDailyLoss, setMaxDailyLoss] = useState('50');
  const [timezone, setTimezone] = useState('UTC');
  const [closeOnLoss, setCloseOnLoss] = useState(false);
  const [autoSelect, setAutoSelect] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState('');

  const handleConfigure = async () => {
    if (!strategySource.trim()) {
      setError('Paste your Pine Script strategy source code');
      return;
    }
    const pairs = pairsText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (pairs.length === 0) {
      setError('Enter at least one trading pair');
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
          pairs: pairs.map((s) => ({ symbol: s, timeframe: '60' })),
          risk: { maxDailyLoss: Number(maxDailyLoss), dailyLossTimezone: timezone, closeOnDailyLoss: closeOnLoss },
          autoSelect,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Configuration failed');
      } else {
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
        <textarea
          value={strategySource}
          onChange={(e) => setStrategySource(e.target.value)}
          placeholder="//@version=5&#10;strategy('My Strategy')&#10;if close > open&#10;  strategy.entry('long', strategy.long)"
          rows={4}
          style={{
            width: '100%', background: '#111128', color: '#e0e0e0',
            border: '1px solid #333', borderRadius: 4, padding: '6px 8px',
            fontSize: 11, fontFamily: 'monospace', resize: 'vertical',
          }}
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
            Max Daily Loss ($):{' '}
            <input
              type="number"
              value={maxDailyLoss}
              onChange={(e) => setMaxDailyLoss(e.target.value)}
              style={{
                width: 70, background: '#111128', color: '#e0e0e0',
                border: '1px solid #333', borderRadius: 3, padding: '2px 6px',
                fontSize: 11, marginLeft: 4,
              }}
            />
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
          <label style={{ color: '#888', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={autoSelect}
              onChange={(e) => setAutoSelect(e.target.checked)}
            />
            Auto-select
          </label>
        </div>
        <div>
          <span style={{ color: '#888', fontSize: 11 }}>Trading Pairs (one per line):</span>
          <textarea
            value={pairsText}
            onChange={(e) => setPairsText(e.target.value)}
            rows={3}
            style={{
              width: '100%', background: '#111128', color: '#e0e0e0',
              border: '1px solid #333', borderRadius: 4, padding: '6px 8px',
              fontSize: 11, fontFamily: 'monospace', resize: 'vertical', marginTop: 4,
            }}
          />
        </div>
        {error && <div style={{ color: '#e94560', fontSize: 10 }}>{error}</div>}
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
      {isStopped && (
        <button
          onClick={dashboardOpen ? () => sendCommand('start') : onToggleDashboard}
          disabled={loading}
          title={dashboardOpen ? 'Start Live Trading Bot' : 'Show Bot Dashboard'}
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
          Bot
        </button>
      )}
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
            Bot
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
      {(botState !== 'Idle' || dashboardOpen) && (
        <button
          onClick={onToggleDashboard}
          title={dashboardOpen ? 'Hide Dashboard' : 'Show Dashboard'}
          style={{
            padding: '5px 6px',
            background: dashboardOpen ? '#1a1a2e' : 'transparent',
            color: dashboardOpen ? '#fff' : '#666',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d={dashboardOpen ? 'M8 7L5 4 2 7' : 'M2 3l3 3 3-3'} />
          </svg>
        </button>
      )}
      {!connected && (botState !== 'Idle' || dashboardOpen) && (
        <span style={{ color: '#ff9800', fontSize: '10px', marginLeft: '2px' }} title="Reconnecting...">
          ○
        </span>
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

export function LiveDashboard({
  backendUrl,
  status,
  logs,
  onClose,
}: {
  backendUrl: string;
  status: BotStatusSnapshot;
  logs: LogEntry[];
  onClose: () => void;
}) {
  const [view, setView] = useState<'setup' | 'status' | 'metrics' | 'logs'>(
    status.state === 'Idle' || status.state === 'Stopped' ? 'setup' : 'status'
  );
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo>({
    hasWallet: !!status.walletPublicKey,
    publicKey: status.walletPublicKey ?? undefined,
  });
  const [configApplied, setConfigApplied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Fetch wallet status on mount
  useEffect(() => {
    fetch(`${backendUrl}/api/bot/wallet`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setWallet({ hasWallet: data.hasWallet, publicKey: data.publicKey });
        }
      })
      .catch(() => {});
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

  const TabBtn = ({ tab, label }: { tab: typeof view; label: string }) => (
    <button
      onClick={() => setView(tab)}
      style={{
        padding: '4px 16px',
        background: view === tab ? '#1a1a2e' : 'transparent',
        color: view === tab ? '#fff' : '#888',
        border: 'none',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: view === tab ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  const stateColor =
    status.state === 'Running' ? '#4caf50' :
    status.state === 'Error' ? '#e94560' :
    status.state === 'Idle' ? '#888' : '#ff9800';

  const isReady = wallet.hasWallet && (configApplied || status.state !== 'Idle');

  return (
    <div
      style={{
        background: '#0d0d18',
        borderTop: '1px solid #222',
        borderBottom: '1px solid #222',
        fontSize: '12px',
        height: '320px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a2e' }}>
        {isIdle ? (
          <TabBtn tab="setup" label="Setup" />
        ) : (
          <>
            <TabBtn tab="status" label="Status" />
            <TabBtn tab="metrics" label="Metrics" />
            <TabBtn tab="logs" label={`Logs (${logs.length})`} />
          </>
        )}
        <div style={{ flex: 1 }} />
        {/* Action buttons */}
        {isIdle && (
          <button
            onClick={() => sendCommand('start')}
            disabled={loading || !isReady}
            title={
              !wallet.hasWallet ? 'Import a wallet first' :
              !configApplied ? 'Apply configuration first' :
              'Start Live Trading Bot'
            }
            style={{
              padding: '5px 12px', background: isReady ? '#1a3328' : '#111',
              color: isReady ? '#4caf50' : '#555',
              border: `1px solid ${isReady ? '#4caf50' : '#333'}`,
              borderRadius: '4px', cursor: loading ? 'wait' : isReady ? 'pointer' : 'default',
              fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <polygon points="2,0 9,5 2,10" />
            </svg>
            Start Bot
          </button>
        )}
        {isRunning && (
          <>
            <button
              onClick={() => sendCommand('stop')}
              disabled={loading}
              style={{
                padding: '5px 12px', background: '#e94560', color: '#fff',
                border: 'none', borderRadius: '4px', cursor: loading ? 'wait' : 'pointer',
                fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px',
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
                border: 'none', borderRadius: '4px', cursor: loading ? 'wait' : 'pointer',
                fontSize: '11px', fontWeight: 700,
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
              border: '1px solid #ff9800', borderRadius: '4px', cursor: loading ? 'wait' : 'pointer',
              fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px',
            }}
          >
            ⟳ Reset
          </button>
        )}
        {transitioning && (
          <span style={{ color: '#ff9800', fontSize: '11px', fontStyle: 'italic', marginRight: 8 }}>
            {status.state}...
          </span>
        )}
        <button
          onClick={onClose}
          style={{
            padding: '4px 10px', background: 'transparent', color: '#888',
            border: 'none', cursor: 'pointer', fontSize: '14px', marginLeft: 4,
          }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {/* ---- Setup Tab (Idle/Stopped) ---- */}
        {view === 'setup' && (
          <div>
            <WalletImportPanel backendUrl={backendUrl} wallet={wallet} onWalletChange={setWallet} />
            <BotConfigPanel backendUrl={backendUrl} onConfigured={() => setConfigApplied(true)} />
            {configApplied && (
              <div style={{ color: '#4caf50', fontSize: 11, marginTop: 8 }}>
                ✓ Configuration applied. Click Start Bot to begin trading.
              </div>
            )}
          </div>
        )}

        {/* ---- Status Tab ---- */}
        {view === 'status' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
            <MetricValue label="State" value={status.state} color={stateColor} />
            <MetricValue label="Strategy" value={status.strategyName} />
            <MetricValue label="DEX" value={status.dex} />
            {wallet.publicKey && (
              <MetricValue
                label="Wallet"
                value={`${wallet.publicKey.slice(0, 8)}...${wallet.publicKey.slice(-4)}`}
                color="#4caf50"
              />
            )}
            <MetricValue label="Duration" value={fmtDur(status.uptimeMs)} />
            <MetricValue label="Balance" value={`$${status.balance.toFixed(2)}`} />
            <MetricValue label="Realized PnL" value={fmtPnl(status.realizedPnl).text} color={fmtPnl(status.realizedPnl).color} />
            <MetricValue label="Unrealized PnL" value={fmtPnl(status.unrealizedPnl).text} color={fmtPnl(status.unrealizedPnl).color} />
            <MetricValue label="Exposure" value={`${(status.exposure * 100).toFixed(1)}%`} />

            {status.positions.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: '#888' }}>Positions:</span>
                {status.positions.map((pos, i) => (
                  <div key={i} style={{ marginTop: 4, padding: '4px 8px', background: '#111128', borderRadius: 4 }}>
                    <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{pos.symbol}</span>
                    <span style={{ color: pos.side === 'long' ? '#4caf50' : '#e94560', marginLeft: 8 }}>
                      {pos.side.toUpperCase()}
                    </span>
                    <span style={{ color: '#888', marginLeft: 8 }}>
                      {pos.size} @ ${pos.entryPrice.toFixed(2)}
                    </span>
                    <span style={{ color: fmtPnl(pos.unrealizedPnl).color, marginLeft: 8 }}>
                      {fmtPnl(pos.unrealizedPnl).text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {status.errors.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: '#e94560', fontWeight: 600 }}>Errors ({status.errors.length}):</span>
                {status.errors.slice(-3).map((err, i) => (
                  <div key={i} style={{ color: '#e94560', fontSize: '11px', marginTop: 2 }}>
                    [{err.code}] {err.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Metrics Tab ---- */}
        {view === 'metrics' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
            <MetricValue label="Total Trades" value={status.totalTrades != null ? String(status.totalTrades) : na} />
            <MetricValue label="Winning" value={status.winningTrades != null ? String(status.winningTrades) : na} color="#4caf50" />
            <MetricValue label="Losing" value={status.losingTrades != null ? String(status.losingTrades) : na} color="#e94560" />
            <MetricValue
              label="Win Rate"
              value={status.winRate != null ? `${(status.winRate * 100).toFixed(1)}%` : na}
            />
            <MetricValue
              label="Avg Win"
              value={status.avgWin != null ? `$${status.avgWin.toFixed(2)}` : na}
              color={status.avgWin != null && status.avgWin > 0 ? '#4caf50' : undefined}
            />
            <MetricValue
              label="Avg Loss"
              value={status.avgLoss != null ? `-$${Math.abs(status.avgLoss).toFixed(2)}` : na}
              color={status.avgLoss != null && status.avgLoss < 0 ? '#e94560' : undefined}
            />
            <MetricValue
              label="Profit Factor"
              value={status.profitFactor != null ? status.profitFactor.toFixed(2) : na}
              color={
                status.profitFactor != null
                  ? status.profitFactor >= 1.5 ? '#4caf50' : status.profitFactor >= 1 ? '#ff9800' : '#e94560'
                  : undefined
              }
            />
            <MetricValue
              label="Max Drawdown"
              value={status.maxDrawdown != null ? `${(status.maxDrawdown * 100).toFixed(1)}%` : na}
              color="#e94560"
            />
            <MetricValue
              label="Total Fees"
              value={status.totalFees != null ? `$${status.totalFees.toFixed(2)}` : na}
            />
            <MetricValue
              label="Avg Latency"
              value={status.avgLatency != null ? `${status.avgLatency.toFixed(0)}ms` : na}
            />
          </div>
        )}

        {/* ---- Logs Tab ---- */}
        {view === 'logs' && (
          <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.6' }}>
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
        )}
      </div>
    </div>
  );
}
