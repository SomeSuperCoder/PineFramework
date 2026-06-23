import { useState, useCallback, useEffect } from 'react';
import { ChartComponent } from './components/ChartComponent';
import { CodeEditor } from './components/CodeEditor';
import { ErrorConsole } from './components/ErrorConsole';
import { BacktestPanel } from './components/BacktestPanel';
import { BacktestResults } from './components/BacktestResults';
import { useChartData } from './hooks/useChartData';
import type { BacktestResultResponse } from './types';

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
  const [btResult, setBtResult] = useState<BacktestResultResponse | null>(null);

  const {
    candles,
    scriptResult,
    errors,
    isConnected,
    isLoading,
    executeScript,
    fetchOHLCV,
    subscribe,
    setErrors,
  } = useChartData();

  useEffect(() => {
    setDataVersion((v) => v + 1);
    fetchOHLCV(symbol, timeframe);
    subscribe(symbol, timeframe);
  }, [symbol, timeframe, fetchOHLCV, subscribe]);

  const handleExecute = async (code: string) => {
    setEditorOpen(false);
    await executeScript(code, symbol, timeframe);
  };

  const handleBacktestResult = useCallback((result: BacktestResultResponse) => {
    setBtResult(result);
  }, []);

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
        <ChartComponent data={candles} scriptResult={scriptResult} dataVersion={dataVersion} />
      </main>

      <ErrorConsole errors={errors} onClear={() => setErrors([])} />

      <button className="editor-button" onClick={() => setEditorOpen(true)}>
        Open Editor
      </button>

      <CodeEditor isOpen={editorOpen} onClose={() => setEditorOpen(false)} onExecute={handleExecute} />

      <BacktestPanel symbol={symbol} timeframe={timeframe} onResult={handleBacktestResult} />

      {btResult && (
        <BacktestResults
          result={btResult}
          onClose={() => setBtResult(null)}
        />
      )}
    </div>
  );
}

export default App;
