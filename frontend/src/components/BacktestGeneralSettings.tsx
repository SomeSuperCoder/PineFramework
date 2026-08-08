import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DateRangeMode } from '../types';
import {
  SAFE_AMOUNT_OF_CANDLES,
  estimateBars,
  sliderBounds,
} from '../utils/candleLimit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { tokens } from '../theme/tokens';

const TIMEFRAME_LABELS: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '240': '4h',
  D: '1D',
  W: '1W',
};

/** Numeric text field (same editing semantics as the legacy NumberInput:
 *  accepts numeric keystrokes, shows empty while editing, commits on blur) —
 *  now a shadcn Input with ghost ChevronUp/ChevronDown steppers (§15.6). */
export function NumberField({
  value,
  onChange,
  step = '1',
  min,
  max,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: string;
  min?: number;
  max?: number;
  id?: string;
}) {
  const [display, setDisplay] = useState(() => (value === 0 ? '' : String(value)));

  useEffect(() => {
    setDisplay(value === 0 ? '' : String(value));
  }, [value]);

  const stepNum = Number(step) || 1;
  const clamp = (v: number) => {
    if (typeof min === 'number' && v < min) return min;
    if (typeof max === 'number' && v > max) return max;
    return v;
  };
  const bump = (dir: 1 | -1) => {
    const next = clamp(Number((value + dir * stepNum).toFixed(4)));
    setDisplay(next === 0 ? '' : String(next));
    onChange(next);
  };

  return (
    <div className="flex w-full items-stretch gap-1">
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={display}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            bump(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            bump(-1);
          }
        }}
        onChange={(e) => {
          setDisplay(e.target.value);
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        onBlur={() => setDisplay(value === 0 ? '' : String(value))}
        className="h-11 flex-1"
        aria-label="Numeric value"
      />
      <div className="flex flex-col">
        <Button
          type="button"
          variant="ghost"
          className="h-7 w-9"
          aria-label="Increase"
          onClick={() => bump(1)}
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-7 w-9"
          aria-label="Decrease"
          onClick={() => bump(-1)}
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export interface BacktestGeneralSettingsProps {
  initialCapital: number;
  onInitialCapitalChange: (v: number) => void;
  daysBack: number;
  onDaysBackChange: (v: number) => void;
  dateRangeMode: DateRangeMode;
  onDateRangeModeChange: (mode: DateRangeMode) => void;
  startDate: string;
  onStartDateChange: (d: string) => void;
  endDate: string;
  onEndDateChange: (d: string) => void;
  timeframe: string;
  /** Called whenever the estimated bar count vs. limit changes. */
  onBarsExceededChange?: (exceedsLimit: boolean) => void;
}

export function BacktestGeneralSettings({
  initialCapital,
  onInitialCapitalChange,
  daysBack,
  onDaysBackChange,
  dateRangeMode,
  onDateRangeModeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  timeframe,
  onBarsExceededChange,
}: BacktestGeneralSettingsProps) {
  const { min: minDays, max: maxDays } = sliderBounds(timeframe);

  // Clamp daysBack if it exceeds the current max (e.g., after timeframe switch)
  useEffect(() => {
    if (daysBack > maxDays) {
      onDaysBackChange(maxDays);
    }
  }, [maxDays, daysBack, onDaysBackChange]);

  const estimatedDays =
    dateRangeMode === 'days_back'
      ? daysBack
      : (() => {
          if (startDate && endDate) {
            const diff =
              (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
            return Math.max(0, Math.ceil(diff));
          }
          return 0;
        })();
  const estimatedBars = estimateBars(timeframe, estimatedDays);
  const exceedsLimit = estimatedBars > SAFE_AMOUNT_OF_CANDLES;

  useEffect(() => {
    onBarsExceededChange?.(exceedsLimit);
  }, [exceedsLimit, onBarsExceededChange]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="backtest-initial-capital">Initial Capital</Label>
        <NumberField value={initialCapital} onChange={onInitialCapitalChange} id="backtest-initial-capital" />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Date Range</Label>
        {/* §15.5 segmented control — in-panel tabs */}
        <Tabs
          value={dateRangeMode}
          onValueChange={(v) => onDateRangeModeChange(v as DateRangeMode)}
          className="w-full"
        >
          <TabsList className="w-full">
            <TabsTrigger value="days_back" className="flex-1">
              Days Back
            </TabsTrigger>
            <TabsTrigger value="traditional" className="flex-1">
              Begin / End
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {dateRangeMode === 'days_back' ? (
          minDays === maxDays ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">{maxDays}</span>
              <span className="text-xs text-muted-foreground">
                day{maxDays !== 1 ? 's' : ''} (only option — slider locked)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="range"
                value={daysBack}
                onChange={(e) => onDaysBackChange(Number(e.target.value))}
                min={minDays}
                max={maxDays}
                step={1}
                className="flex-1"
                style={{ accentColor: tokens.colors.brand.blue }}
              />
              <span className="min-w-[60px] text-right text-[13px] text-foreground">
                {daysBack}
              </span>
              <span className="text-xs text-muted-foreground">days back from today</span>
            </div>
          )
        ) : (
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="backtest-start-date" className="text-xs text-muted-foreground">
                Start Date
              </Label>
              <Input
                id="backtest-start-date"
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="h-11 w-full"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="backtest-end-date" className="text-xs text-muted-foreground">
                End Date
              </Label>
              <Input
                id="backtest-end-date"
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="h-11 w-full"
              />
            </div>
          </div>
        )}
      </div>

      {estimatedDays > 0 && (
        <div
          role="status"
          className={
            exceedsLimit
              ? 'mt-3 rounded-md border border-[color:var(--pf-semantic-error)] bg-[color:var(--pf-semantic-error-bg)] px-3 py-2 text-xs text-[color:var(--pf-semantic-error)]'
              : 'mt-3 rounded-md border border-[color:var(--pf-semantic-success)] bg-[color:var(--pf-semantic-success-bg)] px-3 py-2 text-xs text-[color:var(--pf-semantic-success)]'
          }
        >
          {exceedsLimit
            ? `~${estimatedBars.toLocaleString()} bars exceeds limit of ${SAFE_AMOUNT_OF_CANDLES}. Max for ${TIMEFRAME_LABELS[timeframe] ?? timeframe} is ~${maxDays} day${maxDays !== 1 ? 's' : ''}.`
            : `~${estimatedBars.toLocaleString()} bars (max ${SAFE_AMOUNT_OF_CANDLES})`}
        </div>
      )}
    </>
  );
}