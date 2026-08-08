import type { CSSProperties } from 'react';
import type { TradeHistoryMode, TradeHistoryStatus } from '../types/trade';
import { tokens } from '../theme/tokens';

/** Shared filter-control styles — house palette (hairline field, steel border). */
export const filterControlStyle: CSSProperties = {
  background: tokens.colors.hairline.default,
  color: tokens.colors.ink['1'],
  border: '1px solid #333',
  borderRadius: 3,
  padding: '4px 8px',
  fontSize: 11,
  boxSizing: 'border-box',
};

export const pageButtonStyle: CSSProperties = {
  padding: '4px 10px',
  background: tokens.colors.hairline.default,
  color: '#64b5f6',
  border: '1px solid #333',
  borderRadius: 4,
  fontSize: 11,
};

/** Live-vs-chaos segmented toggle (design D6). Defaults handled by the parent;
 *  labels are explicit: All | Live | Chaos, each with a clear tooltip. */
export function ModeToggle({
  value,
  onChange,
}: {
  value: TradeHistoryMode;
  onChange: (v: TradeHistoryMode) => void;
}) {
  const options: Array<{
    value: TradeHistoryMode;
    label: string;
    activeColor: string;
    title: string;
  }> = [
    { value: 'all', label: 'All', activeColor: '#64b5f6', title: 'Live + chaos trades' },
    {
      value: 'live',
      label: 'Live',
      activeColor: tokens.colors.semantic.success,
      title: 'Live (real execution) trades only',
    },
    {
      value: 'chaos',
      label: 'Chaos',
      activeColor: tokens.colors.semantic.warning,
      title: 'Chaos-mode trades only',
    },
  ];
  return (
    <div
      style={{
        display: 'inline-flex',
        borderRadius: 4,
        border: '1px solid #333',
        overflow: 'hidden',
      }}
    >
      {options.map((o, i) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            title={o.title}
            style={{
              padding: '4px 12px',
              background: active ? tokens.colors.hairline.default : 'transparent',
              color: active ? o.activeColor : tokens.colors.steel.muted,
              border: 'none',
              borderRight: i < options.length - 1 ? '1px solid #333' : 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: active ? 600 : 400,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TradeHistoryStatus)}
      title="Status filter — unknown-outcome closes are excluded by default"
      style={filterControlStyle}
    >
      <option value="confirmed">Confirmed</option>
      <option value="all">All statuses</option>
      <option value="unknown">Unknown only</option>
    </select>
  );
}

/** Error state with the API failure message (spec: error state + message). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        background: tokens.colors.semantic.errorBg,
        border: `1px solid ${tokens.colors.semantic.error}`,
        borderRadius: 6,
        color: tokens.colors.semantic.error,
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span>⚠ {message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: '4px 10px',
            background: 'transparent',
            color: tokens.colors.semantic.error,
            border: `1px solid ${tokens.colors.semantic.error}`,
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
