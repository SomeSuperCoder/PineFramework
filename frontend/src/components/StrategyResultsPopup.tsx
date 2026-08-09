import { BacktestResults } from './BacktestResults';
import { ProgressBar } from './ProgressBar';
import type { BacktestStatusResponse, BacktestResultResponse } from '../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
  const isLoading = status === null || status === 'queued' || status === 'running';
  const displayProgress = status === 'completed' ? 100 : progress;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[90vw]"
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b border-border px-5 py-4">
          <DialogTitle className="text-lg text-primary">
            Backtest Results
          </DialogTitle>
          <div className="flex items-center gap-2">
            {status === 'running' && (
              <span className="text-xs text-yellow-500">{displayProgress}%</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              title="Open Backtest"
              className="size-9"
            >
              ⚙
            </Button>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                title="Close"
                className="size-9"
              >
                ✕
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="flex h-full items-center justify-center">
              <ProgressBar
                progress={displayProgress}
                phase={phase || 'Starting backtest'}
                variant="modal"
                status={status}
              />
            </div>
          )}
          {status === 'failed' && error && (
            <div className="py-10 text-center text-destructive">
              Backtest failed: {error}
            </div>
          )}
          {status === 'completed' && result && (
            <BacktestResults result={result} onClose={() => {}} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
