import { StrategyEngine, resetOrderIdCounter } from '../../src/strategy/strategy-engine.js';

describe('StrategyEngine', () => {
  beforeEach(() => {
    resetOrderIdCounter();
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
      const liquidationMarkers = markers.filter(
        (m) => m.comment === 'Margin liquidation',
      );
      expect(liquidationMarkers.length).toBeGreaterThan(0);
    });

    it('should skip liquidation check when marginRate is 0', () => {
      const engine = new StrategyEngine({ marginLong: 0, marginShort: 0 });

      engine.updateBar(0, 1000, 100, 105, 95, 102, 1000);
      engine.entry('Long', 'long', 50);

      engine.updateBar(1, 1001, 50, 55, 45, 48, 1000);

      const markers = engine.getMarkers();
      const liquidationMarkers = markers.filter(
        (m) => m.comment === 'Margin liquidation',
      );
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
      const closeMarker = markers.find(
        (m) => m.type === 'close' && m.direction === 'long',
      );
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
      const closeMarker = markers.find(
        (m) => m.type === 'close' && m.direction === 'long',
      );
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
      const closeMarker = markers.find(
        (m) => m.type === 'close' && m.direction === 'short',
      );
      expect(closeMarker).toBeDefined();
      expect(closeMarker!.name).toBe('Exit Short');
      expect(closeMarker!.comment).toBe('reverse');
    });
  });
});
