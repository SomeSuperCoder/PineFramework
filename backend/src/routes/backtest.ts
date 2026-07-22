import { Router } from 'express';
import { fetchDexFeeBps, type StrategyConfig } from 'pine-framework';
import { randomUUID } from 'crypto';
import { fetchBars } from '../bybit/fetch-bars.js';
import type { DiskOHLCVCache } from '../cache/DiskOHLCVCache.js';
import { runBacktestPipeline, computeBacktestMetrics } from '../backtest-runner.js';
import { logger } from '../utils/logger.js';

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
      logger.info({ removed, remaining: jobs.size }, 'Swept old backtest jobs');
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
      logger.info({ jobId: job.jobId, symbol: job.symbol, scriptLen: (job.config.script as string)?.length || 0 }, 'Starting backtest');
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
      const configOverride: Partial<StrategyConfig> = {};
      const configFields: Array<keyof StrategyConfig> = [
        'initialCapital', 'commission', 'slippage',
        'commissionType', 'slippageType',
        'defaultQty', 'defaultQtyType',
        'pyramiding', 'marginLong', 'marginShort',
        'commissionMethod', 'commissionMethodSettings',
      ];
      for (const field of configFields) {
        const val = job.config[field];
        if (val !== undefined) {
          (configOverride as Record<string, unknown>)[field] = val;
        }
      }

      // ── Live DEX fee fetch (Jupiter methods only) ──
      const cm = configOverride.commissionMethod;
      if (job.symbol && (cm === 'jupiter_manual' || cm === 'jupiter_ultra')) {
        try {
          const { dexFeeBps } = await fetchDexFeeBps(job.symbol);
          const existingSettings = (configOverride.commissionMethodSettings as Record<string, unknown>) ?? {};
          configOverride.commissionMethodSettings = { ...existingSettings, dexFeeBps };
          logger.info({ jobId: job.jobId, symbol: job.symbol, dexFeeBps }, 'DEX fee fetched');
        } catch (err) {
          logger.error({ jobId: job.jobId, symbol: job.symbol, err }, 'Failed to fetch DEX fee');
          throw err;
        }
      }

      setPhase(job.jobId, 'Executing bars');
      const pipelineResult = runBacktestPipeline({
        script,
        bars,
        configOverride: Object.keys(configOverride).length > 0 ? configOverride : undefined,
      });

      if (!pipelineResult.success) {
        throw new Error(pipelineResult.error || 'Execution failed');
      }

      const execEngine = pipelineResult.engine!;
      logger.info({ jobId: job.jobId, success: true, markers: pipelineResult.execResult?.strategyMarkers?.length || 0 }, 'Backtest execution complete');

      updateProgress(job.jobId, 80);
      setPhase(job.jobId, 'Computing metrics');

      const metricsResult = computeBacktestMetrics(bars, execEngine);
      if (!metricsResult) {
        throw new Error('Script is not a strategy (missing strategy() declaration)');
      }

      const { trades, metrics, filledOrders, equityCurve, drawdownCurve, equityPoints, monthlyReturns, buyHoldReturn } = metricsResult;

      updateProgress(job.jobId, 90);
      setPhase(job.jobId, 'Building results');

      const sanitize = (v: number) => Number.isFinite(v) ? v : (v === Infinity ? null : 0);

      logger.info({ jobId: job.jobId, totalTrades: metrics.totalTrades, totalPnl: metrics.totalPnl, winRate: metrics.winRate, profitFactor: metrics.profitFactor }, 'Backtest metrics computed');

      job.result = {
        metrics: {
          totalTrades: metrics.totalTrades,
          winningTrades: metrics.winningTrades,
          losingTrades: metrics.losingTrades,
          winRate: metrics.winRate,
          profitFactor: sanitize(metrics.profitFactor),
          totalPnl: metrics.totalPnl,
          totalPnlPercent: metrics.totalPnlPercent,
          maxDrawdown: metrics.maxDrawdown,
          maxDrawdownPercent: metrics.maxDrawdownPercent,
          sharpeRatio: sanitize(metrics.sharpeRatio),
          sortinoRatio: sanitize(metrics.sortinoRatio),
          averageWin: metrics.averageWin,
          averageLoss: metrics.averageLoss,
          largestWin: metrics.largestWin,
          largestLoss: metrics.largestLoss,
          averageTradeDuration: metrics.averageTradeDuration,
          commission: metrics.commission,
        },
        equityCurve,
        drawdownCurve,
        trades: trades.map((t) => ({
          id: t.id,
          direction: t.direction,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          entryTime: t.entryTime,
          exitTime: t.exitTime,
          quantity: t.quantity,
          pnl: t.pnl,
          pnlPercent: t.pnlPercent,
          commission: t.commission,
          entryName: t.entryName,
          exitName: t.exitName,
          mae: t.mae,
          mfe: t.mfe,
          barsHeld: t.barsHeld,
        })),
        orders: filledOrders.map((o) => ({
          id: o.id,
          direction: o.direction,
          action: o.action,
          type: o.type,
          quantity: o.quantity,
          price: o.price,
          fillPrice: o.fillPrice,
          fillTime: o.fillTime,
          entryName: o.entryName,
          commission: o.commission,
        })),
        equityPoints,
        monthlyReturns,
        buyHoldReturn: Math.round(buyHoldReturn * 100) / 100,
      };

      job.status = 'completed';
      job.progress = 100;
      job.completedAt = Date.now();
    } catch (err) {
      job.status = 'failed';
      // Sanitize error messages to prevent leaking internal URLs, hostnames,
      // or environment configuration in API responses.
      const rawMessage = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: job.jobId, error: rawMessage }, 'Backtest failed');
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



