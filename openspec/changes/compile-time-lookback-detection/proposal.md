## Why

The previous change (`skip-scripts-until-lookback-satisfied`) added output filtering for scripts that explicitly declare `max_bars_back` in their `indicator()`/`strategy()` declaration. However, most scripts don't declare `max_bars_back` — they rely on implicit lookback from TA function calls like `ta.ema(src, 50)` and `[]` indexing like `close[20]`. Without compile-time detection of these lookback requirements, scripts still produce labels stacked on the oldest candle.

## What Changes

- **NEW**: Static AST analysis during compilation to automatically detect lookback period from:
  - **TA function calls** with constant period arguments (15 TA builtins: `ta.sma`, `ta.ema`, `ta.hma`, `ta.rsi`, `ta.atr`, `ta.highest`, `ta.lowest`, `ta.pivothigh`, `ta.pivotlow`, `ta.valuewhen`, `ta.sar`, `ta.crossover`, `ta.crossunder`, `ta.cross`, `ta.change`)
  - **Pivot functions** with combined lookback (`ta.pivothigh(leftBars, rightBars)` → `leftBars + rightBars`)
  - **Series history indexing** with constant offsets (`close[50]`, `open[100]`, `high[5]`, `low[3]`, `volume[50]`)
  - **User-defined variable indexing** (`mySeries[10]` → 10)
- **NEW**: The detected lookback is stored on `CompiledScript.maxBarsBack` when the user hasn't explicitly set it
- The existing `applyLookbackFilter()` in `executeBars()` now applies automatically to ALL scripts (not just those with explicit declarations)
- The runtime lookback fallback (`getMaxLookback()`) is preserved for edge cases where compile-time analysis can't determine a period (variable period arguments, `ta.barssince()`, `ta.cum()`)

## Capabilities

### New Capabilities
- `compile-time-lookback`: Detects minimum required lookback from TA function params and `[]` indexing during AST analysis

### Modified Capabilities
- `execution-engine`: `CompiledScript.maxBarsBack` is now auto-populated when not declared

## Impact

- **Code**: `src/language/compiler/compiler.ts` — add AST walk to detect lookback
- **Code**: `src/language/compiler/ir.ts` — no change (maxBarsBack already exists)
- **Code**: `src/language/runtime/execution-engine.ts` — no change (filter already works)
- **Code**: `src/language/runtime/interpreter.ts` — no change (filter already works)
- **Behavior**: All scripts automatically get lookback-based output filtering without explicit declaration
- **Performance**: AST walk adds ~O(n) to compile step where n is AST node count — negligible

## TA Functions — Complete Detection Table

| Function | Period Arg Position | Detection Logic |
|----------|-------------------|-----------------|
| `ta.sma(src, length)` | Arg 1 | Extract constant from length |
| `ta.ema(src, length)` | Arg 1 | Extract constant from length |
| `ta.hma(src, length)` | Arg 1 | Extract constant from length |
| `ta.rsi(src, length)` | Arg 1 | Extract constant from length |
| `ta.atr(length)` | Arg 0 | Extract constant from length |
| `ta.highest(src, length)` | Arg 1 | Extract constant from length |
| `ta.lowest(src, length)` | Arg 1 | Extract constant from length |
| `ta.pivothigh(leftBars, rightBars)` | Args 0+1 | Sum of both constants |
| `ta.pivotlow(leftBars, rightBars)` | Args 0+1 | Sum of both constants |
| `ta.valuewhen(cond, src, occ)` | Arg 2 | Extract constant occurrence |
| `ta.sar(start, inc, max)` | N/A | No traditional lookback (acceleration factors) |
| `ta.crossover / crossunder / cross` | N/A | No lookback period |
| `ta.change(source)` | N/A | No lookback period |
