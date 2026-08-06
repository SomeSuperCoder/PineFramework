import { useState, useEffect, useCallback, useRef } from 'react';
import { ChartComponent, type ChartComponentHandle } from './components/ChartComponent';
import { CodeEditor } from './components/CodeEditor';
import { ErrorConsole } from './components/ErrorConsole';
import { GoToDatePopup } from './components/GoToDatePopup';
import { StrategyResultsPopup } from './components/StrategyResultsPopup';
import { BacktestSettingsPopup } from './components/BacktestSettingsPopup';
import { TelegramConfigPanel } from './components/TelegramConfigPanel';
import { QuickAdderPopup } from './components/QuickAdderPopup';
import { StrategyConflictDialog } from './components/StrategyConflictDialog';
import { AppToolbar } from './components/AppToolbar';
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
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [showResultsPopup, setShowResultsPopup] = useState(false);
  const [isStrategy, setIsStrategy] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
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
  const [botDashboardOpen, setBotDashboardOpen] = useState(false);
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
    lastCodeRef,
    registerOnIndicatorRemoved,
    removeIndicatorData,
    indicatorSourcesRef,
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

    if (hasStrategyMarkers) {
      setIsStrategy(true);
    } else {
      setIsStrategy(false);
      setShowSettingsPopup(false);
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

  const strategySource = (() => {
    const fromMain = scriptResult?.strategyMarkers && scriptResult.strategyMarkers.length > 0;
    if (fromMain) return lastCodeRef.current || '';
    for (const [id, res] of indicatorResults) {
      if (res.strategyMarkers && res.strategyMarkers.length > 0) {
        const fromRef = indicatorSourcesRef.current.get(id);
        if (fromRef?.source) return fromRef.source;
        const ind = indicatorManager.indicators.find((i) => i.id === id);
        if (ind?.source) return ind.source;
        console.error('[strategySource] MISS: id=%s has strategyMarkers but source not in sourcesRef (%d entries) or indicators (%d entries)',
          id, indicatorSourcesRef.current.size, indicatorManager.indicators.length);
        return '';
      }
    }
    return '';
  })();

  const overlayIndicatorLabels = indicatorManager.getOverlayIndicators().map((i) => ({
    id: i.id,
    name: i.name,
    overlay: true,
  }));

  const handleRunBacktest = useCallback((config: BacktestConfig, startDate?: string, endDate?: string) => {
    setShowSettingsPopup(false);
    setShowResultsPopup(true);
    submitBacktest(
      symbol,
      timeframe,
      { ...config, script: strategySource },
      startDate,
      endDate,
    );
  }, [symbol, timeframe, strategySource, submitBacktest]);

  const handleOpenSettings = useCallback(() => {
    setShowResultsPopup(false);
    setShowSettingsPopup(true);
  }, []);

  const handleCloseResults = useCallback(() => {
    setShowResultsPopup(false);
    reset();
  }, [reset]);

  return (
    <div className="app">
      <header className="header">
        <h1>Pine Script Engine</h1>
        <div className="header-controls">
          <select value={symbol} onChange={(e) => { const v = e.target.value; setSymbol(v); localStorage.setItem('pine-symbol', v); }}>
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={timeframe} onChange={(e) => { const v = e.target.value; setTimeframe(v); localStorage.setItem('pine-timeframe', v); }}>
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
          <span style={{ fontSize: '12px', color: isConnected ? '#4caf50' : '#e94560' }}>
            {isLoading ? '◌ Loading...' : isConnected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
      </header>

      <main className="main-content">
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
      </main>

      <AppToolbar
        isStrategy={isStrategy}
        autoScale={autoScale}
        onToggleAutoScale={() => setAutoScale(!autoScale)}
        debugMode={debugMode}
        onToggleDebugMode={() => setDebugMode(!debugMode)}
        errors={errors}
        errorConsoleOpen={errorConsoleOpen}
        onToggleErrorConsole={() => setErrorConsoleOpen(!errorConsoleOpen)}
        telegramOpen={telegramOpen}
        onToggleTelegram={() => setTelegramOpen(!telegramOpen)}
        onOpenQuickAdder={() => { setEditingScriptId(null); setQuickAdderOpen(true); }}
        onOpenEditor={() => { setEditingScriptId(null); setEditorOpen(true); }}
        onOpenBacktest={() => setShowSettingsPopup(true)}
        onOpenGoToDate={() => setGoToDateOpen(true)}
        onExport={async () => {
          const path = await exportChartData();
          if (path) {
            alert(`Chart data exported to:\n${path}`);
          } else {
            alert('Export failed. Check console for details.');
          }
        }}
        backendUrl={backendUrl}
        botState={botStatus?.state ?? 'Idle'}
        botConnected={botConnected}
        botDashboardOpen={botDashboardOpen}
        onToggleBotDashboard={() => setBotDashboardOpen((v) => !v)}
      />

      {botDashboardOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 1000, background: '#0d0d18', display: 'flex', flexDirection: 'column',
        }}>
          {botStatus ? (
            <LiveDashboard
              backendUrl={backendUrl}
              status={botStatus}
              logs={botLogs}
              onClose={() => setBotDashboardOpen(false)}
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
                onClick={() => setBotDashboardOpen(false)}
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
                onClick={() => setBotDashboardOpen(false)}
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

      <TelegramConfigPanel
        alertConditions={scriptResult?.alertConditions || []}
        isOpen={telegramOpen}
        onToggle={() => setTelegramOpen(!telegramOpen)}
      />

      <BacktestSettingsPopup
        isOpen={showSettingsPopup}
        onClose={() => setShowSettingsPopup(false)}
        onRun={handleRunBacktest}
        scriptSource={strategySource}
        timeframe={timeframe}
        symbol={symbol}
      />

      <StrategyResultsPopup
        isOpen={showResultsPopup}
        onClose={handleCloseResults}
        onOpenSettings={handleOpenSettings}
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
    </div>
  );
}

export default App;
