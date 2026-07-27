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
  // Metrics from TradeStats
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

// ---- Inline Bot Control Button (renders inside AppToolbar) ----

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

  if (isStopped && !dashboardOpen) return null;

  return (
    <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
      {isStopped && dashboardOpen && (
        <button
          onClick={() => sendCommand('start')}
          disabled={loading}
          title="Start Live Trading Bot"
          style={{
            padding: '5px 10px',
            background: '#1a3328',
            color: '#4caf50',
            border: '1px solid #4caf50',
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
      {botState !== 'Idle' && (
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
      {!connected && botState !== 'Idle' && (
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
  status,
  logs,
  onClose,
}: {
  status: BotStatusSnapshot;
  logs: LogEntry[];
  onClose: () => void;
}) {
  const [view, setView] = useState<'status' | 'metrics' | 'logs'>('status');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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

  return (
    <div
      style={{
        background: '#0d0d18',
        borderTop: '1px solid #222',
        borderBottom: '1px solid #222',
        fontSize: '12px',
        height: '200px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a2e' }}>
        <TabBtn tab="status" label="Status" />
        <TabBtn tab="metrics" label="Metrics" />
        <TabBtn tab="logs" label={`Logs (${logs.length})`} />
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          style={{
            padding: '4px 10px',
            background: 'transparent',
            color: '#888',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {/* ---- Status Tab ---- */}
        {view === 'status' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
            <MetricValue label="State" value={status.state} color={stateColor} />
            <MetricValue label="Strategy" value={status.strategyName} />
            <MetricValue label="DEX" value={status.dex} />
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
