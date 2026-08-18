import { parseAndCompile, barsToContext, ExecutionEngine, type Bar } from 'pine-framework';
import type { ExecutionResultMessage } from 'pine-framework/contracts';
import { FormingCandleManager } from './FormingCandleManager.js';

/**
 * WS execution-result payload.
 *
 * WHY THIS IS AN ALIAS (B2): ScriptOutputs was a third hand-maintained copy
 * of the execution-result wire shape (drifted from REST execute.ts and the
 * frontend's ExecuteResponse/ExecutionResultMessage — optionality, extend,
 * maxLookback, mergedCells, isConfirmed). The Director mandate: build both
 * wire paths from ONE source of truth, "everything passed even if empty".
 * The contract union (ExecutionResultMessage) now requires all 17 collection
 * fields on both variants; the serializers (FormingCandleManager) guarantee
 * them via normalizeExecutionResultMessage(). Backend callers keep using the
 * ScriptOutputs name — it IS the shared contract type.
 */
export type ScriptOutputs = ExecutionResultMessage;

export class ScriptSession {
  public source: string;
  public symbol: string;
  public interval: string;
  private bars: Bar[];
  private engine: ExecutionEngine | null = null;
  private contexts: import('pine-framework').ExecutionContext[] = [];
  public version: number | null = null;
  private formingCandleManager: FormingCandleManager | null = null;

  constructor(source: string, symbol: string, interval: string, bars: Bar[]) {
    this.source = source;
    this.symbol = symbol;
    this.interval = interval;
    this.bars = bars;
  }

  initialize(): ScriptOutputs {
    const compileResult = parseAndCompile(this.source);
    this.version = compileResult.ir.version ?? null;
    this.engine = new ExecutionEngine(compileResult);
    this.contexts = barsToContext(this.bars);
    const result = this.engine.executeBars(this.contexts);
    this.formingCandleManager = new FormingCandleManager(this.bars, this.contexts, this.engine, this.version);
    return this.formingCandleManager.toOutputs(result);
  }

  appendOrUpdateBar(bar: Bar, confirmed?: boolean): ScriptOutputs {
    if (!this.engine || !this.formingCandleManager) {
      this.bars = [bar];
      this.contexts = barsToContext(this.bars);
      return this.initialize();
    }

    if (confirmed) {
      return this.formingCandleManager.confirm(bar);
    }

    return this.formingCandleManager.tick(bar);
  }

  /**
   * Returns any new alert triggers generated during the last confirmed bar
   * execution.  Used by the gateway to send Telegram notifications only for
   * the NEW bar's triggers, not all accumulated historical triggers.
   * Triggers are returned once and then cleared.
   */
  getPendingNewAlertTriggers(): Array<{ alertId: string; barIndex: number; timestamp: number }> {
    return this.formingCandleManager?.getPendingNewAlertTriggers() ?? [];
  }
}
