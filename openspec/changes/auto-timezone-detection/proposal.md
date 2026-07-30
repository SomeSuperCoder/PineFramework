## Why

The trading bot's config step currently hardcodes timezone to `'UTC'` with no detection or override. Users need the bot to use their local timezone for daily loss resets, trade logging, and scheduling — but VPN users can't rely on IP-based geolocation. We need automatic detection that works regardless of network conditions, plus a manual dropdown for full control.

## What Changes

- **Auto-detect timezone** using `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser-native, VPN-proof — uses OS locale, not IP)
- **Persist detected timezone** to localStorage so it survives page reloads
- **Replace the plain text timezone display** on the config step with a searchable dropdown containing all IANA timezones
- **Allow manual override** — user can pick any timezone from the dropdown, overriding the detected value
- **Send selected timezone** to the backend in the bot configuration payload

## Capabilities

### New Capabilities
- `timezone-detection`: Automatic timezone detection via Intl API + localStorage persistence, with manual override dropdown on the config step

### Modified Capabilities
- `frontend-application`: Config step gains timezone dropdown UI and auto-detection on mount

## Impact

- **Frontend**: `TradingBotPanel.tsx` — `BotConfigPanel` component gets timezone detection logic and dropdown UI
- **Backend**: No changes needed — timezone is already sent as a config field, backend uses it as-is
- **Dependencies**: None new — `Intl.DateTimeFormat` is native browser API
- **Data**: Timezone preference stored in `localStorage` key `autoSelectTimezone` (or new key `botTimezone`)
