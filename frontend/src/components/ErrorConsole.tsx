import type { PineScriptError } from '../types';

interface ErrorConsoleProps {
  errors: PineScriptError[];
  isOpen: boolean;
  onClear: () => void;
  onClose: () => void;
}

export function ErrorConsole({ errors, isOpen, onClear, onClose }: ErrorConsoleProps) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 300,
    }} onClick={onClose}>
      <div style={{
        width: 520,
        maxHeight: '60vh',
        backgroundColor: '#0d0d18',
        border: '1px solid #111128',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid #111128',
        }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#e94560' }}>
            Errors ({errors.length})
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onClear}
              style={{
                padding: '4px 10px',
                border: '1px solid #333',
                borderRadius: 4,
                backgroundColor: '#111128',
                color: '#e0e0e0',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '4px 10px',
                border: 'none',
                borderRadius: 4,
                backgroundColor: '#111128',
                color: '#e0e0e0',
                fontSize: '14px',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 14px',
        }}>
          {errors.length === 0 ? (
            <div style={{ padding: '8px 0', fontSize: '12px', color: '#4caf50', fontFamily: 'monospace' }}>
              No errors
            </div>
          ) : (
            errors.map((error, index) => (
              <div
                key={index}
                style={{
                  padding: '4px 0',
                  fontSize: '12px',
                  fontFamily: "'Monaco', 'Menlo', monospace",
                  color: error.type === 'error' ? '#e94560' : error.type === 'warning' ? '#ffc107' : '#4caf50',
                }}
              >
                {error.line && error.column
                  ? `[Line ${error.line}, Col ${error.column}] `
                  : ''}
                {error.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
