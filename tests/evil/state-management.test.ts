/**
 * Evil tests: State Management (Snapshot/Rollback)
 *
 * Adversarial scenarios for the execution engine's state management:
 * rollback without snapshot, double rollback, stale snapshots,
 * snapshot during forming candle, snapshot after bar push.
 * Verifies graceful handling and state consistency.
 */

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine.js';
import { makeEvilBarContext } from './helpers.js';

/** Helper: create a simple engine with a script and execute N bars. */
function createEngine(barCount = 5): ExecutionEngine {
  const source = `//@version=6
indicator("Test")
x = close
plot(x, "x")
`;
  const { ast } = parse(source);
  const result = compile(ast);
  const engine = new ExecutionEngine(result);

  for (let i = 0; i < barCount; i++) {
    engine.executeBar(makeEvilBarContext({}, i + 1));
  }
  return engine;
}

describe('Evil state — rollback edge cases', () => {
  it('rollbackToSnapshot(0) rolls back to first snapshot (auto-created by interpreter)', () => {
    const engine = createEngine(3);
    // Interpreter auto-creates snapshots per bar, so snapshot 0 exists
    expect(engine.rollbackToSnapshot(0)).toBe(true);
  });

  it('rollbackToSnapshot(999) with nonexistent index returns false', () => {
    const engine = createEngine(3);
    // index beyond snapshot count
    const snapCount = engine['snapshots']?.length ?? 0;
    expect(engine.rollbackToSnapshot(snapCount + 999)).toBe(false);
  });

  it('rollbackToPreviousBar succeeds when auto-snapshots exist (default behavior)', () => {
    const engine = createEngine(3);
    // Interpreter auto-creates snapshots on each bar, so rollback should work
    expect(engine.rollbackToPreviousBar()).toBe(true);
  });

  it('rollback restores output series values to snapshot state', () => {
    const engine = createEngine(3);

    // Create explicit snapshot
    engine.createSnapshot();
    const snapOutput = engine.getOutput('x')?.last();

    // Execute one more bar
    engine.executeBar(makeEvilBarContext({}, 4));
    const postOutput = engine.getOutput('x')?.last();

    // Rollback to explicit snapshot
    engine.rollbackToPreviousBar();

    // Output series should have been restored to snapshot state
    // (Note: metrics.totalBars is NOT part of the snapshot and stays at post-execution value)
    expect(engine.getOutput('x')?.last()).not.toBe(postOutput);
  });

  it('forming candle state rolled back after rollback', () => {
    const engine = createEngine(5);

    // Record the output before forming candle
    const preVal = engine.getOutput('x')?.last();

    // Simulate a forming candle update
    engine.setFormingCandle(true);
    engine.computeFormingCandle(makeEvilBarContext({}, 6));
    engine.setFormingCandle(false);

    // Output should be restored to pre-forming-candle value since computeFormingCandle
    // internally restores engine state after computing diffs
    expect(engine.getOutput('x')?.last()).toBe(preVal);
  });
});
