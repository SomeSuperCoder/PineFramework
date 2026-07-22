import { useEffect } from 'react';
import { NumberInput } from './NumberInput.js';
import type { DateRangeMode } from '../types';

const MAX_BARS = 1500;

const BARS_PER_DAY: Record<string, number> = {
  '1': 1440,
  '5': 288,
  '15': 96,
  '30': 48,
  '60': 24,
  '240': 6,
  D: 1,
  W: Math.round((1 / 7) * 100) / 100,
};

function getMaxDays(timeframe: string): number {
  const barsPerDay = BARS_PER_DAY[timeframe] ?? 24;
  return Math.floor(MAX_BARS / barsPerDay);
}

function estimateBars(timeframe: string, days: number): number {
  const barsPerDay = BARS_PER_DAY[timeframe] ?? 24;
  return Math.ceil(barsPerDay * days);
}

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
  const maxDays = getMaxDays(timeframe);
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
  const exceedsLimit = estimatedBars > MAX_BARS;

  useEffect(() => {
    onBarsExceededChange?.(exceedsLimit);
  }, [exceedsLimit, onBarsExceededChange]);

  return (
    <>
      <div>
        <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
          Initial Capital
        </label>
        <NumberInput value={initialCapital} onChange={onInitialCapitalChange} />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Date Range</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            onClick={() => onDateRangeModeChange('days_back')}
            style={{
              padding: '4px 12px',
              background: dateRangeMode === 'days_back' ? '#2196f3' : '#111128',
              color: '#e0e0e0',
              border: '1px solid #111128',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Days Back
          </button>
          <button
            onClick={() => onDateRangeModeChange('traditional')}
            style={{
              padding: '4px 12px',
              background: dateRangeMode === 'traditional' ? '#2196f3' : '#111128',
              color: '#e0e0e0',
              border: '1px solid #111128',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Begin / End
          </button>
        </div>
        {dateRangeMode === 'days_back' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <NumberInput
              value={daysBack}
              onChange={onDaysBackChange}
              min={1}
              style={{ width: '80px' }}
            />
            <span style={{ color: '#aaa', fontSize: '12px' }}>days back from today</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label
                style={{ display: 'block', marginBottom: '4px', color: '#aaa', fontSize: '11px' }}
              >
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px',
                  background: '#0f1520',
                  color: '#e0e0e0',
                  border: '1px solid #111128',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{ display: 'block', marginBottom: '4px', color: '#aaa', fontSize: '11px' }}
              >
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px',
                  background: '#0f1520',
                  color: '#e0e0e0',
                  border: '1px solid #111128',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {estimatedDays > 0 && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            background: exceedsLimit ? '#3a1a1a' : '#1a2a1a',
            color: exceedsLimit ? '#e94560' : '#4caf50',
            border: `1px solid ${exceedsLimit ? '#e94560' : '#4caf50'}`,
          }}
        >
          {exceedsLimit
            ? `~${estimatedBars.toLocaleString()} bars exceeds limit of ${MAX_BARS}. Max for ${TIMEFRAME_LABELS[timeframe] ?? timeframe} is ~${maxDays} day${maxDays !== 1 ? 's' : ''}.`
            : `~${estimatedBars.toLocaleString()} bars (max ${MAX_BARS})`}
        </div>
      )}
    </>
  );
}
