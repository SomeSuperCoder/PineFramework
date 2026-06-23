import type { BacktestConfig } from '../types';

export function extractStrategyParams(source: string): Partial<BacktestConfig> {
  const params: Partial<BacktestConfig> = {};

  const strategyMatch = source.match(/strategy\s*\(([\s\S]*?)\)/i);
  if (!strategyMatch) return params;

  const argsStr = strategyMatch[1] ?? '';

  const args = parseNamedArgs(argsStr);

  if (args.initial_capital !== undefined) {
    params.initialCapital = parseFloat(args.initial_capital);
  }
  if (args.commission_value !== undefined) {
    params.commission = parseFloat(args.commission_value);
  }
  if (args.slippage !== undefined) {
    params.slippage = parseFloat(args.slippage);
  }
  if (args.pyramiding !== undefined) {
    params.pyramiding = parseInt(args.pyramiding, 10);
  }
  if (args.default_qty_value !== undefined) {
    params.defaultQty = parseFloat(args.default_qty_value);
  }
  if (args.default_qty_type !== undefined) {
    const qt = args.default_qty_type.replace(/['"]/g, '').trim();
    if (qt === 'percent_of_equity') params.defaultQtyType = 'percent_of_equity';
    else if (qt === 'currency') params.defaultQtyType = 'cash';
    else params.defaultQtyType = 'contracts';
  }
  if (args.commission_type !== undefined) {
    const ct = args.commission_type.replace(/['"]/g, '').trim();
    if (ct === 'per_order') params.commissionType = 'per_order';
    else if (ct === 'per_contract') params.commissionType = 'per_contract';
    else if (ct === 'percent') params.commissionType = 'percent';
    else params.commissionType = 'fixed';
  }
  if (args.margin_long !== undefined) {
    const ml = parseFloat(args.margin_long);
    params.marginLong = ml > 1 ? ml / 100 : ml;
  }
  if (args.margin_short !== undefined) {
    const ms = parseFloat(args.margin_short);
    params.marginShort = ms > 1 ? ms / 100 : ms;
  }

  return params;
}

function parseNamedArgs(argsStr: string): Record<string, string> {
  const args: Record<string, string> = {};
  const exprRe = /(\w+)\s*=\s*((?:'[^']*'|"[^"]*"|[^,)]+))/g;
  let match: RegExpExecArray | null;
  while ((match = exprRe.exec(argsStr)) !== null) {
    const val = match[2]!.trim();
    if (val.length > 0) {
      args[match[1]!] = val;
    }
  }
  return args;
}
