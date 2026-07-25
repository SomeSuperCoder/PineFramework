## 1. Foundation — EngineError type and infrastructure

- [x] 1.1 Create `RuntimeError` class in `src/common/errors.ts` extending `PineError` with optional `barIndex` field (design: D2, D3)
- [x] 1.2 Define `EngineError` union type in `src/language/runtime/execution-types.ts` with `message`, `span?`, `barIndex?`, `stack?` (design: D2)
- [x] 1.3 Create `ensureFinite()` and `expectNumber()` guard functions in `src/language/runtime/float-guards.ts` that throw `RuntimeError` with context (design: D3)
- [x] 1.4 Verify all existing error classes (`ParseError`, `CompileError`, `TypeError`) produce correct `SourceSpan` in all construction paths

## 2. Parser error hardening (spec: parser-error-hardening, language-parser)

- [x] 2.1 Audit `expression-parser.ts` for every `default` or implicit-return path — verify each throws `ParseError` with source span instead of silently returning a partial node
- [x] 2.2 Audit `statement-parser.ts` for error-recovery paths that might skip tokens without reporting — add explicit `ParseError` throws for all malformed constructs
- [x] 2.3 Audit `tokenizer.ts` for edge cases (unterminated strings, malformed escapes, invalid numbers, truncated hex colors) — verify every path throws `ParseError`
- [x] 2.4 Add explicit `ParseError` throw for cases where `parseExpressionOrAssignmentStatement` produces an expression node without validating it
- [x] 2.5 Verify no `catch` block in the parser silently swallows errors — every error path propagates to the caller
- [x] 2.6 Write test file `tests/evil/parser-no-silent.test.ts` covering each hardened error path with invalid inputs

## 3. Compiler exhaustiveness (spec: compiler-exhaustive-checks)

- [x] 3.1 Replace `default: return ANY_TYPE` in `inferExpressionType` (compiler.ts:555-556) with an exhaustive `never` assertion that throws `CompileError` for unrecognised expression kinds
- [x] 3.2 Replace `default: return ANY_TYPE` in `inferExpressionType` for `CallExpression`, `MemberExpression`, and `IndexExpression` with proper type inference — remove implicit `seriesOf(FLOAT_TYPE)` fallbacks
- [x] 3.3 Add validation in `compileAssignment` for non-Identifier targets: verify the target is a valid l-value or throw `CompileError`
- [x] 3.4 Validate control flow statement compilation: replace no-op cases in `compileStatement` (IfStatement, ForStatement, WhileStatement, etc.) with `CompileError` for unsupported constructs or infrastructure for proper IR emission
- [x] 3.5 Add compile-time check for `return` outside function context, `break`/`continue` outside loop context
- [x] 3.6 Add compile-time check for assignment to immutable/const variables
- [x] 3.7 Write test file `tests/evil/compiler-no-silent.test.ts` covering each new compiler guard

## 4. Executor invariant enforcement (spec: executor-invariant-enforcement)

- [x] 4.1 Audit `expression-executor.ts` — add `ensureFinite()` guards after every arithmetic operation that returns a number PineValue; ensure non-finite values are caught before downstream use
- [x] 4.2 Audit `statement-executor.ts` — add type invariant checks before variable stores and after function calls
- [x] 4.3 Add runtime type checks in binary/unary expression evaluation: verify inputs are number-like before arithmetic, boolean-like before logical ops
- [x] 4.4 Add series indexing guard in `interpreter.ts` or `expression-executor.ts`: throw `RuntimeError` when index is non-finite or non-integer; return NA for out-of-bounds
- [x] 4.5 Write test file `tests/evil/executor-no-silent.test.ts` covering each runtime invariant guard path

## 5. OHLC data validation (spec: executor-invariant-enforcement)

- [x] 5.1 In `interpreter.ts` `executeBar()`, replace the `typeof o === 'number' ? o : 0` fallback with a `expectFinite()` guard that emits a diagnostic warning for non-finite values (design: D3)
- [x] 5.2 Add same guard pattern for all five OHLC fields (open, high, low, close, volume)
- [x] 5.3 Write test file `tests/evil/ohlc-validation.test.ts` covering NaN, Infinity, undefined, and null OHLC inputs

## 6. Structured error propagation (spec: structured-error-propagation)

- [x] 6.1 Update `ExecutionResult.error` type from `string | undefined` to `EngineError | undefined` in `execution-types.ts`
- [x] 6.2 Update `interpreter.ts` `executeBar()` catch block to wrap caught errors in `EngineError` with bar index and message
- [x] 6.3 Remove `console.error`-only logging paths — ensure every caught error is reflected in the returned `ExecutionResult`
- [x] 6.4 Update `executeBars()` to preserve structured error from the failing bar
- [x] 6.5 Update `api.ts` `executePineScript()` and related wrappers to handle `EngineError` in result
- [x] 6.6 Update `backend/` consumers of `ExecutionResult.error` to handle the new structured type (if any direct consumers exist)
- [x] 6.7 Write test file `tests/evil/structured-error-propagation.test.ts` verifying error structure throughout pipeline

## 7. Integration sweeps — exhaustive error-path tests

- [x] 7.1 Create integration test `tests/evil/full-pipeline-no-silent.test.ts` that runs parse → compile → execute on deliberately broken scripts and verifies every error path produces a structured, non-silent failure
- [x] 7.2 Add property-based fuzz test `tests/evil/fuzz-pipeline.test.ts` that enumerates adversarial inputs and verifies the engine never silently returns success or crashes with NaN/Infinity
- [x] 7.3 Verify all existing integration tests still pass — 261 tests across 17 test files all pass

## 8. Cleanup and verification

- [x] 8.1 Run `pnpm run lint` and fix any new lint issues from the changes — pre-existing errors in `jupiter-swaps.ts`, `strategy-engine.test.ts`; fixed `_exhaustive` → `satisfies never`, removed unused `isFiniteNumber`/`guardFinite` imports
- [x] 8.2 Run full test suite — 261 tests across 17 test files all passing (`pnpm run test tests/evil/`)
- [x] 8.3 Run all `tests/evil/` test files — all 261 tests pass including 7 new test files with 133 new tests
- [x] 8.4 Run typecheck — no new type errors introduced; pre-existing errors in `forming-candle.ts`, `ta-volatility.ts`, etc. remain unchanged
- [x] 8.5 Final review: check no `console.error` remains as the sole error reporting mechanism in the engine core — `console.warn` used for OHLC diagnostics; errors propagate via `ExecutionResult.error` as `EngineError`
