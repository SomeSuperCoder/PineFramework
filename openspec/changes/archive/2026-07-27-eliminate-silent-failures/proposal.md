## Why

The Pine Engine's parser, compiler, and executor contain multiple pathways where errors or invalid states are silently absorbed — returning `ANY_TYPE`, defaulting to `FLOAT_TYPE`, substituting `0` for non-numeric values, or silently converting NaN/Infinity to NA without diagnostics. These silent failures produce incorrect indicator output, mask bugs in scripts, and erode trust in the engine. Pine Script users expect every syntax error, type mismatch, and runtime invariant violation to be reported immediately with a clear message.

## What Changes

- **Parser hardening**: Audit all parse-time guard clauses to ensure every invalid token sequence, type annotation error, and malformed expression throws a `ParseError` with a descriptive message and source location instead of returning a partial AST or silently skipping tokens.
- **Compiler exhaustiveness**: Replace `default: return ANY_TYPE` in `inferExpressionType` with an explicit exhaustive match that throws `CompileError` for unrecognised expression kinds. Add compile-time validation for assignment targets, member access, and index expressions.
- **Executor invariant checks**: Add runtime type guards in `expression-executor.ts` and `statement-executor.ts` that throw on NaN/Infinity propagation outside known-safe paths, instead of silently converting. Validate that all operator branches produce the expected PineValue type.
- **Error propagation**: Ensure every execution error carries a structured payload (message, source span, bar index) through the `ExecutionResult` so callers can display or log it meaningfully. Eliminate `console.error`-only logging paths.
- **OHLC data validation**: Replace silent `typeof === 'number' ? val : 0` fallbacks in the interpreter with explicit type checks that log a warning or fail fast.
- **Comprehensive error test suite**: Add integration tests that verify error behaviour for every error path in the parser, compiler, and executor — ensuring none are silent.

## Capabilities

### New Capabilities
- `parser-error-hardening`: Audit and harden every error path in the parser — no invalid input silently produces a partial AST
- `compiler-exhaustive-checks`: Replace default ANY_TYPE returns and implicit fallbacks in the compiler with exhaustive matching that catches unhandled constructs at compile time
- `executor-invariant-enforcement`: Runtime validation of PineValue types, arithmetic results, and operator preconditions in the executor
- `structured-error-propagation`: Carry structured error payloads (message, span, bar index) through the entire engine pipeline

### Modified Capabilities
- `language-parser`: Parser error reporting is enhanced — every malformed construct produces a descriptive ParseError with source location (no silent recovery)
- `type-system`: Type-checking error messages are expanded to cover previously unguarded paths
- `execution-engine`: Execution errors now carry structured diagnostic info; error rollback behaviour is unchanged but error details are preserved
- `ieee754-arithmetic`: NaN/Infinity handling is hardened — unexpected non-finite values produce explicit errors instead of silent NA conversion in non-arithmetic contexts

## Impact

- **Parser** (`src/language/parser/`): Error-return paths audited and hardened; no functional change to valid-script parsing
- **Compiler** (`src/language/compiler/compiler.ts`): `inferExpressionType` exhaustiveness enforced; assignment target validation added
- **Runtime/Executor** (`src/language/runtime/`): Expression/statement executors get invariant checks; OHLC data validation added; error propagation restructured
- **API** (`src/api.ts`): `executePineScript` and `createPineScriptEngine` maintain backward compatibility but richer error data flows through
- **Tests** (`tests/`): New error-path test files; no existing tests break
- **Backend** (`backend/`): May consume richer error payloads from `ExecutionResult`
