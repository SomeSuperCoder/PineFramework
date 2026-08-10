import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DateRangeMode } from '../types';
import {
  SAFE_AMOUNT_OF_CANDLES,
  estimateBars,
  sliderBounds,
  validateDateRange,
} from '../utils/candleLimit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusCallout } from '@/components/ui/status-callout';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
        className="h-10 flex-1"
        aria-label="Numeric value"
      />
      <div className="flex flex-col">
        <Button
          type="button"
          variant="ghost"
          className="h-5 w-9"
          aria-label="Increase"
          onClick={() => bump(1)}
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-5 w-9"
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
  /** Called when the explicit date range fails validation (Run must be disabled). */
  onValidationBlocked?: (blocked: boolean, message?: string) => void;
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
  onValidationBlocked,
}: BacktestGeneralSettingsProps) {
  const { min: minDays, max: maxDays } = sliderBounds(timeframe);
  const mountedRef = useRef(true);
  const [daysBackWarning, setDaysBackWarning] = useState<string | null>(null);

  // Clamp daysBack into [minDays, maxDays] (e.g., after timeframe switch or on
  // mount). A clamp on the very first render surfaces the rule-2 warning;
  // later clamps (timeframe switches) are silent.
  useEffect(() => {
    if (daysBack < minDays || daysBack > maxDays) {
      const bound = daysBack < minDays ? minDays : maxDays;
      onDaysBackChange(bound);
      if (mountedRef.current) {
        setDaysBackWarning(`Invalid backtest period reset to ${bound} days.`);
      }
    }
    mountedRef.current = false;
  }, [minDays, maxDays, daysBack, onDaysBackChange]);

  const validation = useMemo(
    () =>
      dateRangeMode === 'traditional' && startDate && endDate
        ? validateDateRange(startDate, endDate, timeframe)
        : ({ valid: true } as const),
    [dateRangeMode, startDate, endDate, timeframe],
  );

  useEffect(() => {
    if (!validation.valid) {
      onValidationBlocked?.(true, validation.message);
    } else {
      onValidationBlocked?.(false);
    }
  }, [validation, onValidationBlocked]);

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
                onChange={(e) => {
                  setDaysBackWarning(null);
                  onDaysBackChange(Math.min(maxDays, Math.max(minDays, Number(e.target.value))));
                }}
                min={minDays}
                max={maxDays}
                step={1}
                className="flex-1 accent-primary"
              />
              <span className="min-w-[60px] text-right text-[13px] text-foreground">
                {daysBack}
              </span>
              <span className="text-xs text-muted-foreground">days back from today</span>
            </div>
          )
        ) : (
          <>
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
                  className="h-10 w-full"
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
                  className="h-10 w-full"
                />
              </div>
            </div>
            {!validation.valid && (
              <StatusCallout tone="error" className="mt-3">
                {validation.message}
              </StatusCallout>
            )}
          </>
        )}

        {daysBackWarning && (
          <StatusCallout tone="warning" className="mt-3">
            {daysBackWarning}
          </StatusCallout>
        )}
      </div>

      {validation.valid && estimatedDays > 0 && (
        <div
          role="status"
          className={
            exceedsLimit
              ? 'mt-3 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive'
              : 'mt-3 rounded-md border border-success bg-success/10 px-3 py-2 text-xs text-success'
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