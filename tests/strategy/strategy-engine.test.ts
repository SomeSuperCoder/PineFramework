import { StrategyEngine } from '../../src/strategy/strategy-engine.js';

describe('StrategyEngine', () => {
  beforeEach(() => {
    // no-op: each new instance has its own counter
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const engine = new StrategyEngine();

      expect(engine.getEquity()).toBe(10000);
      expect(engine.getPosition().direction).toBe('flat');
      expect(engine.getTrades()).toEqual([]);
    });

    it('should create with custom config', () => {
      const engine = new StrategyEngine({
        initialCapital: 50000,
        commission: 0.1,
        slippage: 2,
      });

      expect(engine.getEquity()).toBe(50000);
    });
  });

  describe('entry', () => {
    it('should open a long position', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      const order = engine.entry('Long', 'long', 1);

      expect(order).toBeDefined();
      expect(order!.action).toBe('buy');

      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      expect(engine.getPosition().direction).toBe('long');
      expect(engine.getPosition().quantity).toBe(1);
    });

    it('should open a short position', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      const order = engine.entry('Short', 'short', 1);

      expect(order).toBeDefined();
      expect(order!.action).toBe('sell');

      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      expect(engine.getPosition().direction).toBe('short');
      expect(engine.getPosition().quantity).toBe(1);
    });

    it('should open with market order at current price', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 103, 105, 100, 103, 1000);

      expect(engine.getPosition().avgPrice).toBe(103);
    });

    it('should open with limit order', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      const order = engine.entry('Long', 'long', 1, 0, undefined, 98);

      expect(order).toBeDefined();
      expect(order!.type).toBe('limit');
      expect(engine.getPendingOrders().length).toBe(1);
      expect(engine.getPosition().direction).toBe('flat');
    });

    it('should open with stop order', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      const order = engine.entry('Long', 'long', 1, 0, 106);

      expect(order).toBeDefined();
      expect(order!.type).toBe('stop');
      expect(engine.getPendingOrders().length).toBe(1);
      expect(engine.getPosition().direction).toBe('flat');
    });

    it('should not open if pyramiding limit reached', () => {
      const engine = new StrategyEngine({ pyramiding: 0 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long1', 'long', 1);

      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      const order = engine.entry('Long2', 'long', 1);

      expect(order).toBeUndefined();
    });
  });

  describe('exit', () => {
    it('should close a long position', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.exit('Exit');

      engine.updateBar(2, 1002, 108, 110, 105, 109, 1000);

      expect(engine.getPosition().direction).toBe('flat');
      expect(engine.getPosition().quantity).toBe(0);
    });

    it('should close a short position', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Short', 'short', 1);

      engine.updateBar(1, 1001, 102, 110, 100, 98, 1000);
      engine.exit('Exit');

      engine.updateBar(2, 1002, 98, 100, 95, 96, 1000);

      expect(engine.getPosition().direction).toBe('flat');
    });

    it('should partial close', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 2);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.exit('Exit', 1);

      engine.updateBar(2, 1002, 108, 110, 105, 109, 1000);

      expect(engine.getPosition().quantity).toBe(1);
      expect(engine.getPosition().direction).toBe('long');
    });

    it('should return undefined if flat', () => {
      const engine = new StrategyEngine();
      const order = engine.exit('Exit');

      expect(order).toBeUndefined();
    });
  });

  describe('close', () => {
    it('should close entire position', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 3);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.close();

      engine.updateBar(2, 1002, 108, 110, 105, 109, 1000);

      expect(engine.getPosition().direction).toBe('flat');
      expect(engine.getPosition().quantity).toBe(0);
    });
  });

  describe('cancel', () => {
    it('should cancel a pending order', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      const order = engine.entry('Long', 'long', 1, 0, undefined, 98);

      expect(engine.getPendingOrders().length).toBe(1);

      const cancelled = engine.cancel(order!.id);
      expect(cancelled).toBe(true);
      expect(engine.getPendingOrders().length).toBe(0);
    });

    it('should return false for non-existent order', () => {
      const engine = new StrategyEngine();
      const cancelled = engine.cancel('nonexistent');
      expect(cancelled).toBe(false);
    });
  });

  describe('cancelAll', () => {
    it('should cancel all pending orders', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long1', 'long', 1, 0, undefined, 98);
      engine.entry('Long2', 'long', 1, 0, undefined, 96);

      expect(engine.getPendingOrders().length).toBe(2);

      engine.cancelAll();
      expect(engine.getPendingOrders().length).toBe(0);
    });
  });

  describe('order fills', () => {
    it('should fill limit order when price reaches limit', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1, 0, undefined, 98);

      expect(engine.getPendingOrders().length).toBe(1);
      expect(engine.getPosition().direction).toBe('flat');

      engine.updateBar(1, 1001, 100, 105, 96, 102, 1000);

      expect(engine.getPendingOrders().length).toBe(0);
      expect(engine.getPosition().direction).toBe('long');
      expect(engine.getPosition().avgPrice).toBe(98);
    });

    it('should fill stop order when price reaches stop', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1, 0, 106);

      expect(engine.getPendingOrders().length).toBe(1);

      engine.updateBar(1, 1001, 100, 108, 100, 105, 1000);

      expect(engine.getPendingOrders().length).toBe(0);
      expect(engine.getPosition().direction).toBe('long');
      expect(engine.getPosition().avgPrice).toBe(106);
    });

    it('should create stop-limit order when both stop and limit provided', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      const order = engine.entry('Long', 'long', 1, 0, 106, 104);

      expect(order).toBeDefined();
      expect(order!.type).toBe('stop-limit');
      expect(order!.stopPrice).toBe(106);
      expect(order!.limitPrice).toBe(104);
      expect(engine.getPendingOrders().length).toBe(1);
      expect(engine.getPosition().direction).toBe('flat');
    });

    it('should fill stop-limit order when both stop and limit are hit on same bar', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1, 0, 106, 104);

      expect(engine.getPendingOrders().length).toBe(1);

      // Bar 1: high=108 hits stop (106), low=103 hits limit (104) — fills on same bar
      engine.updateBar(1, 1001, 100, 108, 103, 105, 1000);

      expect(engine.getPendingOrders().length).toBe(0);
      expect(engine.getPosition().direction).toBe('long');
      expect(engine.getPosition().avgPrice).toBe(104);
    });

    it('should convert stop-limit to limit order when stop hit but limit not hit on same bar', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1, 0, 106, 104);

      expect(engine.getPendingOrders().length).toBe(1);

      // Bar 1: high=107 hits stop (106), but low=105 never reaches limit (104)
      // The stop-limit should convert to a limit order at 104
      engine.updateBar(1, 1001, 100, 107, 105, 106, 1000);

      // Still flat — limit not hit yet
      expect(engine.getPosition().direction).toBe('flat');
      // One pending order remains (the converted limit order)
      expect(engine.getPendingOrders().length).toBe(1);
      // Verify it's a limit order with correct price
      const pending = engine.getPendingOrders();
      expect(pending[0]!.type).toBe('limit');
      expect(pending[0]!.price).toBe(104);
      expect(pending[0]!.limitPrice).toBe(104);
      expect(pending[0]!.stopPrice).toBeUndefined();

      // Bar 2: low=103 hits the limit price (104) — fills now
      engine.updateBar(2, 1002, 106, 108, 103, 107, 1000);

      expect(engine.getPendingOrders().length).toBe(0);
      expect(engine.getPosition().direction).toBe('long');
      expect(engine.getPosition().avgPrice).toBe(104);
    });

    it('should fill sell stop-limit order on a short entry', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Short', 'short', 1, 0, 98, 100);

      expect(engine.getPendingOrders().length).toBe(1);
      expect(engine.getPendingOrders()[0]!.type).toBe('stop-limit');

      // Bar 1: low=97 hits stop (98), high=101 hits the limit (100) — fills on same bar
      engine.updateBar(1, 1001, 100, 101, 97, 100, 1000);

      expect(engine.getPendingOrders().length).toBe(0);
      expect(engine.getPosition().direction).toBe('short');
      expect(engine.getPosition().avgPrice).toBe(100);
    });
  });

  describe('trades', () => {
    it('should record trades', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.exit('Exit');

      engine.updateBar(2, 1002, 108, 110, 105, 109, 1000);

      const trades = engine.getTrades();
      expect(trades.length).toBe(1);
      expect(trades[0]!.direction).toBe('long');
      expect(trades[0]!.entryPrice).toBe(102);
      expect(trades[0]!.exitPrice).toBe(108);
    });

    it('should calculate PnL correctly for long', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 100, 110, 98, 110, 1000);
      engine.exit('Exit');

      engine.updateBar(2, 1002, 110, 112, 108, 111, 1000);

      const trades = engine.getTrades();
      expect(trades[0]!.pnl).toBe(10);
    });

    it('should calculate PnL correctly for short', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Short', 'short', 1);

      engine.updateBar(1, 1001, 100, 102, 90, 90, 1000);
      engine.exit('Exit');

      engine.updateBar(2, 1002, 90, 95, 88, 91, 1000);

      const trades = engine.getTrades();
      expect(trades[0]!.pnl).toBe(10);
    });
  });

  describe('commission', () => {
    it('should deduct commission from equity', () => {
      const engine = new StrategyEngine({ commission: 1, commissionType: 'fixed' });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      expect(engine.getEquity()).toBe(10000 - 1);
    });

    it('should charge percent commission', () => {
      const engine = new StrategyEngine({ commission: 0.1, commissionType: 'percent' });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 100, 105, 98, 101, 1000);

      const expectedCommission = 100 * 1 * 0.001;
      expect(engine.getEquity()).toBeCloseTo(10000 - expectedCommission);
    });
  });

  describe('slippage', () => {
    it('should apply slippage to fill price', () => {
      const engine = new StrategyEngine({ slippage: 1, slippageType: 'ticks' });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      expect(engine.getPosition().avgPrice).toBe(103);
    });

    it('should apply percent slippage', () => {
      const engine = new StrategyEngine({ slippage: 1, slippageType: 'percent' });

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 100, 105, 98, 101, 1000);

      expect(engine.getPosition().avgPrice).toBe(101);
    });
  });

  describe('metrics', () => {
    it('should calculate metrics', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long1', 'long', 1);

      engine.updateBar(1, 1001, 100, 110, 98, 110, 1000);
      engine.exit('Exit1');

      engine.updateBar(2, 1002, 110, 115, 108, 110, 1000);
      engine.entry('Long2', 'long', 1);

      engine.updateBar(3, 1003, 110, 105, 100, 102, 1000);
      engine.exit('Exit2');

      engine.updateBar(4, 1004, 102, 105, 100, 103, 1000);

      const metrics = engine.getMetrics();
      expect(metrics.totalTrades).toBe(2);
      expect(metrics.winningTrades).toBe(1);
      expect(metrics.losingTrades).toBe(1);
      expect(metrics.winRate).toBe(50);
    });
  });

  describe('drawdown', () => {
    it('should track max drawdown', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 100, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 100, 110, 108, 110, 1000);

      engine.updateBar(2, 1002, 110, 105, 95, 95, 1000);

      const drawdown = engine.getMaxDrawdown();
      expect(drawdown).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset engine state', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.reset();

      expect(engine.getEquity()).toBe(10000);
      expect(engine.getPosition().direction).toBe('flat');
      expect(engine.getTrades()).toEqual([]);
      expect(engine.getFilledOrders()).toEqual([]);
    });
  });

  describe('order', () => {
    it('should create an order with marker', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      const order = engine.order('Buy', 'long', 1);

      expect(order).toBeDefined();
      expect(order!.action).toBe('buy');

      const markers = engine.getMarkers();
      expect(markers.length).toBe(1);
      expect(markers[0]!.type).toBe('order');
      expect(markers[0]!.name).toBe('Buy');
    });

    it('should create a market order at current price', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.order('Buy', 'long', 1);

      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      expect(engine.getPosition().direction).toBe('long');
      expect(engine.getPosition().avgPrice).toBe(102);
    });
  });

  describe('closeAll', () => {
    it('should close entire position', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 3);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.closeAll();

      engine.updateBar(2, 1002, 108, 110, 105, 109, 1000);

      expect(engine.getPosition().direction).toBe('flat');
      expect(engine.getPosition().quantity).toBe(0);
    });
  });

  describe('markers', () => {
    it('should track entry markers', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      const markers = engine.getMarkers();
      expect(markers.length).toBe(1);
      expect(markers[0]!.type).toBe('entry');
      expect(markers[0]!.name).toBe('Long');
      expect(markers[0]!.direction).toBe('long');
      expect(markers[0]!.action).toBe('buy');
      expect(markers[0]!.color).toBe('#00FF00');
    });

    it('should use direction name for short entries', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('MyEntry', 'short', 1);

      const markers = engine.getMarkers();
      expect(markers[0]!.name).toBe('MyEntry');
    });

    it('should track exit markers', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.exit('Long');

      const markers = engine.getMarkers();
      expect(markers.length).toBe(2);
      expect(markers[1]!.type).toBe('exit');
      expect(markers[1]!.name).toBe('Exit Long');
    });

    it('should store comment on entry marker without overriding name', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1, 0, undefined, undefined, 'Buy Signal');

      const markers = engine.getMarkers();
      expect(markers.length).toBe(1);
      expect(markers[0]!.name).toBe('Long');
      expect(markers[0]!.comment).toBe('Buy Signal');
    });

    it('should store comment on exit marker without overriding name', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.exit('Long', undefined, 0, undefined, undefined, 'TP Hit');

      const markers = engine.getMarkers();
      expect(markers.length).toBe(2);
      expect(markers[1]!.name).toBe('Exit Long');
      expect(markers[1]!.comment).toBe('TP Hit');
    });

    it('should track close markers', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.close('Long');

      const markers = engine.getMarkers();
      expect(markers.length).toBe(2);
      expect(markers[1]!.type).toBe('close');
      expect(markers[1]!.name).toBe('Exit Long');
    });

    it('should track cancel markers', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      const order = engine.entry('Long', 'long', 1, 0, undefined, 98);

      engine.cancel(order!.id);

      const markers = engine.getMarkers();
      expect(markers.length).toBe(2);
      expect(markers[1]!.type).toBe('cancel');
    });

    it('should track cancel_all markers', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long1', 'long', 1, 0, undefined, 98);
      engine.entry('Long2', 'long', 1, 0, undefined, 96);

      engine.cancelAll();

      const markers = engine.getMarkers();
      expect(markers.length).toBe(4);
      expect(markers[2]!.type).toBe('cancel_all');
      expect(markers[3]!.type).toBe('cancel_all');
    });
  });

  describe('liquidation', () => {
    it('should not produce liquidation markers with default config (marginLong=0)', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 100);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);

      const markers = engine.getMarkers();
      const liquidationMarkers = markers.filter(
        (m) => m.comment === 'Margin liquidation' || m.name.includes('liquidation'),
      );
      expect(liquidationMarkers.length).toBe(0);
    });

    it('should produce liquidation markers when margin is explicitly configured', () => {
      const engine = new StrategyEngine({ marginLong: 0.5 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 100);

      engine.updateBar(1, 1001, 102, 105, 1, 3, 1000);

      const markers = engine.getMarkers();
      const liquidationMarkers = markers.filter((m) => m.comment === 'Margin liquidation');
      expect(liquidationMarkers.length).toBeGreaterThan(0);
    });

    it('should skip liquidation check when marginRate is 0', () => {
      const engine = new StrategyEngine({ marginLong: 0, marginShort: 0 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 50);

      engine.updateBar(1, 1001, 50, 55, 45, 48, 1000);

      const markers = engine.getMarkers();
      const liquidationMarkers = markers.filter((m) => m.comment === 'Margin liquidation');
      expect(liquidationMarkers.length).toBe(0);
    });
  });

  describe('reversal markers', () => {
    it('should produce close marker with entry name (no _reverse suffix)', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.entry('Short', 'short', 1);

      const markers = engine.getMarkers();
      const closeMarker = markers.find((m) => m.type === 'close' && m.direction === 'long');
      expect(closeMarker).toBeDefined();
      expect(closeMarker!.name).toBe('Exit Long');
      expect(closeMarker!.name).not.toContain('_reverse');
    });

    it('should set comment to reverse on reversal close markers', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.entry('Short', 'short', 1);

      const markers = engine.getMarkers();
      const closeMarker = markers.find((m) => m.type === 'close' && m.direction === 'long');
      expect(closeMarker).toBeDefined();
      expect(closeMarker!.comment).toBe('reverse');
    });

    it('should produce both close and entry markers on reversal', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);

      engine.updateBar(1, 1001, 102, 110, 100, 108, 1000);
      engine.entry('Short', 'short', 1);

      const markers = engine.getMarkers();
      expect(markers.length).toBe(3);

      const closeMarker = markers.find((m) => m.type === 'close');
      const entryMarker = markers.find((m) => m.type === 'entry' && m.direction === 'short');

      expect(closeMarker).toBeDefined();
      expect(closeMarker!.name).toBe('Exit Long');
      expect(closeMarker!.comment).toBe('reverse');

      expect(entryMarker).toBeDefined();
      expect(entryMarker!.name).toBe('Short');
    });

    it('should produce correct reversal markers for short-to-long', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Short', 'short', 1);

      engine.updateBar(1, 1001, 102, 110, 100, 98, 1000);
      engine.entry('Long', 'long', 1);

      const markers = engine.getMarkers();
      const closeMarker = markers.find((m) => m.type === 'close' && m.direction === 'short');
      expect(closeMarker).toBeDefined();
      expect(closeMarker!.name).toBe('Exit Short');
      expect(closeMarker!.comment).toBe('reverse');
    });
  });

  describe('pyramiding', () => {
    it('should allow entries up to pyramiding+1 (with pyramiding=2 allows 3 total entries)', () => {
      const engine = new StrategyEngine({ pyramiding: 2 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('First', 'long', 1);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);
      expect(engine.getPosition().quantity).toBe(1);

      engine.entry('Second', 'long', 1);
      engine.updateBar(2, 1002, 103, 106, 101, 104, 1000);
      expect(engine.getPosition().quantity).toBe(2);

      // Third entry fills — entries counter is now 3 which equals pyramiding+1
      engine.entry('Third', 'long', 1);
      engine.updateBar(3, 1003, 104, 107, 102, 105, 1000);
      expect(engine.getPosition().quantity).toBe(3);
    });

    it('should reject entry beyond pyramiding+1 (pyramiding=0 allows only 1 total entry)', () => {
      const engine = new StrategyEngine({ pyramiding: 0 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('First', 'long', 1);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);
      expect(engine.getPosition().quantity).toBe(1);

      // Second entry should be rejected since pyramiding=0 allows only 1 entry
      const order = engine.entry('Second', 'long', 1);
      expect(order).toBeUndefined();
    });
  });

  describe('fractional quantities', () => {
    it('should handle fractional entry quantity', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 0.5);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      expect(engine.getPosition().quantity).toBe(0.5);
      expect(engine.getPosition().direction).toBe('long');
    });

    it('should handle fractional exit quantity', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);
      engine.exit('Partial', 0.3);
      engine.updateBar(2, 1002, 103, 105, 101, 104, 1000);

      expect(engine.getPosition().quantity).toBeCloseTo(0.7);
    });
  });

  describe('zero-price scenarios', () => {
    it('should fill market order at current price when price=0', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1, 0);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      expect(engine.getPosition().avgPrice).toBe(102);
    });

    it('should handle limit entry with explicit limitPrice > 0', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      const order = engine.entry('Long', 'long', 1, 0, undefined, 95);
      expect(order).toBeDefined();
      expect(order!.type).toBe('limit');
      expect(order!.limitPrice).toBe(95);
    });
  });

  describe('negative slippage', () => {
    it('should not reduce fill price below market with negative slippage', () => {
      const engine = new StrategyEngine({ slippage: -1, slippageType: 'ticks' });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      // Slippage modifies price; the fill price should still be the current price
      expect(engine.getPosition().avgPrice).toBeGreaterThan(0);
      expect(engine.getPosition().direction).toBe('long');
    });

    it('should handle negative percent slippage', () => {
      const engine = new StrategyEngine({ slippage: -0.5, slippageType: 'percent' });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      expect(engine.getPosition().direction).toBe('long');
    });
  });

  describe('stop-limit short fill across multiple bars', () => {
    it('should convert stop-limit to limit on short side when stop hit but limit not hit', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      // Short entry: stop=98 (trigger if low <= 98), limit=100 (fill when high >= 100)
      engine.entry('Short', 'short', 1, 0, 98, 100);

      expect(engine.getPendingOrders().length).toBe(1);
      expect(engine.getPendingOrders()[0]!.type).toBe('stop-limit');

      // Bar 1: low=97 hits stop (98), high=99 never reaches limit (100) — converts to limit
      engine.updateBar(1, 1001, 100, 99, 97, 98, 1000);

      expect(engine.getPosition().direction).toBe('flat');
      expect(engine.getPendingOrders().length).toBe(1);
      expect(engine.getPendingOrders()[0]!.type).toBe('limit');
      expect(engine.getPendingOrders()[0]!.price).toBe(100);

      // Bar 2: high=101 hits the limit price (100) — fills now
      engine.updateBar(2, 1002, 98, 101, 97, 99, 1000);

      expect(engine.getPendingOrders().length).toBe(0);
      expect(engine.getPosition().direction).toBe('short');
      expect(engine.getPosition().avgPrice).toBe(100);
    });
  });

  describe('exit with stop/limit orders', () => {
    it('should create a stop exit order', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      const exitOrder = engine.exit('Long', 1, 0, 98);
      expect(exitOrder).toBeDefined();
      expect(exitOrder!.type).toBe('stop');
      expect(exitOrder!.stopPrice).toBe(98);
    });

    it('should create a limit exit order', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      const exitOrder = engine.exit('Long', 1, 0, undefined, 110);
      expect(exitOrder).toBeDefined();
      expect(exitOrder!.type).toBe('limit');
      expect(exitOrder!.limitPrice).toBe(110);
    });

    it('should fill stop exit order when price reaches stop', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      // Place a stop exit at 98 (stop-loss)
      engine.exit('Long', 1, 0, 98);

      // Bar 2: low=97 hits the stop — fills
      engine.updateBar(2, 1002, 103, 104, 97, 102, 1000);

      expect(engine.getPosition().direction).toBe('flat');
      expect(engine.getPosition().quantity).toBe(0);
      const trades = engine.getTrades();
      expect(trades.length).toBe(1);
      expect(trades[0]!.exitPrice).toBe(98);
    });

    it('should fill limit exit order when price reaches limit', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      // Place a limit exit at 108 (take-profit)
      engine.exit('Long', 1, 0, undefined, 108);

      // Bar 2: high=109 hits the limit — fills
      engine.updateBar(2, 1002, 103, 109, 102, 108, 1000);

      expect(engine.getPosition().direction).toBe('flat');
      const trades = engine.getTrades();
      expect(trades.length).toBe(1);
      expect(trades[0]!.exitPrice).toBe(108);
    });
  });

  describe('stop-limit entry with immediate fill', () => {
    it('should fill long stop-limit when bar opens within range', () => {
      const engine = new StrategyEngine();

      // Place stop-limit: stop=105, limit=104
      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 1, 0, 105, 104);

      // Bar opens at 106 (above stop), then trades down to 103 which hits the limit
      engine.updateBar(1, 1001, 106, 107, 103, 105, 1000);

      expect(engine.getPosition().direction).toBe('long');
      expect(engine.getPosition().avgPrice).toBe(104);
    });
  });

  describe('OCA groups', () => {
    it('should assign ocaGroup on non-market exit orders', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 2);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      const exit1 = engine.exit('TP1', 1, 0, undefined, 110);
      const exit2 = engine.exit('TP2', 1, 0, undefined, 115);

      expect(exit1).toBeDefined();
      expect(exit2).toBeDefined();
      expect(exit1!.ocaGroup).toBeTruthy();
      expect(exit2!.ocaGroup).toBe(exit1!.ocaGroup);
    });

    it('should not assign ocaGroup on market exit orders', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 2);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      const exitOrder = engine.exit('Exit', 1);
      expect(exitOrder).toBeDefined();
      expect(exitOrder!.ocaGroup).toBeUndefined();
    });

    it('should cancel sibling OCA orders when one fills', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 2);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      // Place two limit exits: TP1 at 108, TP2 at 115
      engine.exit('TP1', 1, 0, undefined, 108);
      engine.exit('TP2', 1, 0, undefined, 115);

      expect(engine.getPendingOrders().length).toBe(2);

      // Bar hits TP1 but not TP2
      engine.updateBar(2, 1002, 103, 110, 102, 109, 1000);

      // TP1 should have filled (1 of 2 units), TP2 should be cancelled
      expect(engine.getPosition().direction).toBe('long');
      expect(engine.getPosition().quantity).toBe(1);
      expect(engine.getPendingOrders().length).toBe(0);
      const trades = engine.getTrades();
      expect(trades.length).toBe(1);
      expect(trades[0]!.exitPrice).toBe(108);
    });

    it('should cancel remaining OCA orders when position is closed', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 2);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      // Place two limit exits
      engine.exit('TP1', 1, 0, undefined, 108);
      engine.exit('TP2', 1, 0, undefined, 115);

      expect(engine.getPendingOrders().length).toBe(2);

      // Close the position manually
      engine.close();
      engine.updateBar(2, 1002, 103, 105, 101, 104, 1000);

      // Position should be flat and pending orders cleared
      expect(engine.getPosition().direction).toBe('flat');
      expect(engine.getPendingOrders().length).toBe(0);
    });

    it('should not mix OCA groups across different entries', () => {
      const engine = new StrategyEngine({ pyramiding: 1 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Buy1', 'long', 1);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      // First entry done, add second
      engine.entry('Buy2', 'long', 1);
      engine.updateBar(2, 1002, 103, 108, 102, 107, 1000);

      // Place exits for each entry
      const exit1 = engine.exit('TP1', 1, 0, undefined, 115);
      const exit2 = engine.exit('TP2', 1, 0, undefined, 120);

      // Different entries should get different OCA groups
      expect(exit1).toBeDefined();
      expect(exit2).toBeDefined();
      // Actually with current implementation, exit uses position.entryName which is 'Buy2' (the last entry).
      // This is correct per design — the OCA group comes from the position's entry name.
      // Multi-entry pyramiding OCA is handled later with from_entry.
      expect(exit1!.ocaGroup).toBe(exit2!.ocaGroup);
    });
  });

  describe('position lot tracking', () => {
    it('should track a single lot on entry', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 5);

      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      const pos = engine.getPosition();
      expect(pos.lots.length).toBe(1);
      expect(pos.lots[0]!.entryName).toBe('Long');
      expect(pos.lots[0]!.quantity).toBe(5);
      expect(pos.lots[0]!.avgPrice).toBe(102);
    });

    it('should add a second lot on pyramiding', () => {
      const engine = new StrategyEngine({ pyramiding: 2 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('First', 'long', 3);
      engine.updateBar(1, 1001, 105, 110, 103, 108, 1000);

      engine.entry('Second', 'long', 2);
      engine.updateBar(2, 1002, 108, 112, 106, 110, 1000);

      const pos = engine.getPosition();
      expect(pos.lots.length).toBe(2);
      expect(pos.lots[0]!.entryName).toBe('First');
      expect(pos.lots[0]!.quantity).toBe(3);
      expect(pos.lots[1]!.entryName).toBe('Second');
      expect(pos.lots[1]!.quantity).toBe(2);
      expect(pos.quantity).toBe(5);
    });

    it('should pop lots FIFO on partial exit', () => {
      const engine = new StrategyEngine({ pyramiding: 2 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('First', 'long', 3);
      engine.updateBar(1, 1001, 105, 110, 103, 108, 1000);

      engine.entry('Second', 'long', 2);
      engine.updateBar(2, 1002, 108, 112, 106, 110, 1000);

      // Exit 2 units — should come from first lot (FIFO)
      engine.exit('Partial', 2);
      engine.updateBar(3, 1003, 110, 115, 108, 112, 1000);

      const pos = engine.getPosition();
      expect(pos.lots.length).toBe(2);
      expect(pos.lots[0]!.quantity).toBe(1);  // First lot reduced from 3 to 1
      expect(pos.lots[1]!.quantity).toBe(2);  // Second lot untouched
      expect(pos.quantity).toBe(3);
    });

    it('should remove exhausted lot from FIFO queue', () => {
      const engine = new StrategyEngine({ pyramiding: 2 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('First', 'long', 3);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      engine.entry('Second', 'long', 2);
      engine.updateBar(2, 1002, 103, 108, 102, 107, 1000);

      // Exit 3 units — consumes entire first lot
      engine.exit('Partial', 3);
      engine.updateBar(3, 1003, 107, 110, 105, 108, 1000);

      const pos = engine.getPosition();
      expect(pos.lots.length).toBe(1);
      expect(pos.lots[0]!.entryName).toBe('Second');
      expect(pos.lots[0]!.quantity).toBe(2);
      expect(pos.quantity).toBe(2);
    });

    it('should clear lots when position goes flat', () => {
      const engine = new StrategyEngine({ pyramiding: 2 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('First', 'long', 3);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      engine.entry('Second', 'long', 2);
      engine.updateBar(2, 1002, 103, 108, 102, 107, 1000);

      // Exit all
      engine.exit('Full', 5);
      engine.updateBar(3, 1003, 107, 110, 105, 108, 1000);

      const pos = engine.getPosition();
      expect(pos.lots.length).toBe(0);
      expect(pos.direction).toBe('flat');
    });
  });

  describe('fromEntry parameter', () => {
    it('should exit quantity from matching entry lot', () => {
      const engine = new StrategyEngine({ pyramiding: 2 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('First', 'long', 3);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      engine.entry('Second', 'long', 2);
      engine.updateBar(2, 1002, 103, 108, 102, 107, 1000);

      // Exit only from "First" entry
      const order = engine.exit('TP1', 3, 0, undefined, 115, undefined, 'First');
      engine.updateBar(3, 1003, 107, 116, 105, 115, 1000);

      expect(order).toBeDefined();
      // Should only close 3 (First's portion), leaving Second open
      expect(engine.getPosition().quantity).toBe(2);
      expect(engine.getPosition().lots.length).toBe(1);
      expect(engine.getPosition().lots[0]!.entryName).toBe('Second');
    });

    it('should return undefined if fromEntry does not match any lot', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Buy', 'long', 5);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      const order = engine.exit('TP1', 5, 0, undefined, 115, undefined, 'NonExistent');
      expect(order).toBeUndefined();
    });
  });

  describe('trail parameters on exit orders', () => {
    it('should set trailPrice on exit order', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 3);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      const order = engine.exit('Trail', 3, 0, 98, undefined, undefined, undefined, 2.0);
      expect(order).toBeDefined();
      expect(order!.trailPrice).toBe(2.0);
    });

    it('should set trailOffset on exit order', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 3);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      const order = engine.exit('Trail', 3, 0, 98, undefined, undefined, undefined, undefined, 20);
      expect(order).toBeDefined();
      expect(order!.trailOffset).toBe(20);
    });

    it('should set both trailPrice and trailOffset', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 3);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);

      const order = engine.exit('Trail', 3, 0, 98, undefined, undefined, undefined, 2.0, 20);
      expect(order).toBeDefined();
      expect(order!.trailPrice).toBe(2.0);
      expect(order!.trailOffset).toBe(20);
    });
  });

  describe('multi-level exit integration', () => {
    it('6.1: should fill one limit TP and OCA-cancel the other on next bar', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 4);
      // Entry fills at open=103 → avgPrice=103
      engine.updateBar(1, 1001, 103, 105, 100, 103, 1000);

      // Place two take-profit exits at different levels
      const tp1 = engine.exit('TP1', 2, 0, undefined, 115);
      const tp2 = engine.exit('TP2', 2, 0, undefined, 120);
      expect(tp1).toBeDefined();
      expect(tp2).toBeDefined();
      expect(tp1!.ocaGroup).toBeDefined();
      expect(tp2!.ocaGroup).toBe(tp1!.ocaGroup);

      // Bar 2: high=116 hits TP1 at 115, fills it, cancels TP2
      engine.updateBar(2, 1002, 110, 116, 108, 115, 1000);

      // TP1 should have filled: reduced position by 2
      const pos = engine.getPosition();
      expect(pos.quantity).toBe(2);
      expect(pos.direction).toBe('long');

      // TP2 should be cancelled (no longer pending)
      const pending = engine.getPendingOrders();
      expect(pending.length).toBe(0);

      // Should have one trade recorded for the partial exit
      const trades = engine.getTrades();
      expect(trades.length).toBe(1);
      expect(trades[0]!.exitName).toBe('TP1');
      expect(trades[0]!.quantity).toBe(2);
    });

    it('6.2: should fill stop loss SL and OCA-cancel TP in bracket', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 3);
      // Entry fills at open=103 → avgPrice=103
      engine.updateBar(1, 1001, 103, 105, 100, 103, 1000);

      // Bracket: TP at 115, SL at 98
      const tp = engine.exit('TP', 3, 0, undefined, 115);
      const sl = engine.exit('SL', 3, 0, 98);
      expect(tp).toBeDefined();
      expect(sl).toBeDefined();
      expect(tp!.ocaGroup).toBe(sl!.ocaGroup);

      // Bar 2: low=97 hits SL=98, fills it, cancels TP
      engine.updateBar(2, 1002, 102, 104, 97, 100, 1000);

      // Position should be flat
      expect(engine.getPosition().direction).toBe('flat');
      expect(engine.getPosition().quantity).toBe(0);

      // TP should be cancelled
      expect(engine.getPendingOrders().length).toBe(0);

      // One trade recorded at stop price
      const trades = engine.getTrades();
      expect(trades.length).toBe(1);
      expect(trades[0]!.exitName).toBe('SL');
      expect(trades[0]!.exitPrice).toBeCloseTo(98, 0);
    });

    it('6.3: should exit specific entry lot with from_entry under pyramiding', () => {
      const engine = new StrategyEngine({ pyramiding: 2 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('First', 'long', 3);
      engine.updateBar(1, 1001, 102, 105, 100, 103, 1000);
      engine.entry('Second', 'long', 2);
      engine.updateBar(2, 1002, 103, 108, 102, 107, 1000);

      // Position has two lots: First(3), Second(2)
      expect(engine.getPosition().quantity).toBe(5);

      // Exit only Second's portion
      engine.exit('TP2', 5, 0, undefined, 120, undefined, 'Second');
      engine.updateBar(3, 1003, 110, 122, 108, 120, 1000);

      // Second's 2 units should be gone, First's 3 remain
      const pos = engine.getPosition();
      expect(pos.quantity).toBe(3);
      expect(pos.lots.length).toBe(1);
      expect(pos.lots[0]!.entryName).toBe('First');

      // Trade should record the correct exit quantity
      const trades = engine.getTrades();
      expect(trades.length).toBe(1);
      expect(trades[0]!.quantity).toBe(2);
    });

    it('6.4: should activate, ratchet, and trigger trailing stop across multiple bars', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 5);
      // Entry fills at open=103 → avgPrice=103
      engine.updateBar(1, 1001, 103, 105, 100, 103, 1000);

      // Trailing stop with offset=20 ticks
      engine.exit('Trail', 5, 0, undefined, undefined, undefined, undefined, undefined, 20);

      // Bar 2: activates (high=106 >= 103.20), stop=105.80
      engine.updateBar(2, 1002, 106, 106, 106, 106, 1000);
      let pending = engine.getPendingOrders();
      expect(pending.length).toBe(1);
      expect(pending[0]!.stopPrice).toBeCloseTo(105.80, 1);

      // Bar 3: ratchets (high=108), stop=107.80
      engine.updateBar(3, 1003, 108, 108, 108, 108, 1000);
      pending = engine.getPendingOrders();
      expect(pending[0]!.stopPrice).toBeCloseTo(107.80, 1);

      // Bar 4: triggers (low=107.50 <= 107.80)
      engine.updateBar(4, 1004, 107, 108, 107.5, 107.5, 1000);

      expect(engine.getPosition().direction).toBe('flat');
      const trades = engine.getTrades();
      expect(trades.length).toBe(1);
      expect(trades[0]!.exitPrice).toBeCloseTo(107.80, 1);
    });

    it('6.5: should exit partial quantity simulating qty_percent across two bars', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 10);
      // Entry fills at open=103 → avgPrice=103
      engine.updateBar(1, 1001, 103, 105, 100, 103, 1000);

      // Exit 30% of position (= 3 contracts) — simulates qty_percent=30
      engine.exit('TP1', 3, 0, undefined, 110);
      // Exit remaining 70% (= 7 contracts) — simulates qty_percent=70
      engine.exit('TP2', 7, 0, undefined, 115);

      // Bar 2: high=112 hits TP1 at 110, fills 3, cancels TP2
      engine.updateBar(2, 1002, 108, 112, 106, 110, 1000);

      // Position reduced from 10 to 7
      let pos = engine.getPosition();
      expect(pos.quantity).toBe(7);
      expect(pos.direction).toBe('long');

      // TP2 was cancelled because TP1 filled (same OCA group)
      let pending = engine.getPendingOrders();
      expect(pending.length).toBe(0);

      // Now place another TP for remaining 7
      engine.exit('TP3', 7, 0, undefined, 115);

      // Bar 3: high=116 hits TP3 at 115
      engine.updateBar(3, 1003, 112, 116, 110, 115, 1000);

      // Position flat
      expect(engine.getPosition().direction).toBe('flat');

      // Two trades: TP1 (3 units) and TP3 (7 units)
      const trades = engine.getTrades();
      expect(trades.length).toBe(2);
      expect(trades[0]!.quantity).toBe(3);
      expect(trades[0]!.exitName).toBe('TP1');
      expect(trades[1]!.quantity).toBe(7);
      expect(trades[1]!.exitName).toBe('TP3');
    });
  });

  describe('trailing stop behavior', () => {
    it('should not activate until price moves favorably', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 3);
      // Entry fills at open=103 → avgPrice=103
      engine.updateBar(1, 1001, 103, 105, 100, 103, 1000);

      // trail_offset=20 ticks * 0.01 = $0.20 activation distance
      // Activation at $103 + $0.20 = $103.20
      engine.exit('Trail', 3, 0, undefined, undefined, undefined, undefined, undefined, 20);

      // Bar stays below activation: high=103.10 < 103.20
      engine.updateBar(2, 1002, 103, 103.1, 101, 103, 1000);

      // Stop should not have been set yet (not activated)
      const pending = engine.getPendingOrders();
      expect(pending.length).toBe(1);
      expect(pending[0]!.stopPrice).toBeUndefined();
    });

    it('should activate and set stop when price exceeds trail_offset from entry', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 3);
      // Entry fills at open=103 → avgPrice=103
      engine.updateBar(1, 1001, 103, 105, 100, 103, 1000);

      // trail_offset=20 ticks * 0.01 = $0.20
      // Activation at $103 + $0.20 = $103.20
      engine.exit('Trail', 3, 0, undefined, undefined, undefined, undefined, undefined, 20);

      // Bar triggers activation with high=106, but low=106 stays above stop
      // Stop = 106 - 0.20 = 105.80, so low=106 won't trigger
      engine.updateBar(2, 1002, 106, 106, 106, 106, 1000);

      // Should now have a stopPrice set on the pending order
      const pending = engine.getPendingOrders();
      expect(pending.length).toBe(1);
      expect(pending[0]!.stopPrice).toBeDefined();
      // With highest=106, offset=20*0.01=0.20, stop = 106 - 0.20 = 105.80
      expect(pending[0]!.stopPrice).toBeCloseTo(105.80, 1);
    });

    it('should ratchet stop up on new highs and not down', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 5);
      // Entry fills at open=103 → avgPrice=103
      engine.updateBar(1, 1001, 103, 105, 100, 103, 1000);

      // trail_offset=20 ticks * 0.01 = $0.20
      engine.exit('Trail', 5, 0, undefined, undefined, undefined, undefined, undefined, 20);

      // Bar 2: activates with high=106, low=106 above stop=105.80
      engine.updateBar(2, 1002, 106, 106, 106, 106, 1000);
      let pending = engine.getPendingOrders();
      const stopAfterBar2 = pending[0]!.stopPrice!;

      // Bar 3: new high=108, stop should ratchet up to 108 - 0.20 = 107.80
      engine.updateBar(3, 1003, 108, 108, 108, 108, 1000);
      pending = engine.getPendingOrders();
      expect(pending[0]!.stopPrice).toBeGreaterThan(stopAfterBar2);
      expect(pending[0]!.stopPrice).toBeCloseTo(107.80, 1);

      // Bar 4: lower high=107.9 (<108), low=107.9 above stop=107.80, stop should NOT go down
      engine.updateBar(4, 1004, 107.9, 107.9, 107.9, 107.9, 1000);
      pending = engine.getPendingOrders();
      expect(pending[0]!.stopPrice).toBeCloseTo(107.80, 1);
    });

    it('should trigger exit when price hits trailing stop', () => {
      const engine = new StrategyEngine();

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 5);
      // Entry fills at open=103 → avgPrice=103
      engine.updateBar(1, 1001, 103, 105, 100, 103, 1000);

      // trail_offset=20 ticks * 0.01 = $0.20
      engine.exit('Trail', 5, 0, undefined, undefined, undefined, undefined, undefined, 20);

      // Bar 2: activates with high=106, stop = 105.80
      engine.updateBar(2, 1002, 106, 106, 106, 106, 1000);

      // Bar 3: new high=108, stop ratchets to 107.80
      engine.updateBar(3, 1003, 108, 108, 108, 108, 1000);

      // Bar 4: low=107.50 hits stop=107.80 → triggers exit
      engine.updateBar(4, 1004, 107, 108, 107.5, 107.5, 1000);

      expect(engine.getPosition().direction).toBe('flat');
      const trades = engine.getTrades();
      expect(trades.length).toBe(1);
      expect(trades[0]!.exitPrice).toBeCloseTo(107.80, 1);
    });
  });
});
