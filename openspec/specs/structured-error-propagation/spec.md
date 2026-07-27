## Purpose
Ensure that structured error information is propagated through the full parsing, compilation, and execution pipeline, and that no error paths silently consume errors via console.error only.

## Requirements

### Requirement: Structured error payload in ExecutionResult
`ExecutionResult.error` SHALL be extended from `string | undefined` to `EngineError | undefined` where `EngineError` is an object containing at minimum `message: string`, and optionally `span`, `barIndex`, and `stack`.

#### Scenario: Successful execution returns no error
- **WHEN** execution succeeds
- **THEN** `ExecutionResult.error` SHALL be `undefined` and `success` SHALL be `true`

#### Scenario: Failed execution returns structured error
- **WHEN** execution fails at a known bar
- **THEN** `ExecutionResult.error` SHALL be an `EngineError` object with `message`, `barIndex`, and optionally `span`

#### Scenario: Error object is string-coercible
- **WHEN** an `EngineError` is converted to string (e.g., template literal)
- **THEN** it SHALL produce the same readable format as the previous string-only error

### Requirement: Error propagation through the full pipeline
Errors from parsing, compilation, and execution SHALL be propagated through the API layer so that callers of `parse()`, `compile()`, `execute()`, and `executePineScript()` can access structured error information.

#### Scenario: Parse error propagates to API caller
- **WHEN** a script fails to parse via `createPineScriptEngine().parse()`
- **THEN** the `ParseError` SHALL be thrown directly (current behaviour, preserved)

#### Scenario: Compile error propagates to API caller
- **WHEN** a script fails to compile via `createPineScriptEngine().compile()`
- **THEN** the `CompileError` SHALL be thrown directly (current behaviour, preserved)

#### Scenario: Execution error returned in result
- **WHEN** a script fails during execution via `createPineScriptEngine().execute()`
- **THEN** the `ExecutionResult` SHALL have `success: false` and `error` containing an `EngineError` with structured data

### Requirement: No console.error-only error paths
Every execution error path SHALL produce structured error data in the `ExecutionResult`. No error SHALL be silently consumed by `console.error` without being reflected in the returned result.

#### Scenario: All error paths produce structured output
- **WHEN** a runtime error occurs in any execution path
- **THEN** the error SHALL be captured in `ExecutionResult.error` and NOT only logged to console

#### Scenario: Console logging is supplemental
- **WHEN** a runtime error occurs
- **THEN** `console.error` MAY be used for supplemental server-side logging, but the error SHALL also be present in the returned result
