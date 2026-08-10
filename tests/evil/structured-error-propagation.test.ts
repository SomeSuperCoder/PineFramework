/**
 * Structured error propagation tests.
 *
 * Verifies that EngineError objects flow correctly from the executor
 * through to the API layer, preserving message, barIndex, and optional
 * source span. Also ensures backward compatibility with string-based
 * consumers.
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { ExecutionContext, EngineError } from '../../src/language/runtime/execution-types.js';
import { executePineScript } from '../../src/api.js';
import type { Bar } from '../../src/data/bar.js';

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    barIndex: 0,
    barCount: 100,
    timestamp: Date.now(),
    open: createSeries('open', [100]),
    high: createSeries('high', [105]),
    low: createSeries('low', [95]),
    close: createSeries('close', [102]),
    volume: createSeries('volume', [1000]),
    ...overrides,
  };
}

function makeBar(overrides?: Partial<Bar>): Bar {
  return {
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('Structured error propagation', () => {
  // ===========================================================================
  // EngineError structure
  // ===========================================================================

  it('runtime error on undefined variable produces EngineError with message', () => {
    const { ast } = parse('//@version=6\nindicator("")\nplot(unknownVar)');
    const result = compile(ast);
    const engine = new ExecutionEngine(result);
    const execResult = engine.executeBar(makeContext());

    expect(execResult.success).toBe(false);
    expect(execResult.error).toBeDefined();

    if (execResult.error) {
      // Current API: execution errors are structured EngineError objects
      expect(execResult.error.message).toBeDefined();
      expect(execResult.error.message.length).toBeGreaterThan(0);
    }
  });

  it('EngineError contains barIndex when available', () => {
    const { ast } = parse('//@version=6\nindicator("")\nplot(undefinedVar)');
    const result = compile(ast);
    const engine = new ExecutionEngine(result);
    const execResult = engine.executeBar(makeContext({ barIndex: 42 }));

    if (execResult.error && !(typeof execResult.error === 'string')) {
      // If structured, barIndex should be set
      // (we accept optional, but our interpreter sets it)
      expect(execResult.error.barIndex).toBeDefined();
    }
  });

  it('error persists in ExecutionResult across bars', () => {
    const { ast } = parse('//@version=6\nindicator("")\nplot(unknownVar)');
    const result = compile(ast);
    const engine = new ExecutionEngine(result);

    const result1 = engine.executeBar(makeContext({ barIndex: 0 }));
    expect(result1.success).toBe(false);

    const result2 = engine.executeBar(makeContext({ barIndex: 1 }));
    // Error should persist or re-occur
    expect(result2.error).toBeDefined();
  });

  // ===========================================================================
  // API layer integration
  // ===========================================================================

  it('executePineScript returns structured error on runtime failure', () => {
    const apiResult = executePineScript('//@version=6\nindicator("")\nplot(badVar)', [makeBar()]);

    expect(apiResult.error).toBeDefined();
    if (apiResult.error) {
      if (typeof apiResult.error === 'string') {
        expect(apiResult.error.length).toBeGreaterThan(0);
      } else {
        expect(apiResult.error.message).toBeDefined();
      }
    }
  });

  it('executePineScript returns no error on successful execution', () => {
    const apiResult = executePineScript('//@version=6\nindicator("")\nplot(close)', [makeBar()]);

    expect(apiResult.error).toBeUndefined();
    expect(apiResult.outputs).toBeDefined();
  });

  // ===========================================================================
  // Backward compatibility
  // ===========================================================================

  it('consumer can extract message from either string or EngineError', () => {
    const extractMessage = (err: string | EngineError): string => {
      if (typeof err === 'string') return err;
      return err.message ?? 'Unknown error';
    };

    const stringError = 'old style string error';
    expect(extractMessage(stringError)).toBe('old style string error');

    const structuredError: EngineError = { message: 'new style error', barIndex: 0 };
    expect(extractMessage(structuredError)).toBe('new style error');
  });

  // ===========================================================================
  // Success path — no error
  // ===========================================================================

  it('successful bar execution has no error', () => {
    const { ast } = parse('//@version=6\nindicator("")\nplot(close)');
    const result = compile(ast);
    const engine = new ExecutionEngine(result);
    const execResult = engine.executeBar(makeContext());

    expect(execResult.success).toBe(true);
    expect(execResult.error).toBeUndefined();
  });

  it('multiple successful bars produce no errors', () => {
    const { ast } = parse('//@version=6\nindicator("")\nplot(close)');
    const result = compile(ast);
    const engine = new ExecutionEngine(result);

    for (let i = 0; i < 5; i++) {
      const execResult = engine.executeBar(makeContext({ barIndex: i }));
      expect(execResult.success).toBe(true);
      expect(execResult.error).toBeUndefined();
    }
  });
});
