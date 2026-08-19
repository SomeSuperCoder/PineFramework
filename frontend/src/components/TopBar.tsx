import { Separator } from '@/components/ui/separator';
import logoUrl from '@/assets/logo.svg';

export interface TopBarProps {
  botConnected: boolean;
  botState: string;
  errorCount: number;
}

export function TopBar({
  botConnected,
  botState,
  errorCount,
}: TopBarProps) {
  return (
    <header
      data-testid="topbar"
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4"
    >
      {/* Left: Logo + App Name — §16 wordmark in brand yellow */}
      <div className="flex min-w-[180px] items-center">
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="" width={24} height={24} aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-[#eab308]">
            Pine Framework
          </span>
        </div>
      </div>

      {/* Center: Status indicators */}
      <div className="flex flex-1 items-center justify-center gap-2.5">
        <StatusDot connected={botConnected} />
        <span className="text-xs text-muted-foreground">Bot: {botState}</span>

            <Separator orientation="vertical" className="h-6" />

        {errorCount > 0 && (
          <>
            <span className="text-[11px] font-semibold text-destructive">
              Errors: {errorCount}
            </span>
        <Separator orientation="vertical" className="h-6" />
          </>
        )}
      </div>

      {/* Right: spacer — balances the left logo block */}
      <div className="flex min-w-[160px] items-center justify-end gap-1.5" />
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
        boxShadow: connected
          ? '0 0 6px #22c55e66'
          : '0 0 6px var(--color-destructive)66',
      }}
      title={connected ? 'Connected' : 'Disconnected'}
    />
  );
}
