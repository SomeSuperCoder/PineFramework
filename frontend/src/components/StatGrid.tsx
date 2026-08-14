import type { BacktestMetrics } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DASH } from '../utils/format';

/** Format a nullable ratio metric — null (backend-sanitized Infinity, e.g. an all-win run) renders as an em-dash. */
function formatRatio(value: number | null): string {
  return value !== null ? value.toFixed(2) : DASH;
}

/** Small stat tile (§15.2 Card recipe: label caption + tabular-nums value). */
function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <Card size="sm" className="gap-1 text-center">
      <CardHeader className="items-center gap-0 pb-0">
        <CardTitle className="text-[11px] font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <div className={`text-base font-semibold tabular-nums ${valueClassName ?? ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

/** The 8-tile metrics grid — extracted from BacktestResults to keep that file lean. */
export function StatGrid({ metrics }: { metrics: BacktestMetrics }) {
  return (
    <CardContent>
      <div className="grid grid-cols-4 gap-2">
        <StatCard
          label="Net Profit"
          value={`$${metrics.totalPnl.toFixed(2)}`}
          valueClassName={
            metrics.totalPnl >= 0
              ? 'text-[#22c55e]'
              : 'text-destructive'
          }
        />
        <StatCard label="Win Rate" value={`${metrics.winRate.toFixed(1)}%`} />
        <StatCard label="Profit Factor" value={formatRatio(metrics.profitFactor)} />
        <StatCard label="Sharpe" value={formatRatio(metrics.sharpeRatio)} />
        <StatCard
          label="Max DD"
          value={`${metrics.maxDrawdownPercent.toFixed(1)}%`}
          valueClassName="text-destructive"
        />
        <StatCard label="Sortino" value={formatRatio(metrics.sortinoRatio)} />
        <StatCard label="Total Trades" value={`${metrics.totalTrades}`} />
        <StatCard label="Commission" value={`$${metrics.commission.toFixed(2)}`} />
      </div>
    </CardContent>
  );
}
