import { describe, it, expect } from 'vitest';
import { buildScriptResult } from '../hooks/chart-data-transform';
import { mergeDiffIntoResult } from '../hooks/indicator-merge';
import {
  normalizeExecutionResultMessage,
  type ExecutionResultMessageInput,
} from 'pine-framework/contracts';
import type { ScriptResult } from '../types';

/**
 * B11 — hlines feed wiring: the engine emits HLineEntry records (hline()
 * builtin) but they historically never crossed the execution-result contract
 * to PineChart.setHLines (which was hard-fed []). These tests prove:
 *   1. normalize() carries hlines through and fills [] when absent.
 *   2. buildScriptResult maps hlines into ScriptResult.
 *   3. The diff merge preserves hlines (static field — constant per script).
 *   4. A dotted zero-line hline survives the full path with its style intact.
 */

const DOTTED_ZERO_LINE = { price: 0, color: '#888888', style: 'dotted' as const, width: 1 };

function baseScriptResult(): ScriptResult {
  return buildScriptResult(true, {}, [], [], [], []);
}

describe('hlines contract wiring', () => {
  it('normalize fills hlines to [] when absent', () => {
    const msg: ExecutionResultMessageInput = { overlay: true };
    expect(normalizeExecutionResultMessage(msg).hlines).toEqual([]);
  });

  it('normalize carries hlines through with style intact', () => {
    const msg: ExecutionResultMessageInput = {
      overlay: true,
      hlines: [DOTTED_ZERO_LINE],
    };
    expect(normalizeExecutionResultMessage(msg).hlines).toEqual([DOTTED_ZERO_LINE]);
  });

  it('buildScriptResult maps hlines into ScriptResult', () => {
    const result = buildScriptResult(
      true,
      {},
      [],
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [DOTTED_ZERO_LINE],
    );
    expect(result.hlines).toEqual([DOTTED_ZERO_LINE]);
  });

  it('buildScriptResult defaults hlines to [] when not provided', () => {
    expect(baseScriptResult().hlines).toEqual([]);
  });

  it('diff merge preserves prev.hlines (static field, constant per script)', () => {
    const prev = { ...baseScriptResult(), hlines: [DOTTED_ZERO_LINE] };
    const merged = mergeDiffIntoResult(prev, {
      isConfirmed: false,
      overlay: true,
      outputs: { close: [1] },
    } as unknown as Parameters<typeof mergeDiffIntoResult>[1]);
    expect(merged.hlines).toEqual([DOTTED_ZERO_LINE]);
  });
});
