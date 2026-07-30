## 1. Timezone Constants & Utilities

- [x] 1.1 Create `TIMEZONE_GROUPS` constant: array of `{ group: string, zones: string[] }` covering all IANA timezones grouped by continent (America, Europe, Asia, Africa, Australia/Pacific, UTC)
- [x] 1.2 Create `detectTimezone()` utility: returns `Intl.DateTimeFormat().resolvedOptions().timeZone`
- [x] 1.3 Create `getTimezoneLabel(iana: string)` utility: converts `America/New_York` → `America/New_York (EDT)` or similar human-readable label

## 2. BotConfigPanel Timezone State

- [x] 2.1 Add `timezone` state initialization: load from `localStorage.getItem('botTimezone')`, fall back to `detectTimezone()`, final fallback `'UTC'`
- [x] 2.2 Add `useEffect` to persist timezone to localStorage when it changes
- [x] 2.3 Update `handleConfigure` to use `timezone` state instead of hardcoded `'UTC'`

## 3. Timezone Dropdown UI

- [x] 3.1 Replace the timezone display text in `BotConfigPanel` with a `<select>` element grouped by `TIMEZONE_GROUPS`
- [x] 3.2 Add a text filter input above the dropdown for searching timezones (case-insensitive substring match)
- [x] 3.3 Style the dropdown and filter to match existing form controls (dark theme, consistent spacing)

## 4. Review Step Display

- [x] 4.1 Update the config summary in the review/backtest step to display the selected timezone label

## 5. Testing & Verification

- [x] 5.1 Verify auto-detection: clear localStorage, reload, confirm timezone is auto-detected
- [x] 5.2 Verify persistence: select a timezone, reload, confirm it's restored from localStorage
- [x] 5.3 Verify filter: type partial timezone name, confirm dropdown filters correctly
- [x] 5.4 Verify backend receives correct timezone in POST `/api/bot/configure` payload
