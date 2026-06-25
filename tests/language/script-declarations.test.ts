import {
  parseVersionDirective,
  parseIndicatorDeclaration,
  parseStrategyDeclaration,
  parseLibraryDeclaration,
  validateScriptConfig,
  getDefaultConfig,
  getStrategyConfig,
  getDrawingLimits,
} from '../../src/language/script-declarations.js';

describe('Script Declarations', () => {
  describe('parseVersionDirective', () => {
    it('should parse version 6', () => {
      expect(parseVersionDirective('//@version=6')).toBe(6);
    });

    it('should parse version 5', () => {
      expect(parseVersionDirective('//@version=5')).toBe(5);
    });

    it('should parse version with spaces around =', () => {
      expect(parseVersionDirective('//@version= 6')).toBe(6);
    });

    it('should return null for invalid version', () => {
      expect(parseVersionDirective('// no version')).toBeNull();
    });

    it('should return null for version > 6', () => {
      expect(parseVersionDirective('//@version=7')).toBeNull();
    });

    it('should return null for version < 1', () => {
      expect(parseVersionDirective('//@version=0')).toBeNull();
    });
  });

  describe('parseIndicatorDeclaration', () => {
    it('should parse basic indicator', () => {
      const config = parseIndicatorDeclaration({ title: 'My Indicator' });
      expect(config.type).toBe('indicator');
      expect(config.title).toBe('My Indicator');
    });

    it('should parse indicator with all options', () => {
      const config = parseIndicatorDeclaration({
        title: 'RSI',
        shorttitle: 'RSI',
        overlay: false,
        format: 'price',
        precision: 2,
        scale: 'linear',
        max_labels_count: 1000,
        max_lines_count: 2000,
        max_boxes_count: 300,
        max_polylines_count: 400,
        max_bars_back: 100,
        calc_on_every_tick: true,
        max_lines_left: 100,
        max_labels_left: 200,
        max_boxes_left: 50,
        explicit_plot_zorder: true,
      });

      expect(config.title).toBe('RSI');
      expect(config.shorttitle).toBe('RSI');
      expect(config.overlay).toBe(false);
      expect(config.format).toBe('price');
      expect(config.precision).toBe(2);
      expect(config.scale).toBe('linear');
      expect(config.max_labels_count).toBe(1000);
      expect(config.max_lines_count).toBe(2000);
      expect(config.max_boxes_count).toBe(300);
      expect(config.max_polylines_count).toBe(400);
      expect(config.max_bars_back).toBe(100);
      expect(config.calc_on_every_tick).toBe(true);
      expect(config.max_lines_left).toBe(100);
      expect(config.max_labels_left).toBe(200);
      expect(config.max_boxes_left).toBe(50);
      expect(config.explicit_plot_zorder).toBe(true);
    });

    it('should use default title when not provided', () => {
      const config = parseIndicatorDeclaration({});
      expect(config.title).toBe('Indicator');
    });
  });

  describe('parseStrategyDeclaration', () => {
    it('should parse basic strategy', () => {
      const config = parseStrategyDeclaration({ title: 'My Strategy' });
      expect(config.type).toBe('strategy');
      expect(config.title).toBe('My Strategy');
    });

    it('should parse strategy with all options', () => {
      const config = parseStrategyDeclaration({
        title: 'MA Cross',
        shorttitle: 'MA',
        overlay: true,
        pyramiding: 3,
        calc_on_every_tick: true,
        backtest_fill_limits_assumption: 5,
        default_qty_type: 'percent_of_equity',
        default_qty_value: 10,
        initial_capital: 100000,
        commission_type: 'per_order',
        commission_value: 10,
        slippage: 5,
        process_orders_on_close: true,
        close_entries_rule: 'LIFO',
        margin_long: 150,
        margin_short: 200,
        max_boxes_count: 600,
        max_lines_count: 700,
        max_labels_count: 800,
        risk_free_rate: 2.5,
      });

      expect(config.title).toBe('MA Cross');
      expect(config.overlay).toBe(true);
      expect(config.pyramiding).toBe(3);
      expect(config.calc_on_every_tick).toBe(true);
      expect(config.backtest_fill_limits_assumption).toBe(5);
      expect(config.default_qty_type).toBe('percent_of_equity');
      expect(config.default_qty_value).toBe(10);
      expect(config.initial_capital).toBe(100000);
      expect(config.commission_type).toBe('per_order');
      expect(config.commission_value).toBe(10);
      expect(config.slippage).toBe(5);
      expect(config.process_orders_on_close).toBe(true);
      expect(config.close_entries_rule).toBe('LIFO');
      expect(config.margin_long).toBe(150);
      expect(config.margin_short).toBe(200);
      expect(config.risk_free_rate).toBe(2.5);
    });
  });

  describe('parseLibraryDeclaration', () => {
    it('should parse basic library', () => {
      const config = parseLibraryDeclaration({ title: 'My Library' });
      expect(config.type).toBe('library');
      expect(config.title).toBe('My Library');
    });
  });

  describe('validateScriptConfig', () => {
    it('should validate valid config', () => {
      const config = parseIndicatorDeclaration({ title: 'Test' });
      const errors = validateScriptConfig(config);
      expect(errors).toEqual([]);
    });

    it('should error on empty title', () => {
      const config = parseIndicatorDeclaration({ title: '' });
      const errors = validateScriptConfig(config);
      expect(errors).toContain('Script title is required');
    });

    it('should error on negative pyramiding', () => {
      const config = parseStrategyDeclaration({ title: 'Test', pyramiding: -1 });
      const errors = validateScriptConfig(config);
      expect(errors).toContain('Pyramiding must be non-negative');
    });

    it('should error on negative initial capital', () => {
      const config = parseStrategyDeclaration({ title: 'Test', initial_capital: -100 });
      const errors = validateScriptConfig(config);
      expect(errors).toContain('Initial capital must be non-negative');
    });

    it('should error on negative slippage', () => {
      const config = parseStrategyDeclaration({ title: 'Test', slippage: -5 });
      const errors = validateScriptConfig(config);
      expect(errors).toContain('Slippage must be non-negative');
    });

    it('should error on risk free rate out of range', () => {
      const config = parseStrategyDeclaration({ title: 'Test', risk_free_rate: 150 });
      const errors = validateScriptConfig(config);
      expect(errors).toContain('Risk free rate must be between 0 and 100');
    });

    it('should error on negative max_labels_count', () => {
      const config = parseIndicatorDeclaration({ title: 'Test', max_labels_count: -1 });
      const errors = validateScriptConfig(config);
      expect(errors).toContain('max_labels_count must be non-negative');
    });
  });

  describe('getDefaultConfig', () => {
    it('should return indicator defaults', () => {
      const config = getDefaultConfig('indicator');
      expect(config.type).toBe('indicator');
      expect(config.overlay).toBe(false);
      expect(config.max_labels_count).toBe(500);
    });

    it('should return strategy defaults', () => {
      const config = getDefaultConfig('strategy');
      expect(config.type).toBe('strategy');
      expect(config.pyramiding).toBe(0);
      expect(config.initial_capital).toBe(10000);
    });

    it('should return library defaults', () => {
      const config = getDefaultConfig('library');
      expect(config.type).toBe('library');
    });
  });

  describe('getStrategyConfig', () => {
    it('should convert strategy config', () => {
      const config = parseStrategyDeclaration({
        title: 'Test',
        initial_capital: 50000,
        commission_value: 0.1,
        slippage: 2,
        pyramiding: 2,
        calc_on_every_tick: true,
        process_orders_on_close: true,
      });

      const stratConfig = getStrategyConfig(config);
      expect(stratConfig).not.toBeNull();
      expect(stratConfig!.initialCapital).toBe(50000);
      expect(stratConfig!.commission).toBe(0.1);
      expect(stratConfig!.slippage).toBe(2);
      expect(stratConfig!.pyramiding).toBe(2);
      expect(stratConfig!.calcOnEveryTick).toBe(true);
      expect(stratConfig!.processOrdersOnClose).toBe(true);
    });

    it('should return null for non-strategy config', () => {
      const config = getDefaultConfig('indicator');
      expect(getStrategyConfig(config)).toBeNull();
    });

    it('should map commission_type per_order to per_order', () => {
      const config = parseStrategyDeclaration({
        title: 'Test',
        commission_type: 'per_order',
        commission_value: 5,
      });
      const stratConfig = getStrategyConfig(config);
      expect(stratConfig!.commissionType).toBe('per_order');
      expect(stratConfig!.commission).toBe(5);
    });

    it('should map commission_type per_contract to per_contract', () => {
      const config = parseStrategyDeclaration({
        title: 'Test',
        commission_type: 'per_contract',
        commission_value: 0.5,
      });
      const stratConfig = getStrategyConfig(config);
      expect(stratConfig!.commissionType).toBe('per_contract');
    });

    it('should map default_qty_type percent_of_equity', () => {
      const config = parseStrategyDeclaration({
        title: 'Test',
        default_qty_type: 'percent_of_equity',
        default_qty_value: 10,
      });
      const stratConfig = getStrategyConfig(config);
      expect(stratConfig!.defaultQtyType).toBe('percent_of_equity');
    });

    it('should map default_qty_type currency to cash', () => {
      const config = parseStrategyDeclaration({
        title: 'Test',
        default_qty_type: 'currency',
        default_qty_value: 5000,
      });
      const stratConfig = getStrategyConfig(config);
      expect(stratConfig!.defaultQtyType).toBe('cash');
    });

    it('should map default_qty_type fixed to contracts', () => {
      const config = parseStrategyDeclaration({
        title: 'Test',
        default_qty_type: 'fixed',
        default_qty_value: 2,
      });
      const stratConfig = getStrategyConfig(config);
      expect(stratConfig!.defaultQtyType).toBe('contracts');
      expect(stratConfig!.defaultQty).toBe(2);
    });

    it('should map margin_long and margin_short as decimal ratios', () => {
      const config = parseStrategyDeclaration({
        title: 'Test',
        margin_long: 50,
        margin_short: 25,
      });
      const stratConfig = getStrategyConfig(config);
      expect(stratConfig!.marginLong).toBe(0.5);
      expect(stratConfig!.marginShort).toBe(0.25);
    });

    it('should use defaults for all new fields when not specified', () => {
      const config = parseStrategyDeclaration({
        title: 'Test',
      });
      const stratConfig = getStrategyConfig(config);
      expect(stratConfig!.defaultQtyType).toBe('percent_of_equity');
      expect(stratConfig!.defaultQty).toBe(20);
      expect(stratConfig!.commissionType).toBe('percent');
      expect(stratConfig!.marginLong).toBe(1);
      expect(stratConfig!.marginShort).toBe(1);
    });
  });

  describe('getDrawingLimits', () => {
    it('should extract drawing limits from config', () => {
      const config = parseIndicatorDeclaration({
        title: 'Test',
        max_labels_count: 1000,
        max_lines_count: 2000,
        max_boxes_count: 300,
        max_polylines_count: 400,
      });

      const limits = getDrawingLimits(config);
      expect(limits.maxLabels).toBe(1000);
      expect(limits.maxLines).toBe(2000);
      expect(limits.maxBoxes).toBe(300);
      expect(limits.maxPolylines).toBe(400);
    });

    it('should use defaults when not specified', () => {
      const config = getDefaultConfig('indicator');
      const limits = getDrawingLimits(config);
      expect(limits.maxLabels).toBe(500);
      expect(limits.maxLines).toBe(500);
      expect(limits.maxBoxes).toBe(500);
      expect(limits.maxPolylines).toBe(500);
    });
  });
});
