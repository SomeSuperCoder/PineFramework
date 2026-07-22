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

  const extractScriptName = (src: string): string => {
    // Prefer positional "Name", then named title="Name"
    const pos = src.match(/\b(?:strategy|indicator|study)\s*\(\s*["']([^"']+)["']/);
    if (pos) return pos[1];
    const named = src.match(/\b(?:strategy|indicator|study)\s*\(\s*title\s*=\s*["']([^"']+)["']/);
    return named?.[1] || 'Indicator';
  };

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
    setComputingIndicators((prev) => {
      const next = new Set(prev);
      next.delete(indicatorId);
      lastIndicatorsRef.current = next;
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
        />
      </main>

      <div className="footer-bar" style={{ display: 'flex', gap: '2px', alignItems: 'center', padding: '6px 12px' }}>
        <button onClick={() => { setEditingScriptId(null); setQuickAdderOpen(true); }} style={{
          padding: '5px 10px', background: '#111128', color: '#e0e0e0',
          border: '1px solid #111128', borderRadius: '4px', cursor: 'pointer',
          fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" /></svg>
          Add
        </button>
        <button onClick={() => { setEditingScriptId(null); setEditorOpen(true); }} style={{
          padding: '5px 10px', background: '#111128', color: '#e0e0e0',
          border: '1px solid #111128', borderRadius: '4px', cursor: 'pointer',
          fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 1.5l2 2L4 10H2v-2z" /></svg>
          Editor
        </button>
        <div style={{ width: 1, height: 18, background: '#222', margin: '0 6px' }} />
        {isStrategy && (
          <button onClick={() => setShowSettingsPopup(true)} style={{
            padding: '5px 10px', background: '#2196f3', color: '#fff',
            border: 'none', borderRadius: '4px', cursor: 'pointer',
            fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px',
          }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="2,0 10,5.5 2,11" /></svg>
            Backtest
          </button>
        )}
        {isStrategy && <div style={{ width: 1, height: 18, background: '#222', margin: '0 6px' }} />}
        <button onClick={() => setAutoScale(!autoScale)} style={{
          padding: '5px 10px',
          background: autoScale ? '#1a3328' : '#111128',
          color: autoScale ? '#4caf50' : '#e0e0e0',
          border: `1px solid ${autoScale ? '#4caf50' : '#111128'}`,
          borderRadius: '4px', cursor: 'pointer',
          fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="1,4 1,1 4,1" /><polyline points="8,1 11,1 11,4" /><polyline points="11,8 11,11 8,11" /><polyline points="4,11 1,11 1,8" /></svg>
          {autoScale ? 'Auto Scale' : 'Manual'}
        </button>
        <button onClick={() => setGoToDateOpen(true)} style={{
          padding: '5px 10px', background: '#111128', color: '#e0e0e0',
          border: '1px solid #111128', borderRadius: '4px', cursor: 'pointer',
          fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="4.5" /><polyline points="6,3 6,6 8,7" /></svg>
          Go to Date
        </button>
        <div style={{ width: 1, height: 18, background: '#222', margin: '0 6px' }} />
        <div style={{ flex: 1 }} />
        <button onClick={async () => {
          const path = await exportChartData();
          if (path) {
            alert(`Chart data exported to:\n${path}`);
          } else {
            alert('Export failed. Check console for details.');
          }
        }} style={{
          padding: '5px 10px', background: '#1a2a1a', color: '#8bc34a',
          border: '1px solid #2a4a2a', borderRadius: '4px', cursor: 'pointer',
          fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v7M3 6l3 3 3-3M2 10h8" /></svg>
          Export
        </button>
        <div style={{ width: 1, height: 18, background: '#222', margin: '0 6px' }} />
        <button onClick={() => setTelegramOpen(!telegramOpen)} style={{
          padding: '5px 10px',
          background: telegramOpen ? '#3a1a1a' : '#111128',
          color: telegramOpen ? '#e94560' : '#e0e0e0',
          border: `1px solid ${telegramOpen ? '#e94560' : '#111128'}`,
          borderRadius: '4px', cursor: 'pointer',
          fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6l9-4-4 9-1-4z" /><path d="M10 8L6 6" /></svg>
          Telegram
        </button>
        <div style={{ width: 1, height: 18, background: '#222', margin: '0 6px' }} />
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <button onClick={() => setErrorConsoleOpen(!errorConsoleOpen)} style={{
            padding: '5px 10px',
            background: errorConsoleOpen ? '#2a1520' : '#111128',
            color: errors.length > 0 ? '#e94560' : '#e0e0e0',
            border: `1px solid ${errors.length > 0 ? '#e94560' : '#111128'}`,
            borderRadius: '4px', cursor: 'pointer',
            fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 1L1 11h10z" /><line x1="6" y1="5" x2="6" y2="7.5" /><circle cx="6" cy="9.5" r="0.5" fill="currentColor" /></svg>
            Errors
          </button>
          {errors.length > 0 && (
            <span style={{
              position: 'absolute', top: '-6px', right: '-6px',
              backgroundColor: '#e94560', color: '#fff',
              fontSize: '10px', fontWeight: 'bold', borderRadius: '50%',
              minWidth: '16px', height: '16px', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, pointerEvents: 'none',
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
    </div>
  );
}

export default App;
