# Pine Script Compatibility Task

## Objective

Make the attached Pine Script indicator produce identical output to TradingView.

## Workflow

### Step 1: Create the integration test FIRST

Before fixing anything, write `tests/integration/<script-name>.test.ts`. This test is your feedback loop — you will run it repeatedly until it passes.

```typescript
import { PineParser } from '../../src/language/parser/parser';
import { PineCompiler } from '../../src/language/compiler';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine';
import { SampleData } from '../helpers/sample-data';

describe('<Script Name>', () => {
  let parser: PineParser;
  let compiler: PineCompiler;
  let engine: ExecutionEngine;

  beforeEach(() => {
    parser = new PineParser();
    compiler = new PineCompiler();
    engine = new ExecutionEngine();
  });

  it('parses and compiles without errors', () => {
    const code = `<paste script here>`;
    const ast = parser.parse(code);
    const compiled = compiler.compile(ast);
    expect(compiled).toBeDefined();
  });

  it('produces expected output keys', () => {
    const code = `<paste script here>`;
    const ast = parser.parse(code);
    const compiled = compiler.compile(ast);
    const data = SampleData.generate(500);
    const result = engine.execute(compiled, data);
    // List every key you expect from TradingView:
    expect(result.plots).toHaveProperty('plot_0');
    expect(result.plots).toHaveProperty('plot_1');
  });

  it('has no na values after warmup period', () => {
    const code = `<paste script here>`;
    const ast = parser.parse(code);
    const compiled = compiler.compile(ast);
    const data = SampleData.generate(500);
    const result = engine.execute(compiled, data);
    const warmup = 250; // adjust based on indicator
    for (let i = warmup; i < result.plots.plot_0.length; i++) {
      expect(result.plots.plot_0[i]).not.toBeNull();
    }
  });

  it('matches TradingView values within tolerance', () => {
    const code = `<paste script here>`;
    const ast = parser.parse(code);
    const compiled = compiler.compile(ast);
    const data = SampleData.generate(500);
    const result = engine.execute(compiled, data);
    // Paste known TradingView values for specific bars:
    const expected = [
      { bar: 300, value: 12345.67 },
      { bar: 350, value: 12400.12 },
      { bar: 400, value: 12380.45 },
    ];
    for (const { bar, value } of expected) {
      expect(result.plots.plot_0[bar]).toBeCloseTo(value, 1);
    }
  });

  it('produces shapes when expected', () => {
    const code = `<paste script here>`;
    const ast = parser.parse(code);
    const compiled = compiler.compile(ast);
    const data = SampleData.generate(500);
    const result = engine.execute(compiled, data);
    // If TradingView shows shapes:
    expect(result.shapes.length).toBeGreaterThan(0);
    expect(result.shapes[0].barIndex).toBeDefined();
    expect(result.shapes[0].color).toBeDefined();
  });
});
```

Run the test:
```bash
pnpm test -- --testPathPattern=<script-name>
```

### Step 2: Fix until the test passes

Read the test output. Fix the first failing assertion. Re-run. Repeat.

Work bottom-up through layers:

| Layer | File | 
|-------|------|
| Tokenizer | `src/language/parser/tokenizer.ts` |
| Parser | `src/language/parser/parser.ts` |
| AST | `src/language/parser/ast/nodes.ts` |
| Compiler | `src/language/compiler.ts` |
| Runtime | `src/language/runtime/execution-engine.ts` |
| Builtins | `src/language/runtime/execution-engine.ts` |
| Backend | `backend/src/routes/execute.ts`, `backend/src/session/ScriptSession.ts` |
| Frontend | `frontend/src/hooks/useChartData.ts`, `frontend/src/chart/renderers/` |

### Step 3: Expand the test

Once the basic test passes, add assertions for:
- All plot output keys and their values
- All shapes/fills/barcolors and their positions/colors
- Edge cases (na handling, var persistence, history operator)
- Visual correctness (colors match TradingView, positions are correct)

## Test Structure Rules

1. **One `it` block per assertion type** — output keys, na values, value matching, shapes
2. **Hard-code expected values from TradingView** — pick 3-5 specific bars and paste their exact values
3. **Use `toBeCloseTo` for floats** — tolerance of 1 decimal place for price values
4. **Use `SampleData.generate(N)` for consistent test data** — always 500 bars unless the script needs more
5. **Separate warmup from assertion** — indicators need bars to converge; don't assert on early bars
6. **Test shapes independently from plots** — shapes have their own assertion path

## Rules

- Do not modify the `.pine` script file.
- Run lint and typecheck after every change: `pnpm run lint && pnpm run typecheck`
- Do not commit unless asked.
- Follow existing code conventions — check neighboring files before writing new code.

## Gotchas

- `ta.atr(length)` needs 200+ bars to warm up
- `method` keyword → parsed as `FunctionExpression`, resolved at runtime
- PascalCase identifiers → `looksLikeUserType` guard prevents false typed-declaration parsing
- Compound assignments (`+=`, etc.) → separate token types, read current value via `getRelative(0)`
- `namedArgs` must not leak as positional args
- `var` persists via `functionPersistentScopes` — parameters re-assign each bar
- `barColorData` must be in snapshots and rollbacks
- `plotshape` title (2nd positional arg) is internal — use `text` named arg for display
- `location.absolute` positions via the shape's `price` field through `priceToPixel()`
- Shape `price` flows: engine → backend → frontend hook → chart component → renderer

## Critical Lessons Learned

### 1. Parser else-binding MUST respect Pine Script indentation

**This was the #1 most impactful bug found.** In Pine Script, `else` belongs to the `if` at the **same indentation level**, not the most recently parsed `if`. The original parser consumed `else` unconditionally, which caused nested `if` blocks to steal `else` clauses from outer `if` statements.

**The pattern that breaks:**
```pine
if trend                       // column 0
    if close < trail           // column 4 — indented inner if
        ...
else                           // column 0 — belongs to OUTER if, not inner!
    trail := math.min(...)     // NEVER EXECUTED if inner if steals the else
```

**The fix:** Add a `baseColumn` parameter to `parseIfStatement`:
- For standalone `if`, `baseColumn` = the `if` keyword's column
- For `else if`, `baseColumn` = the `else` keyword's column (passed recursively)
- An `else` is only consumed when `elseToken.span.start.column >= baseColumn`
- When parsing `else if`, consume the `if` keyword before recursing into `parseIfStatement(baseColumn)`

**Why this matters:** Without this fix, any indicator with nested `if/else` blocks at different indentation levels will silently produce wrong results — the `else` branch simply never executes. The trail going flat is the classic symptom: the trail update logic is in the `else` branch and never runs.

### 2. Debug trail flatness by tracing intermediate values

When a trail line goes perfectly horizontal after a trend flip, create a **debug Pine script** that outputs intermediate computation values as separate `plot()` calls:

```pine
plot(hull, "Hull", color.blue, display = display.data_window)
plot(upperBand, "UpperBand", color.red, display = display.data_window)
plot(lowerBand, "LowerBand", color.green, display = display.data_window)
plot(trail, "RawTrail", color.orange, linewidth = 2, display = display.data_window)
plot(prevTrail, "PrevTrail", color.gray, display = display.data_window)
plot(trend ? 1.0 : 0.0, "Trend", color.white, display = display.data_window)
```

Then write a test that runs this debug script and logs values bar-by-bar around the flat area. This immediately reveals whether:
- The trail is stuck because the `else` branch isn't executing (parser bug)
- The trail is stuck because `upperBand` never drops below `prevTrail` (correct behavior)
- An intermediate value (hull, atr, upperBand) is computed incorrectly

### 3. The `pushBarValues` + `var` series growth pattern

`var` variables grow by **2 entries per bar**: `pushBarValues()` copies the last value (+1), then assignment pushes the new value (+1). Despite this, `getRelative(0)` and `getRelative(1)` still return the correct current/previous bar values because:
- After `pushBarValues`, `getRelative(0)` returns the copy (previous bar's value)
- After the assignment, `getRelative(0)` returns the new value (current bar)
- `getRelative(1)` returns the copy (previous bar's value)

**This is NOT the cause of trail flatness.** The series indexing is correct. The flatness is caused by the `else` branch not executing.

### 4. Test data generation matters

Use `createTrendingBars(count, startPrice, seed)` with a deterministic seed for reproducible results. The test data should include:
- An uptrend phase (drift > 0)
- A downtrend phase (drift < 0) — this triggers the bearish flip
- A recovery phase — this verifies the trail can flip back

The downtrend phase is critical because it's where the trail must follow `upperBand` downward. If the `else` branch doesn't execute, the trail stays flat at the flip-point value.

### 5. How to identify the exact bar where things go wrong

1. Log the trail color (green = bullish, red = bearish) and find the flip bar
2. Log trail values around the flip bar — look for values that should change but don't
3. Log the close, upperBand, lowerBand, and trend values at each bar
4. Compare: if `trend = false` (bearish) and `upperBand < prevTrail`, the trail MUST decrease. If it doesn't, the `else` branch isn't executing.

### 6. Pine Script indentation model

Pine Script uses **indentation-based scoping** (like Python), not braces. The parser's `parseIndentedBlock` stops when it encounters a token at a shallower column than the block's first statement. Key rules:
- `isBlockContinuation()` returns `false` for `else`, `case`, `default` — these stop block parsing
- The `blockColumn` is set to the column of the **first statement** in the block
- Subsequent statements at the same or deeper column are included; shallower column breaks the block
- For `else if`, the `else` and `if` are on the same line but the `if` keyword is at a deeper column than the `else` — the `else`'s column determines the indentation level, not the `if`'s

## Methodologies & Debugging Patterns

These are concrete, repeatable methods for diagnosing indicator compatibility issues. Apply them in order.

### Method 1: AST Structure Inspection

**When to use:** Parser parses without errors but output is wrong.

**How:** Write a test that parses the script and walks the AST to verify structure.

```typescript
it('inspects if/else structure', () => {
  const { ast } = parse(source);
  function findIfStatements(node: any, depth = 0): void {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'IfStatement') {
      const indent = '  '.repeat(depth);
      console.log(`${indent}IfStatement condition: ${node.condition?.kind}`);
      console.log(`${indent}  thenBranch: ${node.thenBranch?.length ?? 0} statements`);
      console.log(`${indent}  elseBranch: ${node.elseBranch?.length ?? 'undefined'} statements`);
      if (node.elseBranch) {
        for (const s of node.elseBranch) {
          console.log(`${indent}    - ${s.kind}`);
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'kind' || key === 'span') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) findIfStatements(item, depth + 1);
      } else if (val && typeof val === 'object' && val.kind) {
        findIfStatements(val, depth + 1);
      }
    }
  }
  findIfStatements(ast);
});
```

**What to look for:**
- `elseBranch: undefined` on an `if` that should have an else
- `elseBranch` attached to the wrong `if` (inner instead of outer)
- Wrong number of statements in a branch

### Method 2: Color Flip Detection

**When to use:** Need to find exactly when a trend/state changes.

**How:** Use the `plotColors` output to detect color transitions (green→red or red→green).

```typescript
const trailColorKey = Array.from(result.plotColors!.keys()).find((k) => k.includes('Trail'));
const colors = result.plotColors!.get(trailColorKey)!;
let prevIsGreen = false;
for (let i = 0; i < colors.length; i++) {
  const isGreen = colors[i]?.toLowerCase().includes('00ff00');
  const isRed = colors[i]?.toLowerCase().includes('ff0000');
  if (isGreen && !prevIsGreen) console.log(`FLIP TO GREEN at bar ${i}`);
  if (isRed && prevIsGreen) console.log(`FLIP TO RED at bar ${i}`);
  if (isGreen || isRed) prevIsGreen = isGreen;
}
```

**Why:** The flip bar is the critical point. Everything before it is bullish, everything after is bearish (or vice versa). Focus debugging on the 20 bars around the flip.

### Method 3: Debug Pine Script Injection

**When to use:** Need to see intermediate computation values not exposed by the original script.

**How:** Create a copy of the Pine script that adds `plot()` calls for internal variables:

```pine
// Add these at the end of the script, BEFORE any fill/plotshape calls:
plot(hull, "Hull", color.blue, display = display.data_window)
plot(upperBand, "UpperBand", color.red, display = display.data_window)
plot(lowerBand, "LowerBand", color.green, display = display.data_window)
plot(trail, "RawTrail", color.orange, linewidth = 2, display = display.data_window)
plot(prevTrail, "PrevTrail", color.gray, display = display.data_window)
plot(trend ? 1.0 : 0.0, "Trend", color.white, display = display.data_window)
```

Then write a test that runs this debug script and logs values bar-by-bar:

```typescript
it('traces intermediate values', () => {
  const debugSource = fs.readFileSync('./test_indicators/script-debug.pine', 'utf-8');
  const bars = createTrendingBars(350, 80);
  const { result } = runEngine(debugSource, bars);
  const getValues = (name: string) => {
    const key = Array.from(result.outputs.keys()).find((k) => k.includes(name));
    return key ? result.outputs.get(key)!.values : null;
  };
  const trail = getValues('RawTrail');
  const upperBand = getValues('UpperBand');
  const trend = getValues('Trend');
  // Log bar-by-bar around the problem area
  for (let i = 195; i <= 220; i++) {
    console.log(`bar ${i}: trail=${trail?.[i]} upper=${upperBand?.[i]} trend=${trend?.[i]}`);
  }
});
```

### Method 4: Differential Analysis

**When to use:** Need to understand why two versions of a script produce different output.

**How:** Run both versions, subtract outputs, find the first diverging bar.

```typescript
const { result: resultA } = runEngine(sourceA, bars);
const { result: resultB } = runEngine(sourceB, bars);
const trailA = resultA.outputs.get('Trail')!.values;
const trailB = resultB.outputs.get('Trail')!.values;
for (let i = 0; i < trailA.length; i++) {
  if (trailA[i] !== trailB[i]) {
    console.log(`First divergence at bar ${i}: A=${trailA[i]} B=${trailB[i]}`);
    break;
  }
}
```

### Method 5: Conditional Value Assertion

**When to use:** Need to verify that a variable changes when it should.

**How:** Assert that a value is different at two points where the logic says it should change.

```typescript
// Trail should change after the flip
const afterFlip = trailValues.slice(flipBar, flipBar + 20);
const uniqueAfterFlip = new Set(afterFlip.map((v) => Math.round(v! * 100)));
expect(uniqueAfterFlip.size).toBeGreaterThan(1); // trail must not be flat
```

### Method 6: Pre-existing Failure Isolation

**When to use:** A test fails after your change and you're not sure if you caused it.

**How:** Run the test on the original code (before your change) using `git stash`:

```bash
git stash && pnpm test tests/integration/suspect.test.ts
# Check if it was already failing
git stash pop
```

**Rule:** If the test was already failing before your change, it's not your fault. Focus on tests that were passing before.

### Method 7: Layer-by-Layer Bisection

**When to use:** Output is wrong but you don't know which layer (parser, compiler, runtime) is responsible.

**How:** Test each layer independently:

1. **Parser:** `parse(source)` → check `result.errors.length === 0` and AST structure
2. **Compiler:** `compile(ast)` → check it produces a `CompiledScript`
3. **Runtime (single bar):** `engine.executeBar(ctx)` → check `result.success === true`
4. **Runtime (multi-bar):** `engine.executeBars(contexts)` → check output values
5. **Frontend:** Check `useChartData` transforms and renderer outputs

If layer N fails, the bug is in layers 1-N. If layer N passes but the final output is wrong, the bug is in layers N+1 or in the layer interface.

### Method 8: Minimal Reproduction Script

**When to use:** Complex script has a bug but you can't isolate it.

**How:** Create the simplest possible Pine script that reproduces the issue:

```pine
//@version=6
indicator("minimal test")
var float trail = na
var bool trend = true
float prevTrail = nz(trail)
if trend
    trail := math.max(low, prevTrail)
    if close < trail
        trend := false
        trail := high
else
    trail := math.min(high, prevTrail)
    if close > trail
        trend := true
        trail := low
plot(trail, "Trail")
```

Run this minimal script. If it works, the bug is in the other parts of the full script. If it doesn't, the bug is in the core `if/else` logic.

### Method 9: The `git diff` Code Review

**When to use:** After making a fix, verify it's correct and minimal.

**How:** Run `git diff` and check:
1. No unrelated files changed
2. No debug `console.log` left in production code
3. No test-only assertions removed
4. The fix is as small as possible
5. The fix doesn't break any previously passing tests

### Method 10: Before/After Test Comparison

**When to use:** Need to verify your fix actually improved things.

**How:** Count passing/failing tests before and after:

```bash
# Before
pnpm test 2>&1 | grep -E "Tests:"

# After your change
pnpm test 2>&1 | grep -E "Tests:"
```

**Rule:** If you went from `N passed, M failed` to `N+K passed, M failed`, you fixed K bugs. If you went to `N passed, M+J failed`, you introduced J regressions.

### Method 11: Indentation Column Comparison

**When to use:** Parser bug involving `if/else` at different indentation levels.

**How:** Manually trace which `else` belongs to which `if` by comparing column numbers.

```
Token stream with columns:
  [if col=0] [trend] [:] [NEWLINE]
  [INDENT]
    [if col=4] [close < trail] [:] [NEWLINE]
    [INDENT]
      ...
    [DEDENT]
  [else col=0]  ← belongs to the if at col=0, NOT col=4
```

**Rule:** An `else` belongs to the `if` whose indentation level matches the `else`'s column. If the `else` column is shallower than the inner `if`'s column, it belongs to the outer `if`.

### Method 12: Test Isolation for Debug Scripts

**When to use:** Need to test a debug version of a Pine script without affecting the main test suite.

**How:** Create a separate test file in `tests/integration/` that reads from a debug `.pine` file in `test_indicators/`:

```typescript
// tests/integration/my-script-debug.test.ts
import fs from 'fs';
import { PineParser } from '../../src/language/parser/parser';
import { PineCompiler } from '../../src/language/compiler';
import { ExecutionEngine } from '../../src/language/runtime/execution-engine';
import { SampleData } from '../helpers/sample-data';

describe('My Script (debug)', () => {
  it('logs intermediate values', () => {
    const source = fs.readFileSync('./test_indicators/my-script-debug.pine', 'utf-8');
    const parser = new PineParser();
    const compiler = new PineCompiler();
    const engine = new ExecutionEngine();
    const ast = parser.parse(source);
    const compiled = compiler.compile(ast);
    const data = SampleData.generate(500);
    const result = engine.execute(compiled, data);
    // Log and analyze
    for (const [key, series] of result.outputs) {
      console.log(`${key}: last 5 values =`, series.values.slice(-5));
    }
  });
});
```

**Why:** Keeps debug output separate from production test assertions. Debug scripts can be deleted after the root cause is found.

### Method 13: Walk-the-AST Pattern

**When to use:** Need to find all occurrences of a specific pattern in the parsed AST (e.g., all `if` statements, all variable references, all function calls).

**How:** Write a recursive visitor that checks each node's `kind`:

```typescript
function walkAST(node: any, callback: (node: any, path: string) => void, path = 'root'): void {
  if (!node || typeof node !== 'object') return;
  callback(node, path);
  for (const [key, val] of Object.entries(node)) {
    if (key === 'kind' || key === 'span') continue;
    if (Array.isArray(val)) {
      val.forEach((item, i) => walkAST(item, callback, `${path}.${key}[${i}]`));
    } else if (val && typeof val === 'object' && val.kind) {
      walkAST(val, callback, `${path}.${key}`);
    }
  }
}

// Find all IfStatements
walkAST(ast, (node, path) => {
  if (node.kind === 'IfStatement') {
    console.log(`IfStatement at ${path}`);
    console.log(`  has else: ${!!node.elseBranch}`);
  }
});
```

### Method 14: Bar-by-Bar Value Logging

**When to use:** Need to pinpoint the exact bar where a computation diverges from expected behavior.

**How:** Run the script, then log values for a specific range of bars:

```typescript
const trail = getValues('trail');
const close = data.close;
for (let i = flipBar - 5; i <= flipBar + 20; i++) {
  console.log(
    `bar ${i}: close=${close[i]?.toFixed(2)} trail=${trail[i]?.toFixed(2)} ` +
    `diff=${(close[i]! - trail[i]!).toFixed(2)}`
  );
}
```

**What to look for:**
- A value that stops changing when it should continue changing
- A value that changes in the wrong direction
- A value that jumps to an unexpected number
- A value that is `null`/`undefined` when it shouldn't be

### Method 15: Execution Engine Instrumentation

**When to use:** Need to see what the engine is actually executing at runtime (which branches, which assignments).

**How:** Temporarily add `console.log` inside the engine's `executeIfStatement`, `executeAssignment`, or `executeBinaryExpression` methods:

```typescript
// In execution-engine.ts, inside executeIfStatement:
console.log(`[ENGINE] IfStatement: condition=${JSON.stringify(condition)}, ` +
  `thenBranch=${node.thenBranch.length} stmts, ` +
  `elseBranch=${node.elseBranch?.length ?? 0} stmts`);

// Inside executeAssignment:
if (variableName === 'trail') {
  console.log(`[ENGINE] trail assigned: ${JSON.stringify(value)} at bar ${this.currentBar}`);
}
```

**Why:** Shows exactly which branches execute and which assignments run. Critical for confirming whether an `else` branch is actually reached.

### Method 16: The "Expected vs Actual" Diff

**When to use:** TradingView values are known but your engine produces different values.

**How:** Create an array of expected values from TradingView and diff against actual:

```typescript
const expected = [
  { bar: 200, value: 84.52 },
  { bar: 201, value: 84.48 },
  { bar: 202, value: 83.91 }, // should flip here
  { bar: 203, value: 83.95 },
  { bar: 204, value: 84.01 },
];
for (const { bar, value } of expected) {
  const actual = trailValues[bar];
  const diff = Math.abs(actual! - value);
  if (diff > 0.1) {
    console.log(`MISMATCH at bar ${bar}: expected=${value} actual=${actual?.toFixed(4)} diff=${diff.toFixed(4)}`);
  }
}
```

### Method 17: The "What Changed" Isolation

**When to use:** Multiple changes were made and something broke, but you don't know which change caused it.

**How:** Use `git bisect` or manual bisection:

```bash
# Find the commit that introduced the regression
git log --oneline -10  # see recent commits
git stash              # go back to known good state
pnpm test             # confirm tests pass
git stash pop         # apply changes one at a time
# OR use git bisect for automated bisection
```

### Method 18: The "Smallest Failing Example"

**When to use:** A complex script fails but you need to understand the minimal condition that triggers the bug.

**How:** Remove code from the script one line at a time until it either passes or the failure condition disappears:

1. Run full script → fails
2. Remove line 50 → still fails
3. Remove lines 40-60 → passes! Bug is in lines 40-60
4. Add back lines 40-50 → still passes
5. Add back lines 55-60 → fails! Bug is in lines 55-60

This narrows the problem to the smallest possible reproducing case.

### Method 19: The "Type Inference Check"

**When to use:** Engine throws a runtime type error or produces unexpected `null`/`undefined`.

**How:** Check what types the engine infers for each variable at each bar:

```typescript
// Temporarily log in executeVariableDeclaration:
if (varName === 'trail') {
  console.log(`[TYPE] trail: value=${JSON.stringify(value)}, ` +
    `isNull=${value === null}, isUndefined=${value === undefined}, ` +
    `type=${typeof value}`);
}
```

**Common causes of unexpected null:**
- `nz()` on a `na` value (returns 0, not null)
- `ta.atr()` before warmup period (returns null)
- Division by zero (returns `NaN` in Pine, not error)
- `var float x = na` — starts as null, first assignment makes it non-null

### Method 20: The "Output Structure Audit"

**When to use:** Frontend shows wrong plots/fills/shapes but engine output looks correct.

**How:** Inspect the full output structure from the engine:

```typescript
console.log('=== Output Structure ===');
console.log('outputs keys:', Array.from(result.outputs.keys()));
console.log('plotColors keys:', Array.from(result.plotColors?.keys() ?? []));
console.log('fills:', result.fills?.length, 'entries');
console.log('shapes:', result.shapes?.length, 'entries');
console.log('barColors:', result.barColors?.length, 'entries');
// Check a specific series
const trailKey = Array.from(result.outputs.keys()).find(k => k.includes('Trail'));
if (trailKey) {
  const series = result.outputs.get(trailKey)!;
  console.log(`${trailKey}: ${series.values.length} values, first non-null at index`,
    series.values.findIndex(v => v !== null));
}
```

**What to check:**
- Are all expected keys present?
- Do series have the right length (should be `bars.length`)?
- Are there unexpected `null` gaps?
- Do `plotColors` match the `outputs` keys?
- Are `fills` referencing valid plot keys?
