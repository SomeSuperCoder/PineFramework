import { useCallback, useState } from 'react';
import { CandlestickChart, X } from 'lucide-react';
import { useBacktestPanelState } from '../hooks/useBacktestPanelState';
import type { BacktestRunRequest } from '../hooks/useBacktestPanelState';
import { BacktestGeneralSettings } from './BacktestGeneralSettings.js';
import { BacktestCommissionSettings } from './BacktestCommissionSettings.js';
import { SampleFeesCard } from './SampleFeesCard.js';
import { StrategySelector } from './StrategySelector.js';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionHeader } from '@/components/ui/section-header';
import { SettingRow } from '@/components/ui/setting-row';
import { StatusCallout } from '@/components/ui/status-callout';
import { PAIR_OPTIONS, TIMEFRAME_OPTIONS } from '../utils/options';

export interface BacktestPanelProps {
  /** Panel payload — the panel supplies its OWN symbol/timeframe. */
  onRun: (request: BacktestRunRequest) => void;
  onClose: () => void;
}

export function BacktestPanel({ onRun, onClose }: BacktestPanelProps) {
  const {
    selectedStrategy,
    setSelectedStrategy,
    validationError,
    setValidationError,
    initialCapital,
    setInitialCapital,
    timeframe,
    setTimeframe,
    symbol,
    setSymbol,
    dateRangeMode,
    setDateRangeMode,
    daysBack,
    setDaysBack,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    commissionMethod,
    setCommissionMethod,
    commissionMethodSettings,
    setCommissionMethodSettings,
    runConfig,
  } = useBacktestPanelState();

  const [barsExceedLimit, setBarsExceedLimit] = useState(false);
  const [rangeBlocked, setRangeBlocked] = useState(false);

  const handleRun = useCallback(() => {
    if (!selectedStrategy?.source) {
      setValidationError('Select a strategy to backtest.');
      return;
    }
    setValidationError('');
    onRun({ ...runConfig, strategy: selectedStrategy });
  }, [selectedStrategy, runConfig, onRun, setValidationError]);

  return (
    <div className="backtest-panel flex flex-1 flex-col overflow-auto rounded-md border border-border bg-card p-5 text-foreground">
      {/* Shell header — Telegram recipe: title left, actions right */}
      <header className="mb-4 flex items-center justify-between gap-2.5">
        <h3 className="m-0 text-[16px] font-semibold tracking-tight">Backtest Settings</h3>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRun}
            disabled={!selectedStrategy || barsExceedLimit || rangeBlocked}
            title={
              !selectedStrategy
                ? 'Select a strategy to run the backtest'
                : rangeBlocked
                  ? 'Fix the date range to run the backtest'
                  : undefined
            }
            className="h-10 whitespace-nowrap px-4"
          >
            Run Backtest
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Back to dashboard"
            className="h-10"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      {validationError && (
        <StatusCallout tone="error" className="mb-4">
          {validationError}
        </StatusCallout>
      )}

      <div className="flex flex-col gap-4">
        {/* Card 1 — Strategy (design-visual §3) */}
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-base font-semibold">Strategy</CardTitle>
            <CardDescription className="text-[13px] text-muted-foreground">
              Choose a Pine Script strategy to backtest.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5 pt-2">
            <section aria-label="Strategy">
              <StrategySelector
                value={selectedStrategy?.source ?? ''}
                onChange={(source, name, id) => {
                  setSelectedStrategy({ id, name, source });
                  setValidationError('');
                }}
                label="Strategy"
              />
            </section>
          </CardContent>
        </Card>

        {/* Card 2 — General: Market → Capital → Date Range (design-visual §4) */}
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-base font-semibold">General</CardTitle>
            <CardDescription className="text-[13px] text-muted-foreground">
              Market, starting capital, and date window for the backtest.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5 pt-2">
            <section aria-label="Market">
              <SectionHeader icon={CandlestickChart} title="Market" />
              <SettingRow label="Trading Pair" description="Solana spot pair to backtest.">
                <Select value={symbol} onValueChange={setSymbol}>
                  <SelectTrigger className="h-10 w-44" aria-label="Trading pair">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAIR_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow label="Timeframe" description="Candle interval for bar data.">
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger className="h-10 w-44" aria-label="Timeframe">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEFRAME_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>
            </section>

            <BacktestGeneralSettings
              initialCapital={initialCapital}
              onInitialCapitalChange={setInitialCapital}
              daysBack={daysBack}
              onDaysBackChange={setDaysBack}
              dateRangeMode={dateRangeMode}
              onDateRangeModeChange={setDateRangeMode}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              timeframe={timeframe}
              onBarsExceededChange={setBarsExceedLimit}
              onValidationBlocked={(blocked) => setRangeBlocked(blocked)}
            />
          </CardContent>
        </Card>

        {/* Card 3 — Commission (design-visual §5) */}
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-base font-semibold">Commission</CardTitle>
            <CardDescription className="text-[13px] text-muted-foreground">
              Fee model applied to the backtest.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5 pt-2">
            <section aria-label="Commission method">
              <BacktestCommissionSettings
                commissionMethod={commissionMethod}
                onCommissionMethodChange={setCommissionMethod}
                commissionMethodSettings={commissionMethodSettings}
                onCommissionMethodSettingsChange={setCommissionMethodSettings}
                symbol={symbol}
              />
            </section>
          </CardContent>
        </Card>

        {/* Card 4 — SampleFees (design-visual §6). Feature-gated: Jupiter methods only. */}
        {(commissionMethod === 'jupiter_ultra' || commissionMethod === 'jupiter_manual') && (
          <SampleFeesCard symbol={symbol} commissionMethod={commissionMethod} />
        )}
      </div>
    </div>
  );
}
