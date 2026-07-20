import { parse, compile, ExecutionEngine, createSeries, fetchDexFeeBps, type Bar, type StrategyConfig } from 'pine-framework';
import type { SymbolResult, SymbolMetrics } from './types.js';

const BYBIT_REST_BASE = process.env.BYBIT_REST_URL || 'https://api.bybit.com';

function isJupiterMethod(method: unknown): method is 'jupiter_manual' | 'jupiter_ultra' {
  return method === 'jupiter_manual' || method === 'jupiter_ultra';
}

export async function runSymbolBacktest(
  script: string,
  symbol: string,
  timeframe: string,
  startDate?: number,
  endDate?: number,
  configOverride?: Partial<StrategyConfig>,
): Promise<SymbolResult> {
  try {
    const bars = await fetchBars(symbol, timeframe, startDate, endDate);
    if (bars.length === 0) {
      return { symbol, status: 'failed', error: 'No bar data available' };
    }

    // ── Live DEX fee fetch (Jupiter methods only) ──
    let effectiveConfig = configOverride ? { ...configOverride } : {};
    if (symbol && isJupiterMethod(effectiveConfig.commissionMethod)) {
      try {
        const { dexFeeBps, source, dexLabel } = await fetchDexFeeBps(symbol);
        const existingSettings = (effectiveConfig.commissionMethodSettings as Record<string, unknown>) ?? {};
        effectiveConfig = {
          ...effectiveConfig,
          commissionMethodSettings: {
            ...existingSettings,
            dexFeeBps,
          },
        };
        process.stderr.write(
          `  ℹ ${symbol}: using DEX fee ${dexFeeBps} bps (source: ${source})${dexLabel ? ' via ' + dexLabel : ''}\n`,
        );
      } catch (err) {
        process.stderr.write(
          `  ⚠ ${symbol}: failed to fetch live DEX fee — ${err instanceof Error ? err.message : String(err)}\n`,
        );
        throw err;
      }
    }

    const parseResult = parse(script);
    const compileResult = compile(parseResult.ast);
    if (compileResult.ir.scriptKind !== 'strategy') {
      return { symbol, status: 'failed', error: 'Script is not a strategy' };
    }

    const execEngine = new ExecutionEngine(
      compileResult,
      Object.keys(effectiveConfig).length > 0 ? effectiveConfig : undefined,
    );

    const contexts = bars.map((bar, i) => ({
      barIndex: i,
      barCount: bars.length,
      timestamp: bar.timestamp,
      open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
      high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
      low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
      close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
      volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
    }));

    const batchSize = 100;
    let execResult;
    for (let i = 0; i < contexts.length; i += batchSize) {
      const batch = contexts.slice(i, i + batchSize);
      execResult = execEngine.executeBars(batch);
      if (!execResult.success) {
        return { symbol, status: 'failed', error: execResult.error || 'Execution failed' };
      }
      if (i + batchSize < contexts.length) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    if (!execResult || !execResult.success) {
      return { symbol, status: 'failed', error: execResult?.error || 'Execution failed' };
    }

    const strategyEngine = execEngine.getStrategyEngine();
    if (!strategyEngine) {
      return { symbol, status: 'failed', error: 'Missing strategy engine' };
    }

    const metrics = strategyEngine.getMetrics();

    const buyHoldReturn = bars.length >= 2
      ? ((bars[bars.length - 1]!.close - bars[0]!.close) / bars[0]!.close) * 100
      : 0;

    const sanitize = (v: number) => (Number.isFinite(v) ? v : 0);

    const resultMetrics: SymbolMetrics = {
      netProfit: sanitize(metrics.totalPnl),
      netProfitPercent: sanitize(metrics.totalPnlPercent),
      profitFactor: sanitize(metrics.profitFactor),
      maxDrawdownPercent: sanitize(metrics.maxDrawdownPercent),
      winRate: sanitize(metrics.winRate),
      sharpeRatio: sanitize(metrics.sharpeRatio),
      totalTrades: metrics.totalTrades,
      buyHoldReturn: Math.round(buyHoldReturn * 100) / 100,
    };

    return { symbol, status: 'completed', metrics: resultMetrics };
  } catch (err) {
    return {
      symbol,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchBars(
  symbol: string,
  timeframe: string,
  startDate?: number,
  endDate?: number,
): Promise<Bar[]> {
  const bybitSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
  const limit = 1000;
  let allBars: Bar[] = [];
  let cursor: number | undefined;

  for (let attempt = 0; attempt < 200; attempt++) {
    let url = `${BYBIT_REST_BASE}/v5/market/kline?category=linear&symbol=${bybitSymbol}&interval=${timeframe}&limit=${limit}`;
    if (cursor) url += `&end=${cursor}`;

    const response = await fetch(url);
    if (!response.ok) break;

    const json = (await response.json()) as {
      retCode: number;
      result: { list: string[][] };
    };

    if (json.retCode !== 0) break;

    const raw = json.result.list;
    if (!raw || raw.length === 0) break;

    const bars: Bar[] = raw
      .map((row: string[]) => ({
        timestamp: parseInt(row[0], 10),
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
      }))
      .reverse();

    const filtered = bars.filter((b: Bar) => {
      if (startDate && b.timestamp < startDate) return false;
      if (endDate && b.timestamp > endDate) return false;
      return true;
    });

    allBars = allBars.concat(filtered);
    cursor = bars[0]!.timestamp;

    if (bars.length < limit) break;
    if (startDate && cursor <= startDate) break;
  }

  return allBars;
}
