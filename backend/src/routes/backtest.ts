import { Router } from 'express';
import { BacktestEngine, type StrategyEngine, type Bar, type BacktestConfig } from 'pine-framework';
import { randomUUID } from 'crypto';

const BYBIT_REST_BASE = process.env.BYBIT_REST_URL || 'https://api.bybit.com';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface BacktestJob {
  jobId: string;
  status: JobStatus;
  progress: number;
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

export function createBacktestRouter() {
  const router = Router();
  const jobs = new Map<string, BacktestJob>();

  function updateProgress(jobId: string, progress: number): void {
    const job = jobs.get(jobId);
    if (job) {
      job.progress = progress;
    }
  }

  async function runBacktest(job: BacktestJob): Promise<void> {
    try {
      const config: Partial<BacktestConfig> = {
        initialCapital: (job.config.initialCapital as number) ?? 10000,
        commission: (job.config.commission as number) ?? 0,
        slippage: (job.config.slippage as number) ?? 0,
        commissionType: (job.config.commissionType as BacktestConfig['commissionType']) ?? 'percent',
        slippageType: (job.config.slippageType as BacktestConfig['slippageType']) ?? 'ticks',
        defaultQty: (job.config.defaultQty as number) ?? 1,
        pyramiding: (job.config.pyramiding as number) ?? 0,
        startDate: job.startDate ? new Date(job.startDate).getTime() : undefined,
        endDate: job.endDate ? new Date(job.endDate).getTime() : undefined,
        barMagnifier: job.config.barMagnifier as string | undefined,
      };

      const bars = await fetchBars(job.symbol, job.timeframe, config.startDate, config.endDate);
      updateProgress(job.jobId, 10);

      if (bars.length === 0) {
        throw new Error('No bar data available for the specified symbol and timeframe');
      }

      const engine = new BacktestEngine(config);

      const result = engine.run(bars, (_eng: StrategyEngine, _bar: Bar, _index: number) => {
        // In a full implementation, this would execute the compiled Pine Script strategy
        // For now, the strategyFn is a no-op placeholder
        // The strategy logic would be injected via the strategyFn callback
      });

      updateProgress(job.jobId, 90);

      job.result = {
        metrics: {
          totalTrades: result.metrics.totalTrades,
          winningTrades: result.metrics.winningTrades,
          losingTrades: result.metrics.losingTrades,
          winRate: result.metrics.winRate,
          profitFactor: result.metrics.profitFactor,
          totalPnl: result.metrics.totalPnl,
          totalPnlPercent: result.metrics.totalPnlPercent,
          maxDrawdown: result.metrics.maxDrawdown,
          maxDrawdownPercent: result.metrics.maxDrawdownPercent,
          sharpeRatio: result.metrics.sharpeRatio,
          sortinoRatio: result.metrics.sortinoRatio,
          averageWin: result.metrics.averageWin,
          averageLoss: result.metrics.averageLoss,
          largestWin: result.metrics.largestWin,
          largestLoss: result.metrics.largestLoss,
          averageTradeDuration: result.metrics.averageTradeDuration,
          commission: result.metrics.commission,
        },
        equityCurve: result.equityCurve,
        drawdownCurve: result.drawdownCurve,
        trades: result.trades.map((t) => ({
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
        orders: result.filledOrders.map((o) => ({
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
        equityPoints: result.equityPoints,
        monthlyReturns: result.monthlyReturns,
        buyHoldReturn: result.buyHoldReturn,
      };

      job.status = 'completed';
      job.progress = 100;
      job.completedAt = Date.now();
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      job.completedAt = Date.now();
    }
  }

  router.post('/backtest', async (req, res) => {
    try {
      const { symbol, timeframe, startDate, endDate, ...config } = req.body as Record<string, unknown>;

      if (!symbol || typeof symbol !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "symbol" field' });
        return;
      }
      if (!timeframe || typeof timeframe !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "timeframe" field' });
        return;
      }

      const jobId = randomUUID();
      const job: BacktestJob = {
        jobId,
        status: 'queued',
        progress: 0,
        symbol,
        timeframe,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        config: config as Record<string, unknown>,
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

    res.json(job.result);
  });

  return router;
}

async function fetchBars(
  symbol: string,
  timeframe: string,
  startDate?: number,
  endDate?: number,
): Promise<Bar[]> {
  const bybitSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
  const limit = 200;
  let allBars: Bar[] = [];
  let cursor: number | undefined;

  for (let attempt = 0; attempt < 10; attempt++) {
    let url = `${BYBIT_REST_BASE}/v5/market/kline?category=linear&symbol=${bybitSymbol}&interval=${timeframe}&limit=${limit}`;
    if (cursor) url += `&end=${cursor}`;

    const response = await fetch(url);
    if (!response.ok) break;

    const json = await response.json() as {
      retCode: number;
      result: { list: string[][] };
    };

    if (json.retCode !== 0) break;

    const raw = json.result.list;
    if (!raw || raw.length === 0) break;

    const bars: Bar[] = raw.map((row: string[]) => ({
      timestamp: parseInt(row[0], 10),
      open: parseFloat(row[1]),
      high: parseFloat(row[2]),
      low: parseFloat(row[3]),
      close: parseFloat(row[4]),
      volume: parseFloat(row[5]),
    })).reverse();

    const filtered = bars.filter((b: Bar) => {
      if (startDate && b.timestamp < startDate) return false;
      if (endDate && b.timestamp > endDate) return false;
      return true;
    });

    allBars = allBars.concat(filtered);
    cursor = parseInt(raw[0][0], 10);
    if (bars.length < limit) break;
  }

  return allBars;
}
