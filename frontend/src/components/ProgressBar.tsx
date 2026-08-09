import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  progress: number;
  phase?: string;
  variant?: 'inline' | 'modal';
  status?: 'queued' | 'running' | 'completed' | 'failed' | null;
  error?: string | null;
}

const FILL_BLUE = "[&_[data-slot='progress-indicator']]:bg-primary";
const FILL_SUCCESS =
  "[&_[data-slot='progress-indicator']]:bg-[#22c55e]";
const FILL_ERROR =
  "[&_[data-slot='progress-indicator']]:bg-destructive";

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
        className="rounded-md bg-[rgba(239,68,68,0.12)] px-3 py-3 text-center text-xs text-destructive"
      >
        {error}
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div className="px-10 pt-10 pb-10 text-center text-muted-foreground">
        <div className="relative mx-auto mb-3 h-[6px] w-3/5 overflow-hidden rounded-full">
          <Progress
            value={isIndeterminate ? null : displayProgress}
            aria-busy={isIndeterminate}
            className={cn(
              'h-[6px] w-full rounded-full bg-secondary',
              fillClass,
            )}
          />
          {isIndeterminate && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-[30%] rounded-full bg-primary transition-transform animate-[backtest-indeterminate_1.5s_ease-in-out_infinite] motion-reduce:animate-none"
            />
          )}
        </div>
        <div className="text-sm text-muted-foreground">
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
            'h-[6px] w-full rounded-full bg-secondary',
            fillClass,
          )}
        />
        {isIndeterminate && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-[30%] rounded-full bg-primary transition-transform duration-200 animate-[backtest-indeterminate_1.5s_ease-in-out_infinite] motion-reduce:animate-none"
          />
        )}
      </div>
      <div className="mt-1 text-center text-[13px] tabular-nums text-muted-foreground">
        {isRunning ? `Processing... ${Math.round(displayProgress)}%` : `${phase || 'Starting'}...`}
      </div>
    </div>
  );
}