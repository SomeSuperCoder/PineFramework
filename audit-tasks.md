# Audit Tasks

## Audit Summary
- **Date:** 2026-07-20
- **Project:** pine-framework (Pine Script v6 Compatible Execution & Rendering Engine)
- **Overall Health Score:** 62/100
- **Security Score:** 51/100
- **Architecture Score:** 65/100
- **Code Quality Score:** 58/100
- **Performance Score:** 55/100
- **Test Coverage Confidence:** 45%
- **Maintainability Score:** 60/100
- **Scalability Score:** 40/100

---

## Task List

### Critical (Fix Immediately)

- [x] **C-001** | [Security-SSRF] | `backend/src/routes/backtest.ts:393` | Unvalidated URL construction from environment variable enables SSRF via BYBIT_REST_URL
  - **Issue:** `const BYBIT_REST_BASE = process.env.BYBIT_REST_URL || 'https://api.bybit.com';` is directly interpolated into fetch URLs (`const url = \`${BYBIT_REST_BASE}/v5/market/kline?category=linear&symbol=${bybitSymbol}&interval=${timeframe}&limit=${limit}\``). There is no validation that this URL points to a legitimate Bybit endpoint. If the env var is set to a malicious server, all OHLCV/bar data fetches go there, including API tokens or internal network addresses.
  - **Impact:** An attacker who can set `BYBIT_REST_URL` (e.g., via compromised CI/CD, malicious container config, or .env leak) can exfiltrate all backtest data or pivot to internal services via SSRF. Same issue exists in `symbol-runner.ts:4` with identical code.
  - **Fix:** Validate `BYBIT_REST_URL` against a URL allowlist or at minimum validate it matches `https://api.bybit.com*` before using. Also validate the `BYBIT_WS_URL` env var in ws/gateway.ts:14.
  - **Test:** Set `BYBIT_REST_URL=http://evil.com` and verify the server rejects the request or logs a warning.

- [x] **C-002** | [Security-CommandInjection] | `backend/src/routes/backtest.ts:393` | Trading pair symbol directly interpolated into URL without sanitization
  - **Issue:** The `bybitSymbol` variable (`symbol.endsWith('USDT') ? symbol : \`${symbol}USDT\``) is directly interpolated into a URL string without URL encoding. While Bybit API may reject invalid symbols, a malicious symbol string like `BTCUSDT&foo=bar` could modify the URL's query parameters. The symbol also flows from user input with no validation beyond a type check.
  - **Impact:** An attacker could craft a symbol string that manipulates the Bybit API request, potentially accessing unauthorized endpoints or manipulating query parameters. The same issue exists in `symbol-runner.ts:133`.
  - **Fix:** Always URL-encode the symbol parameter before URL interpolation: `const bybitSymbol = encodeURIComponent(symbol.endsWith('USDT') ? symbol : \`${symbol}USDT\`)`. Also validate symbols against a regex like `/^[A-Za-z0-9]+$/`.
  - **Test:** Send a request with symbol=`BTCUSDT%26evil=1` and verify the constructed URL is properly encoded.

- [x] **C-003** | [Security-PathTraversal] | `backend/src/utils/security.ts:5-8` | Path traversal protection uses `startsWith` which is trivially bypassable
  - **Issue:** `validateFilePath` checks `resolved.startsWith(resolvedAllowed + path.sep) || resolved === resolvedAllowed`. This is vulnerable to path traversal attacks. For example, if `allowedDir` is `/data/scripts`, a filePath of `/data/scripts- evil/../../etc/passwd` would pass because `/data/scripts` is a prefix of `/data/scripts- evil/...`. The check also doesn't handle symlink resolution.
  - **Impact:** An attacker could bypass path validation to read or write files outside the allowed directory, potentially overwriting system files or accessing sensitive data.
  - **Fix:** Use `path.relative()` and check that the result doesn't start with `..` or is absolute. Also use `path.realpathSync()` to resolve symlinks before comparing paths.
  - **Test:** Craft path traversal attempts like `../etc/passwd`, `allowedDir + '-evil/../../etc/passwd'`, etc. and verify they're rejected.

- [x] **C-004** | [Security-InsecureDeserialization] | `backend/src/store/JsonStore.ts:41` | JSON.parse on arbitrary file content with no schema validation
  - **Issue:** `JsonStore.read()` reads a file from disk and calls `JSON.parse(raw)` on the raw content. While the optional `validateFn` provides some protection, most JsonStore instances (TelegramConfigStore, RunningIndicatorsStore, ScriptsManifestStore) use it inconsistently. If a file is corrupted or tampered with, `JSON.parse` could throw (caught) or return unexpected data. More critically, there is no protection against prototype pollution via `__proto__` keys in JSON.
  - **Impact:** A corrupted or malicious JSON file could cause unexpected behavior, crashes, or prototype pollution. Since these files are in `backend/data/` which is writable by the application, if an attacker gains write access to that directory, they can inject malicious JSON.
  - **Fix:** Use a JSON parsing library that guards against prototype pollution (e.g., `json5` or `lossless-json`) or manually strip `__proto__` keys. Add schema validation via Zod or io-ts for each store type.
  - **Test:** Create a JSON file with `{"__proto__": {"polluted": true}}` and verify the parsed object doesn't pollute Object.prototype.

- [x] **C-005** | [Performance-MemoryLeak] | `backend/src/ws/gateway.ts:91` | Unbounded in-memory alert dedup set with manual FIFO limiting can still lose items
  - **Issue:** `recentAlertKeys` is a `Set<string>` capped at 100 entries via manual FIFO eviction (`recentAlertKeys.values().next().value`). However, this Set is never cleared and grows back to 100 repeatedly. More critically, the dedup set is shared across ALL topics and symbols — a busy market could fill the set with common keys, causing legitimate alerts to be suppressed. Also, if `recentAlertKeys.size > 100`, only ONE item is deleted per new addition, but the check `size > 100` doesn't guarantee it returns to ≤ 100.
  - **Impact:** Alert deduplication can fail (false negatives) or suppress legitimate alerts (false positives). Under high-frequency market conditions, the Set thrashing causes O(n) iteration per alert.
  - **Fix:** Replace with an LRU cache (e.g., `Map`-based with delete on access) or a proper bounded set. Use a TTL-based approach (e.g., keys expire after 5 minutes) instead of a count-based cap. Also, partition the dedup set by `topic` to avoid cross-symbol interference.
  - **Test:** Simulate rapid alert triggers and verify no more than 100 keys are stored and no legitimate alerts are incorrectly suppressed.

- [x] **C-006** | [Performance-O(n2)] | `backend/src/routes/backtest.ts:109-118` | O(n²) memory: each bar context creates a new series with a slice of all previous bars
  - **Issue:** `bars.map((bar, i) => ({... createSeries('open', bars.slice(0, i + 1).map((b) => b.open)) ...}))` — for every bar `i`, the code creates a new Series that copies bars[0..i]. This is O(n²) memory and time. For 1500 bars, this creates ~1.125 million individual bar objects in memory. The identical pattern is in `symbol-runner.ts:59-68`.
  - **Impact:** Backtesting with 1500 bars consumes ~15-30MB of memory just for these context objects. At the 1500 bar limit enforced by the route, this is wasteful but manageable. However, if the limit is ever raised, this becomes a scalability bottleneck. Also causes GC pressure.
  - **Fix:** Create a single set of Series objects that are reused across all bar contexts. Each bar context should share the same OHLCV Series objects (since `getRelative(0)` only reads the last value). See `src/index.ts:65-81` which already implements this correctly in `barsToContext()`. Use that function instead.
  - **Test:** Backtest with 1500 bars and measure memory usage before/after the fix.

- [x] **C-007** | [Bug-Series] | `src/language/runtime/series.ts:42-49` | getRelative() returns NA for offset=0 on empty series, but callers assume it works
  - **Issue:** `getRelative(0)` on an empty series returns `NA` (because `targetIndex = -1` which is < 0). However, code throughout the engine calls `getRelative(0)` on OHLCV series without checking for NA. In `interpreter.ts:642-655`, `context.close.getRelative(0)` is called directly and the result is used as a number without NA checking. If the series is empty, this returns the `NA` symbol which gets used in arithmetic, propagating NaN-like behavior.
  - **Impact:** Subtle bugs where calculations may silently produce `NA` results rather than throwing an error. This can cause incorrect indicator outputs without any error being surfaced.
  - **Fix:** Ensure that `barsToContext()` (and the backtest bar context builders) create non-empty Series. Add runtime assertions or fallbacks for empty series. Alternatively, make `getRelative(0)` return `0` instead of `NA` for OHLCV series (since Pine Script treats `close[0]` as always available).
  - **Test:** Create a test with empty bar context and verify that execution handles it gracefully.

---

### High

- [x] **H-001** | [Security-XSS] | `backend/src/routes/execute.ts:92-100` | Line/box coordinates used to construct response without sanitization
  - **Issue:** Line coordinates (`l.x1`, `l.x2`, `l.y1`, `l.y2`) and box coordinates are passed through as-is in the response. While these are numbers, the label `text` fields (line 108) and shape `text` fields (line 64) are returned unescaped. The frontend may render these as HTML or in canvas without sanitization.
  - **Impact:** If a malicious Pine script produces text with HTML/script content, it could lead to XSS in the frontend when rendered.
  - **Fix:** Sanitize text fields using DOMPurify on the frontend or strip HTML from text fields in the API response. At minimum, escape HTML entities in text content.
  - **Test:** Create a Pine script that generates a shape with `text='<script>alert(1)</script>'` and verify it's not rendered as HTML.

- [x] **H-002** | [Bug-Logic] | `src/strategy/strategy-engine.ts:745-755` | MAE/MFE calculation uses bar-level high/low, not trade-level excursion
  - **Issue:** MAE (Maximum Adverse Excursion) and MFE (Maximum Favorable Excursion) are calculated using the entire bar's `high` and `low` values at the time of position close, not the excursion during the entire trade lifetime. The correct calculation should track the best/worst price reached during the entire holding period, not just on the exit bar.
  - **Impact:** MAE and MFE values in trades are incorrect — they only reflect the exit bar's range, not the full trade range. This makes them useless for position sizing or stop-loss analysis.
  - **Fix:** Track `mfe` and `mae` incrementally during `updatePositionPnL()` by comparing against all bar high/low values while the position is open. Store the worst excursion in the Trade object at close time.
  - **Test:** Create a trade where price moves against the position mid-trade but recovers at exit. Verify MAE captures the adverse move, not just the exit bar.

- [x] **H-003** | [Bug-Logic] | `src/strategy/backtest-engine.ts:188-228` | Monthly returns calculation incorrectly reports 0% for first month of data
  - **Issue:** `computeMonthlyReturns()` initializes all months in range to 0, then only updates a month when `monthly[key] === 0 && point.equity !== lastRecordedEquity`. The first month's return is always 0 because it's initialized to 0 and `point.equity !== lastRecordedEquity` is checked against the start equity — but the equity might legitimately not change in the first month, resulting in a correct 0. The bigger issue: if the first bar has the same equity as `lastRecordedEquity` (which is set to `points[0].equity`), the condition `point.equity !== lastRecordedEquity` fails for the first data point, always making the first month 0 regardless of actual returns.
  - **Impact:** First month of backtest results always shows 0% return, hiding any gains or losses that occur in that month.
  - **Fix:** Use a different sentinel value (e.g., `null` or `undefined`) instead of 0 to indicate "not yet computed," since 0 is a valid monthly return. Alternatively, skip the first month entirely or compute it differently.
  - **Test:** Run a backtest where the first month has a profitable trade and verify the monthly return is non-zero.

- [x] **H-004** | [Bug-Logic] | `src/strategy/strategy-engine.ts:672-698` | Commission calculated per fill, but legacy commission config applies to both entry AND exit fills when it should only apply once per trade
  - **Issue:** In the legacy commission system, `calculateCommission()` is called in `fillOrder()` for every fill. A market order entry calls `fillOrder()` once. But a limit order entry followed by a market exit calls `fillOrder()` twice — once for entry and once for exit. The per-order/per-contract/fixed commission types charge independently on each fill, which means commission is charged twice per round-trip trade. Most real brokerages charge once per trade (entry + exit combined), not per fill.
  - **Impact:** Backtest commissions may be double-counted, making strategies appear less profitable than they would be in reality. For `fixed` and `per_order` commission types, the error is especially large.
  - **Fix:** Change legacy commission to charge only on entry (not exit) by default, or make it configurable. Add a `commissionOnExit` config option. The pluggable commission system (`CommissionCalculator`) has the same issue since `calculate()` is called every fill.
  - **Test:** Run a round-trip trade with `commission: 10, commissionType: 'fixed'` and verify total commission charged is 10, not 20.

- [ ] **H-005** | [Bug-OrderFill] | `src/strategy/strategy-engine.ts:861-920` | Stop-limit orders can be filled at incorrect prices
  - **Issue:** When a stop-limit order is triggered (stop price hit), the code checks `low <= limitPrice` for buys or `high >= limitPrice` for sells to determine if the limit is also hit. If the limit is not hit on the same bar, a new limit order is created and pushed to pending orders. However, this new limit order has `stopPrice: undefined` and `type: 'limit'`, but its `price` is set to `limitPrice`. The issue is that the original order's price field may have been the stop price, not the limit price. The `order.price` field is not consistently used across order types in the fill logic.
  - **Impact:** Stop-limit orders may fill at incorrect prices or fail to fill when they should. The fill price logic in `processPendingOrders` uses `order.limitPrice ?? order.price` for limit orders and `order.stopPrice ?? order.price` for stop orders, which works correctly, but the conversion from stop-limit to limit after trigger loses the original order context.
  - **Fix:** Ensure that when a stop-limit order converts to a limit order, the `limitPrice` is preserved on the new limit order and `price` is set to the same value. Add comprehensive tests for stop-limit fill scenarios.
  - **Test:** Create a stop-limit buy order where stop=105, limit=106, and the bar has high=107 but only reaches 105.5 (triggered but limit not hit on same bar). Verify the limit order persists and fills on a subsequent bar.

- [x] **H-006** | [Security-EnvLeak] | `backend/src/routes/backtest.ts:5` | BYBIT_REST_URL env var could be exposed via error messages
  - **Issue:** Error messages from failed API calls are surfaced to users in the API response (e.g., `job.error = err instanceof Error ? err.message : String(err)`). If the URL or its components appear in error messages (e.g., connection refused to a custom BYBIT_REST_URL), the environment configuration is leaked.
  - **Impact:** Information disclosure of internal network topology or custom API endpoints.
  - **Fix:** Sanitize error messages in API responses. Never surface raw error messages from external API calls. Log the full error server-side and return a generic error to the client.
  - **Test:** Verify that API error responses never contain URLs, hostnames, or IP addresses.

- [x] **H-007** | [Performance-ReDoS] | `src/language/parser/tokenizer.ts` | Regex-based tokenizer could be vulnerable to ReDoS
  - **Issue:** The tokenizer uses regex patterns for token matching. If complex regex patterns are used for string literals or numbers with exponential backtracking potential, an attacker could craft a Pine script that takes exponential time to tokenize. Long string literals with escape sequences are particularly risky.
  - **Impact:** A malicious Pine script could cause the tokenizer to hang for seconds or minutes, blocking the Node.js event loop (since tokenization is synchronous). This is a DoS vector.
  - **Fix:** Audit all regex patterns in the tokenizer for ReDoS vulnerability. Use atomic groups or possessive quantifiers where possible. Implement a maximum input length for the parser (e.g., reject scripts > 1MB).
  - **Test:** Craft a Pine script with a long string containing many escape sequences and measure tokenization time.

- [ ] **H-008** | [Bug-Interpreter] | `src/language/runtime/interpreter.ts:813-821` | Named arguments passed to builtins may overwrite positional arguments (deferred — current behavior preserves named args needed by plot builtins; calculation builtins naturally ignore extra args)
  - **Issue:** The code constructs `builtinArgs` as `Object.keys(namedArgs).length > 0 ? [...args, namedArgs] : args;`. This appends the namedArgs object as an EXTRA argument at the end. If a builtin expects a specific number of positional arguments, adding an extra `namedArgs` object at the end can cause the builtin to receive incorrect argument positions. For example, `math.sum(a, b)` called as `math.sum(a, b, title="test")` would get `[a, b, {title: "test"}]` as 3 positional args.
  - **Impact:** Built-in function calls with named arguments (e.g., for display titles) may silently produce wrong results or throw confusing errors.
  - **Fix:** Named arguments should be extracted and passed separately to builtins, or builtins should be aware of named args and skip the last argument if it's a plain object. Alternatively, strip named args before calling builtins that don't support them.
  - **Test:** Create a script that calls `ta.sma(close, 14, title="SMA")` and verify the result is correct.

- [x] **H-009** | [DataLoss] | `backend/src/store/JsonStore.ts:69-71` | File lock failure silently proceeds without lock
  - **Issue:** If `lockSync()` fails (throws), the catch block silently continues with the write WITHOUT any lock. With concurrent requests to write the same JSON store (e.g., two rapid PUT /api/settings/telegram requests), both could read and write simultaneously, causing data corruption. The `patch()` method's `read()` and `write()` are not atomic — there's a TOCTOU (time-of-check-time-of-use) race.
  - **Impact:** Configuration data corruption under concurrent write access. Subscriber lists, bot tokens, or alarm configurations could be lost or corrupted.
  - **Fix:** Make the lock failure throw an error instead of silently continuing. Use a mutex or write queue for each store. Add retry logic with exponential backoff. Consider switching to a proper database (SQLite) for configuration storage instead of JSON files.
  - **Test:** Send 10 concurrent PUT requests to `/api/settings/telegram` and verify data integrity.

- [x] **H-010** | [Performance-CacheIneffective] | `backend/src/cache/ohlcv-cache.ts:22-31` | Cache uses lastAccessed for TTL check, not insertion time
  - **Issue:** The TTL check uses `lastAccessed` (updated on every `get()`) rather than the original insertion/fetch time. This means frequently accessed cache entries never expire, even if the underlying data (OHLCV) has changed. For a 60-second TTL with a popular symbol being polled every second, the cache effectively never expires.
  - **Impact:** Real-time or intraday backtests could use stale OHLCV data indefinitely if the symbol is polled frequently. The cache never refreshes for actively queried symbols.
  - **Fix:** Store `createdAt` (insertion timestamp) alongside `lastAccessed`. Use `createdAt` for TTL expiration. Or use a hybrid: expire based on `createdAt` but evict based on `lastAccessed` (LRU).
  - **Test:** Set TTL to 100ms, populate a cache entry, read it every 10ms for 1 second, then verify the entry is eventually expired.

---

### Medium

- [ ] **M-001** | [CodeQuality-TypeSafety] | `src/language/runtime/execution-engine.ts:63,66` | Public fields marked `@internal` used by reference across module boundary
  - **Issue:** The `ExecutionEngine` has 30+ public fields annotated with `/** @internal */` JSDoc comments. These fields (like `compiledScript`, `sourceProgram`, `globalScope`, etc.) are accessed directly by `Interpreter`, `StateManager`, and `FormingCandleProcessor` via `this.eng = engine as any` in those classes. This completely bypasses TypeScript's type system. If a field name changes, there's no compilation error — it fails at runtime.
  - **Impact:** Refactoring the engine is extremely fragile. Any rename of an internal field requires manually finding all `any`-typed usages across 4+ files. This has likely already caused or will cause runtime errors.
  - **Fix:** Define an `EngineInternals` interface (or `InternalEngine`) that exposes the cross-module surface, and have the `Interpreter`/`StateManager`/`FormingCandleProcessor` accept it as a typed parameter instead of `any`. Alternatively, move cross-cutting state into a shared state object.
  - **Test:** Rename one field (e.g., `smaBuffers` to `smaBufferMap`) and verify the TypeScript compiler catches all usages.

- [ ] **M-002** | [CodeQuality-Duplication] | `backend/src/routes/backtest.ts:379-441` and `backend/src/cli/symbol-runner.ts:121-174` | Duplicated fetchBars function with identical logic
  - **Issue:** `backtest.ts` and `symbol-runner.ts` both define their own `fetchBars()` function with virtually identical implementation (pagination loop, Bybit API calls, bar parsing, filtering). This violates DRY. Any bug fix or improvement must be applied to both copies.
  - **Impact:** Maintenance burden doubles. The `backtest.ts` version has progress reporting not present in `symbol-runner.ts`. The rate limiter is bypassed in both since they use raw `fetch()` instead of going through `BybitDataSource`.
  - **Fix:** Extract a shared `fetchBars()` function in the Bybit data source module and have both callers use it. Add progress callback support for the backtest route.
  - **Test:** Verify both CLI backtest and HTTP backtest produce identical results for the same symbol/timeframe.

- [x] **M-003** | [Bug-Logic] | `src/strategy/commission-calculator.ts:756-764` | buildTradeContextFromFill sets both entryPrice and exitPrice to fillPrice
  - **Issue:** `buildTradeContextFromFill()` sets both `entryPrice` and `exitPrice` to `params.fillPrice`. This means the `TradeContext` doesn't distinguish between entry and exit fills. The `JupiterUltraCalculator.calculate()` method uses `context.tradeValue` (which is `|fillPrice * quantity|`) for both entry and exit, potentially double-charging DEX fees on a single round-trip trade.
  - **Impact:** Jupiter commission methods charge DEX swap fee (25 bps) on both entry and exit, when in reality the DEX fee is paid per swap. For a backtest, each order fill triggers commission, so a market buy + market sell would charge 50 bps total instead of 25 bps per swap direction. While this may be intentional for some models, the lack of exit/entry context means custom calculators can't differentiate.
  - **Fix:** Add an `isEntry` boolean to `TradeContext` or split into `entryFill`/`exitFill` contexts. For legacy behavior, preserve the current behavior but document it clearly.
  - **Test:** Write a test that verifies commission for a round-trip Jupiter swap matches expected documentation values.

- [x] **M-004** | [ErrorHandling] | `backend/src/store/ScriptFileManager.ts:setActive()` | setActive now reads source from file and is async; caller in scripts.ts updated to await
  - **Issue:** `setActive()` returns a `ScriptEntry` with `source: ''` (empty string) because it only reads from the manifest, not the file. This is inconsistent with `getById()` and `getActive()` which return the actual source. Any caller using `setActive()` result to display the script source will show an empty editor.
  - **Impact:** The "Set Active Script" API response doesn't include script source, forcing the frontend to make an additional `getById()` call to get the source.
  - **Fix:** Have `setActive()` read the file and return the full source, or document that the source field is intentionally empty.
  - **Test:** Call PUT /api/scripts/active with a valid ID and verify the response includes the script source.

- [x] **M-005** | [Bug-Logic] | `src/strategy/strategy-engine.ts:258-267` | Long-only enforcement silently drops short entries without notifying the user
  - **Issue:** When a commission method enforces long-only (`isLongOnlyEnforced` returns true), `entry()` returns `undefined` for short entries. The calling Pine script has no way to know the order was rejected. The strategy continues execution as if nothing happened, potentially causing significant discrepancies between expected and actual behavior.
  - **Impact:** Backtest results silently omit short trades when long-only is enforced. This can make a strategy that relies on short trades appear as if it never trades at all, without any error or warning.
  - **Fix:** Log a warning when a short entry is suppressed due to long-only enforcement. Consider adding a strategy config validation step that warns at initialization time if the strategy uses short entries with a long-only method.
  - **Test:** Create a strategy with both long and short entries using a long-only commission method, and verify that the output clearly indicates which trades were suppressed.

- [ ] **M-006** | [Bug-Parser] | `src/language/parser/parser.ts:1081-1088` | Identifier node created from non-identifier tokens (keywords) may have unexpected `name`
  - **Issue:** The `parsePrimary()` method matches many keyword tokens (ColorType, StringType, Strategy, Indicator, Library, Array, Map, Matrix, Int, Float, Bool, Ta, Math, Str, Time, Input) and creates an `IdentifierNode` with `name: token.lexeme`. However, `token.lexeme` for these tokens contains the actual source text, which may be a keyword like "strategy" or "int". When this identifier is later evaluated, the interpreter may try to resolve it as a variable, and if it doesn't exist, it throws "Variable 'strategy' is not defined". Some keywords should not be treated as identifiers.
  - **Impact:** Certain valid Pine Script expressions may fail to parse or execute if a keyword is used in an unsupported context.
  - **Fix:** In contexts where an identifier is expected (not a keyword), only match `TokenType.Identifier`. For built-in namespace references (ta, math, str, time, input, color), route them to the correct evaluation logic instead of treating them as variable lookups.
  - **Test:** Parse and execute a script using `ta.sma(close, 14)` and verify it works without errors about undefined variables.

- [ ] **M-007** | [Bug-Logic] | `src/language/runtime/interpreter.ts:607` | FunctionExpression evaluation returns NA, discarding function registration in some contexts
  - **Issue:** `executeFunctionExpression()` registers the function in `this.eng.functions.set(expr.name, expr)` and returns NA. However, in the `executeCallExpression()` method (line 825), the code checks `this.eng.functions.get(funcName)` to call user-defined functions. If a function is defined within a conditional branch that doesn't execute on the first bar, it won't be registered when called on a later bar.
  - **Impact:** User-defined functions inside conditional blocks (if statements) may not be accessible on all bars, causing "function not found" errors.
  - **Fix:** Ensure function definitions are hoisted or evaluated unconditionally. The simplest approach is to register all top-level function definitions during initialization rather than during bar execution.
  - **Test:** Create a script with a function defined inside an if statement and verify it's callable from outside the if block.

- [ ] **M-008** | [ErrorHandling] | `src/language/runtime/interpreter.ts:114-139` | Error in executeBar returns a partial success result with empty outputs but success=false
  - **Issue:** When an error occurs during bar execution, the catch block returns `{ success: false, error: ... }` but also returns all current `this.eng.outputs`, `this.eng.shapes`, etc. These outputs may contain partial results from the failed bar execution that were not rolled back properly (since `rollbackToPreviousBar()` only rolls back snapshot state, not outputs/shapes/lines). This can lead to the frontend displaying partial/dirty state from a failed bar.
  - **Impact:** Failed bar executions can leave the engine in an inconsistent state, with partial UI updates displayed to the user.
  - **Fix:** In the error handler, restore outputs, shapes, lines, labels, and other visual elements to their pre-bar state. The `FormingCandleProcessor` already has the infrastructure for this (snapshot/restore pattern). Apply the same pattern to `executeBar()`.
  - **Test:** Create a script that produces valid output for 10 bars then throws on bar 11. Verify the outputs after the failure don't contain partial bar 11 data.

- [ ] **M-009** | [Bug-Logic] | `src/language/runtime/forming-candle.ts:22-40` | First execution uses executeRealtimeBar but doesn't add to barTimestamps consistently
  - **Issue:** When `computeFormingCandle()` is called with `metrics.totalBars === 0` (first bar), it calls `executeRealtimeBar()` which internally calls `executeBar()`. After execution, it returns `diffOutputs` from the result. However, it doesn't add the bar to `barTimestamps` — the result's `barTimestamps` may be empty if `executeBar` fails to add it. Meanwhile, on subsequent calls, `barTimestamps` is expected to have entries.
  - **Impact:** The first forming candle computation may produce inconsistent timestamps, causing the frontend to display incorrect time labels.
  - **Fix:** Ensure `executeRealtimeBar()` always records timestamps. Add the timestamp to `barTimestamps` after `executeBar()` regardless of success/failure.
  - **Test:** Create a forming candle computation and verify `barTimestamps` is consistently set.

- [x] **M-010** | [CodeQuality-Coupling] | `backend/src/ws/gateway.ts:293` | GlobalThis pollution for cross-module communication
  - **Issue:** `(globalThis as Record<string, unknown>).__wsBroadcastIndicatorRemoved = ...` pollutes the global scope. The scripts router (`scripts.ts:119`) accesses it via `(globalThis as Record<string, unknown>).__wsBroadcastIndicatorRemoved`. This is a fragile, untestable pattern for cross-module communication.
  - **Impact:** Testing any route handler that calls this function requires setting up global state. Refactoring the broadcast logic requires finding all usages of `__wsBroadcastIndicatorRemoved`. TypeScript provides no type checking for this.
  - **Fix:** Use dependency injection: pass the broadcast function to `createScriptsRouter()` as a parameter (similar to how `indicatorsStore` is passed). Or use an EventEmitter-based pattern.
  - **Test:** Refactor to DI and verify all existing tests still pass with no global state setup.

---

### Low

- [ ] **L-001** | [ErrorHandling] | `backend/src/routes/backtest.ts:102` | DEX fee fetch failure throws, aborting the entire backtest
  - **Issue:** When Jupiter commission is configured and `fetchDexFeeBps()` fails (e.g., Jupiter API is down), the error is thrown (`throw err`), aborting the entire backtest. This means a backtest cannot complete if the Jupiter API is unreachable, even though cached fees might be available.
  - **Impact:** Backtests fail unnecessarily when Jupiter API is temporarily unavailable, even for strategies that would be fine with cached or default fees.
  - **Fix:** Fall back to the persistent cache or default DEX fee (25 bps) instead of throwing. Log a warning. The `fetchDexFeeBps()` function already has cache fallback — use it. Add a `--allow-cached-fees` option.
  - **Test:** Simulate Jupiter API failure and verify the backtest completes using cached or default fees.

- [ ] **L-002** | [ErrorHandling] | `backend/src/routes/scripts.ts:47` | No rate limiting on script CRUD operations
  - **Issue:** Script creation, update, and deletion routes have no rate limiting. A user could create thousands of scripts, filling disk space with .pine files. The `uniqueFilename` function uses up to 1000 attempts, but there's no cap on total scripts.
  - **Impact:** Disk space exhaustion through script creation DoS.
  - **Fix:** Add rate limiting middleware. Limit the total number of scripts per instance (e.g., max 1000). Add a TTL or cleanup mechanism for unused scripts.
  - **Test:** Attempt to create 2000 scripts and verify the API rejects or limits the creation.

- [ ] **L-003** | [Performance] | `src/language/runtime/forming-candle.ts:42-78` | Full state clone on every forming candle tick is extremely expensive
  - **Issue:** On every forming candle tick (potentially multiple per second), `computeFormingCandle()` deep-clones ALL internal engine state: `smaBuffers`, `emaState`, `crossPrevValues`, `changePrevValues`, `highestBuffers`, `lowestBuffers`, `plotColors`, `fillColorData`, `rsiState`, `atrState`, `hmaBuffers`, `sarState`, `functionPersistentScopes`, and more. Each clone allocates new arrays/objects. For a real-time system with 20+ indicators and multiple ticks per second, this creates massive GC pressure.
  - **Impact:** High latency and memory churn in real-time mode. On slower hardware or with many indicators, this can cause the event loop to block, leading to missed ticks or WebSocket disconnections.
  - **Fix:** Use a copy-on-write strategy or an immutable state tree that shares unchanged data. At minimum, make the deep clone lazy (only clone state that actually changes). Consider using Immer or a similar library.
  - **Test:** Profile the forming candle processor with 50+ bars/sec and measure GC pause times.

- [ ] **L-004** | [Bug-OrderFill] | `src/strategy/strategy-engine.ts:844-858` | Market orders fill at open price even when entered mid-bar
  - **Issue:** `fillPendingMarketOrders()` fills all pending market orders at the current bar's `open` price. However, in real trading, market orders entered during a bar would fill at some price within the bar's range, not necessarily at the open. This is particularly problematic for `calcOnEveryTick: true` strategies.
  - **Impact:** Market order fills are systematically inaccurate, assuming all orders execute at the open. This can significantly affect backtest results for fast-moving markets or during high volatility.
  - **Fix:** Add an option to fill market orders at a randomized or average price within the bar (e.g., `(open + high + low + close) / 4`) instead of always using `open`. At minimum, document this limitation.
  - **Test:** Create a strategy that enters at market on every bar and compare results with different fill price models.

- [ ] **L-005** | [Bug-Logic] | `src/strategy/strategy-engine.ts:1032-1038` | Sharpe ratio hardcoded to annualize with sqrt(252)
  - **Issue:** The Sharpe and Sortino ratios multiply by `Math.sqrt(252)` regardless of the actual bar timeframe. For daily data, 252 is correct. For hourly data, it should be `sqrt(252*6.5)` or `sqrt(252*24)`. For minute data, the scaling is orders of magnitude off.
  - **Impact:** Sharpe and Sortino ratios are only correct for daily timeframe backtests. All other timeframes produce incorrect (overly large or small) risk-adjusted return metrics.
  - **Fix:** Make the annualization factor configurable or derive it from the bar timeframe. At minimum, add a `timeframe` parameter to the engine and compute the correct factor (e.g., `sqrt(252 * barsPerDay)`). For CLI backtests, pass the timeframe automatically.
  - **Test:** Run the same strategy on 1h and 1D data and verify Sharpe ratio values are comparable (annualized to the same period).

- [ ] **L-006** | [CodeQuality-MagicNumbers] | `src/strategy/strategy-engine.ts:1032-1038` | Hardcoded `252` for annualization
  - **Issue:** `Math.sqrt(252)` appears twice (Sharpe and Sortino) with no named constant explaining what 252 represents.
  - **Impact:** Without documentation, a reader might not understand that 252 = typical trading days per year. If the data uses different conventions (e.g., crypto 365-day markets), the value is wrong.
  - **Fix:** Define `const TRADING_DAYS_PER_YEAR = 252;` at the module level and use it in both places.
  - **Test:** Pure refactoring — no behavior change expected.

- [ ] **L-007** | [ErrorHandling] | `backend/src/routes/backtest.ts:229-281` | Backtest job queue is unbounded, no cleanup for failed/completed jobs
  - **Issue:** Completed and failed jobs remain in the `jobs` Map indefinitely. There's no TTL or cleanup mechanism. Over time, this will exhaust memory if users submit many backtests.
  - **Impact:** Memory leak in production. Each backtest result can be hundreds of KB (equity curves, trade lists, etc.). After thousands of backtests, the server will OOM.
  - **Fix:** Add a TTL for completed/failed jobs (e.g., 30 minutes). Periodically sweep old jobs. Or store results on disk and only keep metadata in memory.
  - **Test:** Submit 100 backtests, wait, then verify the jobs Map size doesn't keep growing indefinitely.

- [ ] **L-008** | [Bug-Logic] | `src/strategy/backtest-engine.ts:133-149` | Intrabar magnification (barMagnifier) builds subBarMap but subBars param ordering assumption is fragile
  - **Issue:** `buildSubBarMap()` assumes `subBars` are sorted by timestamp and that no two main bars overlap. It uses `bars[i+1]?.timestamp` as the upper bound, but if `bars` are not sorted (which is not guaranteed), the matching logic fails. There's also no validation that the timestamp ranges of subBars and bars overlap at all.
  - **Impact:** Bar magnification silently produces incorrect results or empty sub-bar lists if the input ordering assumptions are violated.
  - **Fix:** Sort both `bars` and `subBars` by timestamp before processing. Validate that timestamps overlap. Add a warning when subBars match zero bars.
  - **Test:** Create a test with unsorted bars and verify the engine handles them correctly or throws a meaningful error.

- [ ] **L-009** | [Bug-Parser] | `src/language/parser/parser.ts:1089-1095` | Parenthesized expression consumes `(` and `)` but doesn't handle empty parentheses
  - **Issue:** If a user writes an empty parenthesized expression `()`, the parser will call `parseExpression()` inside the parentheses. If the next token is `)`, `parseExpression()` will fail because there's no expression to parse. However, empty parentheses could also be a function call with no arguments (already handled by `finishCall` which checks for `)`). This edge case isn't gracefully handled.
  - **Impact:** `()` in Pine Script produces a confusing parse error instead of a clear message like "empty expression".
  - **Fix:** Check for `)` before calling `parseExpression()` inside parentheses and produce a clear error message.
  - **Test:** Attempt to parse `()` and verify the error message is clear.

- [ ] **L-010** | [CodeQuality] | `src/language/runtime/interpreter.ts:50-54` | Interpreter stores engine as `any` type
  - **Issue:** `private eng: any; constructor(engine: ExecutionEngine) { this.eng = engine as any; }` — the interpreter references ALL engine properties directly via `this.eng.*`, bypassing type checking entirely. Same pattern in `FormingCandleProcessor` and `StateManager`.
  - **Impact:** Complete loss of TypeScript type safety for the most critical component of the system. Refactoring any field on the engine requires manually verifying all `any`-typed accesses across 3+ files.
  - **Fix:** Define a typed interface (e.g., `EngineCore`) that exposes all properties accessed by delegation components. Have the constructor accept `EngineCore` instead of `any`.
  - **Test:** After refactoring, verify `tsc --noEmit` passes with strict mode.

---

### Suggestions

- [ ] **S-001** | [Testing] | `tests/strategy/backtest-engine.test.ts:11-13` | Tests use Math.random() which makes them non-deterministic
  - **Issue:** The `createBars()` helper uses `Math.random()` to generate bar data. This means every test run produces different price data, making tests non-reproducible. A test could pass today and fail tomorrow if the random data happens to trigger a bug.
  - **Fix:** Use a seeded random number generator (e.g., a simple LCG) for deterministic tests. Or use fixed test data fixtures.
  - **Test Impact:** After fix, tests should produce identical results every run.

- [ ] **S-002** | [Testing] | Tests lack integration coverage for the full parse → compile → execute → render pipeline
  - **Issue:** Most tests cover individual components in isolation (parser tests, compiler tests, engine tests). There are few end-to-end tests that run a Pine script from source through to final output comparison. The integration tests in `tests/integration/` are promising but limited.
  - **Fix:** Add comprehensive integration tests that compare engine output against known-good TradingView output for standard indicators (SMA, EMA, MACD, RSI, Bollinger Bands, etc.).
  - **Test:** Each indicator test should verify that the output matches TradingView values within a tolerance (e.g., ±0.01%).

- [ ] **S-003** | [Testing] | `tests/strategy/strategy-engine.test.ts` has no tests for partial fills, stop-limit orders, or OCA groups
  - **Issue:** The strategy engine test suite has 676 lines but covers only basic scenarios. Missing tests: partial fills with slippage, stop-limit fills across multiple bars, OCA group cancellation, `calcOnOrderFills` mode, multiple pyramiding levels, fractional quantities, zero-price scenarios, negative slippage, and more.
  - **Fix:** Add test cases for each edge case listed above. Aim for at least 90% branch coverage on `strategy-engine.ts`.
  - **Test:** Each new test case directly validates the corresponding feature.

- [ ] **S-004** | [Architecture] | Both HTTP backtest route and CLI backtest runner duplicate the entire backtest pipeline
  - **Issue:** `backtest.ts` (HTTP) and `symbol-runner.ts` (CLI) each independently implement the full backtest flow: parse → compile → create engine → build contexts → execute bars → compute metrics. The only difference is the CLI processes bars in batches with delays. This is a massive code duplication (tens of lines of identical logic).
  - **Fix:** Extract a shared `runBacktest(script, bars, config)` function in the library (e.g., `src/strategy/backtest-engine.ts` already provides most of this). Have both the HTTP route and CLI use it.
  - **Test:** Both codepaths should produce identical results for identical inputs.

- [ ] **S-005** | [Architecture] | No database — all configuration stored as JSON files with manual locking
  - **Issue:** The backend uses JSON files (`telegram.json`, `indicators.json`, `manifest.json`) for all persistent state. File corruption risk, no atomic operations, no query capabilities, no migration support, manual locking (optional! fails silently). With only `proper-lockfile` for locking (which itself can fail silently per JsonStore.ts:69-71), data integrity is fragile.
  - **Fix:** Migrate to SQLite (via better-sqlite3 or Bun sqlite) for configuration storage. This provides ACID transactions, atomic writes, concurrent read access, and built-in migration support.
  - **Test:** All store tests should pass after migration.

- [ ] **S-006** | [Performance] | RingBuffer constructor allocates full capacity array but push logic also allocates on first write
  - **Issue:** `RingBuffer.buffer = new Array(capacity)` allocates an array of `capacity` (potentially large for SMA(2000)). Then `push()` overwrites individual elements. For indicators with many lookback periods, this can allocate significant wasted memory. Additionally, `toArray()` allocates a new array on every call, which is called on forming-candle ticks.
  - **Fix:** Consider lazy initialization (allocate on first push). Cache the `toArray()` result when possible. For forming candle mode, avoid calling `toArray()` entirely.
  - **Test:** Profile memory usage before and after for SMA(5000) on multiple symbols.

- [ ] **S-007** | [Maintainability] | `src/language/runtime/interpreter.ts` is 1437 lines with 60+ switch cases in one function
  - **Issue:** `executeExpression()` is a single switch statement with 20+ cases, each dispatching to a separate method. While each expression type has its own method, the overall file is very long and hard to navigate. The `executeCallExpression()` method alone is 300+ lines.
  - **Fix:** Split `interpreter.ts` into smaller modules: `expression-interpreter.ts`, `statement-interpreter.ts`, `call-expression-interpreter.ts`, `array-methods.ts`, `line-methods.ts`, `box-methods.ts`.
  - **Test:** All existing tests must pass without modification (pure refactoring).

- [ ] **S-008** | [Observability] | No structured logging, no metrics, no tracing
  - **Issue:** All logging uses `console.log()`/`console.error()` with string interpolation. In production, this provides no structured data (no JSON, no log levels, no request IDs). There are no metrics (request count, latency, error rates, GC pressure). No distributed tracing for async execution paths.
  - **Fix:** Add a structured logger (e.g., pino) and instrument all API routes with request IDs. Add Prometheus metrics for key operations (backtest execution time, API latency, WebSocket connections, error rates). Add OpenTelemetry for tracing.
  - **Test:** Verify that metrics endpoints return correct values.

- [ ] **S-009** | [Deployment] | No health check endpoint, no graceful degradation documentation
  - **Issue:** The `/api/status` endpoint returns `{status, version, uptime}` but doesn't check dependencies (Bybit API connectivity, disk space, Telegram service status). If Bybit API is down, the server still reports "ok". There's no documentation of what happens to each feature when upstream services fail.
  - **Fix:** Add dependency checks to the status endpoint. Return `status: 'degraded'` with details when dependencies are unavailable. Add load shedding when backtest queue grows large.
  - **Test:** Simulate Bybit API failure and verify the status endpoint reflects the degradation.

- [ ] **S-010** | [Testing] | `tests/language/execution-engine.test.ts` tests mostly check `engine` is defined, not output values
  - **Issue:** Many tests in `execution-engine.test.ts` only check `expect(engine).toBeDefined()` — they verify no crash occurred but don't validate the actual output values. For example, the arithmetic test (`x = 10; y = 20; z = x + y`) never checks that `z` is actually 30.
  - **Fix:** Add assertions for output values: get the output series and verify the values are correct. For example: `expect(engine.getOutput('z')?.last()).toBe(30)`.
  - **Test:** Each test should verify at least one output value, not just that execution didn't crash.

