import { useState, useCallback } from 'react';
import type {
  AutoSelectProgressV2,
  AutoSelectResultV2,
  NormalizedWorld,
} from '../types/multiWorld';
import { pnlOf } from '../types/multiWorld';

/**
 * WS plumbing for the bot:autoSelect channel.
 *
 * KEEP: the WebSocket handling model (progress → complete).
 * EXTEND: payload shape now carries multi-world V2 fields
 * (concurrency, activeWorlds, blocked, worlds, positiveWorlds, ranking).
 *
 * To stay resilient while the backend migrates from the legacy single-best
 * contract to the multi-world contract, the raw `complete` message is
 * normalized into the stable `AutoSelectResultV2` model. Legacy
 * `best.pair`/`ranking[].pair` messages are folded into the same shape so the
 * UI never sees two different result types.
 */

// ---- Normalization helpers (tolerant of legacy + V2 backend shapes) ----

function normalizeWorldEntry(raw: any, _fallbackKey: string): NormalizedWorld {
  // V2 entry: { worldKey, label, symbol, timeframe, strategyId, strategyName?, source?, isBuiltIn?, metrics }
  // Legacy entry: { pair: { symbol, timeframe }, label, metrics }
  const pair = raw?.pair ?? {
    symbol: raw?.symbol ?? '',
    timeframe: raw?.timeframe ?? '',
  };
  const label = raw?.label ?? `${pair.symbol} (${pair.timeframe})`;
  const worldKey =
    raw?.worldKey ??
    (raw?.strategyId && pair.symbol && pair.timeframe
      ? `${pair.symbol}:${pair.timeframe}:${raw.strategyId}`
      : label);
  return {
    worldKey,
    strategyId: raw?.strategyId ?? '',
    symbol: pair.symbol,
    timeframe: pair.timeframe,
    label,
    strategyName: raw?.strategyName ?? raw?.name,
    source: raw?.source,
    isBuiltIn: raw?.isBuiltIn,
    metrics: raw?.metrics ?? {},
    pair: { symbol: pair.symbol, timeframe: pair.timeframe },
  };
}

function normalizeResult(raw: any): AutoSelectResultV2 {
  if (!raw) {
    return {
      blocked: false,
      worlds: [],
      positiveWorlds: [],
      ranking: [],
      best: null,
      positiveCount: 0,
      evaluatedCount: 0,
      failedCount: 0,
    };
  }

  // Detect V2 vs legacy by presence of `worlds`/`positiveWorlds`.
  let worlds: NormalizedWorld[];
  if (Array.isArray(raw.worlds) && raw.worlds.length > 0) {
    worlds = (raw.worlds as any[]).map((w) => normalizeWorldEntry(w, w?.worldKey ?? w?.label));
  } else if (Array.isArray(raw.ranking) && raw.ranking.length > 0) {
    // Legacy ranking: { pair, label, metrics }
    worlds = (raw.ranking as any[]).map((w, i) => normalizeWorldEntry(w, `legacy-${i}`));
  } else if (raw.best) {
    worlds = [normalizeWorldEntry(raw.best, 'best')];
  } else {
    worlds = [];
  }

  const positiveWorlds = worlds.filter((w) => pnlOf(w.metrics) > 0);
  const ranking = [...worlds].sort((a, b) => pnlOf(b.metrics) - pnlOf(a.metrics));
  const best: NormalizedWorld | null =
    positiveWorlds[0] ?? worlds[0] ?? null;

  const blocked: boolean =
    typeof raw.blocked === 'boolean'
      ? raw.blocked
      : positiveWorlds.length === 0;

  return {
    blocked,
    worlds,
    positiveWorlds,
    ranking,
    best,
    positiveCount: positiveWorlds.length,
    evaluatedCount: typeof raw.evaluatedCount === 'number' ? raw.evaluatedCount : worlds.length,
    failedCount: typeof raw.failedCount === 'number' ? raw.failedCount : 0,
  };
}

function normalizeProgress(raw: any): AutoSelectProgressV2 {
  if (!raw) return null as unknown as AutoSelectProgressV2;
  return {
    current: raw.current ?? 0,
    total: raw.total ?? 0,
    concurrency: raw.concurrency,
    activeWorlds: raw.activeWorlds,
    statuses: raw.statuses ?? {},
    candleProgress: raw.candleProgress,
    ranking: raw.ranking,
    pair: raw.pair,
  };
}

export type AutoSelectProgress = AutoSelectProgressV2 | null;
export type AutoSelectResult = AutoSelectResultV2 | null;

interface AutoSelectMessage {
  channel: string;
  type: string;
  data: any;
}

export function useAutoSelectProgress() {
  const [progress, setProgress] = useState<AutoSelectProgress>(null);
  const [result, setResult] = useState<AutoSelectResult>(null);

  const handleMessage = useCallback((msg: AutoSelectMessage) => {
    if (msg.channel === 'bot:autoSelect') {
      if (msg.type === 'progress') {
        setProgress(normalizeProgress(msg.data));
        setResult(null);
      } else if (msg.type === 'complete') {
        setProgress(null);
        setResult(normalizeResult(msg.data));
      }
      // 'error' type is broadcast by the backend but intentionally not stored
      // here — consumers surface failure via missing result / their own retry.
    }
  }, []);

  const reset = useCallback(() => {
    setProgress(null);
    setResult(null);
  }, []);

  return { progress, result, handleMessage, reset };
}
