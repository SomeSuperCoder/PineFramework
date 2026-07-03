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
