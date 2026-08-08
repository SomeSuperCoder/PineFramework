import type { TradeHistoryMode, TradeHistoryStatus } from '../types/trade';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** Live/chaos segmented toggle (§15.5 in-panel tabs). Defaults handled by the
 *  parent; labels are explicit: All | Live | Chaos, each with a clear tooltip. */
export function ModeToggle({
  value,
  onChange,
}: {
  value: TradeHistoryMode;
  onChange: (v: TradeHistoryMode) => void;
}) {
  const options: Array<{ value: TradeHistoryMode; label: string; title: string }> = [
    { value: 'all', label: 'All', title: 'Live + chaos trades' },
    { value: 'live', label: 'Live', title: 'Live (real execution) trades only' },
    { value: 'chaos', label: 'Chaos', title: 'Chaos-mode trades only' },
  ];
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as TradeHistoryMode)}>
      <TabsList>
        {options.map((o) => (
          <TabsTrigger key={o.value} value={o.value} title={o.title} className="px-3">
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Status filter — unknown-outcome closes are excluded by default (confirmed). */
export function StatusSelect({
  value,
  onChange,
}: {
  value: TradeHistoryStatus;
  onChange: (v: TradeHistoryStatus) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TradeHistoryStatus)}>
      <SelectTrigger
        className="h-9 w-[150px]"
        aria-label="Status filter"
        title="Status filter — unknown-outcome closes are excluded by default"
      >
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="confirmed">Confirmed</SelectItem>
        <SelectItem value="all">All statuses</SelectItem>
        <SelectItem value="unknown">Unknown only</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Error state with the API failure message (spec: error state + message). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      <span>⚠ {message}</span>
      {onRetry && (
        <Button type="button" variant="destructive" size="sm" onClick={onRetry} className="shrink-0">
          Retry
        </Button>
      )}
    </div>
  );
}
