## Context

The pine-framework engine compiles Pine Scripts via: `parse() → compile() → ExecutionEngine`. The compiler walks the AST to produce `CompiledScript` (globals, functions, IR instructions) but currently ignores lookback requirements from TA function calls and `[]` indexing.

The `CompiledScript.maxBarsBack` field exists (added in `skip-scripts-until-lookback-satisfied`) and is parsed from `indicator()` args, but when undeclared, defaults to 0. The `applyLookbackFilter()` in `executeBars()` only applies filtering when `maxBarsBack > 0`.

## Goals / Non-Goals

**Goals:**
- Automatically detect lookback period from TA function calls with constant period args
- Automatically detect lookback period from `[]` indexing with constant offsets
- Store detected lookback in `CompiledScript.maxBarsBack` when not explicitly declared
- Make `applyLookbackFilter()` work for ALL scripts automatically

**Non-Goals:**
- Dynamic period detection (where period is a variable, not a constant)
- Modifying runtime lookback (`getMaxLookback()`) — it stays for runtime edge cases
- Changing the filter behavior — only the data source changes (compile-time vs declared)

## Decisions

### Decision: Where to Detect Lookback

**Choice**: In `Compiler.compile()`, walk the AST after generating IR to detect lookback.

**Rationale**: The AST is available as `program` in the compile step. We already walk statements in `compileStatement()`. Adding a lightweight post-IR pass to detect lookback periods is clean and doesn't interfere with IR generation.

**Alternatives Considered**:
- During IR generation: couples IR emission with lookback detection, making both harder to maintain
- Separate analyzer pass: cleaner separation but adds a new file and compile step
- Runtime detection: already exists (getMaxLookback()), can't gate warmup bars

### Decision: Detection Pattern

**Choice**: Walk all AST nodes looking for:
1. `CallExpression` where callee is `ta.ema|ta.sma|ta.rsi|ta.atr|ta.hma|ta.macd|ta.stoch|ta.wpr|ta.cci|ta.mfi|ta.dmi|ta.obv|ta.vwap|ta.ad|ta.adosc` — extract period from second positional arg (index 1)
2. `IndexExpression` where object is `close|open|high|low|volume` and index is a number — extract offset
3. Take the MAX of all detected periods

**Rationale**: These are the most common TA functions with fixed-length lookback. `[]` indexing on OHLCV data is the other primary source of lookback requirements.

### Decision: When to Apply Detection

**Choice**: Only when `CompiledScript.maxBarsBack === 0` (not explicitly declared).

**Rationale**: Explicit declaration always takes precedence. Detection fills in the gap for undeclared scripts.

## Risks / Trade-offs

**[Risk] Variable period args** → `ta.ema(src, length)` where `length` is a variable won't be detected. Mitigation: fall back to runtime `getMaxLookback()` (existing behavior, no regression).

**[Risk] Custom TA functions** → User-defined functions wrapping TA calls won't have their inner lookback detected. Mitigation: AST walk only sees direct `ta.*` calls; this is acceptable for v1.

**[Risk] Nested `[]` indexing** → `ta.highest(high, 50)[10]` needs max(50, 10). Mitigation: detect both the function period and the indexing offset, take the max.
