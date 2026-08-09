import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type StatusTone = 'success' | 'info' | 'error';

interface StatusCalloutProps {
  tone: StatusTone;
  children: ReactNode;
  /** Auto-hide after this many ms (transient "saved" messages). */
  autoDismissMs?: number;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  success: 'border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]',
  info: 'border-border bg-muted text-muted-foreground',
  error: 'border-destructive bg-destructive/10 text-destructive',
};

/** Inline status message. Success/info announce via role="status"; errors via role="alert". */
export function StatusCallout({ tone, children, autoDismissMs, className }: StatusCalloutProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (autoDismissMs === undefined) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs]);

  if (!visible) return null;

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border px-3 py-2 text-xs', toneClasses[tone], className)}
    >
      {children}
    </div>
  );
}
