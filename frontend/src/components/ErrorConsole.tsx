import { useEffect, useRef } from 'react';
import type { PineScriptError } from '../types';
import { Button } from '@/components/ui/button';

interface ErrorConsoleProps {
  errors: PineScriptError[];
  isOpen: boolean;
  onClear: () => void;
  onClose: () => void;
}

export function ErrorConsole({ errors, isOpen, onClear, onClose }: ErrorConsoleProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Modal a11y contract (§15.4 / UX 4.3): initial focus, Escape close, focus trap, focus restore.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Initial focus → the dialog panel; interactive children carry their own focus rings.
    panelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Errors (${errors.length})`}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex w-[520px] max-h-[60vh] flex-col overflow-hidden rounded-preflight border border-border bg-background shadow-lg outline-none"
        onClick={(e) => e.stopPropagation()}
      >
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
              onClick={onClose}
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
          className="flex-1 overflow-y-auto px-3.5 py-2"
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
      </div>
    </div>
  );
}
