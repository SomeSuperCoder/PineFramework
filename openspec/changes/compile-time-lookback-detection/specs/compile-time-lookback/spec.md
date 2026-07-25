## Requirement: compile-time-lookback-detection

### ADDED: `detectLookbackFromAST`

A function in `compiler.ts` that statically analyzes the AST body to extract the minimum lookback period required by the script.

**Detection rules:**

1. **TA function calls** — For each `ta.*` CallExpression with constant period arguments:
   - `ta.sma(src, N)` → N
   - `ta.ema(src, N)` → N
   - `ta.hma(src, N)` → N
   - `ta.rsi(src, N)` → N
   - `ta.atr(N)` → N
   - `ta.highest(src, N)` → N
   - `ta.lowest(src, N)` → N
   - `ta.valuewhen(cond, src, N)` → N

2. **Pivot functions** — Combined lookback:
   - `ta.pivothigh(L, R)` → L + R
   - `ta.pivotlow(L, R)` → L + R

3. **`[]` indexing** — For IndexExpression with constant offset:
   - `close[N]` → N
   - `open[N]` → N
   - `high[N]` → N
   - `low[N]` → N
   - `volume[N]` → N
   - `variableName[N]` → N (user-defined series)

4. **Combined detection** — MAX of all detected values. Only constant (numeric literal) arguments are detected; variable or computed periods are skipped.

**Edge cases:**
- Empty program body → 0
- No detected lookback → 0
- Nested blocks (if/for/while) → walk all branches
- Variable period arguments → skip (fall back to runtime lookback)

**Integration:**
- Called in `Compiler.compile()` after IR generation
- Only populates `maxBarsBack` when `maxBarsBack === 0` (declaration takes precedence)
- Does NOT modify IR — only affects `CompiledScript.maxBarsBack` metadata
