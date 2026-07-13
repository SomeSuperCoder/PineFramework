import { writeFileSync } from 'fs';
import type { BacktestOutput } from './types.js';

export function printSummaryTable(output: BacktestOutput): void {
  const { crossPairSummary: cs } = output;

  const lines: string[] = [];
  const sep = '═'.repeat(70);
  const thinSep = '─'.repeat(70);

  lines.push('');
  lines.push(sep);
  lines.push(
    `  Backtest Results: ${output.script} (${output.timeframe}, ${output.dateRange.start} to ${output.dateRange.end})`,
  );
  lines.push(sep);
  lines.push(
    padRight('  Symbol', 14) +
      padRight('Net PnL%', 12) +
      padRight('PF', 8) +
      padRight('MaxDD%', 10) +
      padRight('WinRate', 10) +
      padRight('Trades', 8) +
      padRight('Sharpe', 8),
  );
  lines.push('  ' + thinSep);

  for (const s of output.symbols) {
    if (s.status === 'completed' && s.metrics) {
      const m = s.metrics;
      const pnlStr = `${m.netProfitPercent >= 0 ? '+' : ''}${m.netProfitPercent.toFixed(2)}%`;
      lines.push(
        padRight(`  ${s.symbol}`, 14) +
          padRight(pnlStr, 12) +
          padRight(m.profitFactor.toFixed(2), 8) +
          padRight(`${m.maxDrawdownPercent.toFixed(2)}%`, 10) +
          padRight(`${m.winRate.toFixed(1)}%`, 10) +
          padRight(String(m.totalTrades), 8) +
          padRight(m.sharpeRatio.toFixed(2), 8),
      );
    } else {
      lines.push(
        padRight(`  ${s.symbol}`, 14) +
          padRight('FAILED', 12) +
          padRight('-', 8) +
          padRight('-', 10) +
          padRight('-', 10) +
          padRight('-', 8) +
          padRight('-', 8),
      );
    }
  }

  lines.push('  ' + thinSep);

  if (cs.successfulSymbols > 0) {
    lines.push(
      padRight('  Average', 14) +
        padRight(`${cs.avgNetProfitPercent >= 0 ? '+' : ''}${cs.avgNetProfitPercent.toFixed(2)}%`, 12) +
        padRight(cs.medianProfitFactor.toFixed(2), 8),
    );
    lines.push(
      `  CV of PnL: ${cs.coefficientOfVariation.toFixed(2)}  |  Overfitting Risk: ${cs.overfittingRisk}`,
    );
    lines.push(
      `  Best: ${cs.bestPair}  |  Worst: ${cs.worstPair}`,
    );
  }

  if (cs.failedSymbols > 0) {
    lines.push(`  ${cs.failedSymbols} symbol(s) failed`);
  }

  lines.push(sep);
  lines.push('');

  process.stdout.write(lines.join('\n'));
}

export function writeJsonOutput(output: BacktestOutput, outputPath: string): void {
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
}

function padRight(str: string, len: number): string {
  if (str.length >= len) return str;
  return str + ' '.repeat(len - str.length);
}
