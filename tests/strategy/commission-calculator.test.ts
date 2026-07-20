import {
  getCommissionCalculator,
  getCommissionMethodDescriptor,
  getAllCommissionMethodDescriptors,
  isLongOnlyEnforced,
  computeCommission,
  buildTradeContextFromFill,
  buildTradeContextFromTrade,
  detectJupiterPairCategory,
  parsePairSymbol,
} from '../../src/strategy/commission-calculator.js';
import type {
  TradeContext,
  CommissionConfig,
  PercentFixedSettings,
  PerOrderFixedSettings,
  JupiterUltraSettings,
  JupiterPairCategory,
} from '../../src/strategy/commission-calculator.js';
import { StrategyEngine } from '../../src/strategy/strategy-engine.js';

describe('Commission Calculator', () => {
  const makeContext = (overrides: Partial<TradeContext> = {}): TradeContext => ({
    direction: 'long',
    entryPrice: 100,
    exitPrice: 110,
    quantity: 10,
    tradeValue: 1000, // 100 * 10
    ...overrides,
  });

  describe('getCommissionCalculator', () => {
    it('should return a calculator for each built-in method', () => {
      expect(getCommissionCalculator('percent_fixed')).toBeDefined();
      expect(getCommissionCalculator('per_order_fixed')).toBeDefined();
      expect(getCommissionCalculator('jupiter_ultra')).toBeDefined();
      expect(getCommissionCalculator('jupiter_manual')).toBeDefined();
      expect(getCommissionCalculator('none')).toBeDefined();
    });

    it('should return undefined for unknown method', () => {
      expect(getCommissionCalculator('unknown' as any)).toBeUndefined();
    });
  });

  describe('getCommissionMethodDescriptor', () => {
    it('should return descriptor for known method', () => {
      const desc = getCommissionMethodDescriptor('percent_fixed');
      expect(desc).toBeDefined();
      expect(desc!.id).toBe('percent_fixed');
      expect(desc!.name).toBe('Percent (Fixed)');
      expect(desc!.enforceLongOnly).toBe(false);
    });

    it('should return undefined for unknown method', () => {
      expect(getCommissionMethodDescriptor('unknown' as any)).toBeUndefined();
    });
  });

  describe('getAllCommissionMethodDescriptors', () => {
    it('should return 6 built-in methods', () => {
      const descriptors = getAllCommissionMethodDescriptors();
      expect(descriptors).toHaveLength(6);
      expect(descriptors.map((d) => d.id)).toEqual([
        'percent_fixed',
        'percent_commission',
        'per_order_fixed',
        'jupiter_ultra',
        'jupiter_manual',
        'none',
      ]);
    });
  });

  describe('isLongOnlyEnforced', () => {
    it('should return true for jupiter_ultra', () => {
      expect(isLongOnlyEnforced('jupiter_ultra')).toBe(true);
    });

    it('should return true for jupiter_manual', () => {
      expect(isLongOnlyEnforced('jupiter_manual')).toBe(true);
    });

    it('should return false for percent_fixed', () => {
      expect(isLongOnlyEnforced('percent_fixed')).toBe(false);
    });

    it('should return false for per_order_fixed', () => {
      expect(isLongOnlyEnforced('per_order_fixed')).toBe(false);
    });

    it('should return false for none', () => {
      expect(isLongOnlyEnforced('none')).toBe(false);
    });

    it('should return false for unknown method', () => {
      expect(isLongOnlyEnforced('unknown' as any)).toBe(false);
    });
  });

  describe('percent_fixed method', () => {
    it('should calculate commission as tradeValue * rate', () => {
      const config: CommissionConfig = {
        method: 'percent_fixed',
        settings: { rate: 0.001 } as PercentFixedSettings,
      };
      const context = makeContext({ tradeValue: 10000 });
      const result = computeCommission(context, config);
      expect(result).toBeCloseTo(10); // 10000 * 0.001
    });

    it('should handle zero rate', () => {
      const config: CommissionConfig = {
        method: 'percent_fixed',
        settings: { rate: 0 } as PercentFixedSettings,
      };
      const context = makeContext();
      expect(computeCommission(context, config)).toBe(0);
    });

    it('should handle high rate (1%)', () => {
      const config: CommissionConfig = {
        method: 'percent_fixed',
        settings: { rate: 0.01 } as PercentFixedSettings,
      };
      const context = makeContext({ tradeValue: 5000 });
      expect(computeCommission(context, config)).toBeCloseTo(50); // 5000 * 0.01
    });

    it('should handle small trade value', () => {
      const config: CommissionConfig = {
        method: 'percent_fixed',
        settings: { rate: 0.001 } as PercentFixedSettings,
      };
      const context = makeContext({ tradeValue: 10 });
      expect(computeCommission(context, config)).toBeCloseTo(0.01); // 10 * 0.001
    });
  });

  describe('per_order_fixed method', () => {
    it('should return fixed amount regardless of trade size', () => {
      const config: CommissionConfig = {
        method: 'per_order_fixed',
        settings: { amount: 0.5 } as PerOrderFixedSettings,
      };

      expect(computeCommission(makeContext({ tradeValue: 100 }), config)).toBe(0.5);
      expect(computeCommission(makeContext({ tradeValue: 100000 }), config)).toBe(0.5);
    });

    it('should handle zero amount', () => {
      const config: CommissionConfig = {
        method: 'per_order_fixed',
        settings: { amount: 0 } as PerOrderFixedSettings,
      };
      expect(computeCommission(makeContext(), config)).toBe(0);
    });

    it('should handle large fixed amount', () => {
      const config: CommissionConfig = {
        method: 'per_order_fixed',
        settings: { amount: 10 } as PerOrderFixedSettings,
      };
      expect(computeCommission(makeContext(), config)).toBe(10);
    });
  });

  describe('jupiter_ultra method', () => {
    // ── Backward compatible: rate-based (no pairCategory) ──

    it('should calculate commission as tradeValue * rate (backward compat)', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: { rate: 0.001 } as JupiterUltraSettings,
      };
      const context = makeContext({ tradeValue: 10000 });
      expect(computeCommission(context, config)).toBeCloseTo(10);
    });

    it('should use default rate of 0.001 when settings are null (backward compat)', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: null,
      };
      const context = makeContext({ tradeValue: 10000 });
      expect(computeCommission(context, config)).toBeCloseTo(10);
    });

    it('should use default rate when pairCategory is unset (backward compat)', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: { rate: 0.005 } as JupiterUltraSettings,
      };
      const context = makeContext({ tradeValue: 10000 });
      expect(computeCommission(context, config)).toBeCloseTo(50); // 10000 * 0.005
    });

    // ── Tiered fee schedule (pairCategory-based) ──

    it.each([
      ['jupiter_ecosystem', 0, 10000, 0],
      ['pegged_asset', 0, 10000, 0],
      ['sol_stable', 2, 10000, 2],
      ['lst_stable', 5, 10000, 5],
      ['default', 10, 10000, 10],
      ['new_token', 50, 10000, 50],
    ])('should charge %s tier: %d bps', (category, bps, tradeValue, expectedCommission) => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: { pairCategory: category as JupiterPairCategory } as JupiterUltraSettings,
      };
      const context = makeContext({ tradeValue });
      // bps / 10000 = decimal fraction
      expect(computeCommission(context, config)).toBeCloseTo(expectedCommission);
    });

    it('should use custom rate when pairCategory is "custom"', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: { pairCategory: 'custom', rate: 0.002 } as JupiterUltraSettings,
      };
      const context = makeContext({ tradeValue: 10000 });
      expect(computeCommission(context, config)).toBeCloseTo(20); // 10000 * 0.002
    });

    it('should ignore rate field when a named tier is set', () => {
      // Even if rate is set alongside a tier, the tier should win
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: { pairCategory: 'sol_stable', rate: 0.1 } as JupiterUltraSettings,
      };
      const context = makeContext({ tradeValue: 10000 });
      // 2 bps = 0.02% = tradeValue * 0.0002
      expect(computeCommission(context, config)).toBeCloseTo(2);
    });

    // ── Large values ──

    it('should handle large trade values with default tier', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: { pairCategory: 'default' } as JupiterUltraSettings,
      };
      const context = makeContext({ tradeValue: 1_000_000 });
      // 10 bps = 0.001 = 1_000_000 * 0.001 = 1000
      expect(computeCommission(context, config)).toBeCloseTo(1000);
    });

    it('should handle small trade values with sol_stable tier', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: { pairCategory: 'sol_stable' } as JupiterUltraSettings,
      };
      const context = makeContext({ tradeValue: 50 });
      // 2 bps = 0.0002 = 50 * 0.0002 = 0.01
      expect(computeCommission(context, config)).toBeCloseTo(0.01);
    });

    it('should handle zero trade value', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: { pairCategory: 'new_token' } as JupiterUltraSettings,
      };
      const context = makeContext({ tradeValue: 0 });
      expect(computeCommission(context, config)).toBe(0);
    });
  });

  describe('jupiter_ultra auto-detection from symbol', () => {
    it('should detect jupiter_ecosystem tier for JUPUSDT', () => {
      expect(detectJupiterPairCategory('JUPUSDT')).toBe('jupiter_ecosystem');
    });

    it('should detect jupiter_ecosystem tier for JLPUSDT', () => {
      expect(detectJupiterPairCategory('JLPUSDT')).toBe('jupiter_ecosystem');
    });

    it('should detect pegged_asset tier for USDCUSDT (stable-stable)', () => {
      expect(detectJupiterPairCategory('USDCUSDT')).toBe('pegged_asset');
    });

    it('should detect sol_stable tier for SOLUSDT', () => {
      expect(detectJupiterPairCategory('SOLUSDT')).toBe('sol_stable');
    });

    it('should detect sol_stable tier for USDSOL', () => {
      expect(detectJupiterPairCategory('USDSOL')).toBe('sol_stable');
    });

    it('should detect lst_stable tier for MSOLUSDT', () => {
      expect(detectJupiterPairCategory('MSOLUSDT')).toBe('lst_stable');
    });

    it('should detect default tier for BTCUSDT', () => {
      expect(detectJupiterPairCategory('BTCUSDT')).toBe('default');
    });

    it('should detect default tier for ETHUSDT', () => {
      expect(detectJupiterPairCategory('ETHUSDT')).toBe('default');
    });

    it('should detect default tier for unknown symbols', () => {
      expect(detectJupiterPairCategory('')).toBe('default');
      expect(detectJupiterPairCategory('XYZ')).toBe('default');
    });

    it('should handle separator-delimited symbols', () => {
      expect(detectJupiterPairCategory('SOL/USDT')).toBe('sol_stable');
      expect(detectJupiterPairCategory('BTC-USDT')).toBe('default');
      expect(detectJupiterPairCategory('JUP_USDT')).toBe('jupiter_ecosystem');
    });

    it('should compute fee from auto-detected symbol tier via TradeContext', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: null,
      };
      // SOLUSDT → sol_stable → 2 bps → 10000 * 0.0002 = 2
      const context: TradeContext = {
        direction: 'long',
        entryPrice: 100,
        exitPrice: 110,
        quantity: 100,
        tradeValue: 10000,
        symbol: 'SOLUSDT',
      };
      expect(computeCommission(context, config)).toBeCloseTo(2);
    });

    it('should compute default 10 bps for non-SOL symbol', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: null,
      };
      // BTCUSDT → default → 10 bps → 10000 * 0.001 = 10
      const context: TradeContext = {
        direction: 'long',
        entryPrice: 100,
        exitPrice: 110,
        quantity: 100,
        tradeValue: 10000,
        symbol: 'BTCUSDT',
      };
      expect(computeCommission(context, config)).toBeCloseTo(10);
    });

    it('should prefer explicit pairCategory over symbol auto-detection', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: { pairCategory: 'pegged_asset' } as JupiterUltraSettings,
      };
      // Even though the symbol is SOLUSDT (sol_stable), explicit pairCategory wins
      const context: TradeContext = {
        direction: 'long',
        entryPrice: 100,
        exitPrice: 110,
        quantity: 100,
        tradeValue: 10000,
        symbol: 'SOLUSDT',
      };
      expect(computeCommission(context, config)).toBeCloseTo(0); // pegged_asset = 0 bps
    });

    it('should fall back to rate when no symbol and no pairCategory', () => {
      const config: CommissionConfig = {
        method: 'jupiter_ultra',
        settings: { rate: 0.005 } as JupiterUltraSettings,
      };
      const context: TradeContext = {
        direction: 'long',
        entryPrice: 100,
        exitPrice: 110,
        quantity: 100,
        tradeValue: 10000,
        // no symbol
      };
      expect(computeCommission(context, config)).toBeCloseTo(50); // 10000 * 0.005
    });
  });

  describe('parsePairSymbol', () => {
    it('should parse SOLUSDT', () => {
      expect(parsePairSymbol('SOLUSDT')).toEqual({ base: 'SOL', quote: 'USDT' });
    });

    it('should parse BTCUSDT', () => {
      expect(parsePairSymbol('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT' });
    });

    it('should parse SOL/USDT with separator', () => {
      expect(parsePairSymbol('SOL/USDT')).toEqual({ base: 'SOL', quote: 'USDT' });
    });

    it('should return undefined for unrecognised format', () => {
      expect(parsePairSymbol('')).toBeUndefined();
      expect(parsePairSymbol('X')).toBeUndefined();
    });
  });

  describe('jupiter_manual method', () => {
    it('should always return zero commission', () => {
      const config: CommissionConfig = {
        method: 'jupiter_manual',
        settings: null,
      };
      expect(computeCommission(makeContext({ tradeValue: 100000 }), config)).toBe(0);
      expect(computeCommission(makeContext({ tradeValue: 0 }), config)).toBe(0);
    });
  });

  describe('none method', () => {
    it('should always return zero commission', () => {
      const config: CommissionConfig = {
        method: 'none',
        settings: null,
      };
      expect(computeCommission(makeContext({ tradeValue: 100000 }), config)).toBe(0);
      expect(computeCommission(makeContext({ tradeValue: 0 }), config)).toBe(0);
    });
  });

  describe('unknown method', () => {
    it('should return 0 for unrecognized method', () => {
      const config: CommissionConfig = {
        method: 'unknown' as any,
        settings: null,
      };
      expect(computeCommission(makeContext(), config)).toBe(0);
    });
  });

  describe('buildTradeContextFromFill', () => {
    it('should build context from fill data', () => {
      const ctx = buildTradeContextFromFill({
        direction: 'long',
        fillPrice: 100,
        quantity: 5,
      });
      expect(ctx.direction).toBe('long');
      expect(ctx.entryPrice).toBe(100);
      expect(ctx.exitPrice).toBe(100);
      expect(ctx.quantity).toBe(5);
      expect(ctx.tradeValue).toBe(500); // abs(100 * 5)
    });

    it('should handle short direction', () => {
      const ctx = buildTradeContextFromFill({
        direction: 'short',
        fillPrice: 200,
        quantity: 10,
      });
      expect(ctx.direction).toBe('short');
      expect(ctx.tradeValue).toBe(2000);
    });
  });

  describe('buildTradeContextFromTrade', () => {
    it('should build context from trade data', () => {
      const ctx = buildTradeContextFromTrade({
        direction: 'long',
        entryPrice: 100,
        exitPrice: 110,
        quantity: 10,
      });
      expect(ctx.direction).toBe('long');
      expect(ctx.entryPrice).toBe(100);
      expect(ctx.exitPrice).toBe(110);
      expect(ctx.quantity).toBe(10);
      expect(ctx.tradeValue).toBe(1000); // abs(100 * 10)
    });
  });

  describe('StrategyEngine integration', () => {
    beforeEach(() => {
      // Each new StrategyEngine instance starts with its own order ID counter
    });

    it('should use percent_fixed commission method', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'percent_fixed',
        commissionMethodSettings: { rate: 0.01 }, // 1%
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);

      engine.updateBar(1, 1001, 100, 105, 98, 101, 1000);

      // Commission: 100 * 10 * 0.01 = 10
      expect(engine.getEquity()).toBeCloseTo(10000 - 10);
    });

    it('should use per_order_fixed commission method', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'per_order_fixed',
        commissionMethodSettings: { amount: 2.5 },
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);

      engine.updateBar(1, 1001, 100, 105, 98, 101, 1000);

      expect(engine.getEquity()).toBeCloseTo(10000 - 2.5);
    });

    it('should use jupiter_ultra commission method', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001 },
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);

      engine.updateBar(1, 1001, 100, 105, 98, 101, 1000);

      // Commission: 100 * 10 * 0.001 = 1
      expect(engine.getEquity()).toBeCloseTo(10000 - 1);
    });

    it('should use jupiter_manual commission method (zero commission)', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'jupiter_manual',
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);

      engine.updateBar(1, 1001, 100, 105, 98, 101, 1000);

      expect(engine.getEquity()).toBeCloseTo(10000);
    });

    it('should use none commission method (zero commission)', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'none',
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);

      engine.updateBar(1, 1001, 100, 105, 98, 101, 1000);

      expect(engine.getEquity()).toBeCloseTo(10000);
    });

    it('should fall back to legacy commission when no method specified', () => {
      const engine = new StrategyEngine({
        commission: 1,
        commissionType: 'fixed',
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);

      engine.updateBar(1, 1001, 100, 105, 98, 101, 1000);

      expect(engine.getEquity()).toBeCloseTo(10000 - 1);
    });

    it('should record commission on trade when using pluggable method', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'percent_fixed',
        commissionMethodSettings: { rate: 0.01 },
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);
      engine.updateBar(1, 1001, 100, 105, 100, 103, 1000); // entry fills at open=100

      engine.updateBar(2, 1002, 110, 115, 108, 112, 1000);
      engine.close('Exit');
      engine.updateBar(3, 1003, 110, 115, 108, 112, 1000); // close fills at open=110

      const trades = engine.getTrades();
      expect(trades).toHaveLength(1);
      // Entry fills at 100, close fills at 110
      // Exit commission: 110 * 10 * 0.01 = 11
      expect(trades[0]!.commission).toBeCloseTo(11);
      // Trade PnL = (110 - 100) * 10 - 11 = 89
      expect(trades[0]!.pnl).toBeCloseTo(89);
    });

    it('should enforce long-only when jupiter_ultra is selected', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001 },
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      const order = engine.entry('Short', 'short', 10);

      expect(order).toBeUndefined();
    });

    it('should enforce long-only when jupiter_manual is selected', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'jupiter_manual',
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      const order = engine.entry('Short', 'short', 10);

      expect(order).toBeUndefined();
    });

    it('should NOT enforce long-only when percent_fixed is selected', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'percent_fixed',
        commissionMethodSettings: { rate: 0.001 },
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      const order = engine.entry('Short', 'short', 10);

      expect(order).toBeDefined();
      expect(order!.direction).toBe('short');
    });

    it('should enforce long-only in order() method for jupiter_ultra', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001 },
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      const order = engine.order('ShortOrder', 'short', 10);

      expect(order).toBeUndefined();
    });
  });
});
