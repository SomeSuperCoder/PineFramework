## Requirement: for-loop-lookback

### ADDED: For-loop body recursion in `detectLookbackFromAST`

When processing a `ForStatement` node, the detector recurses into the loop body to find TA calls and `[]` indexing. The for-loop's upper bound is NOT treated as lookback (it represents search depth, not warmup).

**Detection rules:**

- `for x=1 to 1000` with `ta.sma(close, 20)` inside → lookback = 20 (from TA call, not loop bound)
- `for x=1 to 1000` with `close[50]` inside → lookback = 50 (from indexing, not loop bound)
- `for x=1 to 1000` with no TA calls or indexing inside → lookback = 0 (loop bound not used)
- Nested loops: recurse into each loop's body

**Integration:**

- Called in `detectLookbackInStatements()` for `ForStatement` kind
- Combined with existing TA and `[]` detection via MAX
- Only applies when `maxBarsBack === 0` (no explicit declaration)
