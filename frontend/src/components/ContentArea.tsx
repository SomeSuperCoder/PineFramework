import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ContentAreaProps {
  /** Breadcrumb segments (optional — if not provided, no breadcrumb shown) */
  breadcrumb?: string[];
  /** Panel label for breadcrumb (auto-derived from panel ID if not set) */
  panelLabel?: string;
  children: React.ReactNode;
}

export function ContentArea({ breadcrumb, panelLabel, children }: ContentAreaProps) {
  const segments = breadcrumb ?? (panelLabel ? [panelLabel] : []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {/* Breadcrumb bar */}
      {segments.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-4 py-1.5"
        >
          {segments.map((segment, i) => {
            const isLast = i === segments.length - 1;
            return (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight
                    className="size-3 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <Button
                  variant="link"
                  type="button"
                  tabIndex={isLast ? -1 : 0}
                  aria-current={isLast ? 'page' : undefined}
                  className={cn(
                    'h-7 rounded-full px-2 text-sm no-underline',
                    isLast
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:underline',
                  )}
                >
                  {segment}
                </Button>
              </span>
            );
          })}
        </nav>
      )}

      {/* Scrollable content */}
      <div className="flex flex-1 flex-col overflow-auto p-0">{children}</div>
    </div>
  );
}
