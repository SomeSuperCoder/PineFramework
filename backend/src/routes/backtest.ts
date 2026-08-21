import { Router } from 'express';
import { fetchDexFeeBps, type FeeFetchResult } from 'pine-framework/strategy/jupiter-fee-fetcher';
import { randomUUID } from 'crypto';
import { resolve } from 'node:path';
import {
  VERSION,
  buildBacktestExport,
  scriptHash,
  type BacktestExport,
  WarningCollector,
} from 'pine-framework';
import { writeExportFile, sanitizeExportErrorMessage } from '../backtest-export.js';
import { fetchBars } from '../bybit/fetch-bars.js';
import type { DiskOHLCVCache } from '../cache/DiskOHLCVCache.js';
import { runBacktestPipeline } from '../backtest-runner.js';
import { buildBacktestConfigOverride, applyDexFee } from '../backtest-config.js';
import { normalizeExplicitOverride } from '../normalize-explicit-config.js';
import { resolveDateRange, toUtcDateString, type ResolvedDateRange } from '../backtest-dates.js';
import { toOutcome, toApiResult, buildDecisionWarnings } from '../backtest-result.js';
import type {
  BacktestApiResult,
  EffectiveBacktestConfig,
  ExplicitBacktestOverride,
} from '../backtest-contract.js';
import { logger } from '../utils/logger.js';
import { fetchSolPriceUsd } from '../services/sol-price-fetcher.js';
import { ipRateLimiter } from '../utils/ip-rate-limiter.js';
import { sanitizeUserMessage } from '../utils/sanitize.js';

/** Completed/failed backtest jobs older than this (ms) are eligible for garbage collection. */
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // sweep every 5 minutes

/**
 * Where HTTP-exported backtest files land (repo-root/.exports). Same resolution
 * the CLI's B4 fix landed (backend/src/cli/backtest-cli.ts): import.meta.dirname
 * up 3 levels from backend/src/routes (or backend/dist/routes in the built
 * output) is the repo root — invocation-dir independent. Requires Node >= 20.11.
 */
const EXPORTS_DIR = resolve(import.meta.dirname, '../../..', '.exports');

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
  /**
   * The NORMALIZED explicit override (contract ExplicitBacktestOverride) —
   * produced by normalizeExplicitOverride at request time (400 on ok:false),
   * stored here so runBacktest feeds the engine merge from the canonical shape
   * only. `config` above stays the RAW request for the export's `request` layer.
   */
  configOverride: ExplicitBacktestOverride;
  /** Resolved UTC-midnight date range (ms) for bar fetch + effectiveConfig. */
  dateRange?: ResolvedDateRange;
  /** The API result payload — the wire contract BacktestApiResult (never an
   *  arbitrary record). The GET /:jobId handler serializes it verbatim. */
  result?: BacktestApiResult;
  error?: string;
  /** Full-data export object, built at job completion (see runBacktest). */
  exportData?: BacktestExport;
  /** Non-fatal export build error — the backtest itself still completed. */
  exportError?: string;
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
      logger.info('Starting backtest', {
        jobId: job.jobId,
        symbol: job.symbol,
        scriptLen: (job.config.script as string)?.length || 0,
      });
      const bars = await fetchBars(
        job.symbol,
        job.timeframe,
        job.dateRange?.startDate,
        job.dateRange?.endDate,
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

      // ── Per-run WarningCollector (design D4) ──
      // One collector per run: the engine writes through its onWarning sink,
      // the composition root appends decision records (fee-decision) and
      // export-sink failures, and both the API result payload and the export
      // document serialize the SAME array — diagnostics never diverge.
      //
      // Created BEFORE the live-fee merge (reviewer F3a): applyDexFee emits its
      // fee records (live-fee-cache / live-fee-failure) through the sink, so
      // without the collector being wired first, API runs silently LOST the fee
      // diagnostics that CLI runs already produced.
      const collector = new WarningCollector();

      // Build config override from the NORMALIZED explicit override (the engine
      // merge at execution-engine.ts:456-475 stays the single defaults authority —
      // this only maps the canonical shape onto the engine's Partial<StrategyConfig>).
      const baseOverride = buildBacktestConfigOverride(job.configOverride);

      // ── Live DEX fee merge (Jupiter methods only) ──
      // POLICY (ruling B): a live-fee fetch failure THROWS — no fallback, no
      // invented fee. The job fails with the per-symbol wrapped error. The
      // fee-decision records (cache hit / fetch attempt) flow into the SAME
      // collector as the engine diagnostics — parity with the CLI runner
      // (symbol-runner.ts applies the fee with the collector's sink too).
      const override = await applyDexFee(job.symbol, baseOverride, collector.onWarning);

      setPhase(job.jobId, 'Executing bars');
      const pipelineResult = await runBacktestPipeline({
        script,
        bars,
        configOverride: Object.keys(override).length > 0 ? override : undefined,
        onWarning: collector.onWarning,
      });

      if (!pipelineResult.success) {
        const msg = pipelineResult.error ?? 'Execution failed';
        throw new Error(msg);
      }

      const execEngine = pipelineResult.engine!;
      logger.info('Backtest execution complete', {
        jobId: job.jobId,
        success: true,
        markers: pipelineResult.execResult?.strategyMarkers?.length || 0,
      });

      updateProgress(job.jobId, 80);
      setPhase(job.jobId, 'Computing metrics');

      const outcome = toOutcome(bars, execEngine);
      if (!outcome) {
        throw new Error('Script is not a strategy (missing strategy() declaration)');
      }

      updateProgress(job.jobId, 90);
      setPhase(job.jobId, 'Building results');

      logger.info('Backtest metrics computed', {
        jobId: job.jobId,
        totalTrades: outcome.metrics.totalTrades,
        totalPnl: outcome.metrics.totalPnl,
        winRate: outcome.metrics.winRate,
        profitFactor: outcome.metrics.profitFactor,
      });

      // ── Effective config (contract BacktestResultExtension) ──
      // The engine's post-merge config echoed back to the user — what actually
      // ran — plus the resolved UTC-midnight date range (ms, per contract).
      const strategyEngine = execEngine.getStrategyEngine();
      if (!strategyEngine) {
        throw new Error('Effective strategy config unavailable (missing strategy engine)');
      }
      const effectiveConfig: EffectiveBacktestConfig = {
        ...strategyEngine.getConfig(),
        ...(job.dateRange?.startDate !== undefined ? { startDate: job.dateRange.startDate } : {}),
        ...(job.dateRange?.endDate !== undefined ? { endDate: job.dateRange.endDate } : {}),
      };
      // Decision diagnostics (design D4): record which commission method ran
      // and with which effective settings — the engine's own diagnostics
      // (baselines, long-only suppressions) are already in the collector via
      // onWarning. job.result is assigned AFTER the export build below so
      // export-sink failures surface in the same warnings array.
      for (const w of buildDecisionWarnings(job.configOverride, effectiveConfig)) {
        collector.push(w);
      }

      // ── Full-data export (OpenSpec backtest-full-data-export, tasks 3.1/3.2) ──
      // Mirror the CLI sink's buildBacktestExport call (backend/src/cli/backtest-cli.ts):
      // same params layers, same engine surface — only `source` differs ('frontend').
      // The object is kept on the job (not stringified): the export route serializes
      // + writes on demand, avoiding a double stringify and keeping the job store lean.
      // A failing export NEVER fails the backtest — log + record exportError, then
      // still mark the job completed (mirrors the CLI sink's resilience).
      try {
        job.exportData = buildBacktestExport({
          runId: job.jobId,
          source: 'frontend',
          meta: {
            symbol: job.symbol,
            timeframe: job.timeframe,
            ...(job.dateRange?.startDate !== undefined
              ? { startDate: job.dateRange.startDate }
              : {}),
            ...(job.dateRange?.endDate !== undefined ? { endDate: job.dateRange.endDate } : {}),
            barCount: bars.length,
            engineVersion: VERSION,
            scriptHash: scriptHash(script),
          },
          params: {
            // The raw HTTP job config — what the user actually sent this job.
            request: job.config,
            // Post-applyDexFee override — records what was REALLY run, including
            // injected dexFeeBps/solPriceUsd (same layer the CLI sink records).
            configOverride: { ...override },
            // The engine's post-merge config + resolved date range (contract
            // EffectiveBacktestConfig) — the builder throws when unavailable.
            effectiveConfig: { ...effectiveConfig },
          },
          input: { bars },
          output: {
            series: execEngine.getAllOutputs(),
            barTimestamps: bars.map((b) => b.timestamp),
            strategyMarkers: execEngine.getStrategyMarkers(),
            equityCurve: outcome.equityCurve,
            drawdownCurve: outcome.drawdownCurve,
            equityPoints: outcome.equityPoints,
            // Export contract: numeric values MUST NOT be rounded. Use the raw
            // series when present; fall back to the rounded record with a warning
            // so the document stays honest (same fallback the CLI sink uses).
            monthlyReturns: outcome.monthlyReturnsRaw ?? outcome.monthlyReturns,
            buyHoldReturn: outcome.buyHoldReturn,
          },
          trades: outcome.trades,
          orders: outcome.filledOrders,
          metrics: outcome.metrics,
          // Design D4: the export's warnings are the SAME typed array as the
          // API result payload (engine + decision diagnostics). The old
          // stringly fallback is gone — toOutcome always provides the raw
          // series, so a rounded fallback would be a fidelity lie.
          warnings: collector.toArray(),
        });
      } catch (exportErr) {
        const exportMessage = exportErr instanceof Error ? exportErr.message : String(exportErr);
        logger.warn('Backtest export build failed; backtest still completed', {
          jobId: job.jobId,
          error: exportMessage,
        });
        job.exportError = exportMessage;
        // Export-sink failure (design D4): the backtest completed but the
        // developer record did not — surface it as a typed warning in the
        // result payload (the export document itself is absent).
        // Security S2: the warning payload is SANITIZED — build errors can
        // embed absolute paths; the raw message stays in the server log above.
        collector.push({
          type: 'export-failure',
          message: `Export build failed: ${sanitizeExportErrorMessage(exportErr)}`,
          context: { jobId: job.jobId },
        });
      }

      // ── Result payload (contract BacktestResultExtension) ──
      // Assigned AFTER the export build so export failures are collected first.
      job.result = toApiResult(outcome, {
        effectiveConfig,
        warnings: collector.toArray(),
        barCount: bars.length,
      });

      job.status = 'completed';
      job.progress = 100;
      job.completedAt = Date.now();
    } catch (err) {
      job.status = 'failed';
      // Sanitize error messages to prevent leaking internal URLs, hostnames,
      // or environment configuration in API responses.
      const rawMessage = err instanceof Error ? err.message : String(err);
      logger.error('Backtest failed', { jobId: job.jobId, error: rawMessage });
      // User-facing error via the shared sanitizer (utils/sanitize.ts — SSOT with
      // the Telegram seam). The raw message stays in the server log above.
      job.error = sanitizeUserMessage(rawMessage);
      job.completedAt = Date.now();
    }
  }

  router.post('/backtest', async (req, res) => {
    try {
      const { symbol, timeframe, script, startDate, endDate, days_back, ...config } =
        req.body as Record<string, unknown>;
      console.log(
        '[backtest] POST received: symbol=%s, timeframe=%s, script length=%d, days_back=%s',
        symbol,
        timeframe,
        typeof script === 'string' ? script.length : 0,
        days_back,
      );

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

      // ── Explicit-config normalization (contract D1) ──
      // The single authority for producer input. ok:false → 400 with the
      // normalizer's field-level errors; the run MUST NOT start. This rejects
      // legacy commission/commissionType/currency and UI-state keys loudly
      // (the frontend stops sending them in request-parity wave F1).
      const normalized = normalizeExplicitOverride(config);
      if (!normalized.ok) {
        res.status(400).json({
          error: 'Invalid backtest configuration',
          code: 'VALIDATION_ERROR',
          details: normalized.errors,
        });
        return;
      }

      // ── Date range (contract D6 — the SHARED UTC-midnight resolver) ─────────
      // startDate/endDate arrive as `unknown` from req.body — narrow them here;
      // the resolver only accepts YYYY-MM-DD strings (undefined = full range).
      // ok:false → 400 VALIDATION_ERROR with field-level details (mirrors the
      // normalizer's contract §3 envelope) — the run MUST NOT start.
      const startDateStr = startDate as string | undefined;
      const endDateStr = endDate as string | undefined;
      const daysBack = typeof days_back === 'number' && days_back > 0 ? days_back : undefined;
      const dateRange = resolveDateRange({
        startDate: startDateStr,
        endDate: endDateStr,
        daysBack,
      });
      if (!dateRange.ok) {
        res.status(400).json({
          error: 'Invalid backtest date range',
          code: 'VALIDATION_ERROR',
          details: dateRange.errors,
        });
        return;
      }
      const effectiveStartDate =
        dateRange.value.startDate !== undefined
          ? toUtcDateString(dateRange.value.startDate)
          : startDateStr;
      const effectiveEndDate =
        dateRange.value.endDate !== undefined
          ? toUtcDateString(dateRange.value.endDate)
          : endDateStr;

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
        configOverride: normalized.value,
        dateRange: dateRange.value,
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
          res.status(400).json({
            error: 'Missing or invalid "symbol" query parameter',
            code: 'VALIDATION_ERROR',
          });
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
            res.status(400).json({
              error: `Symbol ${symbol} is not mapped to a Jupiter mint`,
              code: 'UNSUPPORTED_SYMBOL',
            });
          } else {
            logger.warn('DEX fee upstream unavailable', { symbol, err });
            res.status(503).json({
              error: 'DEX fee data temporarily unavailable, try again later',
              code: 'UPSTREAM_UNAVAILABLE',
            });
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

  /**
   * POST /api/backtest/export  { job_id }
   *
   * Serialize + write the completed job's full-data export to .exports/ and
   * return the filename. Frozen contract (the frontend builds against it):
   *   200 { file } | 400 { error, code: 'VALIDATION_ERROR' | 'JOB_NOT_COMPLETED' }
   *   | 404 { error, code: 'JOB_NOT_FOUND' }
   * Registered before GET /backtest/:jobId — different method, but keep static
   * paths ahead of param routes for consistency with the dex-fee route.
   */
  router.post('/backtest/export', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      const rawJobId = body?.job_id;
      if (typeof rawJobId !== 'string' || rawJobId.trim() === '') {
        res
          .status(400)
          .json({ error: 'Missing or invalid "job_id" field', code: 'VALIDATION_ERROR' });
        return;
      }
      const jobId = rawJobId.trim();

      const job = jobs.get(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
        return;
      }

      // Export data only exists once the job completed successfully. A queued /
      // running / failed job, or a completed job whose export build failed
      // (exportError set), gets the same contract code.
      if (job.status !== 'completed' || !job.exportData) {
        res.status(400).json({
          error: 'Job is not completed or export data is no longer available',
          code: 'JOB_NOT_COMPLETED',
        });
        return;
      }

      // writeExportFile (backend glue) does mkdir + atomic write (temp file +
      // rename) and derives the filename from the export itself, so the file
      // name can never disagree with its contents.
      const filename = await writeExportFile(job.exportData, EXPORTS_DIR);
      logger.info('Backtest export written', { jobId, filename });
      res.json({ file: filename });
    } catch (err) {
      // Never leak internals: sanitize anything logged, return a fixed message.
      const rawMessage = err instanceof Error ? err.message : String(err);
      const sanitized = rawMessage
        .replace(/https?:\/\/[^\s]+/g, '[redacted-url]')
        .replace(/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?/g, '[redacted-host]');
      logger.error('Backtest export failed', { error: sanitized });
      res.status(500).json({ error: 'Export failed' });
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

    console.log(
      '[backtest] Result requested for jobId=%s, hasResult=%o, metrics=%o',
      jobId,
      !!job.result,
      job.result?.metrics
        ? Object.fromEntries(
            Object.entries(job.result.metrics).map(([k, v]) => [
              k,
              typeof v === 'number' ? Math.round(v * 100) / 100 : v,
            ]),
          )
        : null,
    );
    res.json(job.result);
  });

  return router;
}
