import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CandlestickChart, X } from 'lucide-react';
import { useBacktestPanelState } from '../hooks/useBacktestPanelState';
import type { BacktestRunRequest } from '../hooks/useBacktestPanelState';
import { BacktestGeneralSettings } from './BacktestGeneralSettings.js';
import { BacktestCommissionSettings } from './BacktestCommissionSettings.js';
import { SampleFeesCard } from './SampleFeesCard.js';
import type { SampleFeesPhase } from './SampleFeesCard.js';
import { StrategySelector } from './StrategySelector.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { FadeIn } from '@/components/ui/motion/fade-in';
import { PAIR_OPTIONS, TIMEFRAME_OPTIONS } from '../utils/options';
import { COMMISSION_METHOD_LABELS } from '../types';
import { cn } from '@/lib/utils';

export interface BacktestPanelProps {
  /** Panel payload — the panel supplies its OWN symbol/timeframe. */
  onRun: (request: BacktestRunRequest) => void;
  onClose: () => void;
  /** Counter incremented each time the results popup closes — resets the wizard to step 1. */
  resetSignal?: number;
}

type WizardStep = 'strategy' | 'market' | 'capital' | 'commission' | 'review';

const STEPS: WizardStep[] = ['strategy', 'market', 'capital', 'commission', 'review'];
const STEP_LABELS: Record<WizardStep, string> = {
  strategy: 'Strategy',
  market: 'Market',
  capital: 'Capital',
  commission: 'Commission',
  review: 'Review',
};

function StepDot({
  s,
  label,
  step,
  setStep,
}: {
  s: WizardStep;
  label: string;
  step: WizardStep;
  setStep: (s: WizardStep) => void;
}) {
  const idx = STEPS.indexOf(s) + 1;
  const active = step === s;
  const done = STEPS.indexOf(s) < STEPS.indexOf(step);
  return (
    <span
      onClick={done ? () => setStep(s) : undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]',
        active
          ? 'font-semibold text-[var(--color-foreground)]'
          : done
            ? 'cursor-pointer text-[#22c55e]'
            : 'text-[var(--color-muted-foreground)]',
      )}
    >
      <span
        className={cn(
          'inline-flex size-[18px] items-center justify-center rounded-full border font-semibold',
          active
            ? 'border-[var(--color-primary)] bg-[rgba(var(--color-primary),0.12)] text-[var(--color-primary)]'
            : done
              ? 'border-[#22c55e] bg-[rgba(34,197,94,0.12)] text-[#22c55e]'
              : 'border-[var(--color-input)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
        )}
      >
        {done ? '✓' : idx}
      </span>
      {label}
    </span>
  );
}

export function BacktestPanel({ onRun, onClose, resetSignal }: BacktestPanelProps) {
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

  const [step, setStep] = useState<WizardStep>('strategy');
  const [barsExceedLimit, setBarsExceedLimit] = useState(false);
  const [rangeBlocked, setRangeBlocked] = useState(false);
  const [sampleFeesPhase, setSampleFeesPhase] = useState<SampleFeesPhase | null>(null);

  // When the results popup closes, App bumps resetSignal — jump back to step 1
  // so the user can tweak and re-run. Selected strategy (session-scoped) is preserved.
  useEffect(() => {
    setStep('strategy');
  }, [resetSignal]);

  // Keep the sample-fees phase clean when the card isn't rendered, so revisiting
  // the commission step always starts from a fresh fetch.
  useEffect(() => {
    if (
      step !== 'commission' ||
      (commissionMethod !== 'jupiter_ultra' && commissionMethod !== 'jupiter_manual')
    ) {
      setSampleFeesPhase(null);
    }
  }, [step, commissionMethod]);

  const handleRun = useCallback(() => {
    if (!selectedStrategy?.source) {
      setValidationError('Select a strategy to backtest.');
      return;
    }
    setValidationError('');
    onRun({ ...runConfig, strategy: selectedStrategy });
  }, [selectedStrategy, runConfig, onRun, setValidationError]);

  const stepIdx = STEPS.indexOf(step);
  const canNext = step !== 'strategy' || !!selectedStrategy;
  const commissionFeesPending =
    step === 'commission' &&
    (commissionMethod === 'jupiter_ultra' || commissionMethod === 'jupiter_manual') &&
    sampleFeesPhase === 'loading';
  const isJupiterMethod =
    commissionMethod === 'jupiter_ultra' || commissionMethod === 'jupiter_manual';

  const next = () => {
    if (stepIdx < STEPS.length - 1) setStep(STEPS[stepIdx + 1]);
  };
  const back = () => {
    if (stepIdx > 0) setStep(STEPS[stepIdx - 1]);
  };

  const strategyLabel = selectedStrategy?.name || 'Not selected';
  const pairLabel = PAIR_OPTIONS.find((o) => o.value === symbol)?.label ?? symbol;
  const tfLabel = TIMEFRAME_OPTIONS.find((o) => o.value === timeframe)?.label ?? timeframe;

  const dateRangeLabel =
    dateRangeMode === 'days_back'
      ? `Last ${daysBack} days`
      : startDate && endDate
        ? `${startDate} → ${endDate}`
        : startDate
          ? `From ${startDate}`
          : 'Not set';

  const commissionLabel = COMMISSION_METHOD_LABELS[commissionMethod];

  const isReview = step === 'review';

  return (
    <div className="backtest-panel flex flex-1 flex-col overflow-auto rounded-md border border-border bg-card p-5 text-foreground">
      {/* Header */}
      <header className="mb-4 flex items-center justify-between gap-2.5">
        <h3 className="m-0 text-[16px] font-semibold tracking-tight">Backtest Settings</h3>
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
      </header>

      {/* Step indicator */}
      <nav className="mb-4 flex items-center gap-1" aria-label="Wizard steps">
        {STEPS.map((s, i) => (
          <span key={s} className="inline-flex items-center">
            <StepDot s={s} label={STEP_LABELS[s]} step={step} setStep={setStep} />
            {i < STEPS.length - 1 && (
              <span className="mx-0.5 text-[10px] text-[var(--color-muted-foreground)]">→</span>
            )}
          </span>
        ))}
      </nav>

      {validationError && (
        <StatusCallout tone="error" className="mb-4">
          {validationError}
        </StatusCallout>
      )}

      {/* Step body — key forces a remount on step navigation so each step fades in */}
      <FadeIn key={step} className="flex flex-1 flex-col gap-4">
        {/* Step 1 — Strategy */}
        {step === 'strategy' && (
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
        )}

        {/* Step 2 — Market */}
        {step === 'market' && (
          <Card>
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-base font-semibold">Market</CardTitle>
              <CardDescription className="text-[13px] text-muted-foreground">
                Trading pair and candle interval for the backtest.
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
            </CardContent>
          </Card>
        )}

        {/* Step 3 — Capital & Date Range */}
        {step === 'capital' && (
          <Card>
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-base font-semibold">Capital & Date Range</CardTitle>
              <CardDescription className="text-[13px] text-muted-foreground">
                Starting capital and date window for the backtest.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5 pt-2">
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
        )}

        {/* Step 4 — Commission */}
        {step === 'commission' && (
          <div className={cn('grid gap-4', isJupiterMethod && 'lg:grid-cols-2 items-start')}>
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
            {isJupiterMethod && (
              <SampleFeesCard
                symbol={symbol}
                commissionMethod={commissionMethod}
                onPhaseChange={setSampleFeesPhase}
              />
            )}
          </div>
        )}

        {/* Step 5 — Review & Run */}
        {step === 'review' && (
          <Card>
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-base font-semibold">Review & Run</CardTitle>
              <CardDescription className="text-[13px] text-muted-foreground">
                Confirm your settings and start the backtest.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-5 pt-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Strategy</span>
                <span className="font-medium">{strategyLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Trading Pair</span>
                <span className="font-medium">{pairLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Timeframe</span>
                <span className="font-medium">{tfLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Initial Capital</span>
                <span className="font-medium">${initialCapital.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Date Range</span>
                <span className="font-medium">{dateRangeLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Commission</span>
                <span className="font-medium">{commissionLabel}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </FadeIn>

      {/* Footer navigation */}
      <footer className="mt-4 flex items-center justify-between">
        {stepIdx > 0 ? (
          <Button type="button" variant="ghost" onClick={back} className="gap-1">
            <ArrowLeft className="size-4" /> Back
          </Button>
        ) : (
          <span />
        )}
        {isReview ? (
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
        ) : (
          <Button
            type="button"
            onClick={next}
            disabled={!canNext || commissionFeesPending}
            title={commissionFeesPending ? 'Waiting for sample fees…' : undefined}
            className="gap-1"
          >
            Next <ArrowRight className="size-4" />
          </Button>
        )}
      </footer>
    </div>
  );
}
