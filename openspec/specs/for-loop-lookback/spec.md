## Purpose
Detect lookback requirements from for-loop bodies in PineScript AST analysis.

## Requirements

### Requirement: For-loop body recursion in lookback detection
When processing a `ForStatement` node, the detector SHALL recurse into the loop body to find TA calls and `[]` indexing. The for-loop's upper bound SHALL NOT be treated as lookback (it represents search depth, not warmup).

#### Scenario: For loop with TA function inside
- **WHEN** `for x=1 to 1000` with `ta.sma(close, 20)` inside
- **THEN** lookback = 20 (from TA call, not loop bound)

#### Scenario: For loop with indexing inside
- **WHEN** `for x=1 to 1000` with `close[50]` inside
- **THEN** lookback = 50 (from indexing, not loop bound)

#### Scenario: For loop with no TA or indexing
- **WHEN** `for x=1 to 1000` with no TA calls or indexing inside
- **THEN** lookback = 0 (loop bound not used)

#### Scenario: Nested loops
- **WHEN** for-loops are nested inside each other
- **THEN** the detector SHALL recurse into each loop's body
