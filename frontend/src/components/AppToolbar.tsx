import {
  Plus,
  Pencil,
  TrendingUp,
  Maximize,
  Bug,
  Clock,
  Download,
  Send,
  TriangleAlert,
} from 'lucide-react';
import type { PineScriptError } from '../types';
import { TradingBotControlButton, type BotStateT } from './TradingBotPanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AppToolbarProps {
  isStrategy: boolean;
  autoScale: boolean;
  onToggleAutoScale: () => void;
  debugMode: boolean;
  onToggleDebugMode: () => void;
  errors: PineScriptError[];
  errorConsoleOpen: boolean;
  onToggleErrorConsole: () => void;
  telegramOpen: boolean;
  onToggleTelegram: () => void;
  onOpenQuickAdder: () => void;
  onOpenEditor: () => void;
  onOpenBacktest: () => void;
  onOpenGoToDate: () => void;
  onExport: () => Promise<void>;
  backendUrl: string;
  botState: BotStateT;
  botConnected: boolean;
  botDashboardOpen: boolean;
  onToggleBotDashboard: () => void;
}

export function AppToolbar({
  isStrategy,
  autoScale,
  onToggleAutoScale,
  debugMode,
  onToggleDebugMode,
  errors,
  errorConsoleOpen,
  onToggleErrorConsole,
  telegramOpen,
  onToggleTelegram,
  onOpenQuickAdder,
  onOpenEditor,
  onOpenBacktest,
  onOpenGoToDate,
  onExport,
  backendUrl,
  botState,
  botConnected,
  botDashboardOpen,
  onToggleBotDashboard,
}: AppToolbarProps) {
  return (
    <div
      className="footer-bar flex flex-wrap items-center gap-1 px-2 py-1.5"
    >
      <Button
        variant="ghost"
        onClick={onOpenQuickAdder}
        className="h-10 px-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden="true" />
        Add
      </Button>
      <Button
        variant="ghost"
        onClick={onOpenEditor}
        className="h-10 px-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <Pencil className="size-4" aria-hidden="true" />
        Editor
      </Button>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      {isStrategy && (
        <Button
          onClick={onOpenBacktest}
          className="h-10 bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <TrendingUp className="size-4" aria-hidden="true" />
          Backtest
        </Button>
      )}
      {isStrategy && <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />}
      <Button
        variant={autoScale ? 'secondary' : 'ghost'}
        onClick={onToggleAutoScale}
        aria-pressed={autoScale}
        className={cn(
          'h-10 px-3 text-sm',
          autoScale
            ? 'bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/10'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Maximize className="size-4" aria-hidden="true" />
        {autoScale ? 'Auto Scale' : 'Manual'}
      </Button>
      <Button
        variant={debugMode ? 'secondary' : 'ghost'}
        onClick={onToggleDebugMode}
        aria-pressed={debugMode}
        className={cn(
          'h-10 px-3 text-sm',
          debugMode
            ? 'bg-[#eab308]/10 text-[#eab308] hover:bg-[#eab308]/10'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Bug className="size-4" aria-hidden="true" />
        Debug
      </Button>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <Button
        variant="ghost"
        onClick={onOpenGoToDate}
        className="h-10 px-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <Clock className="size-4" aria-hidden="true" />
        Go to Date
      </Button>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      {backendUrl && (
        <>
          <TradingBotControlButton
            backendUrl={backendUrl}
            botState={botState}
            connected={botConnected}
            onToggleDashboard={onToggleBotDashboard}
            dashboardOpen={botDashboardOpen}
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        </>
      )}
      <div className="min-w-1 flex-1" />
      <Button
        onClick={onExport}
        className="h-10 border border-[#22c55e]/50 bg-[#22c55e]/10 px-3 text-sm text-[#22c55e] hover:bg-[#22c55e]/10"
      >
        <Download className="size-4" aria-hidden="true" />
        Export
      </Button>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <Button
        variant={telegramOpen ? 'secondary' : 'ghost'}
        onClick={onToggleTelegram}
        aria-pressed={telegramOpen}
        className={cn(
          'h-10 px-3 text-sm',
          telegramOpen
            ? 'bg-destructive/10 text-destructive hover:bg-destructive/10'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Send className="size-4" aria-hidden="true" />
        Telegram
      </Button>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <div className="relative inline-flex">
        <Button
          variant={errorConsoleOpen ? 'secondary' : 'ghost'}
          onClick={onToggleErrorConsole}
          aria-pressed={errorConsoleOpen}
          className={cn(
            'h-10 px-3 text-sm',
            errors.length > 0
              ? 'bg-destructive/10 text-destructive hover:bg-destructive/10'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <TriangleAlert className="size-4" aria-hidden="true" />
          Errors
        </Button>
        {errors.length > 0 && (
          <span
            className="pointer-events-none absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
            aria-label={`${errors.length} errors`}
          >
            {errors.length}
          </span>
        )}
      </div>
    </div>
  );
}
