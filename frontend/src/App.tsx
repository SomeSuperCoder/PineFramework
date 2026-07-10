import { useState, useEffect, useCallback } from 'react';
import { ChartComponent } from './components/ChartComponent';
import { CodeEditor } from './components/CodeEditor';
import { ErrorConsole } from './components/ErrorConsole';
import { StrategyResultsPopup } from './components/StrategyResultsPopup';
import { BacktestSettingsPopup } from './components/BacktestSettingsPopup';
import { TelegramConfigPanel } from './components/TelegramConfigPanel';
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
  const [timeframe, setTimeframe] = useState('1');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [dataVersion, setDataVersion] = useState(0);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [showResultsPopup, setShowResultsPopup] = useState(false);
  const [isStrategy, setIsStrategy] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [indicatorResults, setIndicatorResults] = useState<Map<string, ScriptResult>>(new Map());

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
    fetchOHLCV(symbol, timeframe);
    indicatorManager.fetchIndicators().then((list) => {
      for (const ind of list) {
        executeScript(ind.source, symbol, timeframe, undefined, undefined, undefined, ind.id);
      }
    });
  }, []);

  useEffect(() => {
    setDataVersion((v) => v + 1);
    subscribe(symbol, timeframe);
    fetchOHLCV(symbol, timeframe);
  }, [symbol, timeframe, subscribe, fetchOHLCV]);

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

  const handleAddIndicator = async (scriptId: string, source: string) => {
    setEditorOpen(false);

    const indicator = await indicatorManager.addIndicator(
      scriptId,
      source.match(/strategy\(\s*["'](.+?)["']/)?.[1]
        || source.match(/indicator\(\s*["'](.+?)["']/)?.[1]
        || source.match(/study\(\s*["'](.+?)["']/)?.[1]
        || 'Indicator',
      true,
      source,
    );

    if (indicator) {
      await executeScript(source, symbol, timeframe, undefined, undefined, undefined, indicator.id);
    }
  };

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
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
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
          forceAutoScale={autoScale}
        />
      </main>

      <div className="footer-bar" style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 16px' }}>
        <button className="editor-button" onClick={() => setEditorOpen(true)} style={{
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
      </div>

      <ErrorConsole errors={errors} onClear={() => setErrors([])} />

      <CodeEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
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
    </div>
  );
}

export default App;
