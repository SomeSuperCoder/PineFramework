import { tokens } from '../../theme/tokens';

export function MetricValue({ label, value, color, title }: { label: string; value: string; color?: string; title?: string }) {
  return (
    <div title={title}>
      <span style={{ color: tokens.colors.steel.muted }}>{label}: </span>
      <span style={{ color: color ?? tokens.colors.ink['1'], fontWeight: 600 }}>{value}</span>
    </div>
  );
}
