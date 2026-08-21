/**
 * Unit tests: Length-based scope checkpoints (F3 perf fix)
 *
 * Locks checkpointScope/restoreScopeCheckpoint core semantics:
 * series truncation, post-checkpoint declarations dropped,
 * pre-checkpoint history preserved, the compound-assignment
 * in-place last-slot write edge, and restore idempotency.
 */

import { describe, expect, it } from 'vitest';
import {
  checkpointScope,
  createRuntimeScope,
  declareVariable,
  restoreScopeCheckpoint,
  type ScopeCheckpoint,
} from '../../../src/language/runtime/scope.js';
import { createSeries } from '../../../src/language/runtime/series.js';
import { FLOAT_TYPE } from '../../../src/language/types/pine-types.js';

describe('scope checkpoints — length-based rollback', () => {
  it('truncates a series that grew between checkpoint and restore', () => {
    const scope = createRuntimeScope();
    const binding = declareVariable(scope, 'x', FLOAT_TYPE);
    binding.series.values.push(1);

    const cp = checkpointScope(scope);
    expect(binding.series.values.length).toBe(1);
    expect(cp.entries.length).toBe(1);

    // Series grows after the checkpoint.
    binding.series.values.push(2, 3);
    expect(binding.series.values.length).toBe(3);

    restoreScopeCheckpoint(cp);
    expect(binding.series.values.length).toBe(1);
    expect(binding.series.values).toEqual([1]);
  });

  it('drops variables declared after the checkpoint', () => {
    const scope = createRuntimeScope();
    declareVariable(scope, 'early', FLOAT_TYPE);

    const cp = checkpointScope(scope);

    declareVariable(scope, 'late', FLOAT_TYPE);
    expect(scope.variables.has('late')).toBe(true);

    restoreScopeCheckpoint(cp);
    expect(scope.variables.has('early')).toBe(true);
    expect(scope.variables.has('late')).toBe(false);
  });

  it('preserves full history of variables declared before the checkpoint', () => {
    const scope = createRuntimeScope();
    const binding = declareVariable(scope, 'x', FLOAT_TYPE);
    binding.series.values.push(10, 20, 30);

    const cp = checkpointScope(scope);
    restoreScopeCheckpoint(cp);

    expect(binding.series.values).toEqual([10, 20, 30]);
    expect(scope.variables.get('x')?.series.values).toEqual([10, 20, 30]);
  });

  it('restores the last slot to its pre-write value (compound-assignment edge)', () => {
    // Mirrors statement-executor.ts:158-163: a compound assignment (`+=` etc.)
    // overwrites the LAST SLOT in place (`values[len-1] = result`) instead of
    // pushing. This is safe for length-based checkpoints ONLY because the
    // in-place write always follows a same-bar `push` (setVariableValue /
    // pushBarValues) — the "compound-assignment-before-push" invariant. Pin
    // that real ordering: checkpoint → push (new bar value) → in-place
    // overwrite → restore must yield the pre-push state.
    const scope = createRuntimeScope();
    const binding = declareVariable(scope, 'x', FLOAT_TYPE);
    binding.series.values.push(1); // bar 1

    const cp = checkpointScope(scope);

    // Bar 2: push then in-place compound write to the last slot.
    binding.series.push(2);
    binding.series.values[binding.series.values.length - 1] = 99;
    expect(binding.series.values).toEqual([1, 99]);

    restoreScopeCheckpoint(cp);
    expect(binding.series.values).toEqual([1]);
  });

  it('documents the unsafe ordering: in-place write WITHOUT a post-checkpoint push is NOT reverted', () => {
    // ⚠️ Pins the LIMIT of the length-based design: if code ever writes
    // values[len-1] in place between checkpoint and restore WITHOUT pushing
    // first (i.e. violates the compound-assignment-before-push invariant),
    // the mutated value survives restore. This test documents that known
    // boundary so a future violation surfaces as a deliberate decision.
    const scope = createRuntimeScope();
    const binding = declareVariable(scope, 'x', FLOAT_TYPE);
    binding.series.values.push(1);

    const cp = checkpointScope(scope);
    binding.series.values[binding.series.values.length - 1] = 99;

    restoreScopeCheckpoint(cp);
    expect(binding.series.values).toEqual([99]); // known limitation, not a regression
  });

  it('is idempotent — restoring twice yields the same state', () => {
    const scope = createRuntimeScope();
    const binding = declareVariable(scope, 'x', FLOAT_TYPE);
    binding.series.values.push(7);

    const cp: ScopeCheckpoint = checkpointScope(scope);
    binding.series.values.push(8, 9);
    declareVariable(scope, 'y', FLOAT_TYPE);

    restoreScopeCheckpoint(cp);
    const snapshotAfterFirst =
      JSON.stringify([...scope.variables.get('x')!.series.values]) +
      JSON.stringify([...scope.variables.keys()].sort());

    restoreScopeCheckpoint(cp);
    const snapshotAfterSecond =
      JSON.stringify([...scope.variables.get('x')!.series.values]) +
      JSON.stringify([...scope.variables.keys()].sort());

    expect(snapshotAfterSecond).toBe(snapshotAfterFirst);
    expect(binding.series.values).toEqual([7]);
  });

  it('checkpoints and restores parent scopes recursively', () => {
    const parent = createRuntimeScope();
    const child = createRuntimeScope(parent);
    const parentBinding = declareVariable(parent, 'p', FLOAT_TYPE);
    parentBinding.series.values.push(1);
    const childBinding = declareVariable(child, 'c', FLOAT_TYPE);
    childBinding.series.values.push(2);

    const cp = checkpointScope(child); // captures child + parent

    parentBinding.series.values.push(11);
    childBinding.series.values.push(22);
    declareVariable(child, 'extra', FLOAT_TYPE);

    restoreScopeCheckpoint(cp);
    expect(parentBinding.series.values).toEqual([1]);
    expect(childBinding.series.values).toEqual([2]);
    expect(child.variables.has('extra')).toBe(false);
  });
});

// Guard against accidental import drift: series helper sanity.
describe('checkpoint fixtures', () => {
  it('createSeries supports initialValues used by clone semantics parity', () => {
    const s = createSeries('n', [1, 2]);
    expect(s.values).toEqual([1, 2]);
  });
});
