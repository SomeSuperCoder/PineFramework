/**
 * MetricValue — labeled stat value with optional semantic color.
 *
 * Preserves the exact `label: value` text composition the dashboard asserts
 * on. Styling uses DESIGN tokens: label ink-2, value ink-1 semibold with
 * tabular numerals (so digits don't jitter as they change).
 *
 * @module frontend
 */

export function MetricValue({ label, value, color, title }: { label: string; value: string; color?: string; title?: string }) {
  return (
    <div title={title} className="min-w-0">
      <span className="text-[var(--pf-ink-2)]">{label}: </span>
      <span
        className="font-semibold tabular-nums text-[var(--pf-ink-1)]"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
