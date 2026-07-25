## 1. AST Walk for Lookback Detection

- [ ] 1.1 Create `detectLookbackFromAST(body: Statement[]): number` function in `compiler.ts`
- [ ] 1.2 Implement TA function detection: walk CallExpression nodes, check if callee is `ta.*`, extract constant period from known argument positions using a lookup map
- [ ] 1.3 Implement pivot detection: `ta.pivothigh(leftBars, rightBars)` → `leftBars + rightBars`
- [ ] 1.4 Implement `[]` indexing detection: walk IndexExpression nodes with constant offset on OHLCV identifiers (`close`, `open`, `high`, `low`, `volume`) and user-defined variables
- [ ] 1.5 Combine all detected lookbacks (MAX) and return single number

## 2. Compiler Integration

- [ ] 2.1 In `Compiler.compile()`, call `detectLookbackFromAST()` after IR generation, before `maxBarsBack` assignment
- [ ] 2.2 Only set `maxBarsBack` when `maxBarsBack === 0` (explicit declaration takes precedence)
- [ ] 2.3 Handle edge cases: empty program, no body statements, nested blocks, variable period args (skip detection)

## 3. Testing

- [ ] 3.1 Unit test: `ta.sma(src, 50)` → detected = 50
- [ ] 3.2 Unit test: `ta.atr(14)` → detected = 14
- [ ] 3.3 Unit test: `ta.pivothigh(src, 5, 3)` → detected = 8
- [ ] 3.4 Unit test: `close[20]` → detected = 20
- [ ] 3.5 Unit test: both `ta.sma(src, 50)` and `close[100]` → detected = 100
- [ ] 3.6 Unit test: `ta.valuewhen(cond, src, 3)` → detected = 3
- [ ] 3.7 Unit test: variable period (`len` variable, not constant) → detected = 0
- [ ] 3.8 Unit test: declared `max_bars_back` takes precedence → maxBarsBack = declared value
- [ ] 3.9 Integration test: HHLL script auto-detects lookback without declaration
- [ ] 3.10 Run full test suite to verify no regressions
