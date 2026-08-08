import { useState, useEffect, useCallback, useRef } from 'react';
import { ChartComponent, type ChartComponentHandle } from './components/ChartComponent';
import { CodeEditor } from './components/CodeEditor';
import { ErrorConsole } from './components/ErrorConsole';
import { GoToDatePopup } from './components/GoToDatePopup';
import { StrategyResultsPopup } from './components/StrategyResultsPopup';
import { BacktestPanel, type SelectedBacktestStrategy } from './components/BacktestPanel';
import { TelegramConfigPanel } from './components/TelegramConfigPanel';
import { QuickAdderPopup } from './components/QuickAdderPopup';
import { StrategyConflictDialog } from './components/StrategyConflictDialog';
import { ControlPanel, type PanelId } from './components/ControlPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useChartData } from './hooks/useChartData';
import { useBacktest } from './hooks/useBacktest';
import { useIndicatorManager } from './hooks/useIndicatorManager';
import { useBotWebSocket, LiveDashboard } from './components/TradingBotPanel';
import { useChaosMode } from './hooks/useChaosMode';
import type { ScriptResult, BacktestConfig } from './types';
import { TRADABLE_PAIRS } from 'pine-framework';
import { extractScriptName } from 'pine-framework/utils/script-name';

const SYMBOLS = [...TRADABLE_PAIRS];
const INTERVALS = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
  { value: 'D', label: '1D' },
  { value: 'W', label: '1W' },
];

function App() {
  const [editorOpen, setEditorOpen] = useState(false);

  const [timeframe, setTimeframe] = useState(() => {
    const saved = localStorage.getItem('pine-timeframe');
    return saved && INTERVALS.some(i => i.value === saved) ? saved : '1';
  });
  const [symbol, setSymbol] = useState(() => {
    const saved = localStorage.getItem('pine-symbol');
    return saved && (SYMBOLS as readonly string[]).includes(saved) ? saved : 'BTCUSDT';
  });
  const [dataVersion, setDataVersion] = useState(0);
  const [showResultsPopup, setShowResultsPopup] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [quickAdderOpen, setQuickAdderOpen] = useState(false);
  const [indicatorResults, setIndicatorResults] = useState<Map<string, ScriptResult>>(new Map());
  const [computingIndicators, setComputingIndicators] = useState<Set<string>>(new Set());
  const computingRef = useRef<Set<string>>(new Set());
  computingRef.current = computingIndicators;
  const lastIndicatorsRef = useRef<Set<string>>(new Set());
  const [strategyConflict, setStrategyConflict] = useState<{
    existingName: string;
    incomingName: string;
    pendingScriptId: string;
    pendingSource: string;
  } | null>(null);
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [errorConsoleOpen, setErrorConsoleOpen] = useState(false);
  const [goToDateOpen, setGoToDateOpen] = useState(false);
  const [lastTeleport, setLastTeleport] = useState(() => {
    const saved = localStorage.getItem('pine-last-teleport');
    return saved ? JSON.parse(saved) : { date: '', time: '' };
  });
  const chartRef = useRef<ChartComponentHandle>(null);

  // ControlPanel state
  const [activePanel, setActivePanel] = useState<PanelId>('dashboard');

  const backendUrl = `http://${window.location.hostname}:8081`;
  const {
    connected: botConnected,
    status: botStatus,
    logs: botLogs,
    chaosSignals: botChaosSignals,
    chaosHeartbeat: botChaosHeartbeat,
    chaosHeartbeatHistory: botChaosHeartbeatHistory,
    feedStatus: botFeedStatus,
    totalCandleErrors: botTotalCandleErrors,
    lastCandleError: botLastCandleError,
    engineChaosMode,
    autoSelectProgress,
    autoSelectResult,
    connectionFailed: botConnectionFailed,
    liveTrades: botLiveTrades,
    connectionEpoch: botConnectionEpoch,
  } = useBotWebSocket(backendUrl);
  const { chaosMode, chaosError, tapTargetProps, showToast, dismissToast } = useChaosMode(backendUrl, engineChaosMode);

  const { status, progress, phase, result, error, submitBacktest, reset } = useBacktest();
  const indicatorManager = useIndicatorManager();

  const onIndicatorResult = useCallback((indicatorId: string, result: ScriptResult) => {
    setIndicatorResults((prev) => {
      const next = new Map(prev);
      next.set(indicatorId, result);
      return next;
    });
    setComputingIndicators((prev) => {
      const next = new Set(prev);
      next.delete(indicatorId);
      return next;
    });
  }, []);

  const {
    candles,
    chunkBorders,
    scriptResult,
    errors,
    isConnected,
    isLoading,
    executeScript,
    fetchOHLCV,
    fetchOlderOHLCV,
    subscribe,
    setErrors,
    registerOnIndicatorRemoved,
    removeIndicatorData,
    wsRef,
    exportChartData,
  } = useChartData(onIndicatorResult);

  const executeScriptRef = useRef(executeScript);
  executeScriptRef.current = executeScript;
  const indicatorManagerRef = useRef(indicatorManager);
  indicatorManagerRef.current = indicatorManager;

  useEffect(() => {
    registerOnIndicatorRemoved((indicatorIds: string[]) => {
      indicatorManager.handleIndicatorRemoved(indicatorIds);
      setIndicatorResults((prev) => {
        const next = new Map(prev);
        for (const id of indicatorIds) next.delete(id);
        return next;
      });
    });
  }, [registerOnIndicatorRemoved, indicatorManager.handleIndicatorRemoved]);

  useEffect(() => {
    setDataVersion((v) => v + 1);
    subscribe(symbol, timeframe);
    // Show loading spinners IMMEDIATELY on all known indicators
    setComputingIndicators(new Set(lastIndicatorsRef.current));
    // Clear all plot data (unplot) — spinners show in same render
    setIndicatorResults(new Map());
    fetchOHLCV(symbol, timeframe).then(() => {
      indicatorManagerRef.current.fetchIndicators().then((list) => {
        const ids = new Set(list.map((ind) => ind.id));
        lastIndicatorsRef.current = ids;
        setComputingIndicators(ids);
        for (const ind of list) {
          executeScriptRef.current(ind.source, symbol, timeframe, undefined, undefined, undefined, ind.id);
        }
      });
    });
  }, [symbol, timeframe, subscribe, fetchOHLCV]);

  useEffect(() => {
    const handleSlashKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement).closest('.editor-modal, .CodeMirror, [contenteditable]')) return;
      e.preventDefault();
      setQuickAdderOpen(true);
    };
    window.addEventListener('keydown', handleSlashKey);
    return () => window.removeEventListener('keydown', handleSlashKey);
  }, []);

  useEffect(() => {
    const hasStrategyMarkers =
      (scriptResult?.strategyMarkers && scriptResult.strategyMarkers.length > 0) ||
      Array.from(indicatorResults.values()).some(
        (r) => r.strategyMarkers && r.strategyMarkers.length > 0,
      );

    if (!hasStrategyMarkers) {
      setShowResultsPopup(false);
    }
  }, [scriptResult, indicatorResults]);

  const extractScriptNameFallback = (src: string): string => extractScriptName(src) ?? 'Indicator';

  const isStrategySource = (src: string): boolean =>
    /strategy\(\s*["']/.test(src);

  const findExistingStrategy = (): { id: string; name: string } | null => {
    for (const ind of indicatorManager.indicators) {
      if (isStrategySource(ind.source)) {
        return { id: ind.id, name: ind.name };
      }
    }
    return null;
  };

  const handleAddIndicator = async (scriptId: string, source: string) => {
    setEditorOpen(false);
    setQuickAdderOpen(false);

    if (isStrategySource(source)) {
      const existing = findExistingStrategy();
      if (existing) {
        setStrategyConflict({
          existingName: existing.name,
          incomingName: extractScriptNameFallback(source),
          pendingScriptId: scriptId,
          pendingSource: source,
        });
        return;
      }
    }

    const indicator = await indicatorManager.addIndicator(
      scriptId,
      extractScriptNameFallback(source),
      true,
      source,
    );

    if (indicator) {
      lastIndicatorsRef.current = new Set(lastIndicatorsRef.current).add(indicator.id);
      setComputingIndicators((prev) => new Set(prev).add(indicator.id));
      try {
        await executeScript(source, symbol, timeframe, undefined, undefined, undefined, indicator.id);
      } catch {
        setComputingIndicators((prev) => {
          const next = new Set(prev);
          next.delete(indicator.id);
          lastIndicatorsRef.current = next;
          return next;
        });
      }
    }
  };

  const handleStrategyReplace = useCallback(async () => {
    if (!strategyConflict) return;
    const { pendingScriptId, pendingSource } = strategyConflict;
    setStrategyConflict(null);

    const existing = findExistingStrategy();
    if (existing) {
      await handleRemoveIndicator(existing.id);
    }

    const indicator = await indicatorManager.addIndicator(
      pendingScriptId,
      extractScriptNameFallback(pendingSource),
      true,
      pendingSource,
    );

    if (indicator) {
      setComputingIndicators((prev) => new Set(prev).add(indicator.id));
      try {
        await executeScript(pendingSource, symbol, timeframe, undefined, undefined, undefined, indicator.id);
      } catch {
        setComputingIndicators((prev) => {
          const next = new Set(prev);
          next.delete(indicator.id);
          lastIndicatorsRef.current = next;
          return next;
        });
      }
    }
  }, [strategyConflict, indicatorManager, executeScript, symbol, timeframe]);

  const handleStrategyCancel = useCallback(() => {
    setStrategyConflict(null);
  }, []);

  const handleEditIndicator = useCallback((indicatorId: string) => {
    const ind = indicatorManager.indicators.find((i) => i.id === indicatorId);
    if (ind) {
      setEditingScriptId(ind.scriptId);
      setEditorOpen(true);
    }
  }, [indicatorManager.indicators]);

  const handleRemoveIndicator = async (indicatorId: string) => {
    // 1. Fire-and-forget: notify server to stop real-time updates
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop_indicator', indicatorId }));
    }

    // 2. Synchronous cleanup FIRST — purge refs and state before any await
    //    This closes the race window where HTTP results could arrive after removal.
    removeIndicatorData(indicatorId);
    setIndicatorResults((prev) => {
      const next = new Map(prev);
      next.delete(indicatorId);
      return next;
    });
    setComputingIndicators((prev) => {
      const next = new Set(prev);
      next.delete(indicatorId);
      lastIndicatorsRef.current = next;
      return next;
    });
    setDataVersion((v) => v + 1);

    // 3. Server-side cleanup (HTTP DELETE) — async, safe to await after state cleanup
    await indicatorManager.removeIndicator(indicatorId);
  };

  const overlayIndicatorLabels = indicatorManager.getOverlayIndicators().map((i) => ({
    id: i.id,
    name: i.name,
    overlay: true,
  }));

  const handleRunBacktest = useCallback((config: BacktestConfig, strategy: SelectedBacktestStrategy, startDate?: string, endDate?: string) => {
    if (!strategy?.source) {
      // Defensive — the panel already blocks this; never POST an empty script.
      return;
    }
    setShowResultsPopup(true);
    submitBacktest(symbol, timeframe, { ...config, script: strategy.source }, startDate, endDate);
  }, [symbol, timeframe, submitBacktest]);

  const handleCloseResults = useCallback(() => {
    setShowResultsPopup(false);
    reset();
  }, [reset]);

  // Sidebar navigation handler — also syncs sub-panel states
  const handlePanelChange = useCallback((panel: PanelId) => {
    setActivePanel(panel);
  }, []);

  return (
    <ControlPanel
      activePanel={activePanel}
      onPanelChange={handlePanelChange}
      botConnected={botConnected}
      botState={botStatus?.state ?? 'Idle'}
      errorCount={errors.length}
      settingsOpen={activePanel === 'settings'}
    >
      {/* === Dashboard Panel === */}
      {activePanel === 'dashboard' && (
        <div style={dashboardStyles.container}>
          {/* Top toolbar: symbol, timeframe, quick actions */}
          <div style={dashboardStyles.toolbar}>
            <select
              value={symbol}
              onChange={(e) => { const v = e.target.value; setSymbol(v); localStorage.setItem('pine-symbol', v); }}
              style={dashboardStyles.select}
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={timeframe}
              onChange={(e) => { const v = e.target.value; setTimeframe(v); localStorage.setItem('pine-timeframe', v); }}
              style={dashboardStyles.select}
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>

            <div style={dashboardStyles.divider} />

            <span style={{
              fontSize: 12,
              color: isConnected ? '#4caf50' : '#e94560',
            }}>
              {isLoading ? '◌ Loading...' : isConnected ? '● Connected' : '○ Disconnected'}
            </span>

            <div style={{ flex: 1 }} />

            {/* Quick action buttons */}
            <button onClick={() => { setEditingScriptId(null); setQuickAdderOpen(true); }} style={dashboardStyles.actionBtn}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="6" y1="2" x2="6" y2="10" />
                <line x1="2" y1="6" x2="10" y2="6" />
              </svg>
              Add
            </button>
            <button onClick={() => { setEditingScriptId(null); setEditorOpen(true); }} style={dashboardStyles.actionBtn}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 1.5l2 2L4 10H2v-2z" />
              </svg>
              Editor
            </button>

            <div style={dashboardStyles.divider} />
            <button onClick={() => setActivePanel('backtest')} style={dashboardStyles.primaryBtn}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
                <polygon points="2,0 10,5.5 2,11" />
              </svg>
              Backtest
            </button>

            <div style={dashboardStyles.divider} />

            <button
              onClick={() => setAutoScale(!autoScale)}
              style={{
                ...dashboardStyles.actionBtn,
                background: autoScale ? '#1a3328' : undefined,
                color: autoScale ? '#4caf50' : undefined,
                borderColor: autoScale ? '#4caf50' : undefined,
              }}
            >
              {autoScale ? 'Auto Scale' : 'Manual'}
            </button>
            <button
              onClick={() => setDebugMode(!debugMode)}
              style={{
                ...dashboardStyles.actionBtn,
                background: debugMode ? '#2a2a10' : undefined,
                color: debugMode ? '#ff9800' : undefined,
                borderColor: debugMode ? '#ff9800' : undefined,
              }}
            >
              Debug
            </button>

            <div style={dashboardStyles.divider} />

            <button onClick={() => setGoToDateOpen(true)} style={dashboardStyles.actionBtn}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="6" cy="6" r="4.5" />
                <polyline points="6,3 6,6 8,7" />
              </svg>
              Go to Date
            </button>

            <div style={dashboardStyles.divider} />

            {/* Bot Dashboard toggle */}
            <button
              onClick={async () => {
                const path = await exportChartData();
                if (path) {
                  alert(`Chart data exported to:\n${path}`);
                } else {
                  alert('Export failed. Check console for details.');
                }
              }}
              style={dashboardStyles.actionBtn}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2v7M3 6l3 3 3-3M2 10h8" />
              </svg>
              Export
            </button>

            <div style={dashboardStyles.divider} />

            <button
              onClick={() => setErrorConsoleOpen(!errorConsoleOpen)}
              style={{
                ...dashboardStyles.actionBtn,
                background: errorConsoleOpen ? '#2a1520' : undefined,
                color: errors.length > 0 ? '#e94560' : undefined,
                borderColor: errors.length > 0 ? '#e94560' : undefined,
                position: 'relative',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 1L1 11h10z" />
                <line x1="6" y1="5" x2="6" y2="7.5" />
                <circle cx="6" cy="9.5" r="0.5" fill="currentColor" />
              </svg>
              Errors
              {errors.length > 0 && (
                <span style={dashboardStyles.errorBadge}>{errors.length}</span>
              )}
            </button>
          </div>

          {/* Chart */}
          <div style={dashboardStyles.chartArea}>
            <ChartComponent
              ref={chartRef}
              data={candles}
              dataVersion={dataVersion}
              scriptResult={scriptResult}
              symbol={symbol}
              interval={timeframe}
              fetchOlderOHLCV={fetchOlderOHLCV}
              indicatorLabels={overlayIndicatorLabels}
              indicatorResults={indicatorResults}
              computingIndicators={computingIndicators}
              onRemoveIndicator={handleRemoveIndicator}
              onEditIndicator={handleEditIndicator}
              forceAutoScale={autoScale}
              debugMode={debugMode}
              chunkBorders={chunkBorders}
            />
          </div>
        </div>
      )}

      {/* === Bot Dashboard Panel === */}
      {activePanel === 'bot' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0d0d18', minHeight: 0, overflow: 'hidden' }}>
          {botStatus ? (
            <LiveDashboard
              backendUrl={backendUrl}
              status={botStatus}
              logs={botLogs}
              onClose={() => setActivePanel('dashboard')}
              autoSelectProgress={autoSelectProgress}
              autoSelectResult={autoSelectResult}
              chaosMode={chaosMode}
              chaosError={chaosError}
              engineChaosMode={engineChaosMode}
              chaosHeartbeat={botChaosHeartbeat}
              totalCandleErrors={botTotalCandleErrors}
              lastCandleError={botLastCandleError}
              chaosSignals={botChaosSignals}
              chaosHeartbeats={botChaosHeartbeatHistory}
              feedStatus={botFeedStatus}
              liveTrades={botLiveTrades}
              connectionEpoch={botConnectionEpoch}
            />
          ) : botConnectionFailed ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
              <div style={{ color: '#e94560', fontSize: 16, fontWeight: 600 }}>Cannot Connect to Bot Backend</div>
              <div style={{ color: '#888', fontSize: 12, textAlign: 'center', maxWidth: 400 }}>
                The WebSocket connection to the backend server failed.
                Make sure the backend is running on port 8081.
              </div>
              <div style={{ color: '#555', fontSize: 11, fontFamily: 'monospace' }}>
                {backendUrl}/ws/bot
              </div>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 20px', background: '#1a1a2e', color: '#64b5f6',
                  border: '1px solid #64b5f6', borderRadius: 4, cursor: 'pointer',
                  fontSize: 12, marginTop: 8,
                }}
              >
                Retry Connection
              </button>
              <button
                onClick={() => setActivePanel('dashboard')}
                style={{
                  padding: '6px 16px', background: 'transparent', color: '#888',
                  border: '1px solid #333', borderRadius: 4, cursor: 'pointer',
                  fontSize: 11, marginTop: 8,
                }}
              >
                Close Dashboard
              </button>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
              <div style={{ color: '#888', fontSize: 14 }}>Connecting to bot...</div>
              <div style={{ color: '#555', fontSize: 11 }}>Waiting for WebSocket connection</div>
              <button
                onClick={() => setActivePanel('dashboard')}
                style={{
                  padding: '6px 16px', background: '#1a1a2e', color: '#888',
                  border: '1px solid #333', borderRadius: 4, cursor: 'pointer',
                  fontSize: 11, marginTop: 16,
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* === Telegram Panel === */}
      {activePanel === 'telegram' && (
        <TelegramConfigPanel
          alertConditions={scriptResult?.alertConditions || []}
          onClose={() => setActivePanel('dashboard')}
        />
      )}

      {/* === Backtest Panel === */}
      {activePanel === 'backtest' && (
        <BacktestPanel
          onRun={handleRunBacktest}
          onClose={() => setActivePanel('dashboard')}
          timeframe={timeframe}
          symbol={symbol}
          backendUrl={backendUrl}
        />
      )}

      {/* === Settings Panel === */}
      {activePanel === 'settings' && (
        <SettingsPanel onClose={() => setActivePanel('dashboard')} />
      )}

      {/* === Overlays (fixed position, always available) === */}
      <ErrorConsole
        errors={errors}
        isOpen={errorConsoleOpen}
        onClear={() => setErrors([])}
        onClose={() => setErrorConsoleOpen(false)}
      />

      <CodeEditor
        isOpen={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingScriptId(null); }}
        onAdd={handleAddIndicator}
        initialScriptId={editingScriptId ?? undefined}
      />

      <QuickAdderPopup
        isOpen={quickAdderOpen}
        onClose={() => setQuickAdderOpen(false)}
        onAdd={handleAddIndicator}
      />

      <StrategyResultsPopup
        isOpen={showResultsPopup}
        onClose={handleCloseResults}
        onOpenSettings={() => { setShowResultsPopup(false); setActivePanel('backtest'); }}
        status={status}
        progress={progress}
        phase={phase}
        result={result}
        error={error}
      />

      <GoToDatePopup
        isOpen={goToDateOpen}
        onClose={() => setGoToDateOpen(false)}
        lastTeleport={lastTeleport}
        onGoToDate={(ts, dateStr, timeStr) => {
          chartRef.current?.scrollToDate(ts);
          chartRef.current?.setTeleportLine(ts, { color: '#2196f3', label: 'Teleport' });
          setLastTeleport({ date: dateStr, time: timeStr });
          localStorage.setItem('pine-last-teleport', JSON.stringify({ date: dateStr, time: timeStr }));
        }}
      />

      <StrategyConflictDialog
        isOpen={strategyConflict !== null}
        existingName={strategyConflict?.existingName ?? ''}
        incomingName={strategyConflict?.incomingName ?? ''}
        onReplace={handleStrategyReplace}
        onCancel={handleStrategyCancel}
      />

      {/* Hidden chaos mode activation target — 5 taps in 3 seconds toggles chaos mode */}
      <div {...tapTargetProps} />

      {/* Chaos mode activation toast */}
      {showToast && (
        <div style={{
          position: 'fixed',
          bottom: 48,
          right: 8,
          background: chaosMode ? '#e94560' : '#1a1a2e',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          zIndex: 10000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          cursor: 'pointer',
          transition: 'opacity 0.3s',
        }} onClick={dismissToast}>
          {chaosMode ? '⚡ Chaos Mode Enabled' : 'Chaos Mode Disabled'}
        </div>
      )}
    </ControlPanel>
  );
}

const dashboardStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    background: '#0f1520',
    borderBottom: '1px solid #111128',
    gap: 6,
    flexShrink: 0,
  },
  select: {
    padding: '5px 10px',
    border: '1px solid #111128',
    borderRadius: 4,
    background: '#0d0d18',
    color: '#e0e0e0',
    fontSize: 12,
    cursor: 'pointer',
  },
  divider: {
    width: 1,
    height: 18,
    background: '#222',
    margin: '0 6px',
  },
  actionBtn: {
    padding: '5px 10px',
    background: '#111128',
    color: '#e0e0e0',
    border: '1px solid #111128',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
  primaryBtn: {
    padding: '5px 10px',
    background: '#2196f3',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
  errorBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#e94560',
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    borderRadius: '50%',
    minWidth: 16,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    pointerEvents: 'none',
  },
  chartArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
};

export default App;
