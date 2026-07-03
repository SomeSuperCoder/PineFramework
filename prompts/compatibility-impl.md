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
