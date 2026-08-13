import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { PineScriptError } from '../types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ErrorConsoleProps {
  errors: PineScriptError[];
  onClear: () => void;
}

/**
 * Errors console anchored to the toolbar's Errors button as a shadcn Popover.
 * Escape + outside-click dismissal come free from Radix; a local open state keeps
 * the visible Close affordance wired to the same onOpenChange contract.
 * Error messages are strings (normalized at the storage boundary in
 * useChartData.toErrorMessage) so they are always safe as React children.
 */
export function ErrorConsole({ errors, onClear }: ErrorConsoleProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Errors"
          className={cn(
            'relative text-muted-foreground hover:text-foreground',
            open &&
              'bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive',
            errors.length > 0 && 'text-destructive hover:text-destructive',
          )}
        >
          <TriangleAlert className="size-4" aria-hidden="true" />
          Errors
          {errors.length > 0 && (
            <Badge className="pointer-events-none absolute -top-1.5 -right-1.5 h-4 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {errors.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <h3 className="m-0 text-sm font-semibold text-destructive">
            Errors ({errors.length})
          </h3>
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={onClear}>
              Clear
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              aria-label="Close errors"
              className="px-2 text-sm leading-none"
            >
              ×
            </Button>
          </div>
        </div>
        <div
          role="log"
          aria-live="polite"
          className="max-h-[50vh] overflow-y-auto px-3.5 py-2"
        >
          {errors.length === 0 ? (
            <div className="py-2 text-[12px] font-mono text-[#22c55e]">
              No errors
            </div>
          ) : (
            errors.map((error, index) => (
              <div
                key={index}
                className="py-1 text-[12px] font-mono"
                style={{
                  color:
                    error.type === 'error'
                      ? 'var(--color-destructive)'
                      : error.type === 'warning'
                        ? '#eab308'
                        : '#22c55e',
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
      </PopoverContent>
    </Popover>
  );
}
