import { useEffect, useRef } from 'react';
import type { PineScriptError } from '../types';
import { tokens } from '../theme/tokens';
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
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--pf-scrim)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 300,
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          width: 520,
          maxHeight: '60vh',
          backgroundColor: tokens.colors.canvas,
          border: `1px solid ${tokens.colors.hairline.default}`,
          borderRadius: 'var(--pf-radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--pf-shadow-4)',
          outline: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: `1px solid ${tokens.colors.hairline.default}`,
          }}
        >
          <h3 className="m-0 text-sm font-semibold" style={{ color: tokens.colors.semantic.error }}>
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
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 14px',
          }}
        >
          {errors.length === 0 ? (
            <div className="py-2 text-[12px] font-mono" style={{ color: tokens.colors.semantic.success }}>
              No errors
            </div>
          ) : (
            errors.map((error, index) => (
              <div
                key={index}
                style={{
                  padding: '4px 0',
                  fontSize: '12px',
                  fontFamily: "'Monaco', 'Menlo', monospace",
                  color:
                    error.type === 'error'
                      ? tokens.colors.semantic.error
                      : error.type === 'warning'
                        ? tokens.colors.semantic.warning
                        : tokens.colors.semantic.success,
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
