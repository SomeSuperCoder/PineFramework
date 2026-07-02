import { useState, useEffect } from 'react';
import { ChartComponent } from './components/ChartComponent';
import { CodeEditor, DEFAULT_CODE } from './components/CodeEditor';
import { ErrorConsole } from './components/ErrorConsole';
import { StrategyResultsPopup } from './components/StrategyResultsPopup';
import { TelegramConfigPanel } from './components/TelegramConfigPanel';
import { useChartData } from './hooks/useChartData';

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
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);
  const [showStrategyPopup, setShowStrategyPopup] = useState(false);
  const [isStrategy, setIsStrategy] = useState(false);

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
    prependCountRef,
    ohlcvDataRef,
  } = useChartData();

  useEffect(() => {
    fetch('/api/scripts/running')
      .then((res) => res.json())
      .then((data) => {
        if (data.script) {
          setCurrentScriptId(data.script.id);
          setCurrentCode(data.script.source);
        } else {
          setCurrentCode(DEFAULT_CODE);
        }
      })
      .catch(() => setCurrentCode(DEFAULT_CODE));
  }, []);

  useEffect(() => {
    setDataVersion((v) => v + 1);
    subscribe(symbol, timeframe);
  }, [symbol, timeframe, subscribe]);

  useEffect(() => {
    if (!currentCode) return;
    executeScript(currentCode, symbol, timeframe);
  }, [symbol, timeframe, executeScript, currentCode]);

  useEffect(() => {
    if (scriptResult?.strategyMarkers && scriptResult.strategyMarkers.length > 0) {
      setIsStrategy(true);
    } else {
      setIsStrategy(false);
      setShowStrategyPopup(false);
    }
  }, [scriptResult]);

  const handleRun = async (scriptId: string, source: string) => {
    setEditorOpen(false);
    setCurrentScriptId(scriptId);
    setCurrentCode(source);
    await executeScript(source, symbol, timeframe);
    fetch('/api/scripts/running', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptId }),
    }).catch(() => {});
  };

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
            <button className="view-results-button" onClick={() => setShowStrategyPopup(true)}>
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
          executeScript={executeScript}
          lastCodeRef={lastCodeRef}
          prependCountRef={prependCountRef}
          ohlcvDataRef={ohlcvDataRef}
        />
      </main>

      <ErrorConsole errors={errors} onClear={() => setErrors([])} />

      <button className="editor-button" onClick={() => setEditorOpen(true)}>
        Open Editor
      </button>

      <CodeEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onRun={handleRun}
        initialScriptId={currentScriptId}
      />

      <TelegramConfigPanel
        alertConditions={scriptResult?.alertConditions || []}
      />

      <StrategyResultsPopup
        isOpen={showStrategyPopup}
        onClose={() => setShowStrategyPopup(false)}
        symbol={symbol}
        timeframe={timeframe}
        scriptSource={currentCode}
      />
    </div>
  );
}

export default App;
