import { BacktestResults } from './BacktestResults';
import { ProgressBar } from './ProgressBar';
import type { BacktestStatusResponse, BacktestResultResponse } from '../types';
import { tokens } from '../theme/tokens';

interface StrategyResultsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  status: BacktestStatusResponse['status'] | null;
  progress: number;
  phase: string;
  result: BacktestResultResponse | null;
  error: string | null;
}

export function StrategyResultsPopup({ isOpen, onClose, onOpenSettings, status, progress, phase, result, error }: StrategyResultsPopupProps) {
  if (!isOpen) return null;

  const isLoading = status === null || status === 'queued' || status === 'running';
  const displayProgress = status === 'completed' ? 100 : progress;

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
        background: tokens.colors.surface['1'],
        border: `1px solid ${tokens.colors.hairline.default}`,
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: tokens.colors.ink['1'],
        fontSize: '13px',
      }}>
        <div className="strategy-popup-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: `1px solid ${tokens.colors.hairline.default}`,
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, color: tokens.colors.brand.blue, fontSize: '18px' }}>Backtest Results</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {status === 'running' && (
              <span style={{ fontSize: '12px', color: tokens.colors.semantic.warning }}>{displayProgress}%</span>
            )}
            <button
              onClick={onOpenSettings}
              title="Open Backtest"
              style={{
                padding: '6px 10px',
                background: 'transparent',
                color: tokens.colors.ink['1'],
                border: `1px solid ${tokens.colors.hairline.default}`,
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
                color: tokens.colors.semantic.error,
                border: `1px solid ${tokens.colors.semantic.error}`,
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
          ...(isLoading && { display: 'flex', alignItems: 'center', justifyContent: 'center' }),
        }}>
          {isLoading && (
            <ProgressBar
              progress={displayProgress}
              phase={phase || 'Starting backtest'}
              variant="modal"
              status={status}
            />
          )}
          {status === 'failed' && error && (
            <div style={{ padding: '40px', textAlign: 'center', color: tokens.colors.semantic.error }}>
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
