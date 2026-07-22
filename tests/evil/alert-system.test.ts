/**
 * Evil tests: Alert System
 *
 * Adversarial scenarios for alert conditions and triggers:
 * duplicate suppression, extreme message sizes, rapid triggers,
 * and rollback consistency.
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { makeEvilBarContext } from './helpers.js';

/** Helper: compile and execute a simple alert script. */
function createAlertEngine(barCount = 10): ExecutionEngine {
  const source = `//@version=6
indicator("AlertTest")

condition = close > open
alertcondition(condition, title="Test Alert", message="Price moved up")

plot(close)
`;
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);

  for (let i = 0; i < barCount; i++) {
    engine.executeBar(makeEvilBarContext({}, i + 1));
  }
  return engine;
}

describe('Evil alert — duplicate triggers', () => {
  it('empty alert message does not crash', () => {
    const source = `//@version=6
indicator("EmptyAlert")
condition = close > open
alertcondition(condition, title="Empty", message="")
plot(close)
`;
    const { ast } = parse(source);
    const result = compile(ast);
    const engine = new ExecutionEngine(result);

    expect(() => {
      engine.executeBar(makeEvilBarContext({}, 1));
    }).not.toThrow();
  });

  it('alert with 10000-character message does not crash', () => {
    const longMsg = 'A'.repeat(10000);
    const source = `//@version=6
indicator("LongAlert")
condition = close > open
alertcondition(condition, title="Long", message="${longMsg}")
plot(close)
`;
    const { ast } = parse(source);
    const result = compile(ast);
    const engine = new ExecutionEngine(result);

    expect(() => {
      engine.executeBar(makeEvilBarContext({}, 1));
    }).not.toThrow();
  });

  it('alert with special characters does not crash', () => {
    const source = `//@version=6
indicator("SpecialAlert")
condition = close > open
alertcondition(condition, title="Special", message="<script>alert(1)</script> & \\"quotes\\" 中文 ±")
plot(close)
`;
    const { ast } = parse(source);
    const result = compile(ast);
    const engine = new ExecutionEngine(result);

    expect(() => {
      engine.executeBar(makeEvilBarContext({}, 1));
    }).not.toThrow();
  });
});

describe('Evil alert — rapid triggers', () => {
  it('many alertcondition calls do not crash', () => {
    // Create a script with many alertcondition declarations
    let conditions = '';
    for (let i = 0; i < 50; i++) {
      conditions += `alertcondition(close > open, title="Alert${i}", message="Trigger ${i}")\n`;
    }

    const source = `//@version=6
indicator("ManyAlerts")
${conditions}
plot(close)
`;
    const { ast } = parse(source);
    const result = compile(ast);
    const engine = new ExecutionEngine(result);

    expect(() => {
      for (let i = 0; i < 5; i++) {
        engine.executeBar(makeEvilBarContext({}, i + 1));
      }
    }).not.toThrow();
  });
});

describe('Evil alert — rollback consistency', () => {
  it('engine with alerts handles snapshot/rollback without crash', () => {
    const engine = createAlertEngine(5);

    engine.createSnapshot();
    engine.executeBar(makeEvilBarContext({}, 6));

    // Rollback should not crash
    expect(() => {
      engine.rollbackToPreviousBar();
    }).not.toThrow();
    // Note: metrics.totalBars is NOT part of snapshots and stays at
    // post-execution value — this tests that rollback doesn't throw
  });
});
