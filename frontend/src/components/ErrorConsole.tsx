import type { PineScriptError } from '../types';

interface ErrorConsoleProps {
  errors: PineScriptError[];
  onClear: () => void;
}

export function ErrorConsole({ errors, onClear }: ErrorConsoleProps) {
  return (
    <div className="error-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Error Console</h3>
        <button
          onClick={onClear}
          style={{
            padding: '4px 8px',
            border: '1px solid #0f3460',
            borderRadius: '4px',
            backgroundColor: '#1a1a2e',
            color: '#e0e0e0',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>
      <div className="error-list">
        {errors.length === 0 ? (
          <div className="error-item info">No errors</div>
        ) : (
          errors.map((error, index) => (
            <div key={index} className={`error-item ${error.type}`}>
              {error.line && error.column
                ? `[Line ${error.line}, Col ${error.column}] `
                : ''}
              {error.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
