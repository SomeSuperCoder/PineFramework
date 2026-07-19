export type ScriptType = 'indicator' | 'strategy' | 'library';

export type PineFormat = 'inherit' | 'price' | 'volume' | 'tick' | 'percent';

export type PineScale = 'inherit' | 'linear' | 'logarithmic';

export type DefaultQtyType = 'fixed' | 'percent_of_equity' | 'currency';

import type { CommissionType } from '../strategy/strategy-engine.js';

export type CloseEntriesRule = 'FIFO' | 'LIFO';

export interface IndicatorConfig {
  type: 'indicator';
  title: string;
  shorttitle?: string;
  overlay?: boolean;
  format?: PineFormat;
  precision?: number;
  scale?: PineScale;
  max_labels_count?: number;
  max_lines_count?: number;
  max_boxes_count?: number;
  max_polylines_count?: number;
  max_bars_back?: number;
  calc_on_every_tick?: boolean;
  max_lines_left?: number;
  max_labels_left?: number;
  max_boxes_left?: number;
  explicit_plot_zorder?: boolean;
}

export interface StrategyConfig {
  type: 'strategy';
  title: string;
  shorttitle?: string;
  overlay?: boolean;
  format?: PineFormat;
  precision?: number;
  scale?: PineScale;
  pyramiding?: number;
  calc_on_every_tick?: boolean;
  backtest_fill_limits_assumption?: number;
  default_qty_type?: DefaultQtyType;
  default_qty_value?: number;
  initial_capital?: number;
  commission_type?: CommissionType;
  commission_value?: number;
  slippage?: number;
  process_orders_on_close?: boolean;
  close_entries_rule?: CloseEntriesRule;
  margin_long?: number;
  margin_short?: number;
  max_boxes_count?: number;
  max_lines_count?: number;
  max_labels_count?: number;
  max_polylines_count?: number;
  risk_free_rate?: number;
}

export interface LibraryConfig {
  type: 'library';
  title: string;
  shorttitle?: string;
  overlay?: boolean;
  format?: PineFormat;
  precision?: number;
  scale?: PineScale;
  max_labels_count?: number;
  max_lines_count?: number;
  max_boxes_count?: number;
  max_polylines_count?: number;
}

export type ScriptConfig = IndicatorConfig | StrategyConfig | LibraryConfig;

export interface ScriptDeclaration {
  version: number;
  config: ScriptConfig;
}

const VALID_PINE_FORMATS: PineFormat[] = ['inherit', 'price', 'volume', 'tick', 'percent'];
const VALID_PINE_SCALES: PineScale[] = ['inherit', 'linear', 'logarithmic'];
const VALID_DEFAULT_QTY_TYPES: DefaultQtyType[] = ['fixed', 'percent_of_equity', 'currency'];
const VALID_COMMISSION_TYPES: CommissionType[] = ['percent', 'per_order', 'per_contract'];
const VALID_CLOSE_ENTRIES_RULES: CloseEntriesRule[] = ['FIFO', 'LIFO'];

export function parseVersionDirective(code: string): number | null {
  const match = code.match(/\/\/\s*@version\s*=\s*(\d+)/);
  if (match && match[1]) {
    const version = parseInt(match[1], 10);
    if (version >= 1 && version <= 6) {
      return version;
    }
  }
  return null;
}

export function parseIndicatorDeclaration(args: Record<string, unknown>): IndicatorConfig {
  const title = String(args.title ?? 'Indicator');
  const config: IndicatorConfig = {
    type: 'indicator',
    title,
  };

  if (args.shorttitle !== undefined) config.shorttitle = String(args.shorttitle);
  if (args.overlay !== undefined) config.overlay = Boolean(args.overlay);
  if (args.format !== undefined && VALID_PINE_FORMATS.includes(args.format as PineFormat)) {
    config.format = args.format as PineFormat;
  }
  if (args.precision !== undefined) config.precision = Number(args.precision);
  if (args.scale !== undefined && VALID_PINE_SCALES.includes(args.scale as PineScale)) {
    config.scale = args.scale as PineScale;
  }
  if (args.max_labels_count !== undefined) config.max_labels_count = Number(args.max_labels_count);
  if (args.max_lines_count !== undefined) config.max_lines_count = Number(args.max_lines_count);
  if (args.max_boxes_count !== undefined) config.max_boxes_count = Number(args.max_boxes_count);
  if (args.max_polylines_count !== undefined)
    config.max_polylines_count = Number(args.max_polylines_count);
  if (args.max_bars_back !== undefined) config.max_bars_back = Number(args.max_bars_back);
  if (args.calc_on_every_tick !== undefined)
    config.calc_on_every_tick = Boolean(args.calc_on_every_tick);
  if (args.max_lines_left !== undefined) config.max_lines_left = Number(args.max_lines_left);
  if (args.max_labels_left !== undefined) config.max_labels_left = Number(args.max_labels_left);
  if (args.max_boxes_left !== undefined) config.max_boxes_left = Number(args.max_boxes_left);
  if (args.explicit_plot_zorder !== undefined)
    config.explicit_plot_zorder = Boolean(args.explicit_plot_zorder);

  return config;
}

export function parseStrategyDeclaration(args: Record<string, unknown>): StrategyConfig {
  const title = String(args.title ?? 'Strategy');
  const config: StrategyConfig = {
    type: 'strategy',
    title,
  };

  if (args.shorttitle !== undefined) config.shorttitle = String(args.shorttitle);
  if (args.overlay !== undefined) config.overlay = Boolean(args.overlay);
  if (args.format !== undefined && VALID_PINE_FORMATS.includes(args.format as PineFormat)) {
    config.format = args.format as PineFormat;
  }
  if (args.precision !== undefined) config.precision = Number(args.precision);
  if (args.scale !== undefined && VALID_PINE_SCALES.includes(args.scale as PineScale)) {
    config.scale = args.scale as PineScale;
  }
  if (args.pyramiding !== undefined) config.pyramiding = Number(args.pyramiding);
  if (args.calc_on_every_tick !== undefined)
    config.calc_on_every_tick = Boolean(args.calc_on_every_tick);
  if (args.backtest_fill_limits_assumption !== undefined) {
    config.backtest_fill_limits_assumption = Number(args.backtest_fill_limits_assumption);
  }
  if (
    args.default_qty_type !== undefined &&
    VALID_DEFAULT_QTY_TYPES.includes(args.default_qty_type as DefaultQtyType)
  ) {
    config.default_qty_type = args.default_qty_type as DefaultQtyType;
  }
  if (args.default_qty_value !== undefined)
    config.default_qty_value = Number(args.default_qty_value);
  if (args.initial_capital !== undefined) config.initial_capital = Number(args.initial_capital);
  if (
    args.commission_type !== undefined &&
    VALID_COMMISSION_TYPES.includes(args.commission_type as CommissionType)
  ) {
    config.commission_type = args.commission_type as CommissionType;
  }
  if (args.commission_value !== undefined) config.commission_value = Number(args.commission_value);
  if (args.slippage !== undefined) config.slippage = Number(args.slippage);
  if (args.process_orders_on_close !== undefined)
    config.process_orders_on_close = Boolean(args.process_orders_on_close);
  if (
    args.close_entries_rule !== undefined &&
    VALID_CLOSE_ENTRIES_RULES.includes(args.close_entries_rule as CloseEntriesRule)
  ) {
    config.close_entries_rule = args.close_entries_rule as CloseEntriesRule;
  }
  if (args.margin_long !== undefined) config.margin_long = Number(args.margin_long);
  if (args.margin_short !== undefined) config.margin_short = Number(args.margin_short);
  if (args.max_boxes_count !== undefined) config.max_boxes_count = Number(args.max_boxes_count);
  if (args.max_lines_count !== undefined) config.max_lines_count = Number(args.max_lines_count);
  if (args.max_labels_count !== undefined) config.max_labels_count = Number(args.max_labels_count);
  if (args.risk_free_rate !== undefined) config.risk_free_rate = Number(args.risk_free_rate);

  return config;
}

export function parseLibraryDeclaration(args: Record<string, unknown>): LibraryConfig {
  const title = String(args.title ?? 'Library');
  const config: LibraryConfig = {
    type: 'library',
    title,
  };

  if (args.shorttitle !== undefined) config.shorttitle = String(args.shorttitle);
  if (args.overlay !== undefined) config.overlay = Boolean(args.overlay);
  if (args.format !== undefined && VALID_PINE_FORMATS.includes(args.format as PineFormat)) {
    config.format = args.format as PineFormat;
  }
  if (args.precision !== undefined) config.precision = Number(args.precision);
  if (args.scale !== undefined && VALID_PINE_SCALES.includes(args.scale as PineScale)) {
    config.scale = args.scale as PineScale;
  }

  return config;
}

export function validateScriptConfig(config: ScriptConfig): string[] {
  const errors: string[] = [];

  if (!config.title || config.title.trim() === '') {
    errors.push('Script title is required');
  }

  if (config.type === 'strategy') {
    const stratConfig = config as StrategyConfig;
    if (stratConfig.pyramiding !== undefined && stratConfig.pyramiding < 0) {
      errors.push('Pyramiding must be non-negative');
    }
    if (stratConfig.initial_capital !== undefined && stratConfig.initial_capital < 0) {
      errors.push('Initial capital must be non-negative');
    }
    if (stratConfig.slippage !== undefined && stratConfig.slippage < 0) {
      errors.push('Slippage must be non-negative');
    }
    if (stratConfig.commission_value !== undefined && stratConfig.commission_value < 0) {
      errors.push('Commission value must be non-negative');
    }
    if (
      stratConfig.risk_free_rate !== undefined &&
      (stratConfig.risk_free_rate < 0 || stratConfig.risk_free_rate > 100)
    ) {
      errors.push('Risk free rate must be between 0 and 100');
    }
  }

  if (config.max_labels_count !== undefined && config.max_labels_count < 0) {
    errors.push('max_labels_count must be non-negative');
  }
  if (config.max_lines_count !== undefined && config.max_lines_count < 0) {
    errors.push('max_lines_count must be non-negative');
  }
  if (config.max_boxes_count !== undefined && config.max_boxes_count < 0) {
    errors.push('max_boxes_count must be non-negative');
  }
  if (config.max_polylines_count !== undefined && config.max_polylines_count < 0) {
    errors.push('max_polylines_count must be non-negative');
  }

  return errors;
}

export function getDefaultConfig(type: ScriptType): ScriptConfig {
  switch (type) {
    case 'indicator':
      return {
        type: 'indicator',
        title: 'Indicator',
        overlay: false,
        format: 'inherit',
        precision: 4,
        scale: 'inherit',
        max_labels_count: 500,
        max_lines_count: 500,
        max_boxes_count: 500,
        max_polylines_count: 500,
        calc_on_every_tick: false,
        explicit_plot_zorder: false,
      };
    case 'strategy':
      return {
        type: 'strategy',
        title: 'Strategy',
        overlay: true,
        format: 'inherit',
        precision: 4,
        scale: 'inherit',
        pyramiding: 0,
        calc_on_every_tick: false,
        backtest_fill_limits_assumption: 0,
        default_qty_type: 'fixed',
        default_qty_value: 1,
        initial_capital: 10000,
        commission_type: 'percent',
        commission_value: 0,
        slippage: 0,
        process_orders_on_close: false,
        close_entries_rule: 'FIFO',
        margin_long: 0,
        margin_short: 0,
        max_boxes_count: 500,
        max_lines_count: 500,
        max_labels_count: 500,
        risk_free_rate: 0,
      };
    case 'library':
      return {
        type: 'library',
        title: 'Library',
        overlay: false,
        format: 'inherit',
        precision: 4,
        scale: 'inherit',
      };
  }
}

export function getStrategyConfig(config: ScriptConfig): {
  initialCapital: number;
  commission: number;
  slippage: number;
  commissionType: 'percent' | 'fixed' | 'per_contract' | 'per_order';
  slippageType: 'percent' | 'ticks' | 'points';
  defaultQty: number;
  defaultQtyType: 'contracts' | 'percent_of_equity' | 'cash';
  pyramiding: number;
  calcOnOrderFills: boolean;
  calcOnEveryTick: boolean;
  processOrdersOnClose: boolean;
  maxBarsBack: number;
  marginLong: number;
  marginShort: number;
} | null {
  if (config.type !== 'strategy') return null;

  const strat = config as StrategyConfig;

  const mapCommissionType = (
    t?: CommissionType,
  ): 'percent' | 'fixed' | 'per_contract' | 'per_order' => {
    if (t === 'per_order') return 'per_order';
    if (t === 'per_contract') return 'per_contract';
    if (t === 'percent') return 'percent';
    return 'percent';
  };

  const mapQtyType = (t?: DefaultQtyType): 'contracts' | 'percent_of_equity' | 'cash' => {
    if (t === 'percent_of_equity') return 'percent_of_equity';
    if (t === 'currency') return 'cash';
    if (t === 'fixed') return 'contracts';
    return 'percent_of_equity';
  };

  return {
    initialCapital: strat.initial_capital ?? 10000,
    commission: strat.commission_value ?? 0,
    slippage: strat.slippage ?? 0,
    commissionType: mapCommissionType(strat.commission_type),
    slippageType: 'ticks',
    defaultQty: strat.default_qty_value ?? 20,
    defaultQtyType: mapQtyType(strat.default_qty_type),
    pyramiding: strat.pyramiding ?? 0,
    calcOnOrderFills: true,
    calcOnEveryTick: strat.calc_on_every_tick ?? false,
    processOrdersOnClose: strat.process_orders_on_close ?? false,
    maxBarsBack: 0,
    marginLong: (strat.margin_long ?? 0) / 100,
    marginShort: (strat.margin_short ?? 0) / 100,
  };
}

export function getDrawingLimits(config: ScriptConfig): {
  maxLines: number;
  maxLabels: number;
  maxBoxes: number;
  maxPolylines: number;
} {
  return {
    maxLines: config.max_lines_count ?? 500,
    maxLabels: config.max_labels_count ?? 500,
    maxBoxes: config.max_boxes_count ?? 500,
    maxPolylines: config.max_polylines_count ?? 500,
  };
}
