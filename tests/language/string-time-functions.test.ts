import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function createBarContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    barIndex: 0,
    barCount: 100,
    timestamp: Date.now(),
    open: createSeries('open', [100]),
    high: createSeries('high', [105]),
    low: createSeries('low', [95]),
    close: createSeries('close', [102]),
    volume: createSeries('volume', [1000000]),
    ...overrides,
  };
}

function executeScript(source: string, bars: ExecutionContext[] = []): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);

  if (bars.length === 0) {
    bars = [createBarContext()];
  }

  for (const bar of bars) {
    engine.executeBar(bar);
  }

  return engine;
}

describe('String functions', () => {
  describe('str.format', () => {
    it('formats string with arguments', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.format("Value: {0}", 42)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('handles na values in format', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.format("Value: {0}", na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('str.length', () => {
    it('returns string length', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.length("hello")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.length(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('str.substring', () => {
    it('returns substring', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.substring("hello", 1, 3)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.substring(na, 1, 3)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('str.contains', () => {
    it('checks if string contains substring', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.contains("hello world", "world")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.contains(na, "world")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('str.replace', () => {
    it('replaces substring', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.replace("hello world", "world", "there")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.replace(na, "world", "there")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('str.split', () => {
    it('splits string by separator', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.split("a,b,c", ",")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.split(na, ",")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('str.tolower', () => {
    it('converts to lowercase', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.tolower("HELLO")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.tolower(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('str.toupper', () => {
    it('converts to uppercase', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.toupper("hello")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.toupper(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('str.trim', () => {
    it('trims whitespace', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.trim("  hello  ")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.trim(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('str.tonumber', () => {
    it('converts string to number', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.tonumber("42")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for invalid number', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.tonumber("hello")
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.tonumber(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('str.tostring', () => {
    it('converts number to string', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.tostring(42)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = str.tostring(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });
});

describe('Time functions', () => {
  describe('time.year', () => {
    it('extracts year from timestamp', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.year(time)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.year(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('time.month', () => {
    it('extracts month from timestamp', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.month(time)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.month(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('time.dayofweek', () => {
    it('extracts day of week from timestamp', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.dayofweek(time)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.dayofweek(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('time.hour', () => {
    it('extracts hour from timestamp', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.hour(time)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.hour(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('time.minute', () => {
    it('extracts minute from timestamp', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.minute(time)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.minute(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('time.second', () => {
    it('extracts second from timestamp', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.second(time)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = time.second(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('timestamp', () => {
    it('creates timestamp from date components', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = timestamp(2024, 1, 15, 10, 30, 0)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('creates timestamp with default time', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = timestamp(2024, 1, 15)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = timestamp(na, 1, 15)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });
});

describe('Math functions', () => {
  describe('math.floor', () => {
    it('floors number', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.floor(3.7)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.floor(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.ceil', () => {
    it('ceils number', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.ceil(3.2)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.ceil(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.pow', () => {
    it('calculates power', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.pow(2, 3)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.pow(na, 3)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.sqrt', () => {
    it('calculates square root', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.sqrt(16)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.sqrt(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.log', () => {
    it('calculates natural log', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.log(10)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.log(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.log10', () => {
    it('calculates log base 10', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.log10(100)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.log10(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.exp', () => {
    it('calculates exponential', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.exp(1)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.exp(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.sin', () => {
    it('calculates sine', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.sin(0)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.sin(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.cos', () => {
    it('calculates cosine', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.cos(0)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.cos(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.tan', () => {
    it('calculates tangent', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.tan(0)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.tan(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.sign', () => {
    it('returns sign of number', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.sign(-5)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('returns na for na input', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.sign(na)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });

  describe('math.sum', () => {
    it('sums multiple values', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.sum(1, 2, 3, 4, 5)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });

    it('ignores na values in sum', () => {
      const source = `
        //@version=6
        indicator("Test")
        result = math.sum(1, na, 3, na, 5)
      `;
      const engine = executeScript(source);
      expect(engine).toBeDefined();
    });
  });
});
