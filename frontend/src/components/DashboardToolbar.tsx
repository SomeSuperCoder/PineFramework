import type { Dispatch, SetStateAction } from 'react';
import {
  Bug,
  CalendarClock,
  Download,
  FileCode2,
  Maximize,
  Minimize,
  Play,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { PineScriptError } from '@/types';
import type { Option } from '@/utils/options';
import type { PanelId } from './ControlPanel';

export interface DashboardToolbarProps {
  symbol: string;
  setSymbol: Dispatch<SetStateAction<string>>;
  timeframe: string;
  setTimeframe: Dispatch<SetStateAction<string>>;
  pairOptions: Option[];
  timeframeOptions: Option[];
  isConnected: boolean;
  isLoading: boolean;
  autoScale: boolean;
  setAutoScale: Dispatch<SetStateAction<boolean>>;
  debugMode: boolean;
  setDebugMode: Dispatch<SetStateAction<boolean>>;
  errors: PineScriptError[];
  errorConsoleOpen: boolean;
  setErrorConsoleOpen: Dispatch<SetStateAction<boolean>>;
  setEditingScriptId: Dispatch<SetStateAction<string | null>>;
  setQuickAdderOpen: Dispatch<SetStateAction<boolean>>;
  setEditorOpen: Dispatch<SetStateAction<boolean>>;
  setActivePanel: (panel: PanelId) => void;
  setGoToDateOpen: Dispatch<SetStateAction<boolean>>;
  exportChartData: () => Promise<string | null>;
}

/**
 * Live chart dashboard toolbar (extracted from App.tsx): symbol/timeframe
 * selects, connection status, and the quick-action button row. Mirrors the
 * TopBar house pattern — shadcn Button + Separator on a bordered card strip.
 * Behavior is byte-for-byte compatible with the inline toolbar it replaces:
 * selects persist to localStorage on change, toggles flip their App state, and
 * Export keeps its alert-based result reporting.
 */
export function DashboardToolbar({
  symbol,
  setSymbol,
  timeframe,
  setTimeframe,
  pairOptions,
  timeframeOptions,
  isConnected,
  isLoading,
  autoScale,
  setAutoScale,
  debugMode,
  setDebugMode,
  errors,
  errorConsoleOpen,
  setErrorConsoleOpen,
  setEditingScriptId,
  setQuickAdderOpen,
  setEditorOpen,
  setActivePanel,
  setGoToDateOpen,
  exportChartData,
}: DashboardToolbarProps) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-card px-3">
      {/* Left: market selects — styled native controls (TradeHistoryTab precedent) */}
      <select
        aria-label="Symbol"
        value={symbol}
        onChange={(e) => {
          const v = e.target.value;
          setSymbol(v);
          localStorage.setItem('pine-symbol', v);
        }}
        className={selectClass}
      >
        {pairOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Timeframe"
        value={timeframe}
        onChange={(e) => {
          const v = e.target.value;
          setTimeframe(v);
          localStorage.setItem('pine-timeframe', v);
        }}
        className={selectClass}
      >
        {timeframeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <Separator orientation="vertical" className="h-6" />

      {/* Connection status — announced on change for screen readers */}
      <span
        role="status"
        className={cn(
          'shrink-0 whitespace-nowrap text-xs',
          isConnected ? 'text-[#22c55e]' : 'text-destructive',
        )}
      >
        {isLoading ? '◌ Loading...' : isConnected ? '● Connected' : '○ Disconnected'}
      </span>

      <div className="flex-1" />

      {/* Quick action buttons */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          setEditingScriptId(null);
          setQuickAdderOpen(true);
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          setEditingScriptId(null);
          setEditorOpen(true);
        }}
      >
        <FileCode2 className="size-4" aria-hidden="true" />
        Editor
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Primary CTA — navigates to the backtest panel */}
      <Button type="button" size="sm" onClick={() => setActivePanel('backtest')}>
        <Play className="size-4 fill-current" aria-hidden="true" />
        Backtest
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Chart scale toggle — green accent when Auto Scale is on */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={autoScale}
        onClick={() => setAutoScale(!autoScale)}
        className={cn(
          'text-muted-foreground hover:text-foreground',
          autoScale &&
            'bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/20 hover:text-[#22c55e]',
        )}
      >
        {autoScale ? (
          <Maximize className="size-4" aria-hidden="true" />
        ) : (
          <Minimize className="size-4" aria-hidden="true" />
        )}
        {autoScale ? 'Auto Scale' : 'Manual'}
      </Button>

      {/* Debug toggle — amber accent matches the chart debug visualization */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={debugMode}
        onClick={() => setDebugMode(!debugMode)}
        className={cn(
          'text-muted-foreground hover:text-foreground',
          debugMode &&
            'bg-[#eab308]/10 text-[#eab308] hover:bg-[#eab308]/20 hover:text-[#eab308]',
        )}
      >
        <Bug className="size-4" aria-hidden="true" />
        Debug
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => setGoToDateOpen(true)}
      >
        <CalendarClock className="size-4" aria-hidden="true" />
        Go to Date
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        onClick={async () => {
          const path = await exportChartData();
          if (path) {
            alert(`Chart data exported to:\n${path}`);
          } else {
            alert('Export failed. Check console for details.');
          }
        }}
      >
        <Download className="size-4" aria-hidden="true" />
        Export
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Error console toggle — red accent + badge count when errors exist */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={errorConsoleOpen}
        onClick={() => setErrorConsoleOpen(!errorConsoleOpen)}
        className={cn(
          'relative text-muted-foreground hover:text-foreground',
          errorConsoleOpen &&
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
    </div>
  );
}

const selectClass =
  'h-9 shrink-0 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';