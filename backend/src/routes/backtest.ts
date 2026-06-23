import { Router } from 'express';
import { parse, compile, ExecutionEngine, createSeries, type Bar } from 'pine-framework';
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
      const bars = await fetchBars(job.symbol, job.timeframe,
        job.startDate ? new Date(job.startDate).getTime() : undefined,
        job.endDate ? new Date(job.endDate).getTime() : undefined,
      );
      updateProgress(job.jobId, 10);

      if (bars.length === 0) {
        throw new Error('No bar data available for the specified symbol and timeframe');
      }

      const script = job.config.script as string | undefined;

      if (!script) {
        throw new Error('No Pine Script source provided. Set "script" in the request body.');
      }

      const parseResult = parse(script);
      const compileResult = compile(parseResult.ast);

      const execEngine = new ExecutionEngine(compileResult);

      const contexts = bars.map((bar, i) => ({
        barIndex: i,
        barCount: bars.length,
        timestamp: bar.timestamp,
        open: createSeries('open', [bar.open]),
        high: createSeries('high', [bar.high]),
        low: createSeries('low', [bar.low]),
        close: createSeries('close', [bar.close]),
        volume: createSeries('volume', [bar.volume]),
      }));

      updateProgress(job.jobId, 20);

      execEngine.executeBars(contexts);

      updateProgress(job.jobId, 80);

      const strategyEngine = execEngine.getStrategyEngine();

      if (!strategyEngine) {
        throw new Error('Script is not a strategy (missing strategy() declaration)');
      }

      const trades = strategyEngine.getTrades();
      const metrics = strategyEngine.getMetrics();
      const filledOrders = strategyEngine.getFilledOrders();

      const initialCapital = strategyEngine.getConfig().initialCapital;
      const equityCurve = buildEquityCurve(initialCapital, trades);
      const drawdownCurve = buildDrawdownCurve(equityCurve);
      const equityPoints = buildEquityPoints(bars, equityCurve, drawdownCurve);
      const monthlyReturns = computeMonthlyReturns(equityPoints);
      const buyHoldReturn = bars.length >= 2
        ? ((bars[bars.length - 1]!.close - bars[0]!.close) / bars[0]!.close) * 100
        : 0;

      updateProgress(job.jobId, 90);

      job.result = {
        metrics: {
          totalTrades: metrics.totalTrades,
          winningTrades: metrics.winningTrades,
          losingTrades: metrics.losingTrades,
          winRate: metrics.winRate,
          profitFactor: metrics.profitFactor,
          totalPnl: metrics.totalPnl,
          totalPnlPercent: metrics.totalPnlPercent,
          maxDrawdown: metrics.maxDrawdown,
          maxDrawdownPercent: metrics.maxDrawdownPercent,
          sharpeRatio: metrics.sharpeRatio,
          sortinoRatio: metrics.sortinoRatio,
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
      job.error = err instanceof Error ? err.message : String(err);
      job.completedAt = Date.now();
    }
  }

  router.post('/backtest', async (req, res) => {
    try {
      const { symbol, timeframe, script, startDate, endDate, ...config } = req.body as Record<string, unknown>;

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

function buildEquityCurve(initialCapital: number, trades: Array<{ pnl: number }>): number[] {
  const curve: number[] = [initialCapital];
  let equity = initialCapital;
  for (const trade of trades) {
    equity += trade.pnl;
    curve.push(equity);
  }
  return curve;
}

function buildDrawdownCurve(equityCurve: number[]): number[] {
  const curve: number[] = [];
  let peak = -Infinity;
  for (const eq of equityCurve) {
    if (eq > peak) peak = eq;
    curve.push(peak - eq);
  }
  return curve;
}

function buildEquityPoints(
  bars: Array<{ timestamp: number }>,
  equityCurve: number[],
  drawdownCurve: number[],
): Array<{ time: number; equity: number; drawdown: number; balance: number }> {
  const points: Array<{ time: number; equity: number; drawdown: number; balance: number }> = [];
  const len = Math.min(bars.length, equityCurve.length);
  for (let i = 0; i < len; i++) {
    points.push({
      time: bars[i]!.timestamp,
      equity: equityCurve[i] ?? 0,
      drawdown: drawdownCurve[i] ?? 0,
      balance: equityCurve[i] ?? 0,
    });
  }
  return points;
}

function computeMonthlyReturns(
  points: Array<{ time: number; equity: number }>,
): Record<string, number> {
  const monthly: Record<string, number> = {};
  if (points.length < 2) return monthly;
  let prevMonthEquity = points[0]!.equity;
  for (const point of points) {
    const date = new Date(point.time);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthly[key]) {
      monthly[key] = prevMonthEquity > 0
        ? Math.round(((point.equity - prevMonthEquity) / prevMonthEquity) * 10000) / 100
        : 0;
      prevMonthEquity = point.equity;
    }
  }
  return monthly;
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
