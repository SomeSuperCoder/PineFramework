import {
  getCommissionMethodDescriptor,
  getAllCommissionMethodDescriptors,
  isLongOnlyEnforced,
  buildTradeContextFromFill,
  buildTradeContextFromTrade,
  detectJupiterPairCategory,
  parsePairSymbol,
} from '../../src/strategy/commission-calculator.js';
import { buildBacktestFeeModel } from '../../src/strategy/commission-methods/backtest-model.js';
import { feeBreakdownToQuote, modelFees } from '../../src/pnl/index.js';
import { StrategyEngine } from '../../src/strategy/strategy-engine.js';

describe('Commission Calculator', () => {
  describe('getCommissionMethodDescriptor', () => {
    it('should return descriptor for known method', () => {
      const desc = getCommissionMethodDescriptor('jupiter_ultra');
      expect(desc).toBeDefined();
      expect(desc!.id).toBe('jupiter_ultra');
      expect(desc!.name).toBe('Jupiter Ultra');
      expect(desc!.enforceLongOnly).toBe(true);
    });

    it('should return undefined for unknown method', () => {
      expect(getCommissionMethodDescriptor('unknown' as any)).toBeUndefined();
    });
  });

  describe('getAllCommissionMethodDescriptors', () => {
    it('should return 2 built-in methods (Jupiter only)', () => {
      const descriptors = getAllCommissionMethodDescriptors();
      expect(descriptors).toHaveLength(2);
      expect(descriptors.map((d) => d.id)).toEqual(['jupiter_ultra', 'jupiter_manual']);
    });
  });

  describe('isLongOnlyEnforced', () => {
    it('should return true for jupiter_ultra', () => {
      expect(isLongOnlyEnforced('jupiter_ultra')).toBe(true);
    });

    it('should return true for jupiter_manual', () => {
      expect(isLongOnlyEnforced('jupiter_manual')).toBe(true);
    });

    it('should return false for unknown method', () => {
      expect(isLongOnlyEnforced('unknown' as any)).toBe(false);
    });
  });

  describe('detectJupiterPairCategory', () => {
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

  describe('buildTradeContextFromFill', () => {
    it('should build context from entry fill data', () => {
      const ctx = buildTradeContextFromFill({
        direction: 'long',
        fillPrice: 100,
        quantity: 5,
        isEntry: true,
      });
      expect(ctx.direction).toBe('long');
      expect(ctx.entryPrice).toBe(100);
      expect(ctx.exitPrice).toBe(0);
      expect(ctx.quantity).toBe(5);
      expect(ctx.tradeValue).toBe(500); // abs(100 * 5)
      expect(ctx.isEntry).toBe(true);
    });

    it('should build context from exit fill data', () => {
      const ctx = buildTradeContextFromFill({
        direction: 'long',
        fillPrice: 150,
        quantity: 5,
        isEntry: false,
      });
      expect(ctx.direction).toBe('long');
      expect(ctx.entryPrice).toBe(0);
      expect(ctx.exitPrice).toBe(150);
      expect(ctx.quantity).toBe(5);
      expect(ctx.tradeValue).toBe(750);
      expect(ctx.isEntry).toBe(false);
    });

    it('should handle short direction', () => {
      const ctx = buildTradeContextFromFill({
        direction: 'short',
        fillPrice: 200,
        quantity: 10,
        isEntry: true,
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

  // -------------------------------------------------------------------------
  // REAL fee path — buildBacktestFeeModel → modelFees (src/pnl).
  //
  // D6/D7 (commit 94f3e8c) deleted the per-fill commission calculators. Jupiter
  // fees are now modeled ONCE per round trip through the shared src/pnl module:
  //   buildBacktestFeeModel(method, settings, symbol)  (commission-methods/backtest-model.ts)
  //     → modelFees({ tradeValue }, model)             (pnl/fees.ts)
  //     → aggregateRealizedPnl(...) at trade close      (strategy-engine.ts:742-782)
  // These tests lock the module math with REAL numbers — the engine-level path
  // that consumes it is asserted below in the StrategyEngine integration block.
  // -------------------------------------------------------------------------

  describe('REAL fee path — buildBacktestFeeModel → modelFees', () => {
    it('models jupiter_manual as venue bps + base lamports (DEX swap + SOL network fee)', () => {
      const model = buildBacktestFeeModel('jupiter_manual', { dexFeeBps: 25, solPriceUsd: 73 });
      expect(model.tag).toBe('jupiter_manual');
      expect(model.venueBps).toBe('25');
      expect(model.solUsdPrice).toBe('73');
      // Router path charges 0% Jupiter platform fee — no PLATFORM component.
      expect(model.platformBps).toBeUndefined();

      const fees = modelFees({ tradeValue: '1020', side: 'LONG' }, model);
      const quote = feeBreakdownToQuote(fees, { SOL: { priceUsd: '73', decimals: 9 } });
      // VENUE: 1020 × 25 / 10000 = 2.55 (quote-denominated).
      expect(Number(quote.VENUE!)).toBeCloseTo(2.55, 8);
      // BASE: 5000 lamports × 2 signatures / 1e9 × $73 = 0.00073.
      expect(Number(quote.BASE!)).toBeCloseTo(0.00073, 8);
      // Total = 2.55073 — the exact M6 number through the shared module.
      expect(Number(quote.VENUE!) + Number(quote.BASE!)).toBeCloseTo(2.55073, 8);
    });

    it('models jupiter_ultra as venue bps + platform tier bps + base lamports', () => {
      const model = buildBacktestFeeModel('jupiter_ultra', {}); // all defaults
      expect(model.venueBps).toBe('25'); // default DEX fee (Raydium)
      expect(model.platformBps).toBe('10'); // DEFAULT_JUPITER_FEE_BPS

      const fees = modelFees({ tradeValue: '1020', side: 'LONG' }, model);
      const quote = feeBreakdownToQuote(fees, { SOL: { priceUsd: '73', decimals: 9 } });
      expect(Number(quote.VENUE!)).toBeCloseTo(2.55, 8); // 1020 × 25 / 10000
      expect(Number(quote.PLATFORM!)).toBeCloseTo(1.02, 8); // 1020 × 10 / 10000
      expect(Number(quote.BASE!)).toBeCloseTo(0.00073, 8); // 10000 lamports @ $73
      const total = Number(quote.VENUE!) + Number(quote.PLATFORM!) + Number(quote.BASE!);
      expect(total).toBeCloseTo(3.57073, 8);
    });

    it('auto-detects the platform tier from the trading symbol', () => {
      // SOLUSDT → sol_stable → 2 bps; BTCUSDT → default → 10 bps.
      const solModel = buildBacktestFeeModel(
        'jupiter_ultra',
        { dexFeeBps: 0, solPriceUsd: 0 },
        'SOLUSDT',
      );
      expect(solModel.platformBps).toBe('2');
      const btcModel = buildBacktestFeeModel(
        'jupiter_ultra',
        { dexFeeBps: 0, solPriceUsd: 0 },
        'BTCUSDT',
      );
      expect(btcModel.platformBps).toBe('10');
    });

    it('prefers an explicit pairCategory over symbol auto-detection', () => {
      // SOLUSDT auto-detects sol_stable (2 bps), but the explicit tier wins.
      const model = buildBacktestFeeModel(
        'jupiter_ultra',
        { pairCategory: 'pegged_asset', dexFeeBps: 0, solPriceUsd: 0 },
        'SOLUSDT',
      );
      expect(model.platformBps).toBe('0'); // pegged_asset = 0 bps
    });

    it('maps a custom rate (decimal fraction) to bps when no tier or symbol is set', () => {
      const model = buildBacktestFeeModel('jupiter_ultra', {
        rate: 0.005,
        dexFeeBps: 0,
        solPriceUsd: 0,
      });
      expect(model.platformBps).toBe('50'); // 0.005 × 10000
    });
  });

  describe('StrategyEngine integration', () => {
    it('charges NO fee at entry for jupiter_manual (fees are modeled once at close)', () => {
      const engine = new StrategyEngine({ commissionMethod: 'jupiter_manual' });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);
      engine.updateBar(1, 1001, 100, 105, 98, 101, 1000); // entry fills at open=100

      // Old per-fill behavior charged 2.5015 at entry (equity 9997.4985). The
      // current mechanism charges NOTHING at entry — equity is untouched.
      expect(engine.getEquity()).toBe(10000);
      expect(engine.getPosition().direction).toBe('long');
      expect(engine.getPosition().commission).toBe(0);
    });

    it('charges NO fee at entry for jupiter_ultra (fees are modeled once at close)', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001, dexFeeBps: 0, solPriceUsd: 0 },
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);
      engine.updateBar(1, 1001, 100, 105, 98, 101, 1000); // entry fills at open=100

      // Old per-fill behavior charged 1000 × 0.001 = 1 at entry (equity 9999).
      expect(engine.getEquity()).toBe(10000);
    });

    it('models jupiter_manual fees ONCE at close on the entry notional', () => {
      const engine = new StrategyEngine({ commissionMethod: 'jupiter_manual' });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);
      engine.updateBar(1, 1001, 100, 105, 100, 103, 1000); // entry fills at open=100
      engine.updateBar(2, 1002, 110, 115, 108, 112, 1000);
      engine.close('Exit');
      engine.updateBar(3, 1003, 110, 115, 108, 112, 1000); // close fills at open=110

      const trades = engine.getTrades();
      expect(trades).toHaveLength(1);
      // Gross = (110 − 100) × 10 = 100. Fees ONCE on the ENTRY notional
      // (100 × 10 = 1000): venue 25 bps = 2.50 + base 10000 lamports @
      // DEFAULT_SOL_USD_PRICE 73 = 0.00073 → 2.50073. The old per-fill
      // calculator charged on the EXIT notional with $150 → 2.7515.
      expect(trades[0]!.commission).toBeCloseTo(2.50073, 4);
      expect(trades[0]!.pnl).toBeCloseTo(100 - 2.50073, 4);
      expect(engine.getEquity()).toBeCloseTo(10000 + (100 - 2.50073), 4);
    });

    it('models jupiter_ultra platform fees ONCE at close (rate 0.001 → 10 bps)', () => {
      const engine = new StrategyEngine({
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001, dexFeeBps: 0, solPriceUsd: 0 },
      });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 10);
      engine.updateBar(1, 1001, 100, 105, 100, 103, 1000); // entry fills at open=100
      engine.updateBar(2, 1002, 110, 115, 108, 112, 1000);
      engine.close('Exit');
      engine.updateBar(3, 1003, 110, 115, 108, 112, 1000); // close fills at open=110

      const trades = engine.getTrades();
      expect(trades).toHaveLength(1);
      // Fees ONCE on the entry notional (1000): venue 0 bps (dexFeeBps 0) +
      // platform 10 bps = 1.00 + base 0 (solPriceUsd 0) → 1.00.
      expect(trades[0]!.commission).toBeCloseTo(1.0, 4);
      expect(trades[0]!.pnl).toBeCloseTo(99, 4);
      expect(engine.getEquity()).toBeCloseTo(10099, 4);
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
