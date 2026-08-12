import { Router } from 'express';
import { fetchDexFeeBps, type FeeFetchResult } from 'pine-framework/strategy/jupiter-fee-fetcher';
import { randomUUID } from 'crypto';
import { fetchBars } from '../bybit/fetch-bars.js';
import type { DiskOHLCVCache } from '../cache/DiskOHLCVCache.js';
import { runBacktestPipeline } from '../backtest-runner.js';
import { buildBacktestConfigOverride, applyDexFee, type BacktestConfigInput } from '../backtest-config.js';
import { toOutcome, toApiResult } from '../backtest-result.js';
import { logger } from '../utils/logger.js';
import { fetchSolPriceUsd } from '../services/sol-price-fetcher.js';
import { ipRateLimiter } from '../utils/ip-rate-limiter.js';

/** Completed/failed backtest jobs older than this (ms) are eligible for garbage collection. */
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // sweep every 5 minutes

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface BacktestJob {
  jobId: string;
  status: JobStatus;
  progress: number;
  phase: string;
  symbol: string;
  timeframe: string;
  startDate?: string;
  endDate?: string;
  config: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export function createBacktestRouter(diskCache?: DiskOHLCVCache) {
  const router = Router();
  const jobs = new Map<string, BacktestJob>();

  function updateProgress(jobId: string, progress: number): void {
    const job = jobs.get(jobId);
    if (job) {
      job.progress = progress;
    }
  }

  function setPhase(jobId: string, phase: string): void {
    const job = jobs.get(jobId);
    if (job) {
      job.phase = phase;
    }
  }

  /**
   * Remove completed/failed jobs that are older than JOB_TTL_MS.
   * Returns the number of removed jobs.
   */
  function sweepOldJobs(): number {
    const cutoff = Date.now() - JOB_TTL_MS;
    let removed = 0;
    for (const [id, job] of jobs) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt != null &&
        job.completedAt < cutoff
      ) {
        jobs.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      logger.info('Swept old backtest jobs', { removed, remaining: jobs.size });
    }
    return removed;
  }

  // Periodic sweep to prevent unbounded memory growth
  const sweepTimer = setInterval(sweepOldJobs, SWEEP_INTERVAL_MS);
  // Don't prevent process exit
  if (sweepTimer.unref) sweepTimer.unref();

  async function runBacktest(job: BacktestJob): Promise<void> {
    try {
      job.status = 'running';
      setPhase(job.jobId, 'Fetching market data');
      logger.info('Starting backtest', { jobId: job.jobId, symbol: job.symbol, scriptLen: (job.config.script as string)?.length || 0 });
      const bars = await fetchBars(job.symbol, job.timeframe,
        job.startDate ? new Date(job.startDate).getTime() : undefined,
        job.endDate ? new Date(job.endDate).getTime() : undefined,
        (p) => updateProgress(job.jobId, p),
        diskCache,
      );
      updateProgress(job.jobId, 20);

      if (bars.length === 0) {
        throw new Error('No bar data available for the specified symbol and timeframe');
      }

      const script = job.config.script as string | undefined;
      if (!script) {
        throw new Error('No Pine Script source provided. Set "script" in the request body.');
      }

      setPhase(job.jobId, 'Compiling script');

      // Build config override from job config
      const baseOverride = buildBacktestConfigOverride(job.config as BacktestConfigInput);

      // ── Live DEX fee fetch (Jupiter methods only) ──
      const override = await applyDexFee(job.symbol, baseOverride, { onFailure: 'throw' });

      setPhase(job.jobId, 'Executing bars');
      const pipelineResult = runBacktestPipeline({
        script,
        bars,
        configOverride: Object.keys(override).length > 0 ? override : undefined,
      });

      if (!pipelineResult.success) {
        const msg = pipelineResult.error ?? 'Execution failed';
        throw new Error(msg);
      }

      const execEngine = pipelineResult.engine!;
      logger.info('Backtest execution complete', { jobId: job.jobId, success: true, markers: pipelineResult.execResult?.strategyMarkers?.length || 0 });

      updateProgress(job.jobId, 80);
      setPhase(job.jobId, 'Computing metrics');

      const outcome = toOutcome(bars, execEngine);
      if (!outcome) {
        throw new Error('Script is not a strategy (missing strategy() declaration)');
      }

      updateProgress(job.jobId, 90);
      setPhase(job.jobId, 'Building results');

      logger.info('Backtest metrics computed', { jobId: job.jobId, totalTrades: outcome.metrics.totalTrades, totalPnl: outcome.metrics.totalPnl, winRate: outcome.metrics.winRate, profitFactor: outcome.metrics.profitFactor });

      job.result = toApiResult(outcome);

      job.status = 'completed';
      job.progress = 100;
      job.completedAt = Date.now();
    } catch (err) {
      job.status = 'failed';
      // Sanitize error messages to prevent leaking internal URLs, hostnames,
      // or environment configuration in API responses.
      const rawMessage = err instanceof Error ? err.message : String(err);
      logger.error('Backtest failed', { jobId: job.jobId, error: rawMessage });
      // Strip anything that looks like a URL or hostname from the user-facing error
      job.error = rawMessage.replace(/https?:\/\/[^\s]+/g, '[redacted-url]')
        .replace(/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?/g, '[redacted-host]');
      job.completedAt = Date.now();
    }
  }

  router.post('/backtest', async (req, res) => {
    try {
      const { symbol, timeframe, script, startDate, endDate, days_back, ...config } = req.body as Record<string, unknown>;
      console.log('[backtest] POST received: symbol=%s, timeframe=%s, script length=%d, days_back=%s', symbol, timeframe, typeof script === 'string' ? script.length : 0, days_back);

      if (!symbol || typeof symbol !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "symbol" field' });
        return;
      }
      if (!timeframe || typeof timeframe !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "timeframe" field' });
        return;
      }
      // Validate script at request time so a missing/empty/non-string script
      // gets an immediate 400 instead of failing the async job later.
      // (runBacktest keeps its own async guard for non-HTTP callers — defense-in-depth.)
      if (!script || typeof script !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "script" field' });
        return;
      }

      let effectiveStartDate = startDate as string | undefined;
      let effectiveEndDate = endDate as string | undefined;

      if (days_back && typeof days_back === 'number' && days_back > 0) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days_back);
        effectiveStartDate = start.toISOString().split('T')[0];
        effectiveEndDate = end.toISOString().split('T')[0];
      }

      const jobId = randomUUID();
      const job: BacktestJob = {
        jobId,
        status: 'queued',
        progress: 0,
        phase: 'Queued',
        symbol,
        timeframe,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        config: { ...config, script } as Record<string, unknown>,
        createdAt: Date.now(),
      };

      jobs.set(jobId, job);

      runBacktest(job).catch((err) => {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        job.completedAt = Date.now();
      });

      res.json({ job_id: jobId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/backtest/dex-fee?symbol=SOL
   *
   * Live DEX fee + optional SOL/USD price for the frontend sample-fees panel.
   * Implements openspec/changes/renovate-backtest-panel/api-contract.md verbatim:
   * 200 { dexFeeBps, source, dexLabel?, solPriceUsd? } | 400 VALIDATION_ERROR |
   * 400 UNSUPPORTED_SYMBOL | 503 UPSTREAM_UNAVAILABLE | 429 RATE_LIMITED.
   *
   * Registered BEFORE /backtest/:jobId so the static path wins over the param
   * route — otherwise "dex-fee" would be captured as a jobId and this endpoint
   * would 404, breaking the frontend's feature-gate probe (contract §5).
   */
  router.get(
    '/backtest/dex-fee',
    ipRateLimiter({ max: 30, windowMs: 60_000 }),
    async (req, res) => {
      try {
        const rawSymbol = req.query.symbol;
        // Non-string (e.g. repeated ?symbol=a&symbol=b) or empty-after-trim → validation error.
        if (typeof rawSymbol !== 'string' || rawSymbol.trim() === '') {
          res.status(400).json({ error: 'Missing or invalid "symbol" query parameter', code: 'VALIDATION_ERROR' });
          return;
        }
        const symbol = rawSymbol.trim().toUpperCase();

        let fee: FeeFetchResult;
        try {
          fee = await fetchDexFeeBps(symbol);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Classify by the fetcher's own error message, never by matching input
          // (contract §4: identify via its error type/message).
          if (message.includes('not mapped to Solana mints')) {
            res.status(400).json({ error: `Symbol ${symbol} is not mapped to a Jupiter mint`, code: 'UNSUPPORTED_SYMBOL' });
          } else {
            logger.warn('DEX fee upstream unavailable', { symbol, err });
            res.status(503).json({ error: 'DEX fee data temporarily unavailable, try again later', code: 'UPSTREAM_UNAVAILABLE' });
          }
          return;
        }

        const body: FeeFetchResult & { solPriceUsd?: number } = {
          dexFeeBps: fee.dexFeeBps,
          source: fee.source,
        };
        if (fee.dexLabel !== undefined) body.dexLabel = fee.dexLabel;
        // SOL price is non-blocking — never fail the request for it (contract §3).
        const solPriceUsd = await fetchSolPriceUsd();
        if (solPriceUsd !== null) body.solPriceUsd = solPriceUsd;

        res.json(body);
      } catch (err) {
        // Genuine programmer bug — reuse the route file's sanitized 500 fallback.
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error('DEX fee route error', { err });
        res.status(500).json({ error: message });
      }
    },
  );

  router.get('/backtest/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({
      status: job.status,
      progress: job.progress,
      phase: job.phase,
      error: job.error,
      result_url: job.status === 'completed' ? `/api/backtest/${jobId}/result` : undefined,
    });
  });

  router.get('/backtest/:jobId/result', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status !== 'completed') {
      res.status(400).json({ error: `Job is ${job.status}, not completed` });
      return;
    }

    console.log('[backtest] Result requested for jobId=%s, hasResult=%o, metrics=%o', jobId, !!job.result, job.result?.metrics ? Object.fromEntries(Object.entries(job.result.metrics).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v])) : null);
    res.json(job.result);
  });

  return router;
}



