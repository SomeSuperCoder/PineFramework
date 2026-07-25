## Context

The Pine Engine pipeline is `parse → compile → execute`. Errors at each stage are handled inconsistently:

- **Parser**: Uses `ParseError` throws for known invalid input, but token recovery and partial parsing can produce incomplete ASTs without error.
- **Compiler**: The `inferExpressionType` switch has a `default: return ANY_TYPE` that silently accepts unrecognised expression kinds. Statement compilation for control-flow constructs (`if`, `for`, `while`, `switch`, `return`) is entirely no-op (lines 341-348 of `compiler.ts`). Assignment targets for non-Identifier expressions are compiled without validation. Member/index expression types default to `seriesOf(FLOAT_TYPE)` without checking the object.
- **Executor**: The `executeBar` try-catch catches all errors and returns `success: false`, but error detail is limited to `error.message`. NaN/Infinity from IEEE 754 arithmetic is handled by `float-guards.ts` in some paths, but other paths (OHLC push, type coercion, series indexing) can silently produce or consume non-finite values. `console.error` is the only logging for bar-level failures.
- **API layer**: `executePineScript` returns `error?: string` but doesn't propagate source span or structured diagnostics.

## Goals / Non-Goals

**Goals:**
1. Every invalid parse input produces a descriptive `ParseError` with source location — no partial ASTs returned without error.
2. The compiler's `inferExpressionType` becomes exhaustive: unrecognised expression kinds throw `CompileError` instead of returning `ANY_TYPE`.
3. Expression/statement executors validate runtime invariants (PineValue types, arithmetic results, operator preconditions) and throw structured errors instead of silently corrupting state.
4. `ExecutionResult` carries structured error data (`{ message, span, barIndex, stack? }`) so callers can render, log, or display it meaningfully.
5. A comprehensive test suite covering every error path proves no silent failures remain.

**Non-Goals:**
- No changes to valid-script throughput or execution semantics.
- No changes to the rollback behaviour on execution error (engine still rolls back to previous bar snapshot).
- No new public API surface beyond richer `ExecutionResult.error` field.
- No changes to the frontend (indicator-pane) rendering of errors — that's a separate concern.

## Decisions

### D1: Exhaustive type matching over runtime checks
**Decision**: Replace the `default` catch-all in `inferExpressionType` with an explicit `never` assertion that the compiler flags at build time, plus a runtime throw for any value that slips through.
**Rationale**: TypeScript `never` ensures the compiler catches new expression kinds at compile time. The runtime throw is a safety net. This is cleaner than adding default-value returns that mask bugs.
**Alternatives considered**: Keeping `default: return ANY_TYPE` and relying on test coverage — rejected because it silently accepts bugs rather than revealing them.

### D2: Structured error union type for ExecutionResult
**Decision**: Change `ExecutionResult.error` from `string | undefined` to an `EngineError` object: `{ message: string; span?: SourceSpan; barIndex?: number; stack?: string }`. The existing `success: boolean` distinguishes OK from error.
**Rationale**: Callers need structured data to render error overlays, log to backend, or display in the error-console spec. A string loses all structural information.
**Alternatives considered**: Keeping `error: string` and adding a separate `diagnostics` field — more surface area, same effect. A single union is simpler.

### D3: Guard functions for runtime invariants
**Decision**: Introduce `ensureFinite(val: PineValue, context: string): asserts val is number` and similar guards that throw `RuntimeError` (a new `PineError` subclass) with structured context when invariants are violated. Use them in expression executor arithmetic paths, series indexing, and OHLC data ingestion.
**Rationale**: Explicit fail-fast at the point of violation is easier to debug than silent NA propagation in downstream calculations.
**Alternatives considered**: Returning NA everywhere (current approach) — hides the root cause. Using TypeScript `strict` checks alone — insufficient at runtime.

### D4: Parser error auditing strategy
**Decision**: For each parser method, document every path that can produce an error (or silently recover). Add explicit `throw` or `ParseError` for paths that currently produce partial ASTs without error. The tokenizer already throws for invalid tokens — extend the same pattern to expression and statement parsing.
**Rationale**: The tokenizer and statement parser already have good error-throwing patterns (`this.error(...)` returns `ParseError`). The expression parser is the main gap — cases like `parseExpressionOrAssignmentStatement` can produce `ExpressionStatement` with malformed inner expressions.
**Alternatives considered**: Adding a validation pass over the completed AST — would catch fewer cases and lose source location precision.

## Risks / Trade-offs

- **[Risk] Performance regression from additional runtime guards**: Runtime invariant checks add branches to hot paths (per-bar execution). **Mitigation**: Guards are O(1) type checks and never allocate in the happy path. Profile before/after on heavy indicators (100+ bars, 10k+ expressions).
- **[Risk] Breaking change for API consumers reading `ExecutionResult.error`**: Existing code checking `error !== undefined` / `typeof error === 'string'` must be updated. **Mitigation**: `EngineError` is an object with a `.toString()` that returns the message string, so `String(error)` and template literal usage still work. Flag in changelog.
- **[Risk] False positives from strict exhaustiveness**: A new expression kind added in the future will trigger a compile-time type error. **Mitigation**: This is intended — it forces the implementer to handle the new kind explicitly. Add a lint rule if desired.
- **[Risk] Over-engineering simple guard cases**: Some silent-failure paths (e.g., OHLC `val : 0` fallback) are arguably harmless defaults. **Mitigation**: Only harden paths where the silent value propagates to indicator output. The OHLC fallback emits a warning (not an error) and still uses 0 — sufficient for the minority of cases where a bar has non-numeric OHLC.
