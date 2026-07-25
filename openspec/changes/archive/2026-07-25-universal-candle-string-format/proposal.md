## Why

Telegram alerts from Pine Script indicators display raw template variables like `{{ticker}}` instead of substituting the actual symbol name. The substitution logic is duplicated (or missing) across the Pine runtime (`alert-system.ts`), the backend Telegram service, and the frontend, each with a different subset of supported variables. This causes inconsistent behavior and makes it easy to miss variables like `ticker`.

## What Changes

- Create a shared `candle-string-format` module in `src/` that provides a single `formatCandleString(template, context)` function supporting all candle-related template variables
- Add `{{ticker}}` (symbol name) to the supported variable list
- Replace the inline `formatMessage` in `src/strategy/alert-system.ts` with a call to the new shared module
- Apply the same formatter in the backend Telegram alert path (`gateway.ts`) for variables that are only available there (e.g., `ticker`)
- Expose the formatter for frontend use so rendered alert messages are consistent
- Remove all duplicate formatting logic

## Capabilities

### New Capabilities
- `candle-string-format`: Universal string template formatting for candle/alert data, supporting all common Pine Script template variables (`{{ticker}}`, `{{interval}}`, `{{open}}`, `{{high}}`, `{{low}}`, `{{close}}`, `{{volume}}`, `{{time}}`, `{{bar_index}}`, `{{timestamp}}`)

### Modified Capabilities
- `alert-system`: The alert system's formatting behavior changes — previously unformatted variables (e.g., `{{ticker}}`) will now be resolved, and the formatting logic moves to a shared module
- `telegram-notification`: Telegram alerts will now resolve `{{ticker}}` and other template variables in the message body before sending

## Impact

- New file: `src/util/candle-string-format.ts` (shared formatting module)
- Modified: `src/strategy/alert-system.ts` (delegate to shared module)
- Modified: `backend/src/ws/gateway.ts` (apply formatter before sending to Telegram)
- Possibly modified: `frontend/src/hooks/chart-alert-processor.ts` (use formatter for frontend rendering)
- All current `formatMessage` behavior preserved; only `ticker` is added as a new variable
- No breaking changes — existing message templates continue to work
