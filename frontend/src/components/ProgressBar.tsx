import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  progress: number;
  phase?: string;
  variant?: 'inline' | 'modal';
  status?: 'queued' | 'running' | 'completed' | 'failed' | null;
  error?: string | null;
}

const FILL_BLUE = "[&_[data-slot='progress-indicator']]:bg-[var(--pf-brand-blue)]";
const FILL_SUCCESS =
  "[&_[data-slot='progress-indicator']]:bg-[var(--pf-semantic-success)]";
const FILL_ERROR =
  "[&_[data-slot='progress-indicator']]:bg-[var(--pf-semantic-error)]";

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

  const fillClass =
    status === 'completed'
      ? FILL_SUCCESS
      : status === 'failed'
        ? FILL_ERROR
        : FILL_BLUE;

  if (status === 'failed' && error) {
    return (
      <div
        role="alert"
        className="rounded-md bg-[var(--pf-semantic-error-bg)] px-3 py-3 text-center text-xs text-[var(--pf-semantic-error)]"
      >
        {error}
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div className="px-10 pt-10 pb-10 text-center text-[var(--pf-steel-muted)]">
        <div className="relative mx-auto mb-3 h-[6px] w-3/5 overflow-hidden rounded-full">
          <Progress
            value={isIndeterminate ? null : displayProgress}
            aria-busy={isIndeterminate}
            className={cn(
              'h-[6px] w-full rounded-full bg-[var(--pf-surface-2)]',
              fillClass,
            )}
          />
          {isIndeterminate && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-[30%] rounded-full bg-[var(--pf-brand-blue)] transition-transform animate-[backtest-indeterminate_1.5s_ease-in-out_infinite] motion-reduce:animate-none"
            />
          )}
        </div>
        <div className="text-sm text-[var(--pf-steel-muted)]">
          {isRunning ? `${phase}... ${displayProgress}%` : `${phase || 'Starting'}...`}
        </div>
      </div>
    );
  }

  // Inline variant
  return (
    <div className="mt-3">
      <div className="relative h-[6px] w-full overflow-hidden rounded-full">
        <Progress
          value={isIndeterminate ? null : displayProgress}
          aria-busy={isIndeterminate}
          className={cn(
            'h-[6px] w-full rounded-full bg-[var(--pf-surface-2)]',
            fillClass,
          )}
        />
        {isIndeterminate && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-[30%] rounded-full bg-[var(--pf-brand-blue)] transition-transform duration-[var(--pf-motion-base)] animate-[backtest-indeterminate_1.5s_ease-in-out_infinite] motion-reduce:animate-none"
          />
        )}
      </div>
      <div className="mt-1 text-center text-[13px] tabular-nums text-[var(--pf-ink-3)]">
        {isRunning ? `Processing... ${Math.round(displayProgress)}%` : `${phase || 'Starting'}...`}
      </div>
    </div>
  );
}