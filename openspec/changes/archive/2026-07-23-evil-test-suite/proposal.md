## Why

The existing test suite covers happy-path and basic edge cases, but the project has no systematic adversarial testing layer. Adversarial ("evil") tests — inputs designed to break, confuse, or overwhelm the system — catch silent data corruption, crashes, infinite loops, memory leaks, and logic bugs that unit tests miss. The audit (scoring 62/100, test confidence 45%) identified real bugs in series handling, strategy engine, and backend security that evil tests would have caught earlier. A dedicated evil test suite hardens the engine against production surprises.

## What Changes

- Create `tests/evil/` directory with adversarial test files covering every major subsystem
- Each test file exercises edge cases in its area: invalid inputs, boundary conditions, resource exhaustion, NaN/Infinity propagation, empty states, race-condition-like patterns, and unexpected combinations
- No changes to production code — tests only, designed to verify existing behavior handles adversarial inputs gracefully
- Test structure mirrors `tests/` layout so engineers know where to find each evil counterpart

## Capabilities

### New Capabilities

- `evil-test-parser`: Adversarial inputs for the Pine Script parser — malformed scripts, size bombs, unicode tricks, deeply nested expressions, tokenizer edge cases
- `evil-test-compiler`: Adversarial inputs for the compiler/type system — type mismatches, circular references, extreme nesting, invalid annotations, ambiguous overloads
- `evil-test-runtime`: Adversarial inputs for the execution engine/interpreter — NaN/Infinity propagation, empty series operations, division by zero, extreme numeric ranges, out-of-bounds access, scope corruption
- `evil-test-ta-functions`: Adversarial inputs for built-in TA functions — zero/negative periods, period > bar count, NaN/Infinity prices, constant-price series, single-bar series
- `evil-test-series`: Adversarial operations on Series and RingBuffer — empty buffers, single-element buffers, negative lookback, massive pushes, clear/repopulate cycles
- `evil-test-state-management`: Adversarial scenarios for snapshot/rollback — rollback without snapshot, double rollback, stale snapshot, snapshot during forming candle, snapshot after bar push
- `evil-test-forming-candle`: Adversarial scenarios for forming candle lifecycle — consecutive updates, stale bar detection, confirm after stale, zero-volume forming candles, timestamp edge cases
- `evil-test-strategy-engine`: Adversarial scenarios for strategy/backtest — zero/negative quantity, negative prices, simultaneous entry/exit, partial fills at book edges, commission edge cases (zero, NaN, extreme), order type edge cases (stop-limit, OCO, trailing)
- `evil-test-alert-system`: Adversarial scenarios for alert system — duplicate surge, oversized messages, rapid triggers exhausting dedup sets, alert during rollback
- `evil-test-rendering`: Adversarial inputs for rendering/plotting — extreme coordinates, zero dimensions, NaN colors, massive label/line sets, concurrent draw/clear
- `evil-test-backend-api`: Adversarial inputs for backend API — oversized payloads, invalid symbols, concurrent request storms, boundary query parameters, WebSocket flood

### Modified Capabilities

- *(No existing capabilities have spec-level requirements changing — this is purely a testing addition)*

## Impact

- **New directory**: `tests/evil/` — ~12 test files, ~2000+ lines of adversarial test cases
- **Existing specs**: None modified — evil tests exercise existing capability contracts
- **CI**: Tests run as part of `test` script — no new infrastructure needed
- **Dependencies**: None — uses existing Jest + ts-jest setup
- **Audit findings**: Directly addresses the 45% test coverage confidence gap with high-value edge case coverage
