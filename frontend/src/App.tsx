import { useState, useEffect, useCallback, useRef } from 'react';
import { ChartComponent } from './components/ChartComponent';
import { CodeEditor } from './components/CodeEditor';
import { ErrorConsole } from './components/ErrorConsole';
import { StrategyResultsPopup } from './components/StrategyResultsPopup';
import { BacktestSettingsPopup } from './components/BacktestSettingsPopup';
import { TelegramConfigPanel } from './components/TelegramConfigPanel';
import { QuickAdderPopup } from './components/QuickAdderPopup';
import { StrategyConflictDialog } from './components/StrategyConflictDialog';
import { useChartData } from './hooks/useChartData';
import { useBacktest } from './hooks/useBacktest';
import { useIndicatorManager } from './hooks/useIndicatorManager';
import type { ScriptResult, BacktestConfig } from './types';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT'];
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
    return INTERVALS.some(i => i.value === saved) ? saved : '1';
  });
  const [symbol, setSymbol] = useState(() => {
    const saved = localStorage.getItem('pine-symbol');
    return SYMBOLS.includes(saved) ? saved : 'BTCUSDT';
  });
  const [dataVersion, setDataVersion] = useState(0);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [showResultsPopup, setShowResultsPopup] = useState(false);
  const [isStrategy, setIsStrategy] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [quickAdderOpen, setQuickAdderOpen] = useState(false);
  const [indicatorResults, setIndicatorResults] = useState<Map<string, ScriptResult>>(new Map());
  const [strategyConflict, setStrategyConflict] = useState<{
    existingName: string;
    incomingName: string;
    pendingScriptId: string;
    pendingSource: string;
  } | null>(null);
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [errorConsoleOpen, setErrorConsoleOpen] = useState(false);

  const { status, progress, phase, result, error, submitBacktest, reset } = useBacktest();
  const indicatorManager = useIndicatorManager();

  const onIndicatorResult = useCallback((indicatorId: string, result: ScriptResult) => {
    setIndicatorResults((prev) => {
      const next = new Map(prev);
      next.set(indicatorId, result);
      return next;
    });
  }, []);

  const {
    candles,
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
    setIndicatorResults(new Map());
    fetchOHLCV(symbol, timeframe).then(() => {
      indicatorManagerRef.current.fetchIndicators().then((list) => {
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

  const extractScriptName = (src: string): string =>
    src.match(/strategy\(\s*["'](.+?)["']/)?.[1]
    || src.match(/indicator\(\s*["'](.+?)["']/)?.[1]
    || src.match(/study\(\s*["'](.+?)["']/)?.[1]
    || 'Indicator';

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
          incomingName: extractScriptName(source),
          pendingScriptId: scriptId,
          pendingSource: source,
        });
        return;
      }
    }

    const indicator = await indicatorManager.addIndicator(
      scriptId,
      extractScriptName(source),
      true,
      source,
    );

    if (indicator) {
      await executeScript(source, symbol, timeframe, undefined, undefined, undefined, indicator.id);
    }
  };

  const handleStrategyReplace = useCallback(async () => {
    if (!strategyConflict) return;
    const { pendingScriptId, pendingSource, existingName } = strategyConflict;
    setStrategyConflict(null);

    const existing = findExistingStrategy();
    if (existing) {
      await handleRemoveIndicator(existing.id);
    }

    const indicator = await indicatorManager.addIndicator(
      pendingScriptId,
      extractScriptName(pendingSource),
      true,
      pendingSource,
    );

    if (indicator) {
      await executeScript(pendingSource, symbol, timeframe, undefined, undefined, undefined, indicator.id);
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
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop_indicator', indicatorId }));
    }
    await indicatorManager.removeIndicator(indicatorId);
    removeIndicatorData(indicatorId);
    setIndicatorResults((prev) => {
      const next = new Map(prev);
      next.delete(indicatorId);
      return next;
    });
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
    if (indicatorResults.size > 0) {
      console.log('[strategySource] No strategyMarkers in any of %d indicatorResults', indicatorResults.size);
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
          data={candles}
          scriptResult={scriptResult}
          dataVersion={dataVersion}
          symbol={symbol}
          interval={timeframe}
          fetchOlderOHLCV={fetchOlderOHLCV}
          indicatorLabels={overlayIndicatorLabels}
          indicatorResults={indicatorResults}
          onRemoveIndicator={handleRemoveIndicator}
          onEditIndicator={handleEditIndicator}
          forceAutoScale={autoScale}
        />
      </main>

      <div className="footer-bar" style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 16px' }}>
        <button onClick={() => { setEditingScriptId(null); setEditorOpen(true); }} style={{
          padding: '6px 14px',
          background: '#111128',
          color: '#e0e0e0',
          border: '1px solid #111128',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
        }}>
          Open Editor
        </button>
        <button className="quick-adder-button" onClick={() => setQuickAdderOpen(true)} style={{
          padding: '6px 14px',
          background: '#111128',
          color: '#e0e0e0',
          border: '1px solid #111128',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
        }}>
          Add Script
        </button>
        {isStrategy && (
          <button className="run-backtest-button" onClick={() => setShowSettingsPopup(true)} style={{
            padding: '6px 14px',
            background: '#2196f3',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
          }}>
            Run Backtest
          </button>
        )}
        <button className="telegram-toggle-button" onClick={() => setTelegramOpen(!telegramOpen)} style={{
          padding: '6px 14px',
          background: telegramOpen ? '#3a1a1a' : '#111128',
          color: telegramOpen ? '#e94560' : '#e0e0e0',
          border: `1px solid ${telegramOpen ? '#e94560' : '#111128'}`,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
        }}>
          {telegramOpen ? 'Close Telegram' : 'Telegram'}
        </button>
        <button
          className={`auto-scale-toggle ${autoScale ? 'active' : ''}`}
          onClick={() => setAutoScale(!autoScale)}
          style={{
            padding: '6px 14px',
            background: autoScale ? '#4caf50' : '#111128',
            color: '#e0e0e0',
            border: '1px solid #111128',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          {autoScale ? 'Auto Scale' : 'Manual Scale'}
        </button>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <button onClick={() => setErrorConsoleOpen(!errorConsoleOpen)} style={{
            padding: '6px 14px',
            background: errorConsoleOpen ? '#2a1520' : '#111128',
            color: errors.length > 0 ? '#e94560' : '#e0e0e0',
            border: `1px solid ${errors.length > 0 ? '#e94560' : '#111128'}`,
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}>
            Errors
          </button>
          {errors.length > 0 && (
            <span style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              backgroundColor: '#e94560',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 'bold',
              borderRadius: '50%',
              minWidth: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              pointerEvents: 'none',
            }}>
              {errors.length}
            </span>
          )}
        </div>
      </div>

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

      <StrategyConflictDialog
        isOpen={strategyConflict !== null}
        existingName={strategyConflict?.existingName ?? ''}
        incomingName={strategyConflict?.incomingName ?? ''}
        onReplace={handleStrategyReplace}
        onCancel={handleStrategyCancel}
      />
    </div>
  );
}

export default App;
