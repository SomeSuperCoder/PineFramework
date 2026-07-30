import { useState, useCallback } from 'react';

export type AutoSelectProgress = {
  current: number;
  total: number;
  pair: { symbol: string; timeframe: string };
  phase: string;
  statuses: Record<string, { phase: string; status: 'pending' | 'active' | 'done' | 'failed' }>;
} | null;

export type AutoSelectResult = {
  best: { pair: { symbol: string; timeframe: string }; label: string; metrics: Record<string, number> };
  ranking: Array<{ pair: { symbol: string; timeframe: string }; label: string; metrics: Record<string, number> }>;
  evaluatedCount: number;
  failedCount: number;
} | null;

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
        setProgress(msg.data);
        setResult(null);
      } else if (msg.type === 'complete') {
        setProgress(null);
        setResult(msg.data);
      }
    }
  }, []);

  const reset = useCallback(() => {
    setProgress(null);
    setResult(null);
  }, []);

  return { progress, result, handleMessage, reset };
}
