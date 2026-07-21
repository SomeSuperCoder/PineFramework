## Forming Candle Lifecycle Management

### 1. Overview

The `FormingCandleManager` module encapsulates the forming candle lifecycle management (tick processing, confirm processing, barTimestamps padding) to separate it from the main `ScriptSession` logic. This improves separation of concerns and makes the forming candle computation easier to test and maintain.

### 2. Module Interface

```typescript
class FormingCandleManager {
  constructor(engine: ExecutionEngine, bars: Bar[], barTimestamps: number[])

  tick(bar: Bar): FormingCandleResult
  confirm(bar: Bar): FormingCandleResult
  toOutputs(result: ExecutionResult): ScriptOutputs
  toFormingCandleOutputs(result: ExecutionResult): ScriptOutputs
  getBarTimestamps(): number[]
}
```

### 3. Responsibilities

- **tick()**: Process intra-bar updates (forming candle ticks)
- **confirm()**: Process bar close (confirmed bar)
- **toOutputs()**: Convert computation results to the output format for confirmed bars
- **toFormingCandleOutputs()**: Convert computation results to the output format for forming candle updates
- **barTimestamps padding**: Ensure barTimestamps includes uncommitted new bars for correct time alignment

### 4. Integration with ScriptSession

The `ScriptSession` delegates forming candle operations to the `FormingCandleManager`:

```typescript
class ScriptSession {
  private formingCandleManager: FormingCandleManager

  tick(bar: Bar): ScriptOutputs {
    this.engine.setFormingCandle(true)
    const result = this.formingCandleManager.tick(bar)
    return this.formingCandleManager.toFormingCandleOutputs(result)
  }

  confirm(bar: Bar): ScriptOutputs {
    this.engine.setFormingCandle(false)
    const result = this.formingCandleManager.confirm(bar)
    return this.formingCandleManager.toOutputs(result)
  }
}
```

## Forming Candle Color Updates

### 1. Overview

The forming candle computation must produce correct bgcolor, fillColorData, and plotColors diffs. Previously, these diffs were computed before restoring the pre-execution state, resulting in empty diffs because the restored state matched the snapshot. The fix moves the restoration to AFTER diff computation.

### 2. Diff Computation Order

```
1. Execute script for forming candle
2. Compute bgcolor diff (newBgcolorData vs this.bgcolorData)
3. Compute fillColorData diff (newFillColorData vs this.fillColorData)
4. Compute plotColors diff (newPlotColors vs this.plotColors)
5. Restore pre-execution state (barTimestamps, outputSeriesLength)
6. Apply diffs to the forming candle result
```

### 3. Why This Order Matters

- Before the fix: restoration happened at step 1, making all diffs perpetually empty (restored state matched snapshot)
- After the fix: restoration happens at step 5, so diffs capture actual changes during forming candle execution
- This ensures bgcolor, fill, and plot color changes are correctly reflected on the forming candle
