import { useEffect } from 'react';
import { NumberInput } from './NumberInput.js';
import type { DateRangeMode } from '../types';
import {
  SAFE_AMOUNT_OF_CANDLES,
  estimateBars,
  sliderBounds,
} from '../utils/candleLimit';
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
              background: dateRangeMode === 'days_back' ? tokens.colors.brand.blue : tokens.colors.hairline.default,
              color: tokens.colors.ink['1'],
              border: `1px solid ${tokens.colors.hairline.default}`,
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
              background: dateRangeMode === 'traditional' ? tokens.colors.brand.blue : tokens.colors.hairline.default,
              color: tokens.colors.ink['1'],
              border: `1px solid ${tokens.colors.hairline.default}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Begin / End
          </button>
        </div>
        {dateRangeMode === 'days_back' ? (
          minDays === maxDays ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  color: tokens.colors.ink['1'],
                  fontSize: '13px',
                  fontWeight: 'bold',
                }}
              >
                {maxDays}
              </span>
              <span style={{ color: tokens.colors.steel.muted, fontSize: '12px' }}>
                day{maxDays !== 1 ? 's' : ''} (only option — slider locked)
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="range"
                value={daysBack}
                onChange={(e) => onDaysBackChange(Number(e.target.value))}
                min={minDays}
                max={maxDays}
                step={1}
                style={{ flex: 1, accentColor: tokens.colors.brand.blue }}
              />
              <span
                style={{
                  color: tokens.colors.ink['1'],
                  fontSize: '13px',
                  minWidth: '60px',
                  textAlign: 'right',
                }}
              >
                {daysBack}
              </span>
              <span style={{ color: '#aaa', fontSize: '12px' }}>days back from today</span>
            </div>
          )
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
                  background: tokens.colors.surface['1'],
                  color: tokens.colors.ink['1'],
                  border: `1px solid ${tokens.colors.hairline.default}`,
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
                  background: tokens.colors.surface['1'],
                  color: tokens.colors.ink['1'],
                  border: `1px solid ${tokens.colors.hairline.default}`,
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
            color: exceedsLimit ? tokens.colors.semantic.error : tokens.colors.semantic.success,
            border: `1px solid ${exceedsLimit ? tokens.colors.semantic.error : tokens.colors.semantic.success}`,
          }}
        >
          {exceedsLimit
            ? `~${estimatedBars.toLocaleString()} bars exceeds limit of ${SAFE_AMOUNT_OF_CANDLES}. Max for ${TIMEFRAME_LABELS[timeframe] ?? timeframe} is ~${maxDays} day${maxDays !== 1 ? 's' : ''}.`
            : `~${estimatedBars.toLocaleString()} bars (max ${SAFE_AMOUNT_OF_CANDLES})`}
        </div>
      )}
    </>
  );
}
