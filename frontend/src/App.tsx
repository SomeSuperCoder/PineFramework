import { useState } from 'react';
import { ChartComponent } from './components/ChartComponent';
import { CodeEditor } from './components/CodeEditor';
import { ErrorConsole } from './components/ErrorConsole';
import { useChartData } from './hooks/useChartData';

function App() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [timeframe, setTimeframe] = useState('1');
  const [symbol, setSymbol] = useState('BTCUSDT');

  const {
    candles,
    scriptResult,
    errors,
    isConnected,
    executeScript,
    clearErrors,
  } = useChartData();

  const handleExecute = async (code: string) => {
    setEditorOpen(false);
    await executeScript(code);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Pine Script Engine</h1>
        <div className="header-controls">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="BTCUSDT">BTCUSDT</option>
            <option value="ETHUSDT">ETHUSDT</option>
            <option value="AAPL">AAPL</option>
            <option value="GOOGL">GOOGL</option>
          </select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            <option value="1">1m</option>
            <option value="5">5m</option>
            <option value="15">15m</option>
            <option value="60">1h</option>
            <option value="240">4h</option>
            <option value="1440">1D</option>
          </select>
          <span style={{ fontSize: '12px', color: isConnected ? '#4caf50' : '#e94560' }}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
      </header>

      <main className="main-content">
        <ChartComponent data={candles} scriptResult={scriptResult} />
      </main>

      <ErrorConsole errors={errors} onClear={clearErrors} />

      <button
        className="editor-button"
        onClick={() => setEditorOpen(true)}
      >
        Open Editor
      </button>

      <CodeEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onExecute={handleExecute}
      />
    </div>
  );
}

export default App;
