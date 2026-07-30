## Context

The trading bot config step currently hardcodes `timezone: 'UTC'` (line 525 of `TradingBotPanel.tsx`). The timezone is used for daily loss reset scheduling and trade logging. Users need their local timezone, but VPN users can't rely on IP-based geolocation services.

The config step is a React component (`BotConfigPanel`) inside the `SetupWizard`. It already has state management for other config values (strategy, DEX, max daily loss).

## Goals / Non-Goals

**Goals:**
- Auto-detect user's timezone on config step mount using `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Persist detected timezone to localStorage so it survives page reloads
- Provide a searchable dropdown with all IANA timezones for manual override
- Send the selected timezone to the backend in the bot configuration payload

**Non-Goals:**
- Backend-side timezone detection or storage
- Timezone-aware chart rendering (separate concern)
- Automatic timezone updates based on DST changes (user can re-detect manually)

## Decisions

### 1. Detection method: `Intl.DateTimeFormat` (browser-native)

**Choice:** Use `Intl.DateTimeFormat().resolvedOptions().timeZone` for detection.

**Rationale:** This reads the OS-level timezone setting, which is independent of IP address or VPN. It works offline, has zero latency, and is supported in all modern browsers.

**Alternatives considered:**
- IP-based geolocation (e.g., `ipapi.co`): Fails with VPN, requires network call, adds latency and privacy concerns.
- `Date().getTimezoneOffset()`: Returns UTC offset only, not IANA name — can't distinguish between zones with same offset.

### 2. Dropdown: Searchable `<select>` with optgroup by continent

**Choice:** Use a native `<select>` element with `<optgroup>` grouping by continent/region, plus a text filter input.

**Rationale:** IANA timezone database has ~400 entries. A plain `<select>` would be unusable. Grouping by continent (America, Europe, Asia, etc.) with a text filter makes it navigable. No external dependency needed — the list is static and can be generated from a const array.

**Alternatives considered:**
- Third-party timezone picker (e.g., `react-timezone-select`): Adds dependency for a simple feature. The IANA list is stable and doesn't need a library.
- Flat `<datalist>`: No grouping, harder to navigate 400+ entries.

### 3. Persistence: localStorage key `botTimezone`

**Choice:** Store selected timezone in `localStorage` under key `botTimezone`.

**Rationale:** Consistent with existing pattern (`autoSelectTimeframes` uses localStorage). The value persists across page reloads and sessions. If no stored value, fall back to auto-detection.

### 4. Override model: Manual selection overrides auto-detection

**Choice:** On mount, auto-detect and set as default. If user selects a different timezone from dropdown, that becomes the persisted value. On subsequent mounts, load from localStorage first (skip re-detection).

**Rationale:** Respects user's explicit choice. Auto-detection is a one-time convenience, not a recurring behavior.

## Risks / Trade-offs

- **[Risk] IANA list staleness** → Mitigation: The list is static and rarely changes (a few zones per year). A rebuild can update it if needed. Acceptable for v1.
- **[Risk] Browser timezone ≠ user's actual timezone** → Mitigation: User can override via dropdown. The auto-detect is a convenience default, not a constraint.
- **[Trade-off] Native select vs custom dropdown** → Native select is less styled but zero dependencies, accessible, and works everywhere. Acceptable for a config form.
