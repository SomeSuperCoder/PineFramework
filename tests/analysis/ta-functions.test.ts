import { sma, ema, wma, rma, linreg, correlation } from '../../src/analysis/moving-averages.js';
import {
  rsi,
  macd,
  stoch,
  atr,
  adx,
  bollingerBands,
  cci,
  roc,
  momentum,
} from '../../src/analysis/oscillators.js';
import {
  highest,
  lowest,
  sum,
  stdev,
  variance,
  rank,
  median,
} from '../../src/analysis/math-functions.js';
import { TAEngine } from '../../src/analysis/ta-engine.js';
import { NA } from '../../src/language/types/na.js';
import { TARegistry } from '../../src/analysis/ta-registry.js';

describe('Moving Averages', () => {
  const source = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

  describe('sma', () => {
    it('should calculate simple moving average', () => {
      const result = sma(source, 3);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(result[1]).toBeNaN();
      expect(result[2]).toBeCloseTo(11, 10);
      expect(result[3]).toBeCloseTo(12, 10);
      expect(result[9]).toBeCloseTo(18, 10);
    });

    it('should handle empty array', () => {
      expect(sma([], 5)).toEqual([]);
    });

    it('should handle length 1', () => {
      const result = sma([1, 2, 3], 1);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('ema', () => {
    it('should calculate exponential moving average', () => {
      const result = ema(source, 3);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(result[1]).toBeNaN();
      expect(result[2]).toBeDefined();
      expect(typeof result[2]).toBe('number');
    });

    it('should handle empty array', () => {
      expect(ema([], 5)).toEqual([]);
    });
  });

  describe('wma', () => {
    it('should calculate weighted moving average', () => {
      const result = wma(source, 3);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(result[1]).toBeNaN();
      expect(typeof result[2]).toBe('number');
    });
  });

  describe('rma', () => {
    it('should calculate RMA', () => {
      const result = rma(source, 3);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(result[1]).toBeNaN();
      expect(typeof result[2]).toBe('number');
    });
  });

  describe('linreg', () => {
    it('should calculate linear regression', () => {
      const result = linreg(source, 5);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(result[3]).toBeNaN();
      expect(typeof result[4]).toBe('number');
    });
  });

  describe('correlation', () => {
    it('should calculate correlation', () => {
      const source2 = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
      const result = correlation(source, source2, 5);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(typeof result[4]).toBe('number');
    });
  });
});

describe('Oscillators', () => {
  const high = [110, 112, 115, 113, 116, 118, 117, 119, 120, 122];
  const low = [95, 97, 100, 98, 101, 103, 102, 104, 105, 107];
  const close = [105, 108, 110, 109, 112, 115, 114, 116, 118, 120];

  describe('rsi', () => {
    it('should calculate RSI', () => {
      const result = rsi(close, 14);
      expect(result).toHaveLength(10);
      result.forEach((val) => {
        if (!isNaN(val)) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(100);
        }
      });
    });
  });

  describe('macd', () => {
    it('should calculate MACD', () => {
      const result = macd(close, 12, 26, 9);
      expect(result.macd).toHaveLength(10);
      expect(result.signal).toHaveLength(10);
      expect(result.histogram).toHaveLength(10);
    });
  });

  describe('stoch', () => {
    it('should calculate Stochastic', () => {
      const result = stoch(high, low, close, 14, 3);
      expect(result.k).toHaveLength(10);
      expect(result.d).toHaveLength(10);
    });
  });

  describe('atr', () => {
    it('should calculate ATR', () => {
      const result = atr(high, low, close, 14);
      expect(result).toHaveLength(10);
      result.forEach((val) => {
        if (!isNaN(val)) {
          expect(val).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });

  describe('adx', () => {
    it('should calculate ADX', () => {
      const result = adx(high, low, close, 14);
      expect(result.adx).toHaveLength(10);
      expect(result.plusDi).toHaveLength(10);
      expect(result.minusDi).toHaveLength(10);
    });
  });

  describe('bollingerBands', () => {
    it('should calculate Bollinger Bands', () => {
      const result = bollingerBands(close, 20, 2);
      expect(result.upper).toHaveLength(10);
      expect(result.middle).toHaveLength(10);
      expect(result.lower).toHaveLength(10);
    });
  });

  describe('cci', () => {
    it('should calculate CCI', () => {
      const result = cci(high, low, close, 20);
      expect(result).toHaveLength(10);
    });
  });

  describe('roc', () => {
    it('should calculate Rate of Change', () => {
      const result = roc(close, 5);
      expect(result).toHaveLength(10);
    });
  });

  describe('momentum', () => {
    it('should calculate Momentum', () => {
      const result = momentum(close, 5);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(typeof result[5]).toBe('number');
    });
  });
});

describe('Math Functions', () => {
  const source = [10, 15, 12, 18, 14, 16, 20, 13, 17, 19];

  describe('highest', () => {
    it('should find highest value', () => {
      const result = highest(source, 3);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(result[2]).toBe(15);
      expect(result[3]).toBe(18);
    });
  });

  describe('lowest', () => {
    it('should find lowest value', () => {
      const result = lowest(source, 3);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(result[2]).toBe(10);
      expect(result[3]).toBe(12);
    });
  });

  describe('sum', () => {
    it('should calculate sum', () => {
      const result = sum(source, 3);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(result[2]).toBe(37);
    });
  });

  describe('stdev', () => {
    it('should calculate standard deviation', () => {
      const result = stdev(source, 5);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(typeof result[4]).toBe('number');
    });
  });

  describe('variance', () => {
    it('should calculate variance', () => {
      const result = variance(source, 5);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(typeof result[4]).toBe('number');
    });
  });

  describe('rank', () => {
    it('should calculate rank', () => {
      const result = rank(source, 5);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(typeof result[4]).toBe('number');
    });
  });

  describe('median', () => {
    it('should calculate median', () => {
      const result = median(source, 5);
      expect(result).toHaveLength(10);
      expect(result[0]).toBeNaN();
      expect(typeof result[4]).toBe('number');
    });
  });
});

describe('TAEngine', () => {
  let engine: TAEngine;

  beforeEach(() => {
    engine = new TAEngine();
  });

  describe('initialization', () => {
    it('should create TAEngine', () => {
      expect(engine).toBeDefined();
    });

    it('should have registered functions', () => {
      const functions = engine.getAvailableFunctions();
      expect(functions.length).toBeGreaterThan(0);
    });
  });

  describe('call', () => {
    it('should call ta.sma', () => {
      // Need at least 20 values for SMA(20)
      const result = engine.call('ta', 'sma', [Array(20).fill(100), 20]);
      expect(typeof result === 'number' || result === NA).toBe(true);
    });

    it('should call ta.ema', () => {
      const result = engine.call('ta', 'ema', [Array(20).fill(100), 20]);
      expect(typeof result === 'number' || result === NA).toBe(true);
    });

    it('should call ta.rsi', () => {
      const result = engine.call('ta', 'rsi', [Array(14).fill(100), 14]);
      expect(typeof result === 'number' || result === NA).toBe(true);
    });

    it('should throw for non-existent function', () => {
      expect(() => engine.call('ta', 'nonexistent', [])).toThrow('TA function not found');
    });

    it('should throw for wrong number of arguments', () => {
      expect(() => engine.call('ta', 'sma', [])).toThrow('requires at least');
    });
  });
});

describe('TARegistry', () => {
  let registry: TARegistry;

  beforeEach(() => {
    registry = new TARegistry();
  });

  describe('register and get', () => {
    it('should register and retrieve function', () => {
      registry.register({
        name: 'test',
        namespace: 'test',
        minArgs: 0,
        maxArgs: 0,
        implementation: () => 42,
        description: 'Test function',
      });

      const func = registry.get('test', 'test');
      expect(func).toBeDefined();
      expect(func?.name).toBe('test');
    });

    it('should return undefined for non-existent function', () => {
      expect(registry.get('test', 'nonexistent')).toBeUndefined();
    });

    it('should check if function exists', () => {
      registry.register({
        name: 'test',
        namespace: 'test',
        minArgs: 0,
        maxArgs: 0,
        implementation: () => 42,
        description: 'Test function',
      });

      expect(registry.has('test', 'test')).toBe(true);
      expect(registry.has('test', 'nonexistent')).toBe(false);
    });
  });

  describe('call', () => {
    it('should call registered function', () => {
      registry.register({
        name: 'add',
        namespace: 'math',
        minArgs: 2,
        maxArgs: 2,
        implementation: (a: number, b: number) => a + b,
        description: 'Add two numbers',
      });

      const result = registry.call('math', 'add', [5, 3]);
      expect(result).toBe(8);
    });

    it('should throw for non-existent function', () => {
      expect(() => registry.call('math', 'nonexistent', [])).toThrow();
    });

    it('should throw for too few arguments', () => {
      registry.register({
        name: 'test',
        namespace: 'test',
        minArgs: 2,
        maxArgs: -1,
        implementation: () => 0,
        description: 'Test',
      });

      expect(() => registry.call('test', 'test', [1])).toThrow('requires at least');
    });

    it('should throw for too many arguments', () => {
      registry.register({
        name: 'test',
        namespace: 'test',
        minArgs: 0,
        maxArgs: 2,
        implementation: () => 0,
        description: 'Test',
      });

      expect(() => registry.call('test', 'test', [1, 2, 3])).toThrow('accepts at most');
    });

    it('should allow unlimited arguments when maxArgs is -1', () => {
      registry.register({
        name: 'sum',
        namespace: 'math',
        minArgs: 0,
        maxArgs: -1,
        implementation: (...args: number[]) => args.reduce((a, b) => a + b, 0),
        description: 'Sum',
      });

      expect(registry.call('math', 'sum', [1, 2, 3, 4, 5])).toBe(15);
    });
  });

  describe('getFunctionsByNamespace', () => {
    it('should get functions by namespace', () => {
      registry.register({
        name: 'func1',
        namespace: 'ns1',
        minArgs: 0,
        maxArgs: 0,
        implementation: () => 1,
        description: 'Function 1',
      });

      registry.register({
        name: 'func2',
        namespace: 'ns1',
        minArgs: 0,
        maxArgs: 0,
        implementation: () => 2,
        description: 'Function 2',
      });

      registry.register({
        name: 'func3',
        namespace: 'ns2',
        minArgs: 0,
        maxArgs: 0,
        implementation: () => 3,
        description: 'Function 3',
      });

      const ns1Functions = registry.getFunctionsByNamespace('ns1');
      expect(ns1Functions).toHaveLength(2);
    });
  });
});
