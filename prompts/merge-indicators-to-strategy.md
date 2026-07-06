# PineScript Indicator-to-Strategy Merge

## Objective

Merge multiple PineScript indicator files into a single PineScript strategy file. The resulting strategy must follow user-provided rules, contain no bugs, and be fully functional.

## Input

The user will provide:
1. **Indicator files** — Multiple `.pine` files containing indicator code (linked via `@`)
2. **Strategy rules** — A set of rules defining entry/exit conditions, position sizing, risk management, etc.
3. **Indicator settings** (optional) — Specific parameter values the user wants baked into the strategy as defaults (e.g., "RSI length = 21", "BB multiplier = 2.5")

### How Settings Are Applied

When the user specifies a setting:
1. Match the setting name to the corresponding `input.*()` variable in the source indicator
2. Replace the original default value with the user's value
3. Add a comment above the input showing the original default:
   ```pine
   // Original default: 14, User specified: 21
   rsi_length = input.int(21, "RSI Length", group="RSI Settings")
   ```
4. Preserve all other input properties (title, min, max, tooltip, group, inline)
5. If the user specifies a value outside the original min/max range, expand the range to accommodate it
6. If a setting name doesn't match any existing input, document it in comments and ask for clarification

### Settings Priority

1. User-specified values > indicator's original defaults
2. If two indicators have inputs with the same name but different values, prefix them with the indicator name
3. Strategy-level inputs (e.g., position sizing) are separate from indicator inputs

## Workflow

### Step 1: Analyze Each Indicator

For every linked indicator file:
1. Read the full source code
2. Identify the indicator's declaration (`indicator("name")`)
3. Extract all plot/line/label calls and their visual roles
4. Identify input variables and their defaults
5. Identify any `request.security()` calls and their purpose
6. Note the indicator's warmup period and any `barstate` usage
7. Document what data the indicator produces (buffers, variables)

### Step 2: Understand the Rules and Settings

Parse the user's strategy rules:
1. Entry conditions (long/short)
2. Exit conditions (take profit, stop loss, trailing stop)
3. Position sizing rules
4. Risk management parameters
5. Any filtering conditions
6. Time-based restrictions
7. Order of priority when rules conflict

Parse the user's indicator settings (if provided):
1. Map each setting to the correct indicator's input variable
2. Use the user's value as the `input.*()` default parameter
3. If a setting conflicts with the indicator's original default, the user's value wins
4. Document which settings were customized in the header comments
5. Preserve the input's type (`input.int()`, `input.float()`, `input.bool()`, `input.string()`, etc.)
6. Keep the original input's title, min/max, and tooltip if present

### Step 3: Plan the Merge

Before writing code:
1. Determine which indicator outputs are needed for the strategy
2. Determine which plots are purely visual and can be removed
3. Identify naming conflicts between indicators
4. Plan variable prefixing to avoid collisions (e.g., `rsi_`, `macd_`, `bb_`)
5. Determine if any indicators conflict (e.g., both use the same variable name)
6. Map indicator outputs to strategy entry/exit conditions

### Step 4: Write the Strategy

#### Header Comments

```pine
// This strategy was created by merging the following indicator files:
// - [indicator_name_1.pine](source_path_1) — Brief description of what it does
// - [indicator_name_2.pine](source_path_2) — Brief description of what it does
//
// STRATEGY DESCRIPTION:
// [Verbal description of the strategy logic in plain English]
// [What the strategy does, when it enters, when it exits]
// [Any special conditions or filters applied]
//
// RULES APPLIED:
// [List of the user's rules that were implemented]
//
// CUSTOMIZED SETTINGS:
// [List any indicator settings the user specified to override defaults]
// - RSI Length: 21 (original default: 14)
// - BB Multiplier: 2.5 (original default: 2.0)
//
// OUTPUT PATH: backend/data/scripts/strategies/[filename].pine
//
// --- STRATEGY FILE IDENTIFICATION ---
// This file is a MERGED STRATEGY, not an indicator.
// If this file is linked to an AI agent, DO NOT create a new strategy.
// UPDATE this file instead. The source indicators are:
// @source:indicator_1.pine
// @source:indicator_2.pine
// --- END IDENTIFICATION ---
```

#### Code Structure

```pine
//@version=6
strategy("Merged Strategy Name", overlay=true, ...)

// ─── INPUTS ─────────────────────────────────────────────
// Group inputs by their source indicator
// Use prefixes to avoid conflicts
// Apply user-specified settings as defaults

// From indicator_1:
// Original default: 14, User specified: 21
ind1_input1 = input.int(21, "RSI Length", group="Indicator 1 Settings")
// From indicator_2:
// Original default: 2.0, User specified: 2.5
ind2_input1 = input.float(2.5, "ATR Multiplier", group="Indicator 2 Settings")

// ─── INDICATOR LOGIC ────────────────────────────────────
// Each indicator's logic block is clearly separated
// Variables are prefixed with the indicator's short name

// === Indicator 1: [Name] ===
// Source: indicator_1.pine
ind1_rsi = ta.rsi(close, ind1_input1)
ind1_signal = ta.sma(ind1_rsi, 9)

// === Indicator 2: [Name] ===
// Source: indicator_2.pine
ind2_atr = ta.atr(14)
ind2_upper = close + ind2_atr * ind2_input1
ind2_lower = close - ind2_atr * ind2_input1

// ─── STRATEGY LOGIC ─────────────────────────────────────
// Entry conditions combining indicator outputs
longCondition = ind1_rsi < 30 and close > ind2_lower
shortCondition = ind1_rsi > 70 and close < ind2_upper

if (longCondition)
    strategy.entry("Long", strategy.long)

if (shortCondition)
    strategy.entry("Short", strategy.short)

// ─── EXIT LOGIC ─────────────────────────────────────────
// Based on user rules

// ─── PLOTS ──────────────────────────────────────────────
// Only essential plots — remove purely visual clutter
plot(ind2_upper, "Upper Band", color=color.red)
plot(ind2_lower, "Lower Band", color=color.green)
bgcolor(longCondition ? color.new(color.green, 90) : na)
bgcolor(shortCondition ? color.new(color.red, 90) : na)
```

### Step 5: Validate the Strategy

Before outputting:
1. **No duplicate variable names** — Every variable is unique or prefixed
2. **No missing references** — Every variable used is defined before use
3. **No conflicting `plot()` calls** — No duplicate plot IDs
4. **No `indicator()` calls** — Only one `strategy()` declaration
5. **No `alertcondition()` calls** — Use `strategy.entry()` instead
6. **All `request.security()` calls are valid** — Proper symbol and timeframe
7. **Warmup period is handled** — `bar_index >= ta.highest(all_lengths)` check
8. **No `study()` references** — All `study()` replaced with `strategy()`
9. **Input groups are organized** — Each indicator's inputs are grouped
10. **Strategy rules are correctly mapped** — Entry/exit logic matches user rules
11. **User-specified settings applied** — All user-provided values used as input defaults

### Step 6: Output the File

Save the strategy file to: `backend/data/scripts/strategies/[descriptive_strategy_name].pine`

The filename should:
1. Be lowercase with underscores (e.g., `rsi_bollinger_strategy.pine`)
2. Be descriptive of the strategy's purpose
3. End with `.pine`
4. Avoid special characters

Include in the file:
1. Header comments with source links and description
2. Prompt injection for future updates
3. Clean, well-structured code
4. All necessary plots for the strategy
5. Entry/exit logic following user rules

After saving, run a full sync to register the file in the manifest:
```
POST /api/scripts/files/sync
```

## Conflict Resolution Rules

When indicators conflict:
1. **Variable naming** — Prefix with indicator short name (e.g., `rsi_val`, `macd_val`)
2. **Plot naming** — Use descriptive names (e.g., `"RSI Signal"`, `"MACD Histogram"`)
3. **Input grouping** — Separate by indicator with group parameter
4. **Logic conflicts** — If two indicators produce conflicting signals, document the priority in comments
5. **Timeframe conflicts** — Use the highest timeframe requested by any indicator
6. **Warmup periods** — Use the longest warmup period required by any indicator

## Prompt Injection Template

This MUST appear in the header comments of every output file:

```
// === STRATEGY FILE IDENTIFICATION ===
// This file is a MERGED STRATEGY, not an indicator source file.
//
// OUTPUT PATH: backend/data/scripts/strategies/[filename].pine
//
// If this file is linked to an AI coding agent, you MUST:
// 1. NOT create a new strategy file
// 2. UPDATE this existing strategy file instead
// 3. Preserve the source links below when making changes
//
// This strategy was created from:
// @source:[filename1.pine] — [description]
// @source:[filename2.pine] — [description]
//
// To modify this strategy, update the code below while maintaining
// the source indicator logic and strategy rules.
// === END STRATEGY FILE IDENTIFICATION ===
```

## Example

**Input:**
- `rsi_oversold.pine` — RSI indicator that detects oversold conditions
- `bollinger_breakout.pine` — Bollinger Bands indicator for breakout detection
- Rules: "Go long when RSI < 30 AND price touches lower Bollinger Band. Exit when RSI > 70 OR price touches upper band."
- Settings: "RSI length = 21, BB length = 25, BB multiplier = 2.5"

**Output:** `backend/data/scripts/strategies/rsi_bollinger_strategy.pine`

```pine
// This strategy was created by merging the following indicator files:
// - rsi_oversold.pine — RSI-based oversold/overbought detection
// - bollinger_breakout.pine — Bollinger Band breakout/touch detection
//
// STRATEGY DESCRIPTION:
// Enters long when RSI indicates oversold conditions AND price touches
// the lower Bollinger Band. Exits when RSI indicates overbought OR
// price touches the upper Bollinger Band. Uses configurable RSI length,
// BB length, and BB standard deviation.
//
// RULES APPLIED:
// - Long entry: RSI < 30 AND close <= lower BB
// - Exit: RSI > 70 OR close >= upper BB
// - No short positions
// - Default position size: 100% of equity
//
// CUSTOMIZED SETTINGS:
// - RSI Length: 21 (original default: 14)
// - BB Length: 25 (original default: 20)
// - BB Multiplier: 2.5 (original default: 2.0)
//
// OUTPUT PATH: backend/data/scripts/strategies/rsi_bollinger_strategy.pine
//
// --- STRATEGY FILE IDENTIFICATION ---
// This file is a MERGED STRATEGY, not an indicator.
// If this file is linked to an AI agent, DO NOT create a new strategy.
// UPDATE this file instead. The source indicators are:
// @source:rsi_oversold.pine
// @source:bollinger_breakout.pine
// --- END IDENTIFICATION ---

//@version=6
strategy("RSI + Bollinger Strategy", overlay=true)

// ─── INPUTS ─────────────────────────────────────────────
// RSI Settings (from rsi_oversold.pine)
// Original default: 14, User specified: 21
rsi_length = input.int(21, "RSI Length", group="RSI Settings")
rsi_oversold = input.int(30, "RSI Oversold Level", group="RSI Settings")
rsi_overbought = input.int(70, "RSI Overbought Level", group="RSI Settings")

// Bollinger Band Settings (from bollinger_breakout.pine)
// Original default: 20, User specified: 25
bb_length = input.int(25, "BB Length", group="Bollinger Band Settings")
// Original default: 2.0, User specified: 2.5
bb_mult = input.float(2.5, "BB StdDev", group="Bollinger Band Settings")

// ─── INDICATOR LOGIC ────────────────────────────────────
// === RSI (from rsi_oversold.pine) ===
rsi_val = ta.rsi(close, rsi_length)

// === Bollinger Bands (from bollinger_breakout.pine) ===
bb_basis = ta.sma(close, bb_length)
bb_dev = bb_mult * ta.stdev(close, bb_length)
bb_upper = bb_basis + bb_dev
bb_lower = bb_basis - bb_dev

// ─── STRATEGY LOGIC ─────────────────────────────────────
longCondition = rsi_val < rsi_oversold and close <= bb_lower
exitCondition = rsi_val > rsi_overbought or close >= bb_upper

if (longCondition)
    strategy.entry("Long", strategy.long)

if (exitCondition)
    strategy.close("Long")

// ─── PLOTS ──────────────────────────────────────────────
plot(bb_upper, "Upper Band", color=color.red)
plot(bb_lower, "Lower Band", color=color.green)
plot(bb_basis, "BB Basis", color=color.orange)
hline(rsi_oversold, "RSI Oversold", color=color.green, linestyle=hline.style_dashed)
hline(rsi_overbought, "RSI Overbought", color=color.red, linestyle=hline.style_dashed)
bgcolor(longCondition ? color.new(color.green, 90) : na)
bgcolor(exitCondition ? color.new(color.red, 90) : na)
```

## Checklist

Before delivering the strategy file:

- [ ] File saved to `backend/data/scripts/strategies/[name].pine`
- [ ] All indicator sources are documented in header comments
- [ ] Strategy description is written in plain English
- [ ] User rules are listed and implemented
- [ ] Customized settings are documented in header with original defaults
- [ ] User-specified settings are coded as `input.*()` defaults
- [ ] Prompt injection is present for future updates
- [ ] Output path is included in header comments
- [ ] No variable naming conflicts between indicators
- [ ] All `indicator()` calls replaced with `strategy()`
- [ ] All `alertcondition()` calls replaced with strategy orders
- [ ] Entry/exit logic matches user rules exactly
- [ ] Input groups are organized by source indicator
- [ ] Plots are clean and non-redundant
- [ ] No compilation errors
- [ ] Warmup periods are handled correctly
- [ ] No missing variable references
