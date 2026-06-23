import { useState, useCallback, useRef } from 'react';
import type {
  BacktestJobResponse,
  BacktestStatusResponse,
  BacktestResultResponse,
  BacktestConfig,
} from '../types';

export function useBacktest() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<BacktestStatusResponse['status'] | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BacktestResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const submitBacktest = useCallback(async (
    symbol: string,
    timeframe: string,
    config: Partial<BacktestConfig> & { script?: string },
    startDate?: string,
    endDate?: string,
  ) => {
    stopPolling();
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setStatus('queued');

    try {
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe, startDate, endDate, ...config }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Backtest submission failed: ${text.slice(0, 200)}`);
      }

      const data: BacktestJobResponse = await response.json();
      setJobId(data.job_id);
      setStatus('queued');

      pollRef.current = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/backtest/${data.job_id}`);
          if (!statusResponse.ok) {
            stopPolling();
            return;
          }

          const statusData: BacktestStatusResponse = await statusResponse.json();
          setStatus(statusData.status);
          setProgress(statusData.progress);

          if (statusData.status === 'completed') {
            stopPolling();

            const resultResponse = await fetch(`/api/backtest/${data.job_id}/result`);
            if (resultResponse.ok) {
              const resultData: BacktestResultResponse = await resultResponse.json();
              setResult(resultData);
            }
          } else if (statusData.status === 'failed') {
            stopPolling();
          }
        } catch {
          // continue polling
        }
      }, 500);
    } catch (err) {
      stopPolling();
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('failed');
    } finally {
      setLoading(false);
    }
  }, [stopPolling]);

  return {
    jobId,
    status,
    progress,
    result,
    error,
    loading,
    submitBacktest,
    reset: useCallback(() => {
      stopPolling();
      setJobId(null);
      setStatus(null);
      setProgress(0);
      setResult(null);
      setError(null);
    }, [stopPolling]),
  };
}
