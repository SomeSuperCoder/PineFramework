import { useState, useEffect, useCallback } from 'react';
import { ChartComponent } from './components/ChartComponent';
import { CodeEditor } from './components/CodeEditor';
import { ErrorConsole } from './components/ErrorConsole';
import { StrategyResultsPopup } from './components/StrategyResultsPopup';
import { TelegramConfigPanel } from './components/TelegramConfigPanel';
import { useChartData } from './hooks/useChartData';
import { useIndicatorManager } from './hooks/useIndicatorManager';
import type { ScriptResult } from './types';

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
  const [showStrategyPopup, setShowStrategyPopup] = useState(false);
  const [isStrategy, setIsStrategy] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [indicatorResults, setIndicatorResults] = useState<Map<string, ScriptResult>>(new Map());

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
      setShowStrategyPopup(false);
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
          {isStrategy && (
            <button className="view-results-button" onClick={() => {
              console.log('[App] View Backtest clicked. strategySource=%o, indicatorResults=%o, indicators=%o, sourcesRef=%o',
                strategySource?.substring(0, 50),
                Array.from(indicatorResults.entries()).map(([k, v]) => ({ id: k, hasMarkers: !!(v.strategyMarkers?.length) })),
                indicatorManager.indicators.map(i => ({ id: i.id, scriptId: i.scriptId, hasSource: !!i.source })),
                Array.from(indicatorSourcesRef.current.entries()).map(([k, v]) => ({ id: k, hasSource: !!v.source }))
              );
              setShowStrategyPopup(true);
            }}>
              View Backtest Results
            </button>
          )}
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

      <div className="footer-bar">
        <button
          className={`auto-scale-toggle ${autoScale ? 'active' : ''}`}
          onClick={() => setAutoScale(!autoScale)}
        >
          {autoScale ? '⊡ Auto Scale' : '⊞ Manual Scale'}
        </button>
      </div>

      <ErrorConsole errors={errors} onClear={() => setErrors([])} />

      <button className="editor-button" onClick={() => setEditorOpen(true)}>
        Open Editor
      </button>

      <CodeEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onAdd={handleAddIndicator}
      />

      <TelegramConfigPanel
        alertConditions={scriptResult?.alertConditions || []}
      />

      <StrategyResultsPopup
        isOpen={showStrategyPopup}
        onClose={() => setShowStrategyPopup(false)}
        symbol={symbol}
        timeframe={timeframe}
        scriptSource={strategySource}
      />
    </div>
  );
}

export default App;
