import type { PineScriptError } from '../types';

export interface AppToolbarProps {
  isStrategy: boolean;
  autoScale: boolean;
  onToggleAutoScale: () => void;
  errors: PineScriptError[];
  errorConsoleOpen: boolean;
  onToggleErrorConsole: () => void;
  telegramOpen: boolean;
  onToggleTelegram: () => void;
  onOpenQuickAdder: () => void;
  onOpenEditor: () => void;
  onOpenBacktest: () => void;
  onOpenGoToDate: () => void;
  onExport: () => Promise<void>;
}

export function AppToolbar({
  isStrategy,
  autoScale,
  onToggleAutoScale,
  errors,
  errorConsoleOpen,
  onToggleErrorConsole,
  telegramOpen,
  onToggleTelegram,
  onOpenQuickAdder,
  onOpenEditor,
  onOpenBacktest,
  onOpenGoToDate,
  onExport,
}: AppToolbarProps) {
  return (
    <div className="footer-bar" style={{ display: 'flex', gap: '2px', alignItems: 'center', padding: '6px 12px' }}>
      <button onClick={onOpenQuickAdder} style={{
        padding: '5px 10px', background: '#111128', color: '#e0e0e0',
        border: '1px solid #111128', borderRadius: '4px', cursor: 'pointer',
        fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" /></svg>
        Add
      </button>
      <button onClick={onOpenEditor} style={{
        padding: '5px 10px', background: '#111128', color: '#e0e0e0',
        border: '1px solid #111128', borderRadius: '4px', cursor: 'pointer',
        fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 1.5l2 2L4 10H2v-2z" /></svg>
        Editor
      </button>
      <div style={{ width: 1, height: 18, background: '#222', margin: '0 6px' }} />
      {isStrategy && (
        <button onClick={onOpenBacktest} style={{
          padding: '5px 10px', background: '#2196f3', color: '#fff',
          border: 'none', borderRadius: '4px', cursor: 'pointer',
          fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px',
        }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="2,0 10,5.5 2,11" /></svg>
          Backtest
        </button>
      )}
      {isStrategy && <div style={{ width: 1, height: 18, background: '#222', margin: '0 6px' }} />}
      <button onClick={onToggleAutoScale} style={{
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
      <button onClick={onOpenGoToDate} style={{
        padding: '5px 10px', background: '#111128', color: '#e0e0e0',
        border: '1px solid #111128', borderRadius: '4px', cursor: 'pointer',
        fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="4.5" /><polyline points="6,3 6,6 8,7" /></svg>
        Go to Date
      </button>
      <div style={{ width: 1, height: 18, background: '#222', margin: '0 6px' }} />
      <div style={{ flex: 1 }} />
      <button onClick={onExport} style={{
        padding: '5px 10px', background: '#1a2a1a', color: '#8bc34a',
        border: '1px solid #2a4a2a', borderRadius: '4px', cursor: 'pointer',
        fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px',
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v7M3 6l3 3 3-3M2 10h8" /></svg>
        Export
      </button>
      <div style={{ width: 1, height: 18, background: '#222', margin: '0 6px' }} />
      <button onClick={onToggleTelegram} style={{
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
        <button onClick={onToggleErrorConsole} style={{
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
  );
}
