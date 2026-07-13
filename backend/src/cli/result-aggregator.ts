import type { SymbolResult, BacktestOutput } from './types.js';

export function aggregateResults(
  scriptPath: string,
  timeframe: string,
  symbols: SymbolResult[],
  dateRange: { start: string; end: string },
): BacktestOutput {
  const successful = symbols.filter((s) => s.status === 'completed' && s.metrics);
  const failed = symbols.filter((s) => s.status === 'failed');

  if (successful.length === 0) {
    return {
      script: scriptPath,
      timeframe,
      dateRange,
      symbols,
      crossPairSummary: {
        avgNetProfitPercent: 0,
        medianProfitFactor: 0,
        coefficientOfVariation: 0,
        overfittingRisk: 'HIGH',
        bestPair: '',
        worstPair: '',
        successfulSymbols: 0,
        failedSymbols: failed.length,
      },
    };
  }

  const metricsList = successful.map((s) => s.metrics!);

  const profits = metricsList.map((m) => m.netProfitPercent);
  const avgProfit = mean(profits);
  const medianPF = median(metricsList.map((m) => m.profitFactor));
  const cv = coefficientOfVariation(profits);

  const bestIdx = argMax(profits);
  const worstIdx = argMin(profits);

  return {
    script: scriptPath,
    timeframe,
    dateRange,
    symbols,
    crossPairSummary: {
      avgNetProfitPercent: round2(avgProfit),
      medianProfitFactor: round2(medianPF),
      coefficientOfVariation: round2(cv),
      overfittingRisk: cvToRisk(cv),
      bestPair: successful[bestIdx]!.symbol,
      worstPair: successful[worstIdx]!.symbol,
      successfulSymbols: successful.length,
      failedSymbols: failed.length,
    },
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function standardDeviation(values: number[]): number {
  const avg = mean(values);
  const squareDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(mean(squareDiffs));
}

function coefficientOfVariation(values: number[]): number {
  const avg = mean(values);
  if (avg === 0) return 0;
  return standardDeviation(values) / Math.abs(avg);
}

function cvToRisk(cv: number): 'LOW' | 'MODERATE' | 'HIGH' {
  if (cv < 0.5) return 'LOW';
  if (cv < 1.5) return 'MODERATE';
  return 'HIGH';
}

function argMax(values: number[]): number {
  let maxIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[maxIdx]!) maxIdx = i;
  }
  return maxIdx;
}

function argMin(values: number[]): number {
  let minIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! < values[minIdx]!) minIdx = i;
  }
  return minIdx;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
