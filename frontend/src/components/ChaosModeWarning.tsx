/**
 * ChaosModeWarning — full-screen overlay warning when chaos mode is active.
 *
 * Blocks dashboard interaction until user acknowledges the warning.
 * Presentation-only conversion: contract (`isActive` / `onAcknowledge`) and
 * all visible copy preserved.
 *
 * @module frontend
 */

import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ChaosModeWarningProps {
  /** Whether chaos mode is active. */
  isActive: boolean;
  /** Callback when user acknowledges the warning. */
  onAcknowledge: () => void;
}

export function ChaosModeWarning({ isActive, onAcknowledge }: ChaosModeWarningProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isActive || acknowledged) return null;

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-destructive/95 p-4">
      <Alert variant="destructive" className="w-full max-w-md gap-3 rounded-lg border-0 bg-[var(--pf-surface-1)]/95 p-6">
        <AlertTitle className="text-2xl font-semibold tracking-tight text-[var(--pf-ink-1)]">
          ⚠️ CHAOS MODE ACTIVE
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span className="text-base font-semibold text-[var(--pf-ink-1)]">
            RANDOM SIGNALS — NOT A STRATEGY
          </span>
          <span className="text-sm leading-relaxed text-[var(--pf-steel-muted)]">
            The bot will generate random long/short/exit signals on every candle close.
            Position sizing is fixed at 10% of equity. This is for stress testing only.
          </span>
          <Button
            onClick={() => {
              setAcknowledged(true);
              onAcknowledge();
            }}
            className="mt-4 h-11 w-fit"
          >
            I Understand — Proceed
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
