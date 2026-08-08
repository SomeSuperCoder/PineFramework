export function MetricValue({ label, value, color, title }: { label: string; value: string; color?: string; title?: string }) {
  return (
    <div title={title}>
      <span style={{ color: '#888' }}>{label}: </span>
      <span style={{ color: color ?? '#e0e0e0', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
