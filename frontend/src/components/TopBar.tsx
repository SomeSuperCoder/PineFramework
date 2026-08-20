import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import logoUrl from '@/assets/logo.svg';

export interface TopBarProps {
  botConnected: boolean;
  botState: string;
  errorCount: number;
  /** Opens the landing page (About button / logo-name click). Optional — the
   *  About button only renders when a handler is provided (D4). */
  onShowLanding?: () => void;
}

export function TopBar({ botConnected, botState, errorCount, onShowLanding }: TopBarProps) {
  return (
    <header
      id="app-topbar"
      tabIndex={-1}
      data-testid="topbar"
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4 focus:outline-none"
    >
      {/* Left: Logo + App Name — one click target back to landing (DESIGN §6). */}
      <div className="flex min-w-[180px] items-center">
        <button
          type="button"
          aria-label="Pine Framework — back to landing"
          onClick={onShowLanding}
          className="flex h-full cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img src={logoUrl} alt="" width={24} height={24} aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-[#eab308]">
            Pine Framework
          </span>
        </button>
      </div>

      {/* Center: Status indicators */}
      <div className="flex flex-1 items-center justify-center gap-2.5">
        <StatusDot connected={botConnected} />
        <span className="text-xs text-muted-foreground">Bot: {botState}</span>
        <Separator orientation="vertical" className="h-6" />
        {errorCount > 0 && (
          <>
            <span className="text-[11px] font-semibold text-destructive">Errors: {errorCount}</span>
            <Separator orientation="vertical" className="h-6" />
          </>
        )}
      </div>

      {/* Right: About + spacer — balances the left logo block */}
      <div className="flex min-w-[160px] items-center justify-end gap-1.5">
        {onShowLanding && (
          <Button type="button" variant="ghost" onClick={onShowLanding} className="cursor-pointer">
            About
          </Button>
        )}
      </div>
    </header>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      role="status"
      aria-label={connected ? 'Bot connected' : 'Bot disconnected'}
      className="inline-block"
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: connected ? '#22c55e' : 'var(--color-destructive)',
        boxShadow: connected ? '0 0 6px #22c55e66' : '0 0 6px var(--color-destructive)66',
      }}
      title={connected ? 'Connected' : 'Disconnected'}
    />
  );
}
