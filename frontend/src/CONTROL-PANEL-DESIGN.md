# Full-Screen Control Panel — Visual Design Specification

> **Mode:** Operate (task-completion dashboard)  
> **Status:** Design spec for Frontend Engineer implementation  
> **Date:** 2026-08-07

---

## 1. Design Tokens (CSS Custom Properties)

All values extracted from existing `index.css` and the UX spec. Use these **exclusively** — no hardcoded values in components.

```css
:root {
  /* ─── Surfaces ─── */
  --surface-bg:        #0d0d18;   /* main background */
  --surface-panel:     #0f1520;   /* panels, cards, top bar */
  --surface-footer:    #0a0a14;   /* footer bar */
  --surface-elevated:  #1e1e2e;   /* hover states, inputs, dropdowns */
  --surface-overlay:   rgba(0, 0, 0, 0.7); /* modal backdrop */

  /* ─── Borders ─── */
  --border-subtle:     #111128;
  --border-focus:      #e94560;

  /* ─── Text ─── */
  --text-primary:      #e0e0e0;
  --text-secondary:    #888888;
  --text-disabled:     #555555;
  --text-inverse:      #0d0d18;

  /* ─── Accent ─── */
  --accent-primary:    #e94560;
  --accent-primary-hover: #c73e54;
  --accent-info:       #2196f3;
  --accent-success:    #4caf50;
  --accent-warning:    #ff9800;
  --accent-danger:     #f44336;

  /* ─── Typography ─── */
  --font-family:       -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-size-xs:      11px;   /* labels, badges */
  --font-size-sm:      12px;   /* body, secondary text */
  --font-size-md:      13px;   /* body default, inputs */
  --font-size-base:    14px;   /* headings */
  --font-size-lg:      18px;   /* title, app name */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* ─── Spacing ─── */
  --space-xs:          4px;
  --space-sm:          8px;
  --space-md:          12px;
  --space-lg:          16px;
  --space-xl:          24px;

  /* ─── Radii ─── */
  --radius-sm:         4px;
  --radius-md:         8px;
  --radius-lg:         12px;

  /* ─── Layout ─── */
  --topbar-height:     48px;
  --sidebar-collapsed: 64px;
  --sidebar-expanded:  220px;
  --sidebar-transition: 220ms cubic-bezier(0.4, 0, 0.2, 1);

  /* ─── Shadows ─── */
  --shadow-sm:         0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md:         0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg:         0 8px 32px rgba(0, 0, 0, 0.6);

  /* ─── Z-Index ─── */
  --z-sidebar:         100;
  --z-topbar:          200;
  --z-overlay:         300;
  --z-modal:           400;
  --z-tooltip:         500;
}
```

---

## 2. Top Bar

### 2.1 Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ 48px height, full width, horizontal flex, items center, padding: 0 16px            │
│ background: var(--surface-panel), border-bottom: 1px solid var(--border-subtle)    │
│                                                                                     │
│ ┌───────────────┬─────────────────────────────────────┬───────────────────────────┐ │
│ │ LEFT: Logo    │ MIDDLE: Status indicators            │ RIGHT: Action buttons     │ │
│ │ flex-shrink:0 │ flex: 1, gap: 16px, justify: center  │ flex-shrink: 0, gap: 8px │ │
│ └───────────────┴─────────────────────────────────────┴───────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Left Section — Logo + App Name

| Element | Value |
|---------|-------|
| Container | `display: flex; align-items: center; gap: 10px;` |
| Logo icon | `24×24px`, color `var(--accent-primary)`, SVG inline or icon font |
| App name | `font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); color: var(--accent-primary); letter-spacing: -0.3px;` |
| Divider | `width: 1px; height: 24px; background: var(--border-subtle); margin-left: 12px;` |

### 2.3 Middle Section — Status Indicators

Three pill-shaped status badges, each:

```
┌──────────────────────────────────┐
│  ● Status: Connected            │  (pill container)
│  padding: 4px 12px              │
│  border-radius: 12px            │
│  background: rgba(76, 175, 80, 0.1)   (success state)
│  border: 1px solid rgba(76, 175, 80, 0.25)
│  font-size: var(--font-size-sm)  │
│  display: flex; align-items: center; gap: 6px;
└──────────────────────────────────┘
```

| Indicator | Dot Color | Background | Border |
|-----------|-----------|------------|--------|
| **WebSocket: Connected** | `#4caf50` | `rgba(76, 175, 80, 0.1)` | `rgba(76, 175, 80, 0.25)` |
| **WebSocket: Disconnected** | `#f44336` | `rgba(244, 67, 54, 0.1)` | `rgba(244, 67, 54, 0.25)` |
| **Bot: Running** | `#4caf50` | `rgba(76, 175, 80, 0.1)` | `rgba(76, 175, 80, 0.25)` |
| **Bot: Stopped** | `#555` | `rgba(85, 85, 85, 0.1)` | `rgba(85, 85, 85, 0.25)` |
| **Bot: Error** | `#ff9800` | `rgba(255, 152, 0, 0.1)` | `rgba(255, 152, 0, 0.25)` |
| **Errors: N** (N > 0) | `#f44336` | `rgba(244, 67, 54, 0.1)` | `rgba(244, 67, 54, 0.25)` |
| **Errors: 0** | hidden | — | — |

**Dot spec:** `width: 6px; height: 6px; border-radius: 50%;` with optional `animation: pulse 2s ease-in-out infinite` for Connected/Running states.

**Pulse animation:**
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### 2.4 Right Section — Action Buttons

Two icon-only buttons, consistent with existing `.header-controls button` pattern:

| Element | Specs |
|---------|-------|
| Container | `display: flex; gap: 8px; align-items: center;` |
| Button base | `width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 150ms ease;` |
| Hover | `background: var(--surface-elevated); color: var(--text-primary); border-color: var(--border-subtle);` |
| Focus | `outline: 2px solid var(--accent-primary); outline-offset: 2px;` |
| Settings icon | `⚙` (gear emoji or SVG) |
| Notifications icon | `🔔` (bell emoji or SVG), with badge overlay when unread |

**Notification badge:**
```
position: absolute; top: -4px; right: -4px;
min-width: 16px; height: 16px; padding: 0 4px;
background: var(--accent-primary); color: white;
border-radius: 8px; font-size: 10px; font-weight: 600;
display: flex; align-items: center; justify-content: center;
```

---

## 3. Sidebar

### 3.1 Collapsed State (64px)

```
┌────────┐
│        │  width: 64px
│  ┌──┐  │  background: var(--surface-panel)
│  │📊│  │  border-right: 1px solid var(--border-subtle)
│  └──┘  │  display: flex; flex-direction: column; align-items: center;
│        │  padding: 16px 0;
│  ┌──┐  │  gap: 4px;
│  │💬│  │  position: fixed; top: var(--topbar-height); bottom: 0;
│  └──┐  │  z-index: var(--z-sidebar);
│     │  │
│  ┌──┐  │
│  │📈│  │
│  └──┘  │
│  ┌──┐  │
│  │⚙️│  │
│  └──┘  │
│        │
└────────┘
```

**Nav item (collapsed):**
```
width: 48px; height: 48px;
border-radius: var(--radius-md);
display: flex; align-items: center; justify-content: center;
font-size: 20px; cursor: pointer;
color: var(--text-secondary);
transition: all 150ms ease;
position: relative;
```

| State | Style |
|-------|-------|
| Default | `color: var(--text-secondary); background: transparent;` |
| Hover | `color: var(--text-primary); background: var(--surface-elevated);` |
| Active | `color: var(--accent-primary); background: rgba(233, 69, 96, 0.1);` |
| Active + Hover | `color: var(--accent-primary); background: rgba(233, 69, 96, 0.15);` |
| Focus | `outline: 2px solid var(--accent-primary); outline-offset: 2px;` |

**Tooltip on collapsed items:** On hover, show label to the right:
```
position: absolute; left: calc(100% + 8px); top: 50%; transform: translateY(-50%);
background: var(--surface-elevated); color: var(--text-primary);
padding: 4px 8px; border-radius: var(--radius-sm);
font-size: var(--font-size-sm); white-space: nowrap;
box-shadow: var(--shadow-md); pointer-events: none;
opacity: 0; transition: opacity 150ms ease;
```
Visible on hover: `opacity: 1;`

### 3.2 Expanded State (220px)

```
┌──────────────────────────────────┐
│                                  │  width: 220px
│  ┌──────────────────────────┐    │  same background, border
│  │ 📊  Dashboard            │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │ 💬  Telegram             │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │ 📈  Backtest             │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │ ⚙️  Settings             │    │
│  └──────────────────────────┘    │
│                                  │
└──────────────────────────────────┘
```

**Nav item (expanded):**
```
width: 100%; height: 48px; padding: 0 16px;
border-radius: var(--radius-md);
display: flex; align-items: center; gap: 12px;
font-size: var(--font-size-md); cursor: pointer;
color: var(--text-secondary);
transition: all 150ms ease;
margin: 0 8px; width: calc(100% - 16px);
```

| Element | Value |
|---------|-------|
| Icon | `font-size: 20px; width: 24px; text-align: center; flex-shrink: 0;` |
| Label | `font-size: var(--font-size-md); font-weight: var(--font-weight-medium); white-space: nowrap;` |
| Active indicator | 3px left border: `border-left: 3px solid var(--accent-primary);` OR left accent bar: `::before { content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px; border-radius: 2px; background: var(--accent-primary); }` |

### 3.3 Transition Animation

```css
.sidebar {
  width: var(--sidebar-collapsed);
  transition: width var(--sidebar-transition);
}

.sidebar:hover,
.sidebar.expanded {
  width: var(--sidebar-expanded);
}

.sidebar .nav-label {
  opacity: 0;
  width: 0;
  overflow: hidden;
  transition: opacity 150ms ease 50ms, width 150ms ease 50ms;
}

.sidebar:hover .nav-label,
.sidebar.expanded .nav-label {
  opacity: 1;
  width: auto;
}
```

**Tooltip suppression:** When expanded, hide tooltips (they're redundant with visible labels).

---

## 4. Content Area

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  margin-left: var(--sidebar-collapsed);  /* always 64px, sidebar overlays */│
│  flex: 1; display: flex; flex-direction: column;                           │
│  height: calc(100vh - var(--topbar-height));                               │
│  overflow: hidden;                                                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ BREADCRUMB BAR                                                      │   │
│  │ height: 36px; padding: 0 16px;                                     │   │
│  │ background: var(--surface-panel);                                   │   │
│  │ border-bottom: 1px solid var(--border-subtle);                      │   │
│  │ display: flex; align-items: center; gap: 8px;                       │   │
│  │ font-size: var(--font-size-sm); color: var(--text-secondary);       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PANEL CONTAINER                                                     │   │
│  │ flex: 1; overflow-y: auto; overflow-x: hidden;                      │   │
│  │ padding: var(--space-lg);                                           │   │
│  │ background: var(--surface-bg);                                      │   │
│  │                                                                      │   │
│  │ Custom scrollbar (Webkit):                                          │   │
│  │   width: 6px;                                                       │   │
│  │   ::-webkit-scrollbar-track: background: transparent;               │   │
│  │   ::-webkit-scrollbar-thumb: background: var(--border-subtle);      │   │
│  │                         border-radius: 3px;                         │   │
│  │   ::-webkit-scrollbar-thumb:hover: background: var(--text-disabled);│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Breadcrumb Bar

```
┌──────────────────────────────────────────────────────────────────────┐
│  📊  Dashboard  ›  Overview                          [panel title]   │
│                                                                      │
│  Icon: 16px, color: var(--accent-primary)                           │
│  Segment: font-size: var(--font-size-sm), color: var(--text-secondary)│
│  Separator (›): color: var(--text-disabled), margin: 0 4px          │
│  Current: color: var(--text-primary), font-weight: var(--font-weight-medium) │
│  Panel title (right): font-size: var(--font-size-sm), color: var(--text-secondary), margin-left: auto │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.3 Scroll Behavior

- `overflow-y: auto` on panel container only (not on body)
- Smooth scroll: `scroll-behavior: smooth;`
- Scrollbar: 6px wide, appears on hover only (`scrollbar-width: thin; scrollbar-color: var(--border-subtle) transparent;`)
- Content never scrolls behind the breadcrumb or top bar — those are fixed within the content area

---

## 5. Panel-Specific Mockups

### 5.1 Dashboard Panel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Breadcrumb: 📊 Dashboard › Overview                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─── Row 1: Status Cards (grid: 4 columns, gap: 16px) ─────────────────┐  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │  │
│  │  │ Bot Status   │  │ Uptime       │  │ Total P/L    │  │ Win Rate │  │  │
│  │  │ ● Running    │  │ 14h 23m      │  │ +$1,247.50   │  │ 68.4%    │  │  │
│  │  │              │  │              │  │              │  │          │  │  │
│  │  │ Card:        │  │ Card:        │  │ Card:        │  │ Card:    │  │  │
│  │  │ bg: panel    │  │ bg: panel    │  │ bg: panel    │  │ bg: panel│  │  │
│  │  │ border: sub  │  │ border: sub  │  │ border: sub  │  │ border:  │  │  │
│  │  │ radius: md   │  │ radius: md   │  │ radius: md   │  │ md       │  │  │
│  │  │ padding: lg  │  │ padding: lg  │  │ padding: lg  │  │ padding: │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │ lg       │  │  │
│  │                                                         └──────────┘  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─── Row 2: Two-column layout (gap: 16px) ─────────────────────────────┐  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────┐  ┌─────────────────────────────┐    │  │
│  │  │ Live Trades (flex: 2)       │  │ Performance (flex: 1)       │    │  │
│  │  │                             │  │                             │    │  │
│  │  │ Header: "Live Trades"       │  │ Header: "Performance"       │    │  │
│  │  │ font-size: base             │  │ font-size: base             │    │  │
│  │  │ font-weight: semibold       │  │ font-weight: semibold       │    │  │
│  │  │ color: text-primary         │  │ color: text-primary         │    │  │
│  │  │ margin-bottom: md           │  │ margin-bottom: md           │    │  │
│  │  │                             │  │                             │    │  │
│  │  │ Table:                       │  │ Stats rows:                 │    │  │
│  │  │ width: 100%                 │  │ display: flex;              │    │  │
│  │  │ border-collapse: collapse   │  │ justify-content: space-bet  │    │  │
│  │  │ font-size: sm               │  │ padding: sm 0;              │    │  │
│  │  │                             │  │ border-bottom: 1px solid    │    │  │
│  │  │ th:                          │  │   var(--border-subtle)      │    │  │
│  │  │  text-align: left           │  │                             │    │  │
│  │  │  color: text-secondary      │  │ Label: text-secondary, sm   │    │  │
│  │  │  font-weight: medium        │  │ Value: text-primary, md,    │    │  │
│  │  │  padding: sm md             │  │   font-weight: medium       │    │  │
│  │  │  border-bottom: 1px solid   │  │                             │    │  │
│  │  │    var(--border-subtle)     │  │ Positive: accent-success    │    │  │
│  │  │                             │  │ Negative: accent-danger     │    │  │
│  │  │ td:                          │  │                             │    │  │
│  │  │  padding: sm md             │  │                             │    │  │
│  │  │  color: text-primary        │  │                             │    │  │
│  │  │  border-bottom: 1px solid   │  │                             │    │  │
│  │  │    var(--border-subtle)     │  │                             │    │  │
│  │  │                             │  │                             │    │  │
│  │  │ tr:hover:                   │  │                             │    │  │
│  │  │  background: surface-elev   │  │                             │    │  │
│  │  │                             │  │                             │    │  │
│  │  │ Empty state:                │  │                             │    │  │
│  │  │  "No active trades"         │  │                             │    │  │
│  │  │  color: text-secondary      │  │                             │    │  │
│  │  │  padding: xl, text-align:   │  │                             │    │  │
│  │  │    center                   │  │                             │    │  │
│  │  └─────────────────────────────┘  └─────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Status Card component:**
```
background: var(--surface-panel);
border: 1px solid var(--border-subtle);
border-radius: var(--radius-md);
padding: var(--space-lg);
display: flex; flex-direction: column; gap: var(--space-xs);
```

| Element | Style |
|---------|-------|
| Card label | `font-size: var(--font-size-xs); color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;` |
| Card value | `font-size: 20px; font-weight: var(--font-weight-semibold); color: var(--text-primary);` |
| Card value (positive) | `color: var(--accent-success);` |
| Card value (negative) | `color: var(--accent-danger);` |
| Status dot (Running) | `6px circle, color: var(--accent-success), animation: pulse 2s ease-in-out infinite` |

### 5.2 Telegram Panel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Breadcrumb: 💬 Telegram › Configuration                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─── Two-column layout (grid: 1fr 1fr, gap: 16px) ─────────────────────┐  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────┐  ┌─────────────────────────────┐    │  │
│  │  │ Bot Configuration           │  │ Proxy Settings              │    │  │
│  │  │                             │  │                             │    │  │
│  │  │ ┌─────────────────────────┐ │  │ ┌─────────────────────────┐ │    │  │
│  │  │ │ Bot Token               │ │  │ │ Proxy Type              │ │    │  │
│  │  │ │ [input field]           │ │  │ │ [dropdown: HTTP/SOCKS5] │ │    │  │
│  │  │ └─────────────────────────┘ │  │ └─────────────────────────┘ │    │  │
│  │  │                             │  │                             │    │  │
│  │  │ ┌─────────────────────────┐ │  │ ┌─────────────────────────┐ │    │  │
│  │  │ │ Chat ID                 │ │  │ │ Host                    │ │    │  │
│  │  │ │ [input field]           │ │  │ │ [input field]           │ │    │  │
│  │  │ └─────────────────────────┘ │  │ └─────────────────────────┘ │    │  │
│  │  │                             │  │                             │    │  │
│  │  │ ┌─────────────────────────┐ │  │ ┌─────────────────────────┐ │    │  │
│  │  │ │ Channel/Group           │ │  │ │ Port                    │ │    │  │
│  │  │ │ [input field]           │ │  │ │ [input field]           │ │    │  │
│  │  │ └─────────────────────────┘ │  │ └─────────────────────────┘ │    │  │
│  │  │                             │  │                             │    │  │
│  │  │ [Test Connection] [Save]    │  │ [Test Proxy] [Save]         │    │  │
│  │  └─────────────────────────────┘  └─────────────────────────────┘    │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─── Chat Management (full width) ──────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  Header: "Chat Management"                                             │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Chat History                                                     │  │  │
│  │  │ max-height: 300px; overflow-y: auto;                            │  │  │
│  │  │                                                                  │  │  │
│  │  │ Message bubble:                                                  │  │  │
│  │  │   max-width: 70%; padding: var(--space-sm) var(--space-md);     │  │  │
│  │  │   border-radius: var(--radius-md);                              │  │  │
│  │  │   font-size: var(--font-size-md);                               │  │  │
│  │  │                                                                  │  │  │
│  │  │ Incoming (left):                                                 │  │  │
│  │  │   background: var(--surface-elevated); color: var(--text-primary)│  │  │
│  │  │   border-bottom-left-radius: 2px;                               │  │  │
│  │  │                                                                  │  │  │
│  │  │ Outgoing (right):                                                │  │  │
│  │  │   background: rgba(233, 69, 96, 0.15); color: var(--text-primary)│ │  │
│  │  │   border-bottom-right-radius: 2px; margin-left: auto;          │  │  │
│  │  │                                                                  │  │  │
│  │  │ Timestamp: font-size: xs, color: text-disabled, margin-top: 2px │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  Message input:                                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────┐     │  │
│  │  │ [Type a message...]                          [Send]         │     │  │
│  │  │ height: 40px; background: surface-elevated;                  │     │  │
│  │  │ border: 1px solid border-subtle; border-radius: radius-md;  │     │  │
│  │  │ padding: 0 var(--space-md);                                  │     │  │
│  │  │ Send button: bg: accent-primary, color: white, radius: sm   │     │  │
│  │  └──────────────────────────────────────────────────────────────┘     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Form input spec (shared across panels):**
```
width: 100%;
height: 36px;
padding: 0 var(--space-md);
background: var(--surface-elevated);
color: var(--text-primary);
border: 1px solid var(--border-subtle);
border-radius: var(--radius-sm);
font-size: var(--font-size-md);
font-family: var(--font-family);
outline: none;
transition: border-color 150ms ease;
```

| State | Style |
|-------|-------|
| Default | `border-color: var(--border-subtle);` |
| Focus | `border-color: var(--accent-primary); box-shadow: 0 0 0 2px rgba(233, 69, 96, 0.15);` |
| Disabled | `color: var(--text-disabled); cursor: not-allowed; opacity: 0.6;` |
| Error | `border-color: var(--accent-danger);` |

**Form label:**
```
display: block;
font-size: var(--font-size-xs);
color: var(--text-secondary);
margin-bottom: var(--space-xs);
text-transform: uppercase;
letter-spacing: 0.5px;
```

**Button — Primary (Save, Send):**
```
height: 36px; padding: 0 var(--space-lg);
background: var(--accent-primary); color: white;
border: none; border-radius: var(--radius-sm);
font-size: var(--font-size-md); font-weight: var(--font-weight-medium);
cursor: pointer; transition: background 150ms ease;
```
Hover: `background: var(--accent-primary-hover);`

**Button — Secondary (Test Connection, Test Proxy):**
```
height: 36px; padding: 0 var(--space-lg);
background: transparent; color: var(--text-primary);
border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
font-size: var(--font-size-md); font-weight: var(--font-weight-medium);
cursor: pointer; transition: all 150ms ease;
```
Hover: `background: var(--surface-elevated); border-color: var(--text-disabled);`

**Dropdown (Proxy Type):**
```
Same as input spec + appearance: none;
background-image: url("data:image/svg+xml,..."); /* chevron */
background-repeat: no-repeat;
background-position: right 12px center;
padding-right: 36px;
```

### 5.3 Backtest Panel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Breadcrumb: 📈 Backtest › Strategy Testing                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─── Row 1: Config bar (horizontal flex, gap: 12px) ───────────────────┐  │
│  │                                                                        │  │
│  │  [Strategy Selector ▾]  [Symbol input]  [Timeframe ▾]  [Date Range]   │  │
│  │  [Run Backtest ▼]                                                        │  │
│  │                                                                        │  │
│  │  Each control: inline-flex, height: 36px                                │  │
│  │  Run button: bg: accent-primary, color: white, height: 36px           │  │
│  │  Run button loading: spinner icon + "Running..." text                   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─── Row 2: Results (flex: 1, overflow-y: auto) ────────────────────────┐  │
│  │                                                                        │  │
│  │  ┌─── Stats grid (4 cols, gap: 12px) ─────────────────────────────┐  │  │
│  │  │  Total Return  │  Sharpe Ratio  │  Max Drawdown  │  Win Rate   │  │  │
│  │  │  +12.4%        │  1.82          │  -4.2%         │  68.4%      │  │  │
│  │  │  (same card spec as Dashboard status cards)                     │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  ┌─── Equity Curve (full width, height: 240px) ────────────────────┐  │  │
│  │  │  background: var(--surface-panel);                               │  │  │
│  │  │  border: 1px solid var(--border-subtle);                         │  │  │
│  │  │  border-radius: var(--radius-md);                                │  │  │
│  │  │  padding: var(--space-lg);                                       │  │  │
│  │  │                                                                   │  │  │
│  │  │  Chart area: canvas or SVG, flex: 1                               │  │  │
│  │  │  Line color: var(--accent-primary) (equity)                       │  │  │
│  │  │  Grid lines: var(--border-subtle)                                 │  │  │
│  │  │  Axis labels: font-size: xs, color: text-secondary               │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  ┌─── Trade List (full width) ─────────────────────────────────────┐  │  │
│  │  │  Same table spec as Dashboard live trades                        │  │  │
│  │  │  Columns: Date | Side | Entry | Exit | P/L | Duration           │  │  │
│  │  │  P/L column: green for positive, red for negative                │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Settings Panel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Breadcrumb: ⚙️ Settings › General                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─── Two-column layout ────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  ┌─── Left: Settings nav (width: 200px) ───┐  ┌─── Right: Content ──┐│  │
│  │  │                                           │  │                      ││  │
│  │  │  General                          ●       │  │  General Settings    ││  │
│  │  │  Appearance                       ○       │  │                      ││  │
│  │  │  Notifications                    ○       │  │  ┌────────────────┐  ││  │
│  │  │  API Keys                         ○       │  │  │ App Name       │  ││  │
│  │  │  Advanced                         ○       │  │  │ [input]        │  ││  │
│  │  │                                           │  │  └────────────────┘  ││  │
│  │  │  Nav item spec:                           │  │                      ││  │
│  │  │  padding: sm md                           │  │  ┌────────────────┐  ││  │
│  │  │  font-size: sm                            │  │  │ Theme          │  ││  │
│  │  │  color: text-secondary                    │  │  │ [dropdown]     │  ││  │
│  │  │  border-radius: radius-sm                 │  │  └────────────────┘  ││  │
│  │  │  cursor: pointer                          │  │                      ││  │
│  │  │  hover: bg: surface-elevated               │  │  ┌────────────────┐  ││  │
│  │  │  active: color: accent-primary             │  │  │ Language       │  ││  │
│  │  │           bg: rgba(233,69,96,0.1)          │  │  │ [dropdown]     │  ││  │
│  │  │                                           │  │  └────────────────┘  ││  │
│  │  └───────────────────────────────────────────┘  │                      ││  │
│  │                                                   │  [Save Changes]     ││  │
│  │                                                   │                      ││  │
│  │                                                   └──────────────────────┘│  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Settings nav (left column):**
```
background: var(--surface-panel);
border: 1px solid var(--border-subtle);
border-radius: var(--radius-md);
padding: var(--space-sm);
```

---

## 6. Component States Reference

### 6.1 Loading State

```
┌──────────────────────────────────────────┐
│  Skeleton loader:                         │
│  background: linear-gradient(             │
│    90deg,                                 │
│    var(--surface-elevated) 25%,           │
│    rgba(30, 30, 46, 0.6) 50%,           │
│    var(--surface-elevated) 75%            │
│  );                                       │
│  background-size: 200% 100%;             │
│  animation: skeleton-shimmer 1.5s infinite;│
│  border-radius: var(--radius-sm);        │
│  height: 16px; /* or appropriate */       │
└──────────────────────────────────────────┘

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**Usage:** Replace text/value placeholders while data loads. Use in cards, table rows, chart areas.

### 6.2 Empty State

```
┌──────────────────────────────────────────┐
│                                           │
│           📭 (icon, 32px, disabled color) │
│                                           │
│     No trades yet                         │
│     font-size: md, color: text-secondary  │
│                                           │
│     Start the bot to see live trades      │
│     font-size: sm, color: text-disabled   │
│                                           │
│     [Start Bot] (optional CTA)            │
│     primary button spec                   │
│                                           │
└──────────────────────────────────────────┘
```

Container: `display: flex; flex-direction: column; align-items: center; justify-content: center; padding: var(--space-xl) var(--space-lg); min-height: 200px;`

### 6.3 Error State

```
┌──────────────────────────────────────────┐
│  ┌─ Error banner ──────────────────────┐ │
│  │ ⚠️ Connection failed                 │ │
│  │ background: rgba(244, 67, 54, 0.1); │ │
│  │ border: 1px solid rgba(244, 67, 54, 0.25); │
│  │ border-radius: var(--radius-sm);    │ │
│  │ padding: var(--space-md);           │ │
│  │ display: flex; align-items: center;  │ │
│  │ gap: var(--space-sm);               │ │
│  │                                      │ │
│  │ Icon: ⚠️, color: accent-danger      │ │
│  │ Message: font-size: sm, text-primary│ │
│  │ Retry button: secondary button spec │ │
│  └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 6.4 Disabled State

All interactive elements:
```
opacity: 0.6;
cursor: not-allowed;
pointer-events: none; /* or handle in JS */
color: var(--text-disabled);
background: var(--surface-elevated);
border-color: var(--border-subtle);
```

### 6.5 Focus States (a11y)

All interactive elements receive visible focus:
```
outline: 2px solid var(--accent-primary);
outline-offset: 2px;
```

No `outline: none` without a replacement. Touch targets minimum 44×44px (sidebar icons are 48×48, inputs are 36px height — both pass).

---

## 7. Responsive Behavior

### 7.1 Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Desktop | ≥ 1200px | Full layout: sidebar + content |
| Tablet | 768–1199px | Sidebar collapsed (64px), content fills |
| Mobile | < 768px | Sidebar hidden (off-canvas), hamburger toggle |

### 7.2 Tablet (768–1199px)

- Sidebar: forced collapsed, no hover expand
- Top bar status indicators: collapse to icons only (hide text labels)
- Content area: full width minus 64px
- Grid layouts: reduce to 2 columns
- Breadcrumb: truncate middle segments with `...`

### 7.3 Mobile (< 768px)

- Sidebar: `display: none` by default, toggle via hamburger in top bar
- When open: `position: fixed; width: 260px; z-index: var(--z-overlay);` with backdrop overlay
- Top bar: logo only (hide app name), status indicators hidden, action buttons remain
- Content: full width, single column
- Grids: single column, stacked
- Tables: horizontal scroll or card layout
- Breadcrumb: show only current segment

### 7.4 Mobile Sidebar Overlay

```css
@media (max-width: 767px) {
  .sidebar {
    position: fixed;
    left: -260px;
    width: 260px;
    z-index: var(--z-overlay);
    transition: left 220ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .sidebar.open {
    left: 0;
  }
  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: var(--surface-overlay);
    z-index: calc(var(--z-overlay) - 1);
  }
}
```

---

## 8. Transition & Motion

| Element | Property | Duration | Easing |
|---------|----------|----------|--------|
| Sidebar width | `width` | 220ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Nav label opacity | `opacity` | 150ms + 50ms delay | `ease` |
| Button hover | `background, color, border-color` | 150ms | `ease` |
| Input focus | `border-color, box-shadow` | 150ms | `ease` |
| Card hover | `border-color, transform` | 150ms | `ease` |
| Skeleton shimmer | `background-position` | 1.5s | `linear` (infinite) |
| Status dot pulse | `opacity` | 2s | `ease-in-out` (infinite) |
| Tooltip | `opacity` | 150ms + 50ms delay | `ease` |

**Global motion preference:**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 9. Accessibility Notes

| Requirement | Implementation |
|-------------|----------------|
| Color contrast | All text passes WCAG AA (4.5:1): `#e0e0e0` on `#0d0d18` = 12.5:1 ✓ |
| Focus visibility | 2px solid accent outline on all interactive elements |
| Keyboard nav | Full Tab/Enter/Space/Escape support; sidebar items are `<button>` or `<a>` with `role="tab"` |
| ARIA labels | Sidebar icons: `aria-label="Dashboard"`, etc. Top bar buttons: `aria-label="Settings"`, `aria-label="Notifications (3 unread)"` |
| Screen reader | Status indicators: `aria-live="polite"` for dynamic status changes; `role="status"` on status badges |
| Skip link | "Skip to main content" link, visually hidden until focused |
| Semantic HTML | `<header>` for top bar, `<nav>` for sidebar, `<main>` for content, `<aside>` for panels |
| Touch targets | All interactive elements ≥ 44×44px (sidebar icons 48×48, buttons 36px min-height) |

---

## 10. File Structure Recommendation

```
frontend/src/
├── styles/
│   ├── tokens.css          /* all CSS custom properties */
│   ├── reset.css           /* existing * reset, body, #root */
│   ├── components.css      /* shared component styles */
│   ├── scrollbar.css       /* custom scrollbar */
│   └── animations.css      /* pulse, skeleton, transitions */
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── ContentArea.tsx
│   │   └── Breadcrumb.tsx
│   ├── shared/
│   │   ├── StatusBadge.tsx
│   │   ├── StatusCard.tsx
│   │   ├── DataTable.tsx
│   │   ├── FormInput.tsx
│   │   ├── FormSelect.tsx
│   │   ├── Button.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorBanner.tsx
│   │   └── SkeletonLoader.tsx
│   ├── dashboard/
│   │   ├── DashboardPanel.tsx
│   │   ├── StatusCards.tsx
│   │   ├── LiveTrades.tsx
│   │   └── Performance.tsx
│   ├── telegram/
│   │   ├── TelegramPanel.tsx
│   │   ├── BotConfig.tsx
│   │   ├── ProxySettings.tsx
│   │   └── ChatManager.tsx
│   ├── backtest/
│   │   ├── BacktestPanel.tsx
│   │   ├── BacktestConfig.tsx
│   │   ├── EquityCurve.tsx
│   │   └── TradeList.tsx
│   └── settings/
│       ├── SettingsPanel.tsx
│       ├── SettingsNav.tsx
│       └── GeneralSettings.tsx
```

---

## Summary for Frontend Engineer

1. **Extract tokens** from Section 1 into `tokens.css` — every value flows from these variables
2. **Build shared components** first (Section 6 states, Section 5 form elements) — panels compose from them
3. **Layout shell** (TopBar + Sidebar + ContentArea) is the skeleton — implement before panels
4. **Sidebar transition** is the trickiest CSS piece — test the hover-expand animation carefully
5. **Each panel** is a self-contained component that composes shared components + layout
6. **Responsive** is progressive enhancement — desktop first, tablet/mobile as media queries
7. **Accessibility** is built in from the start — semantic HTML, ARIA, focus states, keyboard nav
