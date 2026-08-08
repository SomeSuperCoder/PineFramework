import { tokens } from '../theme/tokens';
import { Bell, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface TopBarProps {
  botConnected: boolean;
  botState: string;
  errorCount: number;
  settingsOpen: boolean;
  onOpenSettings: () => void;
}

export function TopBar({
  botConnected,
  botState,
  errorCount,
  settingsOpen,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header
      data-testid="topbar"
      className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--pf-hairline)] bg-[var(--pf-surface-1)] px-4"
    >
      {/* Left: Logo + App Name — §16 wordmark in brand yellow */}
      <div className="flex min-w-[180px] items-center">
        <div className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="2" y="10" width="3" height="8" rx="1" fill="var(--pf-brand-yellow)" />
            <rect x="6" y="6" width="3" height="12" rx="1" fill="var(--pf-brand-yellow)" />
            <rect x="10" y="3" width="3" height="15" rx="1" fill="var(--pf-brand-yellow)" />
            <rect x="14" y="1" width="3" height="17" rx="1" fill="var(--pf-brand-yellow)" />
          </svg>
          <span className="text-sm font-semibold tracking-tight text-[var(--pf-brand-yellow)]">
            Pine Framework
          </span>
        </div>
      </div>

      {/* Center: Status indicators */}
      <div className="flex flex-1 items-center justify-center gap-2.5">
        <StatusDot connected={botConnected} />
        <span className="text-xs text-[var(--pf-steel-muted)]">Bot: {botState}</span>

        <div className="h-4 w-px bg-[var(--pf-hairline)]" />

        {errorCount > 0 && (
          <>
            <span className="text-[11px] font-semibold text-[var(--pf-semantic-error)]">
              Errors: {errorCount}
            </span>
            <div className="h-4 w-px bg-[var(--pf-hairline)]" />
          </>
        )}
      </div>

      {/* Right: Quick actions — ghost icon buttons with tooltips */}
      <div className="flex min-w-[160px] items-center justify-end gap-1.5">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={
                  'size-11 text-[var(--pf-steel-muted)] hover:text-[var(--pf-ink-1)] ' +
                  (settingsOpen
                    ? 'bg-[var(--pf-surface-2)] text-[var(--pf-brand-blue)] hover:text-[var(--pf-brand-blue)]'
                    : '')
                }
                onClick={onOpenSettings}
                aria-label="Open settings"
                aria-pressed={settingsOpen}
              >
                <Settings className="size-5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-[var(--pf-steel-muted)] hover:text-[var(--pf-ink-1)]"
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell className="size-5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      role="status"
      aria-label={connected ? 'Bot connected' : 'Bot disconnected'}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: connected ? tokens.colors.semantic.success : tokens.colors.semantic.error,
        boxShadow: connected
          ? `0 0 6px ${tokens.colors.semantic.success}66`
          : `0 0 6px ${tokens.colors.semantic.error}66`,
      }}
      title={connected ? 'Connected' : 'Disconnected'}
    />
  );
}