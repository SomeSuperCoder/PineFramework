import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { botActivity, equitySeries, heroSeries } from './demo-data';

/** Data accent inside demo panels only — blue is a data color, not a UI accent (DESIGN §5). */
const CHART_BLUE = '#4262ff';
/** Brighter hover state of the data color for the bar sparkline's activeBar. */
const CHART_BLUE_HOVER = '#5b7bff';

/** Chart grid + cursor colors — white/10 in dark, black hairlines in light (DESIGN §2.2, §13.1). */
const GRID_STROKE = 'var(--landing-chart-grid)';
const CURSOR_FILL = 'var(--landing-chart-cursor-fill)';

/* ------------------------------------------------------------------ */
/* Hero mini-chart — interactive shadcn AreaChart (DESIGN §2.2).        */
/* ------------------------------------------------------------------ */

export function HeroAreaChart() {
  const gradientId = useId();
  return (
    <ChartContainer
      config={{ value: { label: 'Equity', color: CHART_BLUE } }}
      className="aspect-[320/140] h-auto w-full"
    >
      <AreaChart data={heroSeries} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_BLUE} stopOpacity={0.25} />
            <stop offset="100%" stopColor={CHART_BLUE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeWidth={1} />
        <XAxis dataKey="step" hide />
        <YAxis hide domain={['dataMin - 4', 'dataMax + 4']} />
        <ChartTooltip
          cursor={{ stroke: GRID_STROKE, strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              hideLabel
              indicator="line"
              formatter={(value) => Number(value).toFixed(1)}
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          activeDot={{ r: 4, strokeWidth: 0, fill: CHART_BLUE }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Backtest equity curve — interactive shadcn AreaChart, monotone (DESIGN §2.4). */
/* ------------------------------------------------------------------ */

export function EquityAreaChart() {
  const gradientId = useId();
  return (
    <ChartContainer
      config={{ value: { label: 'Equity', color: CHART_BLUE } }}
      className="aspect-[320/160] h-auto w-full"
    >
      <AreaChart data={equitySeries} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_BLUE} stopOpacity={0.22} />
            <stop offset="100%" stopColor={CHART_BLUE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeWidth={1} />
        <XAxis dataKey="step" hide />
        <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
        <ChartTooltip
          cursor={{ stroke: GRID_STROKE, strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              hideLabel
              indicator="line"
              formatter={(value) => Number(value).toFixed(1)}
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          activeDot={{ r: 4, strokeWidth: 0, fill: CHART_BLUE }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Bot activity sparkline — interactive shadcn BarChart (DESIGN §2.5).  */
/* ------------------------------------------------------------------ */

export function BotBarChart() {
  return (
    <ChartContainer
      config={{ value: { label: 'Trades', color: CHART_BLUE } }}
      className="aspect-[320/72] h-auto w-full"
    >
      <BarChart data={botActivity} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeWidth={1} />
        <XAxis dataKey="step" hide />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip
          cursor={{ fill: CURSOR_FILL }}
          content={<ChartTooltipContent hideLabel indicator="dot" />}
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={[2, 2, 0, 0]}
          maxBarSize={18}
          activeBar={{ fill: CHART_BLUE_HOVER }}
        />
      </BarChart>
    </ChartContainer>
  );
}
