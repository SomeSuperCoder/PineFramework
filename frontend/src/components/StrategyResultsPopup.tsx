import { BacktestResults } from './BacktestResults';
import type { BacktestStatusResponse, BacktestResultResponse } from '../types';

interface StrategyResultsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  status: BacktestStatusResponse['status'] | null;
  progress: number;
  result: BacktestResultResponse | null;
  error: string | null;
}

export function StrategyResultsPopup({ isOpen, onClose, onOpenSettings, status, progress, result, error }: StrategyResultsPopupProps) {
  if (!isOpen) return null;

  return (
    <div className="strategy-popup-overlay" onClick={onClose} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
    }}>
      <div className="strategy-popup" onClick={(e) => e.stopPropagation()} style={{
        width: '90vw',
        height: '90vh',
        background: '#0f1520',
        border: '1px solid #111128',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#e0e0e0',
        fontSize: '13px',
      }}>
        <div className="strategy-popup-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #111128',
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, color: '#2196f3', fontSize: '18px' }}>Backtest Results</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {status === 'running' && (
              <span style={{ fontSize: '12px', color: '#ff9800' }}>{progress}%</span>
            )}
            <button
              onClick={onOpenSettings}
              title="Backtest Settings"
              style={{
                padding: '6px 10px',
                background: 'transparent',
                color: '#e0e0e0',
                border: '1px solid #111128',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: '1',
              }}
            >
              ⚙
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px',
                background: '#3a1a1a',
                color: '#e94560',
                border: '1px solid #e94560',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="strategy-popup-content" style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
        }}>
          {(status === null || status === 'queued' || status === 'running') && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
              <div style={{ width: '60%', margin: '0 auto 12px', height: '8px', background: '#0d0d18', borderRadius: '4px', overflow: 'hidden' }}>
                {status === 'running' ? (
                  <div style={{ width: `${progress}%`, height: '100%', background: '#2196f3', borderRadius: '4px', transition: 'width 0.3s ease' }} />
                ) : (
                  <div style={{ width: '30%', height: '100%', background: '#2196f3', borderRadius: '4px', animation: 'backtest-indeterminate 1.5s ease-in-out infinite' }} />
                )}
              </div>
              <div style={{ fontSize: '14px', color: '#aaa' }}>
                {status === 'running' ? `Running backtest... ${progress}%` : 'Starting backtest...'}
              </div>
            </div>
          )}
          {status === 'failed' && error && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#e94560' }}>
              Backtest failed: {error}
            </div>
          )}
          {status === 'completed' && result && (
            <BacktestResults result={result} onClose={() => {}} />
          )}
        </div>
      </div>
    </div>
  );
}
