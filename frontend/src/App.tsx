import { useState, useEffect, useCallback, useRef } from 'react';
import { ChartComponent, type ChartComponentHandle } from './components/ChartComponent';
import { DashboardToolbar } from './components/DashboardToolbar';
import { CodeEditor } from './components/CodeEditor';
import { GoToDatePopup } from './components/GoToDatePopup';
import { StrategyResultsPopup } from './components/StrategyResultsPopup';
import { BacktestPanel } from './components/BacktestPanel';
import { TelegramConfigPanel } from './components/TelegramConfigPanel';
import { QuickAdderPopup } from './components/QuickAdderPopup';
import { StrategyConflictDialog } from './components/StrategyConflictDialog';
import { ControlPanel, type PanelId } from './components/ControlPanel';
import { LandingPage } from './components/Landing/LandingPage';
import { useLandingGate } from './hooks/useLandingGate';
import { useChartData } from './hooks/useChartData';
import { useBacktest } from './hooks/useBacktest';
import type { BacktestRunRequest } from './hooks/useBacktestPanelState';
import { useIndicatorManager } from './hooks/useIndicatorManager';
import { useBotWebSocket, LiveDashboard } from './components/TradingBotPanel';
import { useChaosMode } from './hooks/useChaosMode';
import type { ScriptResult } from './types';
import { extractScriptName } from 'pine-framework/utils/script-name';
import { tokens } from './theme/tokens';
import { motion } from './theme/motion';
import { PAIR_OPTIONS, TIMEFRAME_OPTIONS } from './utils/options';
import { wsSend } from './utils/wsSend';

function App() {
  const [editorOpen, setEditorOpen] = useState(false);

  // Landing / app view gate (D1–D3) — the composition root decides which view
  // renders; the entered flag is persisted in localStorage.
  const { view, enterApp, showLanding } = useLandingGate();

  const [timeframe, setTimeframe] = useState(() => {
    const saved = localStorage.getItem('pine-timeframe');
    return saved && TIMEFRAME_OPTIONS.some((o) => o.value === saved) ? saved : '1';
  });
  const [symbol, setSymbol] = useState(() => {
    const saved = localStorage.getItem('pine-symbol');
    return saved && PAIR_OPTIONS.some((o) => o.value === saved) ? saved : 'BTCUSDT';
  });
  const [dataVersion, setDataVersion] = useState(0);
  const [showResultsPopup, setShowResultsPopup] = useState(false);
  const [backtestResetSignal, setBacktestResetSignal] = useState(0);
  const [autoScale, setAutoScale] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [quickAdderOpen, setQuickAdderOpen] = useState(false);
  const [indicatorResults, setIndicatorResults] = useState<Map<string, ScriptResult>>(new Map());
  const [computingIndicators, setComputingIndicators] = useState<Set<string>>(new Set());
  const [removingIndicators, setRemovingIndicators] = useState<Set<string>>(new Set());
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
  const { chaosMode, chaosError, tapTargetProps, showToast, dismissToast } = useChaosMode(
    backendUrl,
    engineChaosMode,
  );

  const { status, progress, phase, result, error, jobId, submitBacktest, reset } = useBacktest();
  const indicatorManager = useIndicatorManager();

  const onIndicatorResult = useCallback((indicatorId: string, result: ScriptResult) => {
    // STALE-RESULT DROP: a compute result for an id that is no longer active
    // (removed) must never be delivered. useChartData's generation bump in
    // removeIndicatorData already drops in-flight REST results, but this
    // App-level guard closes the seam for ANY result reaching the callback
    // after removal — including WS execution results for a removed id.
    if (!lastIndicatorsRef.current.has(indicatorId)) return;
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
      // Keep the active-ids set in sync so the onIndicatorResult stale-drop
      // also fires for server-initiated removals.
      const active = new Set(lastIndicatorsRef.current);
      for (const id of indicatorIds) active.delete(id);
      lastIndicatorsRef.current = active;
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
          executeScriptRef.current(
            ind.source,
            symbol,
            timeframe,
            undefined,
            undefined,
            undefined,
            ind.id,
          );
        }
      });
    });
  }, [symbol, timeframe, subscribe, fetchOHLCV]);

  useEffect(() => {
    const handleSlashKey = (e: KeyboardEvent) => {
      // F-1: the quick-add listener must never fire on the landing view — the
      // overlays are always-mounted, so a '/' keystroke there would open the
      // QuickAdder over the landing.
      if (view !== 'app') return;
      if (e.key !== '/') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement).closest('.editor-modal, .CodeMirror, [contenteditable]'))
        return;
      e.preventDefault();
      setQuickAdderOpen(true);
    };
    window.addEventListener('keydown', handleSlashKey);
    return () => window.removeEventListener('keydown', handleSlashKey);
  }, [view]);

  // Focus management on view switch (journey §2.5, A14): landing→app moves
  // focus to the app shell; app→landing moves it to the landing h1. The
  // initial mount performs no focus move.
  const prevViewRef = useRef(view);
  useEffect(() => {
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    if (view === 'landing') {
      document.getElementById('landing-title')?.focus();
    } else {
      document.getElementById('app-topbar')?.focus();
    }
  }, [view]);

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

  const isStrategySource = (src: string): boolean => /strategy\(\s*["']/.test(src);

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
        await executeScript(
          source,
          symbol,
          timeframe,
          undefined,
          undefined,
          undefined,
          indicator.id,
        );
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
        await executeScript(
          pendingSource,
          symbol,
          timeframe,
          undefined,
          undefined,
          undefined,
          indicator.id,
        );
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

  const handleEditIndicator = useCallback(
    (indicatorId: string) => {
      const ind = indicatorManager.indicators.find((i) => i.id === indicatorId);
      if (ind) {
        setEditingScriptId(ind.scriptId);
        setEditorOpen(true);
      }
    },
    [indicatorManager.indicators],
  );

  const handleRemoveIndicator = async (indicatorId: string) => {
    // 1. Fire-and-forget: notify server to stop real-time updates. Route through
    //    wsSend so a socket that closed between the readyState check and send()
    //    cannot throw an uncaught page error.
    wsSend(wsRef.current, { type: 'stop_indicator', indicatorId });

    // 1b. Mark REMOVING synchronously — while the DELETE is in flight the label
    //     must render the removing state, never fall through to the green Check.
    setRemovingIndicators((prev) => new Set(prev).add(indicatorId));

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

    // 3. Server-side cleanup (HTTP DELETE) — bounded by AbortSignal.timeout(15000)
    //    and deduped by the in-flight guard in useIndicatorManager. Clear REMOVING
    //    on resolve (success OR failure) so the label can never hang in removing.
    //    On success the list filter drops the label (useIndicatorManager); on
    //    failure the label stays listed and returns to its normal state.
    const removed = await indicatorManager.removeIndicator(indicatorId);
    setRemovingIndicators((prev) => {
      const next = new Set(prev);
      next.delete(indicatorId);
      return next;
    });
    if (!removed) {
      // DELETE failed/timed out — the indicator is still active server-side and
      // stays listed. Re-add it to the active set so a late compute result is
      // not dropped by the onIndicatorResult stale-guard.
      lastIndicatorsRef.current = new Set(lastIndicatorsRef.current).add(indicatorId);
    }
  };

  const indicatorLabels = indicatorManager.indicators.map((i) => ({
    id: i.id,
    name: i.name,
    overlay: i.overlay,
  }));

  const handleRunBacktest = useCallback(
    (request: BacktestRunRequest) => {
      if (!request.strategy?.source) {
        // Defensive — the panel already blocks this; never POST an empty script.
        return;
      }
      setShowResultsPopup(true);
      submitBacktest(
        request.symbol,
        request.timeframe,
        { ...request.config, script: request.strategy.source },
        request.startDate,
        request.endDate,
      );
    },
    [submitBacktest],
  );

  const handleCloseResults = useCallback(() => {
    setShowResultsPopup(false);
    reset();
    // Bump the signal so BacktestPanel resets its wizard to step 1 (strategy stays selected).
    setBacktestResetSignal((n) => n + 1);
  }, [reset]);

  // Sidebar navigation handler — also syncs sub-panel states
  const handlePanelChange = useCallback((panel: PanelId) => {
    setActivePanel(panel);
  }, []);

  // Landing / app gate at the composition root (D3): the two views are
  // mutually exclusive — switching unmounts the other. The ControlPanel (and
  // its overlays) render only in the app view.
  if (view === 'landing') {
    return <LandingPage onGetStarted={enterApp} />;
  }

  return (
    <ControlPanel
      activePanel={activePanel}
      onPanelChange={handlePanelChange}
      botConnected={botConnected}
      botState={botStatus?.state ?? 'Idle'}
      errorCount={errors.length}
      onShowLanding={showLanding}
    >
      {/* === Dashboard Panel === */}
      {activePanel === 'dashboard' && (
        <div style={dashboardStyles.container}>
          {/* Top toolbar: symbol, timeframe, quick actions */}
          <DashboardToolbar
            symbol={symbol}
            setSymbol={setSymbol}
            timeframe={timeframe}
            setTimeframe={setTimeframe}
            pairOptions={PAIR_OPTIONS}
            timeframeOptions={TIMEFRAME_OPTIONS}
            isConnected={isConnected}
            isLoading={isLoading}
            autoScale={autoScale}
            setAutoScale={setAutoScale}
            debugMode={debugMode}
            setDebugMode={setDebugMode}
            errors={errors}
            onClearErrors={() => setErrors([])}
            setEditingScriptId={setEditingScriptId}
            setQuickAdderOpen={setQuickAdderOpen}
            setEditorOpen={setEditorOpen}
            setActivePanel={setActivePanel}
            setGoToDateOpen={setGoToDateOpen}
            exportChartData={exportChartData}
          />

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
              indicatorLabels={indicatorLabels}
              indicatorResults={indicatorResults}
              computingIndicators={computingIndicators}
              removingIndicators={removingIndicators}
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
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: tokens.colors.canvas,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
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
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ color: tokens.colors.semantic.error, fontSize: 16, fontWeight: 600 }}>
                Cannot Connect to Bot Backend
              </div>
              <div
                style={{
                  color: tokens.colors.steel.muted,
                  fontSize: 12,
                  textAlign: 'center',
                  maxWidth: 400,
                }}
              >
                The WebSocket connection to the backend server failed. Make sure the backend is
                running on port 8081.
              </div>
              <div
                style={{
                  color: tokens.colors.steel.disabled,
                  fontSize: 11,
                  fontFamily: 'monospace',
                }}
              >
                {backendUrl}/ws/bot
              </div>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 20px',
                  background: tokens.colors.surface['1'],
                  color: '#64b5f6',
                  border: '1px solid #64b5f6',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  marginTop: 8,
                }}
              >
                Retry Connection
              </button>
              <button
                onClick={() => setActivePanel('dashboard')}
                style={{
                  padding: '6px 16px',
                  background: 'transparent',
                  color: tokens.colors.steel.muted,
                  border: '1px solid #333',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  marginTop: 8,
                }}
              >
                Close Dashboard
              </button>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ color: tokens.colors.steel.muted, fontSize: 14 }}>
                Connecting to bot...
              </div>
              <div style={{ color: tokens.colors.steel.disabled, fontSize: 11 }}>
                Waiting for WebSocket connection
              </div>
              <button
                onClick={() => setActivePanel('dashboard')}
                style={{
                  padding: '6px 16px',
                  background: tokens.colors.surface['1'],
                  color: tokens.colors.steel.muted,
                  border: '1px solid #333',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  marginTop: 16,
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
          resetSignal={backtestResetSignal}
        />
      )}

      {/* === Overlays (fixed position, always available) === */}
      <CodeEditor
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingScriptId(null);
        }}
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
        status={status}
        progress={progress}
        phase={phase}
        result={result}
        error={error}
        jobId={jobId}
      />

      <GoToDatePopup
        isOpen={goToDateOpen}
        onClose={() => setGoToDateOpen(false)}
        lastTeleport={lastTeleport}
        onGoToDate={(ts, dateStr, timeStr) => {
          chartRef.current?.scrollToDate(ts);
          chartRef.current?.setTeleportLine(ts, {
            color: tokens.colors.brand.blue,
            label: 'Teleport',
          });
          setLastTeleport({ date: dateStr, time: timeStr });
          localStorage.setItem(
            'pine-last-teleport',
            JSON.stringify({ date: dateStr, time: timeStr }),
          );
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
        <div
          style={{
            position: 'fixed',
            bottom: 48,
            right: 8,
            background: chaosMode ? tokens.colors.semantic.error : tokens.colors.surface['1'],
            color: chaosMode ? tokens.colors.ink.default : tokens.colors.ink['1'],
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            zIndex: 10000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            transition: `opacity ${motion.durations.base} ${motion.easings.enter}`,
          }}
          onClick={dismissToast}
        >
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
  chartArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
};

export default App;
