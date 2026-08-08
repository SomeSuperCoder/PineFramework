import { tokens } from '../theme/tokens';

interface ProgressBarProps {
  progress: number;
  phase?: string;
  variant?: 'inline' | 'modal';
  status?: 'queued' | 'running' | 'completed' | 'failed' | null;
  error?: string | null;
}

export function ProgressBar({
  progress,
  phase = '',
  variant = 'inline',
  status = 'running',
  error = null,
}: ProgressBarProps) {
  const displayProgress = status === 'completed' ? 100 : progress;
  const isRunning = status === 'running' || status === 'queued';
  const isIndeterminate = status === null || status === 'queued';

  if (status === 'failed' && error) {
    return (
      <div style={{
        padding: '12px',
        background: '#3a1a1a',
        borderRadius: '4px',
        color: tokens.colors.semantic.error,
        fontSize: '12px',
        textAlign: 'center',
      }}>
        {error}
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: tokens.colors.steel.muted }}>
        <div style={{
          width: '60%',
          margin: '0 auto 12px',
          height: '8px',
          background: tokens.colors.canvas,
          borderRadius: '4px',
          overflow: 'hidden',
        }}>
          {isIndeterminate ? (
            <div style={{
              width: '30%',
              height: '100%',
              background: tokens.colors.brand.blue,
              borderRadius: '4px',
              animation: 'backtest-indeterminate 1.5s ease-in-out infinite',
            }} />
          ) : (
            <div style={{
              width: `${displayProgress}%`,
              height: '100%',
              background: tokens.colors.brand.blue,
              borderRadius: '4px',
              transition: `width ${tokens.motion.base} ${tokens.motion.ease}`,
            }} />
          )}
        </div>
        <div style={{ fontSize: '14px', color: '#aaa' }}>
          {isRunning ? `${phase}... ${displayProgress}%` : `${phase || 'Starting'}...`}
        </div>
      </div>
    );
  }

  // Inline variant
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{
        width: '100%',
        height: '8px',
        background: tokens.colors.canvas,
        borderRadius: '4px',
        overflow: 'hidden',
      }}>
        {isIndeterminate ? (
          <div style={{
            width: '30%',
            height: '100%',
            background: tokens.colors.brand.blue,
            borderRadius: '4px',
            animation: 'backtest-indeterminate 1.5s ease-in-out infinite',
          }} />
        ) : (
          <div style={{
            width: `${displayProgress}%`,
            height: '100%',
            background: tokens.colors.brand.blue,
            borderRadius: '4px',
            transition: `width ${tokens.motion.base} ${tokens.motion.ease}`,
          }} />
        )}
      </div>
      <div style={{ textAlign: 'center', marginTop: '4px', color: '#aaa', fontSize: '12px' }}>
        {isRunning ? `Processing... ${Math.round(displayProgress)}%` : `${phase || 'Starting'}...`}
      </div>
    </div>
  );
}
