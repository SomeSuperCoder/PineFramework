import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CardSkeleton } from '@/components/ui/card-skeleton';
import { StatusCallout } from '@/components/ui/status-callout';
import type { CommissionMethodId } from '../types';

/** Response body of GET /api/backtest/dex-fee. */
interface DexFeeResponse {
  dexFeeBps?: number;
  source?: string;
  dexLabel?: string;
  solPriceUsd?: number;
}

export type SampleFeesPhase = 'loading' | 'error' | 'empty' | 'success' | 'absent';

interface SampleFeesState {
  phase: SampleFeesPhase;
  dexFeeBps?: number;
  source?: string;
  dexLabel?: string;
  solPriceUsd?: number;
}

const SOURCE_LABELS: Record<string, string> = {
  api: 'Live API',
  cache: 'Cache',
  'in-memory-cache': 'Memory Cache',
};

function sourceLabel(source: string | undefined): string {
  if (!source) return '';
  return SOURCE_LABELS[source] ?? source;
}

export interface SampleFeesCardProps {
  symbol: string;
  commissionMethod: CommissionMethodId;
  /** Reports each fee-fetch phase transition so the parent can gate navigation. */
  onPhaseChange?: (phase: SampleFeesPhase) => void;
}

export function SampleFeesCard({ symbol, onPhaseChange }: SampleFeesCardProps) {
  const backendUrl = `http://${window.location.hostname}:8081`;
  const [state, setState] = useState<SampleFeesState>({ phase: 'loading' });
  const requestIdRef = useRef<number>(0);

  // Probe once on mount: is the dex-fee route present at all? Judge on status only.
  useEffect(() => {
    let cancelled = false;
    async function probe(): Promise<void> {
      let status = 0;
      try {
        const res = await fetch(`${backendUrl}/api/backtest/dex-fee?symbol=SOL`);
        status = res.status;
      } catch {
        status = 0; // network failure — cannot judge route presence; assume present
      }
      if (cancelled) return;
      if (status === 404) setState({ phase: 'absent' });
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, [backendUrl]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState({ phase: 'loading' });
    try {
      const res = await fetch(
        `${backendUrl}/api/backtest/dex-fee?symbol=${encodeURIComponent(symbol)}`,
      );
      if (requestId !== requestIdRef.current) return;
      if (res.status === 404) {
        setState({ phase: 'absent' });
        return;
      }
      if (res.status === 400) {
        setState({ phase: 'empty' });
        return;
      }
      if (!res.ok) {
        setState({ phase: 'error' });
        return;
      }
      const data = (await res.json()) as DexFeeResponse;
      if (requestId !== requestIdRef.current) return;
      if (typeof data.dexFeeBps !== 'number') {
        setState({ phase: 'empty' });
        return;
      }
      setState({
        phase: 'success',
        dexFeeBps: data.dexFeeBps,
        source: data.source,
        dexLabel: data.dexLabel,
        solPriceUsd: data.solPriceUsd,
      });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState({ phase: 'error' });
    }
  }, [backendUrl, symbol]);

  // Fetch whenever the symbol changes; invalidate in-flight requests on cleanup.
  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  // Report every phase transition (initial loading, load() results, absent probe,
  // Retry) so the parent can gate navigation until fees are settled.
  useEffect(() => {
    onPhaseChange?.(state.phase);
  }, [state.phase, onPhaseChange]);

  if (state.phase === 'absent') return null;

  if (state.phase === 'loading') return <CardSkeleton />;

  if (state.phase === 'error') {
    return (
      <>
        <StatusCallout tone="error" className="mb-4">
          Could not fetch live fees.
        </StatusCallout>
        <Button variant="outline" className="h-10" onClick={() => void load()}>
          Retry
        </Button>
      </>
    );
  }

  if (state.phase === 'empty') {
    return <StatusCallout tone="info">No fee data available for {symbol}.</StatusCallout>;
  }

  const dexFeeBps = state.dexFeeBps;
  if (typeof dexFeeBps !== 'number') {
    return <StatusCallout tone="info">No fee data available for {symbol}.</StatusCallout>;
  }

  return (
    <Card>
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-base font-semibold">Sample Fees</CardTitle>
        <CardDescription className="text-[13px] text-muted-foreground">
          Live Jupiter fees fetched for this pair — what the backtest will charge.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 pt-2">
        <div>
          <div className="text-xs text-muted-foreground">DEX Fee</div>
          <div className="text-sm font-medium tabular-nums text-foreground">
            {dexFeeBps} bps
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Source</div>
          <div>
            <Badge
              variant="secondary"
              className="h-5 px-1.5 text-[10px] font-semibold"
              title={state.source}
            >
              {sourceLabel(state.source)}
            </Badge>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Pool / Route</div>
          <div className="text-sm font-medium text-foreground">{state.dexLabel ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">SOL Price</div>
          <div className="text-sm font-medium tabular-nums text-foreground">
            {state.solPriceUsd !== undefined ? `$${state.solPriceUsd}` : '—'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
